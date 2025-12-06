#!/usr/bin/env bun

import { parseArgs } from "util";
import { loadConfig, scanDirectory, generateSampleConfig } from "./config";
import { generateCollage, getMediaType, AVAILABLE_SHADERS } from "./ffmpeg";
import { downloadMedia, downloadMultiple, listMedia, getMediaDir } from "./downloader";
import type { CollageConfig, MediaItem } from "./types";

const HELP = `
video-collage - Create video collages from multiple videos and images

USAGE:
  video-collage <command> [options]

COMMANDS:
  generate    Create a video collage (default if no command specified)
  download    Download videos from URLs (YouTube, Twitter, etc.)
  list        List media files in the media folder
  help        Show this help

Run 'video-collage <command> --help' for command-specific help.

QUICK START:
  # Download some videos
  video-collage download https://youtube.com/watch?v=xxx https://twitter.com/xxx

  # Generate collage from downloaded media
  video-collage generate

  # Or do both - download and immediately generate
  video-collage download --generate https://youtube.com/watch?v=xxx
`;

const GENERATE_HELP = `
video-collage generate - Create a video collage

USAGE:
  video-collage generate [options]
  video-collage generate --config <config.json>
  video-collage generate <file1> <file2> ... [options]

OPTIONS:
  -c, --config <path>     Load configuration from JSON file
  -d, --dir <path>        Scan directory for media (default: ./media folder)
  -o, --output <path>     Output video path (default: collage.mp4)
  -w, --width <pixels>    Output width (default: 1920)
  -h, --height <pixels>   Output height (default: 1080)
  -t, --duration <secs>   Output duration in seconds (default: 60)
  -f, --fps <rate>        Frames per second (default: 30)
  --columns <n>           Grid columns (auto-calculated if not set)
  --rows <n>              Grid rows (auto-calculated if not set)
  --gap <pixels>          Gap between cells (default: 4)
   --bg <color>            Background color (default: black)
   --shader <name>         Apply shader effect to output
   --gpu                   Use GPU encoding (default: false)
   --init                  Generate sample config file
   --help                  Show this help

SHADERS:
  vignette    - Darkens edges of the frame
  bloom       - Adds glow effect to bright areas
  chromatic   - RGB channel separation (retro look)
  noise       - Film grain texture
  crt         - CRT monitor effect with scanlines
  dreamy      - Soft ethereal glow with desaturation

EXAMPLES:
  # Generate from media folder (default)
  video-collage generate

  # Generate from specific files
  video-collage generate video1.mp4 image1.jpg -o wallpaper.mp4

  # Custom grid and duration
  video-collage generate --columns 3 --rows 2 --duration 120

  # Apply shader effect
  video-collage generate --shader vignette
  video-collage generate --shader crt -o retro-wallpaper.mp4
`;

const DOWNLOAD_HELP = `
video-collage download - Download videos from URLs

USAGE:
  video-collage download [options] <url1> [url2] ...

OPTIONS:
  -o, --output <dir>      Output directory (default: ./media)
  --max-height <pixels>   Maximum video height (default: 1080)
  --audio-only            Download audio only (mp3)
  --generate              Generate collage after downloading
  --help                  Show this help

SUPPORTED SITES:
  YouTube, Twitter/X, Instagram, TikTok, Vimeo, Reddit,
  and 1000+ more sites supported by yt-dlp

EXAMPLES:
  # Download a YouTube video
  video-collage download https://youtube.com/watch?v=dQw4w9WgXcQ

  # Download multiple videos
  video-collage download https://youtube.com/... https://twitter.com/...

  # Download and immediately create collage
  video-collage download --generate https://youtube.com/...

  # Download to custom folder
  video-collage download -o ~/Videos https://youtube.com/...
`;

async function runGenerate(args: string[]) {
  const { values, positionals } = parseArgs({
    args,
    options: {
      config: { type: "string", short: "c" },
      dir: { type: "string", short: "d" },
      output: { type: "string", short: "o", default: "collage.mp4" },
      width: { type: "string", short: "w", default: "1920" },
      height: { type: "string", short: "h", default: "1080" },
      duration: { type: "string", short: "t", default: "60" },
      fps: { type: "string", short: "f", default: "30" },
      columns: { type: "string" },
      rows: { type: "string" },
      gap: { type: "string", default: "4" },
       bg: { type: "string", default: "black" },
       shader: { type: "string", short: "s" },
       gpu: { type: "boolean" },
       init: { type: "boolean" },
       help: { type: "boolean" },
    },
    allowPositionals: true,
  });

  if (values.help) {
    console.log(GENERATE_HELP);
    process.exit(0);
  }

  if (values.init) {
    console.log(generateSampleConfig());
    process.exit(0);
  }

  let config: CollageConfig;

  if (values.config) {
    config = await loadConfig(values.config);
  } else {
    let media: MediaItem[] = [];

    // If specific files provided, use those
    if (positionals.length > 0) {
      for (const file of positionals) {
        const type = getMediaType(file);
        if (type) {
          media.push({ path: file, type, loop: true });
        } else {
          console.warn(`Skipping unsupported file: ${file}`);
        }
      }
    } else if (values.dir) {
      // Scan specified directory
      console.log(`Scanning directory: ${values.dir}`);
      media = await scanDirectory(values.dir);
      console.log(`Found ${media.length} media files`);
    } else {
      // Default: scan media folder
      const mediaDir = getMediaDir();
      console.log(`Scanning media folder: ${mediaDir}`);
      media = await scanDirectory(mediaDir);
      console.log(`Found ${media.length} media files`);
    }

    if (media.length === 0) {
      console.error("Error: No media files found");
      console.log("\nDownload some media first:");
      console.log("  video-collage download <url>");
      console.log("\nOr specify files directly:");
      console.log("  video-collage generate file1.mp4 file2.jpg");
      process.exit(1);
    }

    // Validate shader if provided
    if (values.shader && !AVAILABLE_SHADERS.includes(values.shader as any)) {
      console.error(`Error: Unknown shader '${values.shader}'`);
      console.log(`\nAvailable shaders: ${AVAILABLE_SHADERS.join(", ")}`);
      process.exit(1);
    }

    config = {
      output: values.output!,
      width: parseInt(values.width!, 10),
      height: parseInt(values.height!, 10),
      duration: parseInt(values.duration!, 10),
      fps: parseInt(values.fps!, 10),
      background: values.bg,
      shader: values.shader,
      gpu: values.gpu || false,
      layout: {
        type: "grid",
        columns: values.columns ? parseInt(values.columns, 10) : undefined,
        rows: values.rows ? parseInt(values.rows, 10) : undefined,
        gap: parseInt(values.gap!, 10),
      },
      media,
    };
  }

  try {
    await generateCollage(config);
    console.log(`\nOutput saved to: ${config.output}`);
  } catch (error) {
    console.error(`\nError: ${error}`);
    process.exit(1);
  }
}

async function runDownload(args: string[]) {
  const { values, positionals } = parseArgs({
    args,
    options: {
      output: { type: "string", short: "o" },
      "max-height": { type: "string", default: "1080" },
      "audio-only": { type: "boolean" },
      generate: { type: "boolean" },
      help: { type: "boolean" },
    },
    allowPositionals: true,
  });

  if (values.help) {
    console.log(DOWNLOAD_HELP);
    process.exit(0);
  }

  const urls = positionals;

  if (urls.length === 0) {
    console.error("Error: No URLs specified");
    console.log("\nUsage: video-collage download <url1> [url2] ...");
    process.exit(1);
  }

  const outputDir = values.output || getMediaDir();
  const maxHeight = parseInt(values["max-height"]!, 10);

  console.log(`Downloading ${urls.length} item(s) to: ${outputDir}\n`);

  const results = await downloadMultiple(urls, outputDir);

  // Summary
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log("\n--- Download Summary ---");
  console.log(`Successful: ${successful.length}`);
  console.log(`Failed: ${failed.length}`);

  if (failed.length > 0) {
    console.log("\nFailed downloads:");
    failed.forEach((r, i) => console.log(`  ${i + 1}. ${r.error}`));
  }

  // Generate collage if requested
  if (values.generate && successful.length > 0) {
    console.log("\n--- Generating Collage ---");
    await runGenerate([]);
  }
}

async function runList() {
  const mediaDir = getMediaDir();
  const files = await listMedia(mediaDir);

  console.log(`Media folder: ${mediaDir}\n`);

  if (files.length === 0) {
    console.log("No media files found.");
    console.log("\nDownload some media:");
    console.log("  video-collage download <url>");
  } else {
    console.log(`Found ${files.length} file(s):\n`);
    files.forEach((file, i) => {
      const name = file.split("/").pop();
      console.log(`  ${i + 1}. ${name}`);
    });
  }
}

async function main() {
  const args = Bun.argv.slice(2);
  const command = args[0];

  // No args - show help
  if (args.length === 0) {
    console.log(HELP);
    process.exit(0);
  }

  // Route to command
  switch (command) {
    case "generate":
      await runGenerate(args.slice(1));
      break;

    case "download":
    case "dl":
      await runDownload(args.slice(1));
      break;

    case "list":
    case "ls":
      await runList();
      break;

    case "help":
    case "--help":
    case "-h":
      console.log(HELP);
      break;

    default:
      // If first arg looks like a URL, treat as download
      if (command.startsWith("http://") || command.startsWith("https://")) {
        await runDownload(args);
      }
      // If first arg looks like a file, treat as generate
      else if (getMediaType(command)) {
        await runGenerate(args);
      }
      // Otherwise try generate with the args
      else {
        await runGenerate(args);
      }
  }
}

main();
