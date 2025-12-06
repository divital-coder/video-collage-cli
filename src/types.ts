export interface MediaItem {
  path: string;
  type: "video" | "image";
  duration?: number; // For images, how long to display (seconds)
  loop?: boolean; // Whether to loop videos
  info?: MediaInfo; // Media info for scaling decisions
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
  shader?: string; // Shader effect to apply (vignette, bloom, chromatic, noise, crt, dreamy)
  gpu?: boolean; // Use GPU encoding
}

export type ShaderType = "vignette" | "bloom" | "chromatic" | "noise" | "crt" | "dreamy";

export interface LayoutConfig {
  type: "grid" | "custom" | "dynamic";
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
