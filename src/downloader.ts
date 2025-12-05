import { existsSync, mkdirSync } from "fs";
import path from "path";

const MEDIA_DIR = path.join(import.meta.dir, "..", "media");

export function getMediaDir(): string {
  if (!existsSync(MEDIA_DIR)) {
    mkdirSync(MEDIA_DIR, { recursive: true });
  }
  return MEDIA_DIR;
}

async function findCommand(name: string): Promise<string | null> {
  try {
    const result = await Bun.$`which ${name}`.text();
    return result.trim();
  } catch {
    return null;
  }
}

export interface DownloadOptions {
  url: string;
  outputDir?: string;
  format?: string;
  maxHeight?: number;
  audioOnly?: boolean;
  filename?: string;
}

export interface DownloadResult {
  success: boolean;
  filePath?: string;
  error?: string;
  title?: string;
}

// Try yt-dlp first, then gallery-dl as fallback
export async function downloadMedia(options: DownloadOptions): Promise<DownloadResult> {
  const outputDir = options.outputDir || getMediaDir();
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Try yt-dlp first
  const ytDlp = await findCommand("yt-dlp");
  if (ytDlp) {
    const result = await downloadWithYtDlp(ytDlp, options, outputDir);
    if (result.success) {
      return result;
    }
    // If yt-dlp failed with unsupported URL, try gallery-dl
    if (result.error?.includes("Unsupported URL") || result.error?.includes("not supported")) {
      console.log("yt-dlp doesn't support this URL, trying gallery-dl...");
    } else {
      return result; // Return other errors
    }
  }

  // Try gallery-dl as fallback
  const galleryDl = await findCommand("gallery-dl");
  if (galleryDl) {
    return await downloadWithGalleryDl(galleryDl, options, outputDir);
  }

  if (!ytDlp && !galleryDl) {
    return {
      success: false,
      error: "No downloader found. Install yt-dlp (pip install yt-dlp) or gallery-dl (pip install gallery-dl)",
    };
  }

  return {
    success: false,
    error: "URL not supported by available downloaders",
  };
}

async function downloadWithYtDlp(
  ytDlp: string,
  options: DownloadOptions,
  outputDir: string
): Promise<DownloadResult> {
  const args: string[] = [
    "--no-playlist",
    "-o", path.join(outputDir, options.filename || "%(title)s.%(ext)s"),
  ];

  if (options.audioOnly) {
    args.push("-x", "--audio-format", "mp3");
  } else {
    if (options.maxHeight) {
      args.push("-f", `bestvideo[height<=${options.maxHeight}]+bestaudio/best[height<=${options.maxHeight}]/best`);
    } else {
      args.push("-f", "bestvideo+bestaudio/best");
    }
    args.push("--merge-output-format", "mp4");
  }

  args.push(options.url);

  console.log(`Downloading: ${options.url}`);

  try {
    const proc = Bun.spawn([ytDlp, ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const decoder = new TextDecoder();
    let downloadedFile = "";
    let errorOutput = "";

    const stdoutReader = proc.stdout.getReader();
    const stderrReader = proc.stderr.getReader();

    const readStdout = async () => {
      while (true) {
        const { done, value } = await stdoutReader.read();
        if (done) break;
        const text = decoder.decode(value);
        const match = text.match(/Destination: (.+)/);
        if (match) downloadedFile = match[1].trim();
      }
    };

    const readStderr = async () => {
      while (true) {
        const { done, value } = await stderrReader.read();
        if (done) break;
        const text = decoder.decode(value);
        errorOutput += text;

        const lines = text.split("\n").filter(l => l.trim());
        for (const line of lines) {
          if (line.includes("[download]") && line.includes("%")) {
            process.stdout.write(`\r${line.trim().slice(0, 80).padEnd(80)}`);
          }
          const destMatch = line.match(/Destination: (.+)/);
          if (destMatch) downloadedFile = destMatch[1].trim();
          const mergeMatch = line.match(/Merging formats into "(.+)"/);
          if (mergeMatch) downloadedFile = mergeMatch[1].trim();
        }
      }
    };

    await Promise.all([readStdout(), readStderr()]);
    await proc.exited;

    if (proc.exitCode !== 0) {
      // Extract meaningful error message
      const errorMatch = errorOutput.match(/ERROR: (.+)/);
      const errorMsg = errorMatch ? errorMatch[1] : `yt-dlp exited with code ${proc.exitCode}`;
      return { success: false, error: errorMsg };
    }

    console.log("\n");

    if (!downloadedFile) {
      downloadedFile = await findNewestFile(outputDir);
    }

    return {
      success: true,
      filePath: downloadedFile,
      title: path.basename(downloadedFile),
    };
  } catch (error) {
    return { success: false, error: `Download failed: ${error}` };
  }
}

async function downloadWithGalleryDl(
  galleryDl: string,
  options: DownloadOptions,
  outputDir: string
): Promise<DownloadResult> {
  console.log(`Downloading with gallery-dl: ${options.url}`);

  const args: string[] = [
    "-d", outputDir,
    "--filename", "{filename}.{extension}",
    options.url,
  ];

  try {
    const proc = Bun.spawn([galleryDl, ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const decoder = new TextDecoder();
    let downloadedFile = "";
    let errorOutput = "";

    const stdoutReader = proc.stdout.getReader();
    const stderrReader = proc.stderr.getReader();

    const readStdout = async () => {
      while (true) {
        const { done, value } = await stdoutReader.read();
        if (done) break;
        const text = decoder.decode(value);
        // gallery-dl outputs the path of downloaded files
        const lines = text.trim().split("\n");
        for (const line of lines) {
          if (line && !line.startsWith("#")) {
            // Could be a file path
            const potentialPath = line.trim();
            if (potentialPath.includes("/") || potentialPath.includes(".")) {
              downloadedFile = potentialPath;
              console.log(`Downloaded: ${path.basename(potentialPath)}`);
            }
          }
        }
      }
    };

    const readStderr = async () => {
      while (true) {
        const { done, value } = await stderrReader.read();
        if (done) break;
        const text = decoder.decode(value);
        errorOutput += text;
        // Show progress
        if (text.includes("Downloading")) {
          process.stdout.write(`\r${text.trim().slice(0, 80).padEnd(80)}`);
        }
      }
    };

    await Promise.all([readStdout(), readStderr()]);
    await proc.exited;

    if (proc.exitCode !== 0) {
      const errorMatch = errorOutput.match(/\[error\] (.+)/i) || errorOutput.match(/error: (.+)/i);
      const errorMsg = errorMatch ? errorMatch[1] : `gallery-dl exited with code ${proc.exitCode}`;
      return { success: false, error: errorMsg };
    }

    console.log("");

    if (!downloadedFile) {
      downloadedFile = await findNewestFile(outputDir);
    }

    return {
      success: true,
      filePath: downloadedFile,
      title: path.basename(downloadedFile),
    };
  } catch (error) {
    return { success: false, error: `Download failed: ${error}` };
  }
}

async function findNewestFile(dir: string): Promise<string> {
  const glob = new Bun.Glob("*.{mp4,webm,mkv,mp3,m4a,jpg,jpeg,png,gif,webp}");
  let newestFile = "";
  let newestTime = 0;

  for await (const file of glob.scan({ cwd: dir, absolute: true })) {
    const stat = await Bun.file(file).stat();
    if (stat && stat.mtime.getTime() > newestTime) {
      newestTime = stat.mtime.getTime();
      newestFile = file;
    }
  }
  return newestFile;
}

export async function downloadMultiple(urls: string[], outputDir?: string): Promise<DownloadResult[]> {
  const results: DownloadResult[] = [];

  for (let i = 0; i < urls.length; i++) {
    console.log(`\n[${i + 1}/${urls.length}] Downloading...`);
    const result = await downloadMedia({
      url: urls[i],
      outputDir,
      maxHeight: 1080,
    });
    results.push(result);

    if (result.success) {
      console.log(`Downloaded: ${result.title}`);
    } else {
      console.error(`Failed: ${result.error}`);
    }
  }

  return results;
}

export async function listMedia(dir?: string): Promise<string[]> {
  const mediaDir = dir || getMediaDir();
  if (!existsSync(mediaDir)) {
    return [];
  }

  const files: string[] = [];
  const glob = new Bun.Glob("*.{jpg,jpeg,png,gif,bmp,webp,mp4,mkv,avi,mov,webm,flv,wmv,m4v}");

  for await (const file of glob.scan({ cwd: mediaDir, absolute: true })) {
    files.push(file);
  }

  return files.sort();
}
