import type { CollageConfig, MediaItem } from "./types";
import { getMediaType } from "./ffmpeg";

const DEFAULT_CONFIG: Partial<CollageConfig> = {
  width: 1920,
  height: 1080,
  duration: 60,
  fps: 30,
  background: "black",
  layout: {
    type: "grid",
    gap: 4,
  },
};

export async function loadConfig(configPath: string): Promise<CollageConfig> {
  const file = Bun.file(configPath);
  if (!(await file.exists())) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const content = await file.text();
  let userConfig: any;

  if (configPath.endsWith(".json")) {
    userConfig = JSON.parse(content);
  } else {
    throw new Error("Config file must be JSON");
  }

  // Merge with defaults
  const config: CollageConfig = {
    ...DEFAULT_CONFIG,
    ...userConfig,
    layout: {
      ...DEFAULT_CONFIG.layout,
      ...userConfig.layout,
    },
  } as CollageConfig;

  // Validate required fields
  if (!config.output) {
    throw new Error("Config must specify 'output' path");
  }

  if (!config.media || config.media.length === 0) {
    throw new Error("Config must specify at least one media item");
  }

  // Process media items
  config.media = await processMediaItems(config.media);

  return config;
}

async function processMediaItems(items: any[]): Promise<MediaItem[]> {
  const processed: MediaItem[] = [];

  for (const item of items) {
    let mediaItem: MediaItem;

    if (typeof item === "string") {
      // Simple path string
      const type = getMediaType(item);
      if (!type) {
        console.warn(`Skipping unsupported file: ${item}`);
        continue;
      }
      mediaItem = { path: item, type };
    } else {
      // Full object
      const type = item.type || getMediaType(item.path);
      if (!type) {
        console.warn(`Skipping unsupported file: ${item.path}`);
        continue;
      }
      mediaItem = {
        path: item.path,
        type,
        duration: item.duration,
        loop: item.loop,
      };
    }

    // Check if file exists
    const file = Bun.file(mediaItem.path);
    if (!(await file.exists())) {
      throw new Error(`Media file not found: ${mediaItem.path}`);
    }

    processed.push(mediaItem);
  }

  return processed;
}

export async function scanDirectory(dirPath: string): Promise<MediaItem[]> {
  const items: MediaItem[] = [];
  const glob = new Bun.Glob("**/*.{jpg,jpeg,png,gif,bmp,webp,mp4,mkv,avi,mov,webm}");

  for await (const file of glob.scan({ cwd: dirPath, absolute: true })) {
    const type = getMediaType(file);
    if (type) {
      items.push({ path: file, type, loop: true });
    }
  }

  return items;
}

export function generateSampleConfig(): string {
  const sample: CollageConfig = {
    output: "collage.mp4",
    width: 1920,
    height: 1080,
    duration: 60,
    fps: 30,
    background: "black",
    layout: {
      type: "grid",
      columns: 3,
      rows: 2,
      gap: 4,
    },
    media: [
      { path: "/path/to/video1.mp4", type: "video", loop: true },
      { path: "/path/to/image1.jpg", type: "image" },
      { path: "/path/to/video2.mp4", type: "video", loop: true },
      { path: "/path/to/image2.png", type: "image" },
    ],
  };

  return JSON.stringify(sample, null, 2);
}
