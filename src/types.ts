export interface MediaItem {
  path: string;
  type: "video" | "image";
  duration?: number; // For images, how long to display (seconds)
  loop?: boolean; // Whether to loop videos
}

export interface CollageConfig {
  output: string;
  width: number;
  height: number;
  duration: number; // Total output duration in seconds
  fps: number;
  layout: LayoutConfig;
  media: MediaItem[];
  background?: string; // Background color (default: black)
}

export interface LayoutConfig {
  type: "grid" | "custom";
  columns?: number;
  rows?: number;
  gap?: number;
  positions?: CellPosition[]; // For custom layouts
}

export interface CellPosition {
  x: number;
  y: number;
  width: number;
  height: number;
  mediaIndex: number;
}

export interface MediaInfo {
  width: number;
  height: number;
  duration: number;
  hasAudio: boolean;
  fps: number;
}
