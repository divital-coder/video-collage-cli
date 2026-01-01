import { test, expect, describe } from "bun:test";
import {
  getMediaType,
  getShaderFilter,
  AVAILABLE_SHADERS,
  AVAILABLE_LAYOUTS,
  ENCODING_PRESETS,
  NVENC_PRESETS,
} from "./ffmpeg";

describe("FFmpeg Utilities", () => {
  describe("getMediaType", () => {
    test("identifies video files", () => {
      expect(getMediaType("video.mp4")).toBe("video");
      expect(getMediaType("video.mkv")).toBe("video");
      expect(getMediaType("video.avi")).toBe("video");
      expect(getMediaType("video.mov")).toBe("video");
      expect(getMediaType("video.webm")).toBe("video");
      expect(getMediaType("video.flv")).toBe("video");
      expect(getMediaType("video.wmv")).toBe("video");
      expect(getMediaType("video.m4v")).toBe("video");
    });

    test("identifies image files", () => {
      expect(getMediaType("image.jpg")).toBe("image");
      expect(getMediaType("image.jpeg")).toBe("image");
      expect(getMediaType("image.png")).toBe("image");
      expect(getMediaType("image.gif")).toBe("image");
      expect(getMediaType("image.bmp")).toBe("image");
      expect(getMediaType("image.webp")).toBe("image");
      expect(getMediaType("image.tiff")).toBe("image");
    });

    test("handles uppercase extensions", () => {
      expect(getMediaType("VIDEO.MP4")).toBe("video");
      expect(getMediaType("IMAGE.PNG")).toBe("image");
    });

    test("returns null for unsupported formats", () => {
      expect(getMediaType("document.pdf")).toBeNull();
      expect(getMediaType("audio.mp3")).toBeNull();
      expect(getMediaType("archive.zip")).toBeNull();
      expect(getMediaType("noextension")).toBeNull();
    });

    test("handles paths with directories", () => {
      expect(getMediaType("/path/to/video.mp4")).toBe("video");
      expect(getMediaType("./relative/path/image.jpg")).toBe("image");
    });
  });

  describe("getShaderFilter", () => {
    test("returns vignette filter", () => {
      const filter = getShaderFilter("vignette", 1920, 1080);
      expect(filter).toContain("vignette");
    });

    test("returns bloom filter", () => {
      const filter = getShaderFilter("bloom", 1920, 1080);
      expect(filter).toContain("gblur");
      expect(filter).toContain("blend");
    });

    test("returns chromatic filter", () => {
      const filter = getShaderFilter("chromatic", 1920, 1080);
      expect(filter).toContain("rgbashift");
    });

    test("returns noise filter", () => {
      const filter = getShaderFilter("noise", 1920, 1080);
      expect(filter).toContain("noise");
    });

    test("returns crt filter with dimensions", () => {
      const filter = getShaderFilter("crt", 1920, 1080);
      expect(filter).toContain("1920");
      expect(filter).toContain("scale"); // Uses scale for scanline effect
      expect(filter).toContain("vignette");
    });

    test("returns dreamy filter", () => {
      const filter = getShaderFilter("dreamy", 1920, 1080);
      expect(filter).toContain("gblur");
      expect(filter).toContain("softlight");
    });

    test("returns empty string for unknown shader", () => {
      // @ts-expect-error Testing invalid input
      const filter = getShaderFilter("unknown", 1920, 1080);
      expect(filter).toBe("");
    });
  });

  describe("Constants", () => {
    test("AVAILABLE_SHADERS has all expected shaders", () => {
      expect(AVAILABLE_SHADERS).toContain("vignette");
      expect(AVAILABLE_SHADERS).toContain("bloom");
      expect(AVAILABLE_SHADERS).toContain("chromatic");
      expect(AVAILABLE_SHADERS).toContain("noise");
      expect(AVAILABLE_SHADERS).toContain("crt");
      expect(AVAILABLE_SHADERS).toContain("dreamy");
      expect(AVAILABLE_SHADERS).toHaveLength(6);
    });

    test("AVAILABLE_LAYOUTS has all expected layouts", () => {
      expect(AVAILABLE_LAYOUTS).toContain("grid");
      expect(AVAILABLE_LAYOUTS).toContain("dynamic");
      expect(AVAILABLE_LAYOUTS).toContain("masonry");
      expect(AVAILABLE_LAYOUTS).toContain("treemap");
      expect(AVAILABLE_LAYOUTS).toContain("pack");
      expect(AVAILABLE_LAYOUTS).toHaveLength(5);
    });

    test("ENCODING_PRESETS has valid CPU settings", () => {
      expect(ENCODING_PRESETS.ultrafast.preset).toBe("ultrafast");
      expect(ENCODING_PRESETS.fast.preset).toBe("veryfast");
      expect(ENCODING_PRESETS.balanced.preset).toBe("medium");
      expect(ENCODING_PRESETS.quality.preset).toBe("slow");
      expect(ENCODING_PRESETS.best.preset).toBe("veryslow");

      // CRF values should be reasonable (18-28 range)
      for (const preset of Object.values(ENCODING_PRESETS)) {
        expect(preset.crf).toBeGreaterThanOrEqual(18);
        expect(preset.crf).toBeLessThanOrEqual(28);
      }
    });

    test("NVENC_PRESETS has valid GPU settings", () => {
      expect(NVENC_PRESETS.ultrafast.preset).toBe("p1");
      expect(NVENC_PRESETS.fast.preset).toBe("p2");
      expect(NVENC_PRESETS.balanced.preset).toBe("p4");
      expect(NVENC_PRESETS.quality.preset).toBe("p6");
      expect(NVENC_PRESETS.best.preset).toBe("p7");

      // CQ values should be reasonable (18-30 range)
      for (const preset of Object.values(NVENC_PRESETS)) {
        expect(preset.cq).toBeGreaterThanOrEqual(18);
        expect(preset.cq).toBeLessThanOrEqual(30);
      }
    });
  });
});
