import type { MediaInfo, CollageConfig, CellPosition, ShaderType } from "./types";
import path from "path";

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tiff"];
const VIDEO_EXTENSIONS = [".mp4", ".mkv", ".avi", ".mov", ".webm", ".flv", ".wmv", ".m4v"];

const SHADER_DIR = path.join(import.meta.dir, "..", "shaders");

export const AVAILABLE_SHADERS: ShaderType[] = ["vignette", "bloom", "chromatic", "noise", "crt", "dreamy"];

// Get FFmpeg filter chain for each shader effect
export function getShaderFilter(shader: ShaderType, width: number, height: number): string {
  switch (shader) {
    case "vignette":
      // Vignette effect using vignette filter
      return "vignette=PI/4:0.5";

    case "bloom":
      // Bloom/glow effect using split, blur, and blend
      return "split[a][b];[b]gblur=sigma=20,curves=all='0/0 0.5/0.7 1/1'[blur];[a][blur]blend=all_mode=screen:all_opacity=0.3";

    case "chromatic":
      // Chromatic aberration using rgbashift
      return "rgbashift=rh=-4:rv=0:gh=0:gv=0:bh=4:bv=0:edge=smear";

    case "noise":
      // Film grain using noise filter
      return "noise=alls=15:allf=t+u";

    case "crt":
      // CRT effect: scanlines + vignette + slight blur
      return `format=rgb24,split[a][b];[a]curves=all='0/0.05 0.5/0.5 1/0.95'[c];[b]scale=${width}:${height*2}:flags=neighbor,scale=${width}:${height}:flags=neighbor[scan];[c][scan]blend=all_mode=multiply:all_opacity=0.15,vignette=PI/3:0.4,noise=alls=8:allf=t`;

    case "dreamy":
      // Dreamy soft glow with desaturation
      return "split[a][b];[b]gblur=sigma=30[blur];[a][blur]blend=all_mode=softlight:all_opacity=0.5,eq=saturation=0.8:brightness=0.05,vignette=PI/4:0.3";

    default:
      return "";
  }
}

export function getMediaType(filePath: string): "video" | "image" | null {
  const ext = filePath.toLowerCase().slice(filePath.lastIndexOf("."));
  if (IMAGE_EXTENSIONS.includes(ext)) return "image";
  if (VIDEO_EXTENSIONS.includes(ext)) return "video";
  return null;
}

export async function getMediaInfo(filePath: string): Promise<MediaInfo> {
  const result = await Bun.$`ffprobe -v quiet -print_format json -show_format -show_streams ${filePath}`.json();

  const videoStream = result.streams?.find((s: any) => s.codec_type === "video");
  const audioStream = result.streams?.find((s: any) => s.codec_type === "audio");

  if (!videoStream) {
    throw new Error(`No video stream found in ${filePath}`);
  }

  // Parse frame rate
  let fps = 30;
  if (videoStream.r_frame_rate) {
    const [num, den] = videoStream.r_frame_rate.split("/").map(Number);
    fps = den ? num / den : num;
  }

  return {
    width: videoStream.width || 1920,
    height: videoStream.height || 1080,
    duration: parseFloat(result.format?.duration || videoStream.duration || "0"),
    hasAudio: !!audioStream,
    fps,
  };
}

export function calculateGridLayout(
  mediaCount: number,
  canvasWidth: number,
  canvasHeight: number,
  columns?: number,
  rows?: number,
  gap: number = 0
): CellPosition[] {
  // Auto-calculate grid dimensions if not specified
  if (!columns || !rows) {
    const sqrt = Math.sqrt(mediaCount);
    columns = Math.ceil(sqrt);
    rows = Math.ceil(mediaCount / columns);
  }

  const cellWidth = Math.floor((canvasWidth - gap * (columns + 1)) / columns);
  const cellHeight = Math.floor((canvasHeight - gap * (rows + 1)) / rows);

  const positions: CellPosition[] = [];

  for (let i = 0; i < mediaCount; i++) {
    const col = i % columns;
    const row = Math.floor(i / columns);

    positions.push({
      x: gap + col * (cellWidth + gap),
      y: gap + row * (cellHeight + gap),
      width: cellWidth,
      height: cellHeight,
      mediaIndex: i,
    });
  }

  return positions;
}

export async function generateCollage(config: CollageConfig): Promise<void> {
  const { layout, width, height, duration, fps, output, background = "black", shader, gpu = false } = config;
  let { media } = config;

  // If more than 9 media items, process in batches
  if (media.length > 9) {
    const batchSize = 4;
    const batches: MediaItem[][] = [];
    for (let i = 0; i < media.length; i += batchSize) {
      batches.push(media.slice(i, i + batchSize));
    }
    const tempFiles: MediaItem[] = [];
    for (let i = 0; i < batches.length; i++) {
      const tempOutput = `temp_collage_${i}.mp4`;
      const batchConfig: CollageConfig = {
        output: tempOutput,
        width,
        height,
        duration,
        fps,
        background,
        shader,
        gpu,
        layout,
        media: batches[i],
      };
      await generateCollage(batchConfig);
      tempFiles.push({ path: tempOutput, type: 'video', loop: false });
    }
    media = tempFiles;
  }

  // Calculate positions
  let positions: CellPosition[];
  if (layout.type === "custom" && layout.positions) {
    positions = layout.positions;
  } else {
    positions = calculateGridLayout(
      media.length,
      width,
      height,
      layout.columns,
      layout.rows,
      layout.gap
    );
  }

  // Build FFmpeg filter complex
  const inputs: string[] = [];
  const filterParts: string[] = [];
  const overlayChain: string[] = [];

  // Disable loop for videos to avoid FFmpeg issues
  for (const item of media) {
    if (item.type === "video") {
      item.loop = false;
    }
  }

  // Add background
  filterParts.push(`color=c=${background}:s=${width}x${height}:d=${duration}:r=${fps}[bg]`);

  for (let i = 0; i < media.length; i++) {
    const item = media[i];
    const pos = positions[i];
    if (!pos) continue;

    inputs.push("-i", item.path);

    const inputLabel = `[${i}:v]`;
    const scaledLabel = `[v${i}]`;
    const loopedLabel = `[vl${i}]`;

    if (item.type === "image") {
      // For images: loop for duration
      filterParts.push(
        `${inputLabel}loop=loop=-1:size=1:start=0,setpts=N/FRAME_RATE/TB,scale=${pos.width}:${pos.height}:force_original_aspect_ratio=decrease,pad=${pos.width}:${pos.height}:(ow-iw)/2:(oh-ih)/2:color=${background},trim=duration=${duration},setpts=PTS-STARTPTS${scaledLabel}`
      );
    } else {
      // For videos: loop if needed, scale to fit cell
      const loopFilter = item.loop !== false ? `loop=loop=-1:size=10000:start=0,` : "";
      filterParts.push(
        `${inputLabel}${loopFilter}setpts=N/FRAME_RATE/TB,scale=${pos.width}:${pos.height}:force_original_aspect_ratio=decrease,pad=${pos.width}:${pos.height}:(ow-iw)/2:(oh-ih)/2:color=${background},trim=duration=${duration},setpts=PTS-STARTPTS${scaledLabel}`
      );
    }
  }

  // Build overlay chain
  let lastLabel = "[bg]";
  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    if (!pos) continue;

    // If this is the last overlay, either apply shader or output directly
    const isLast = i === positions.length - 1;
    const outputLabel = isLast ? (shader ? "[pre_shader]" : "[out]") : `[tmp${i}]`;
    filterParts.push(
      `${lastLabel}[v${i}]overlay=x=${pos.x}:y=${pos.y}:shortest=0${outputLabel}`
    );
    lastLabel = outputLabel;
  }

  // Apply shader effect if specified
  if (shader && AVAILABLE_SHADERS.includes(shader as ShaderType)) {
    const shaderFilter = getShaderFilter(shader as ShaderType, width, height);
    if (shaderFilter) {
      filterParts.push(`[pre_shader]${shaderFilter}[out]`);
    }
  }

  const filterComplex = filterParts.join(";");

  // Build FFmpeg command
  const args = [
    "-y", // Overwrite output
    ...(gpu ? ["-hwaccel", "cuda"] : []), // Use GPU acceleration if enabled
    ...inputs,
    "-filter_complex", filterComplex,
    "-map", "[out]",
    "-c:v", gpu ? "h264_nvenc" : "libx264",
    "-preset", "medium",
    gpu ? "-cq" : "-crf", "23",
    "-pix_fmt", "yuv420p",
    "-t", String(duration),
    "-r", String(fps),
    output,
  ];

  console.log("\nGenerating collage...");
  console.log(`Output: ${output}`);
  console.log(`Resolution: ${width}x${height}`);
  console.log(`Duration: ${duration}s @ ${fps}fps`);
  console.log(`Media items: ${media.length}`);
  if (shader) {
    console.log(`Shader: ${shader}`);
  }
  console.log("");

  try {
    const proc = Bun.spawn(["ffmpeg", ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });

    // Stream stderr for progress
    const decoder = new TextDecoder();
    const reader = proc.stderr.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      // Show progress lines
      if (text.includes("frame=") || text.includes("time=")) {
        process.stdout.write(`\r${text.trim().slice(0, 80)}`);
      }
    }

    await proc.exited;

    if (proc.exitCode !== 0) {
      throw new Error(`FFmpeg exited with code ${proc.exitCode}`);
    }

    console.log("\n\nCollage generated successfully!");
  } catch (error) {
    throw new Error(`FFmpeg error: ${error}`);
  }
}
