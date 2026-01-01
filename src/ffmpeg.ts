import type { MediaInfo, CollageConfig, CellPosition, ShaderType } from "./types";
import type { MediaItem } from "./types";
import { calculateLayout, mediaToLayoutItem, clampPositions, type LayoutType } from "./layout";
import path from "path";

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".tiff"];
const VIDEO_EXTENSIONS = [".mp4", ".mkv", ".avi", ".mov", ".webm", ".flv", ".wmv", ".m4v"];

export const AVAILABLE_SHADERS: ShaderType[] = ["vignette", "bloom", "chromatic", "noise", "crt", "dreamy"];
export const AVAILABLE_LAYOUTS: LayoutType[] = ["grid", "dynamic", "masonry", "treemap", "pack"];

// Encoding presets for different quality/speed tradeoffs
export const ENCODING_PRESETS = {
  ultrafast: { preset: "ultrafast", crf: 28 },
  fast: { preset: "veryfast", crf: 26 },
  balanced: { preset: "medium", crf: 23 },
  quality: { preset: "slow", crf: 20 },
  best: { preset: "veryslow", crf: 18 },
} as const;

// NVENC presets (p1=fastest, p7=slowest/best quality)
export const NVENC_PRESETS = {
  ultrafast: { preset: "p1", cq: 30 },
  fast: { preset: "p2", cq: 26 },
  balanced: { preset: "p4", cq: 23 },
  quality: { preset: "p6", cq: 20 },
  best: { preset: "p7", cq: 18 },
} as const;

export type EncodingPreset = keyof typeof ENCODING_PRESETS;

// Get FFmpeg filter chain for each shader effect
export function getShaderFilter(shader: ShaderType, width: number, height: number): string {
  switch (shader) {
    case "vignette":
      return "vignette=PI/4:0.5";

    case "bloom":
      return "split[a][b];[b]gblur=sigma=20,curves=all='0/0 0.5/0.7 1/1'[blur];[a][blur]blend=all_mode=screen:all_opacity=0.3";

    case "chromatic":
      return "rgbashift=rh=-4:rv=0:gh=0:gv=0:bh=4:bv=0:edge=smear";

    case "noise":
      return "noise=alls=15:allf=t+u";

    case "crt":
      return `format=rgb24,split[a][b];[a]curves=all='0/0.05 0.5/0.5 1/0.95'[c];[b]scale=${width}:${height * 2}:flags=neighbor,scale=${width}:${height}:flags=neighbor[scan];[c][scan]blend=all_mode=multiply:all_opacity=0.15,vignette=PI/3:0.4,noise=alls=8:allf=t`;

    case "dreamy":
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

/**
 * Get media info for a single file
 */
export async function getMediaInfo(filePath: string): Promise<MediaInfo> {
  const result = await Bun.$`ffprobe -v quiet -print_format json -show_format -show_streams ${filePath}`.json();

  const videoStream = result.streams?.find((s: any) => s.codec_type === "video");
  const audioStream = result.streams?.find((s: any) => s.codec_type === "audio");

  if (!videoStream) {
    throw new Error(`No video stream found in ${filePath}`);
  }

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

/**
 * Get media info for multiple files in parallel
 * Significantly faster than sequential calls for large media collections
 */
export async function getMediaInfoBatch(filePaths: string[]): Promise<Map<string, MediaInfo>> {
  const results = new Map<string, MediaInfo>();

  // Process in parallel with concurrency limit to avoid overwhelming system
  const BATCH_SIZE = 8;

  for (let i = 0; i < filePaths.length; i += BATCH_SIZE) {
    const batch = filePaths.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (filePath) => {
      try {
        const info = await getMediaInfo(filePath);
        return { filePath, info, error: null };
      } catch (error) {
        return { filePath, info: null, error };
      }
    });

    const batchResults = await Promise.all(promises);

    for (const result of batchResults) {
      if (result.info) {
        results.set(result.filePath, result.info);
      }
    }
  }

  return results;
}

/**
 * Prepare media items with their info loaded in parallel
 */
export async function prepareMediaItems(media: MediaItem[], duration: number): Promise<MediaItem[]> {
  // Get all video paths that need info
  const videoPaths = media
    .filter(item => item.type === "video" && !item.info)
    .map(item => item.path);

  // Fetch info in parallel
  const infoMap = await getMediaInfoBatch(videoPaths);

  // Update media items with fetched info
  for (const item of media) {
    if (item.type === "video" && !item.info) {
      const info = infoMap.get(item.path);
      if (info) {
        item.info = info;
        item.loop = info.duration < duration;
      }
    }
  }

  return media;
}

// Re-export layout functions for backwards compatibility
export { calculateLayout } from "./layout";
export {
  calculateGridLayout,
  calculateDynamicLayout,
  calculateMasonryLayout,
  calculateTreemapLayout,
  calculatePackLayout,
} from "./layout";

// Legacy function - now delegates to layout module
export function calculateCustomLayout(media: MediaItem[], canvasWidth: number, canvasHeight: number, gap: number = 0): CellPosition[] {
  const items = media.map((m, i) => mediaToLayoutItem(m.info, i));
  return calculateLayout(items, {
    type: "dynamic",
    canvasWidth,
    canvasHeight,
    gap,
  });
}

/**
 * Check if CUDA is available for FFmpeg
 */
export async function checkCudaAvailable(): Promise<boolean> {
  try {
    const result = await Bun.$`ffmpeg -hide_banner -hwaccels 2>&1`.text();
    return result.includes("cuda");
  } catch {
    return false;
  }
}

/**
 * Build CPU-based filter complex (original implementation)
 */
function buildCpuFilterComplex(
  media: MediaItem[],
  positions: CellPosition[],
  config: { width: number; height: number; duration: number; fps: number; background: string; shader?: string }
): { filterParts: string[]; sortedPositions: CellPosition[] } {
  const { width, height, duration, fps, background, shader } = config;
  const filterParts: string[] = [];

  // Add background
  filterParts.push(`color=c=${background}:s=${width}x${height}:d=${duration}:r=${fps}[bg]`);

  for (let i = 0; i < media.length; i++) {
    const item = media[i];
    const pos = positions.find(p => p.mediaIndex === i);
    if (!pos || !item) continue;

    const inputLabel = `[${i}:v]`;
    const scaledLabel = `[v${i}]`;

    if (item.type === "image") {
      filterParts.push(
        `${inputLabel}loop=loop=-1:size=1:start=0,setpts=N/FRAME_RATE/TB,scale=${pos.width}:${pos.height}:flags=lanczos,trim=duration=${duration},setpts=PTS-STARTPTS${scaledLabel}`
      );
    } else {
      const loopFilter = item.loop !== false ? `loop=loop=-1:size=10000:start=0,` : "";
      const scaleFilter = `scale=${pos.width}:${pos.height}:flags=lanczos`;
      filterParts.push(
        `${inputLabel}${loopFilter}${scaleFilter},trim=duration=${duration},setpts=PTS-STARTPTS${scaledLabel}`
      );
    }
  }

  // Build overlay chain - sort positions by index
  const sortedPositions = [...positions].sort((a, b) => a.mediaIndex - b.mediaIndex);

  let lastLabel = "[bg]";
  for (let i = 0; i < sortedPositions.length; i++) {
    const pos = sortedPositions[i];
    if (!pos) continue;

    const isLast = i === sortedPositions.length - 1;
    const outputLabel = isLast ? (shader ? "[pre_shader]" : "[out]") : `[tmp${i}]`;
    filterParts.push(
      `${lastLabel}[v${pos.mediaIndex}]overlay=x=${pos.x}:y=${pos.y}:shortest=0${outputLabel}`
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

  return { filterParts, sortedPositions };
}

/**
 * Build full CUDA GPU filter complex
 * Uses scale_cuda and overlay_cuda for GPU-accelerated processing
 * Downloads to CPU before encoding for maximum compatibility
 */
function buildCudaFilterComplex(
  media: MediaItem[],
  positions: CellPosition[],
  config: { width: number; height: number; duration: number; fps: number; background: string; shader?: string }
): { filterParts: string[]; sortedPositions: CellPosition[] } {
  const { width, height, duration, fps, background, shader } = config;
  const filterParts: string[] = [];

  // Create background and upload to CUDA
  // Use yuv420p format for better compatibility
  filterParts.push(
    `color=c=${background}:s=${width}x${height}:d=${duration}:r=${fps},format=yuv420p,hwupload_cuda[bg_cuda]`
  );

  for (let i = 0; i < media.length; i++) {
    const item = media[i];
    const pos = positions.find(p => p.mediaIndex === i);
    if (!pos || !item) continue;

    const inputLabel = `[${i}:v]`;
    const scaledLabel = `[v${i}_cuda]`;

    if (item.type === "image") {
      // Images: loop, scale on CPU first (for lanczos quality), then upload to CUDA
      filterParts.push(
        `${inputLabel}loop=loop=-1:size=1:start=0,setpts=N/FRAME_RATE/TB,scale=${pos.width}:${pos.height}:flags=lanczos,trim=duration=${duration},setpts=PTS-STARTPTS,format=yuv420p,hwupload_cuda${scaledLabel}`
      );
    } else {
      // Videos: CPU filters first (loop, trim, setpts), then upload to CUDA for scaling
      const loopFilter = item.loop !== false ? `loop=loop=-1:size=10000:start=0,` : "";
      filterParts.push(
        `${inputLabel}${loopFilter}trim=duration=${duration},setpts=PTS-STARTPTS,format=yuv420p,hwupload_cuda,scale_cuda=${pos.width}:${pos.height}${scaledLabel}`
      );
    }
  }

  // Build overlay chain using overlay_cuda - sort positions by index
  const sortedPositions = [...positions].sort((a, b) => a.mediaIndex - b.mediaIndex);

  let lastLabel = "[bg_cuda]";
  for (let i = 0; i < sortedPositions.length; i++) {
    const pos = sortedPositions[i];
    if (!pos) continue;

    const isLast = i === sortedPositions.length - 1;
    const outputLabel = isLast ? "[composite_cuda]" : `[tmp${i}_cuda]`;

    filterParts.push(
      `${lastLabel}[v${pos.mediaIndex}_cuda]overlay_cuda=x=${pos.x}:y=${pos.y}${outputLabel}`
    );
    lastLabel = outputLabel;
  }

  // Always download from CUDA to CPU for encoding compatibility
  // This ensures NVENC gets a format it can handle
  if (shader && AVAILABLE_SHADERS.includes(shader as ShaderType)) {
    const shaderFilter = getShaderFilter(shader as ShaderType, width, height);
    if (shaderFilter) {
      filterParts.push(`[composite_cuda]hwdownload,format=yuv420p,${shaderFilter}[out]`);
    } else {
      filterParts.push(`[composite_cuda]hwdownload,format=yuv420p[out]`);
    }
  } else {
    filterParts.push(`[composite_cuda]hwdownload,format=yuv420p[out]`);
  }

  return { filterParts, sortedPositions };
}

export async function generateCollage(config: CollageConfig): Promise<void> {
  const {
    layout,
    width,
    height,
    duration,
    fps,
    output,
    background = "black",
    shader,
    gpu = false,
    gpuExperimental = false,
    preset = "balanced" as EncodingPreset,
  } = config;
  let { media } = config;

  // GPU mode logic:
  // - gpu: Hybrid mode - CPU filters + NVENC encoding (reliable)
  // - gpuExperimental: Full CUDA pipeline (unreliable, may fail)
  const useNvencEncoding = gpu || gpuExperimental;
  const useCudaFilters = gpuExperimental;

  // Prepare media with parallel info fetching
  console.log("Analyzing media files...");
  media = await prepareMediaItems(media, duration);

  // If more than 12 media items, process in batches
  if (media.length > 12) {
    const batchSize = 6;
    const batches: MediaItem[][] = [];
    for (let i = 0; i < media.length; i += batchSize) {
      batches.push(media.slice(i, i + batchSize));
    }

    console.log(`Processing ${batches.length} batches of media...`);

    const tempFiles: MediaItem[] = [];
    for (let i = 0; i < batches.length; i++) {
      console.log(`\nBatch ${i + 1}/${batches.length}...`);
      const tempOutput = `temp_collage_${i}_${Date.now()}.mp4`;
      const batchMedia = batches[i]!;
      const batchConfig: CollageConfig = {
        output: tempOutput,
        width,
        height,
        duration,
        fps,
        background,
        gpu,
        gpuExperimental,
        layout,
        media: batchMedia,
      };
      await generateCollage(batchConfig);
      const tempInfo = await getMediaInfo(tempOutput);
      tempFiles.push({ path: tempOutput, type: "video", loop: true, info: tempInfo });
    }
    media = tempFiles;
  }

  // Calculate positions using new layout engine
  let positions: CellPosition[];

  if (layout.type === "custom" && layout.positions) {
    positions = layout.positions;
  } else {
    // Convert media to layout items
    const layoutItems = media.map((item, index) => mediaToLayoutItem(item.info, index));

    positions = calculateLayout(layoutItems, {
      type: layout.type as LayoutType,
      canvasWidth: width,
      canvasHeight: height,
      gap: layout.gap || 0,
      columns: layout.columns,
      rows: layout.rows,
    });

    // Ensure positions are within bounds
    positions = clampPositions(positions, width, height);
  }

  // Build inputs array
  const inputs: string[] = [];
  for (let i = 0; i < media.length; i++) {
    const item = media[i];
    const pos = positions.find(p => p.mediaIndex === i);
    if (!pos || !item) continue;
    inputs.push("-i", item.path);
  }

  // Set loop and info for temp collages
  for (const item of media) {
    if (item.path.startsWith("temp_collage_")) {
      item.loop = true;
      if (!item.info) {
        item.info = await getMediaInfo(item.path);
      }
    }
  }

  // Build filter complex based on GPU mode
  const filterConfig = { width, height, duration, fps, background, shader };
  const { filterParts } = useCudaFilters
    ? buildCudaFilterComplex(media, positions, filterConfig)
    : buildCpuFilterComplex(media, positions, filterConfig);

  const filterComplex = filterParts.join(";");

  // Get encoding settings based on GPU mode
  const cpuSettings = ENCODING_PRESETS[preset] || ENCODING_PRESETS.balanced;
  const gpuSettings = NVENC_PRESETS[preset] || NVENC_PRESETS.balanced;

  // Build FFmpeg command with optimized settings
  const args: string[] = ["-y"];

  // Hardware acceleration only for experimental CUDA mode
  // Hybrid mode uses CPU decode (fast enough, avoids format issues)
  if (useCudaFilters) {
    args.push("-hwaccel", "cuda");
  }

  args.push(...inputs);
  args.push("-filter_complex", filterComplex);

  // Map output - always [out] now (CUDA filters download to CPU before output)
  args.push("-map", "[out]");

  // Encoder settings
  if (useNvencEncoding) {
    args.push(
      "-c:v", "h264_nvenc",
      "-preset", gpuSettings.preset,
      "-cq", String(gpuSettings.cq),
      "-b:v", "0", // Use CQ mode (constant quality)
      "-rc", "vbr", // Variable bitrate for better quality
    );
  } else {
    args.push(
      "-c:v", "libx264",
      "-preset", cpuSettings.preset,
      "-crf", String(cpuSettings.crf),
      "-threads", "0", // Auto-detect threads
    );
  }

  args.push(
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    "-t", String(duration),
    "-r", String(fps),
    output,
  );

  // Log configuration
  console.log("\nGenerating collage...");
  console.log(`Output: ${output}`);
  console.log(`Resolution: ${width}x${height}`);
  console.log(`Duration: ${duration}s @ ${fps}fps`);
  console.log(`Layout: ${layout.type}`);
  console.log(`Media items: ${media.length}`);
  const gpuModeLabel = useCudaFilters
    ? "Experimental CUDA pipeline"
    : useNvencEncoding
      ? "Hybrid (CPU filters + NVENC)"
      : "CPU";
  console.log(`GPU: ${gpuModeLabel}`);
  console.log(`Preset: ${preset}`);
  if (shader) {
    console.log(`Shader: ${shader}`);
  }
  console.log("");

  try {
    const proc = Bun.spawn(["ffmpeg", ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const decoder = new TextDecoder();
    const reader = proc.stderr.getReader();
    let errorOutput = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      errorOutput += text;
      if (text.includes("frame=") || text.includes("time=")) {
        process.stdout.write(`\r${text.trim().slice(0, 80)}`);
      }
    }

    await proc.exited;

    if (proc.exitCode !== 0) {
      // Check for common CUDA errors
      if (useCudaFilters && (errorOutput.includes("cuda") || errorOutput.includes("CUDA") || errorOutput.includes("hwupload") || errorOutput.includes("No NVENC"))) {
        // Extract the actual error for debugging
        const errorLines = errorOutput.split("\n").filter(l =>
          l.includes("Error") || l.includes("error") || l.includes("Cannot") || l.includes("Invalid")
        );
        console.error("\n\nCUDA error detected:");
        if (errorLines.length > 0) {
          console.error(errorLines.slice(-3).join("\n"));
        }
        console.error("Falling back to hybrid mode (CPU filters + NVENC)...\n");
        // Retry with hybrid mode - CPU filters but still NVENC encoding
        const hybridConfig = { ...config, gpu: true, gpuExperimental: false };
        return generateCollage(hybridConfig);
      }
      throw new Error(`FFmpeg exited with code ${proc.exitCode}\n${errorOutput.slice(-500)}`);
    }

    // Clean up temp files
    for (const item of media) {
      if (item.path.startsWith("temp_collage_")) {
        try {
          await Bun.$`rm ${item.path}`.quiet();
        } catch {
          // Ignore cleanup errors
        }
      }
    }

    console.log("\n\nCollage generated successfully!");
  } catch (error) {
    throw new Error(`FFmpeg error: ${error}`);
  }
}
