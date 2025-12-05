import type { MediaInfo, CollageConfig, CellPosition } from "./types";

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tiff"];
const VIDEO_EXTENSIONS = [".mp4", ".mkv", ".avi", ".mov", ".webm", ".flv", ".wmv", ".m4v"];

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
  const { media, layout, width, height, duration, fps, output, background = "black" } = config;

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
      const loopFilter = item.loop !== false ? `loop=loop=-1:size=32767:start=0,` : "";
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

    const outputLabel = i === positions.length - 1 ? "[out]" : `[tmp${i}]`;
    filterParts.push(
      `${lastLabel}[v${i}]overlay=x=${pos.x}:y=${pos.y}:shortest=0${outputLabel}`
    );
    lastLabel = outputLabel;
  }

  const filterComplex = filterParts.join(";");

  // Build FFmpeg command
  const args = [
    "-y", // Overwrite output
    ...inputs,
    "-filter_complex", filterComplex,
    "-map", "[out]",
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "23",
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
