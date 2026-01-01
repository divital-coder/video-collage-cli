import { test, expect, describe } from "bun:test";
import {
  calculateLayout,
  calculateGridLayout,
  calculateDynamicLayout,
  calculateMasonryLayout,
  calculateTreemapLayout,
  calculatePackLayout,
  mediaToLayoutItem,
  clampPositions,
  type LayoutItem,
} from "./layout";

describe("Layout Engine", () => {
  const createItems = (count: number, aspect: number = 16 / 9): LayoutItem[] =>
    Array.from({ length: count }, (_, i) => ({ index: i, aspect }));

  describe("calculateGridLayout", () => {
    test("creates correct number of cells", () => {
      const positions = calculateGridLayout(6, 1920, 1080, 3, 2, 0);
      expect(positions).toHaveLength(6);
    });

    test("auto-calculates columns and rows when not specified", () => {
      const positions = calculateGridLayout(9, 1920, 1080);
      expect(positions).toHaveLength(9);
      // Should create 3x3 grid for 9 items
      const cols = new Set(positions.map((p) => p.x)).size;
      expect(cols).toBe(3);
    });

    test("positions cells correctly with gap", () => {
      const positions = calculateGridLayout(4, 1000, 1000, 2, 2, 10);
      expect(positions[0].x).toBe(10); // First cell starts after gap
      expect(positions[0].y).toBe(10);
      expect(positions[1].x).toBeGreaterThan(positions[0].x); // Second cell to the right
    });

    test("all cells have positive dimensions", () => {
      const positions = calculateGridLayout(12, 1920, 1080, 4, 3, 8);
      for (const pos of positions) {
        expect(pos.width).toBeGreaterThan(0);
        expect(pos.height).toBeGreaterThan(0);
      }
    });
  });

  describe("calculateDynamicLayout", () => {
    test("returns empty array for no items", () => {
      const positions = calculateDynamicLayout([], 1920, 1080, 0);
      expect(positions).toHaveLength(0);
    });

    test("single item fills canvas while preserving aspect", () => {
      const items = createItems(1, 16 / 9);
      const positions = calculateDynamicLayout(items, 1920, 1080, 0);
      expect(positions).toHaveLength(1);
      expect(positions[0].width).toBeGreaterThan(0);
      expect(positions[0].height).toBeGreaterThan(0);
    });

    test("multiple items create valid positions", () => {
      const items = createItems(6, 16 / 9);
      const positions = calculateDynamicLayout(items, 1920, 1080, 10);
      expect(positions).toHaveLength(6);

      for (const pos of positions) {
        expect(pos.x).toBeGreaterThanOrEqual(0);
        expect(pos.y).toBeGreaterThanOrEqual(0);
        expect(pos.width).toBeGreaterThan(0);
        expect(pos.height).toBeGreaterThan(0);
        expect(pos.x + pos.width).toBeLessThanOrEqual(1920);
        expect(pos.y + pos.height).toBeLessThanOrEqual(1080);
      }
    });

    test("handles mixed aspect ratios", () => {
      const items: LayoutItem[] = [
        { index: 0, aspect: 16 / 9 },
        { index: 1, aspect: 4 / 3 },
        { index: 2, aspect: 1 },
        { index: 3, aspect: 9 / 16 },
      ];
      const positions = calculateDynamicLayout(items, 1920, 1080, 0);
      expect(positions).toHaveLength(4);
    });
  });

  describe("calculateMasonryLayout", () => {
    test("returns empty array for no items", () => {
      const positions = calculateMasonryLayout([], 1920, 1080, 0);
      expect(positions).toHaveLength(0);
    });

    test("creates specified number of columns", () => {
      const items = createItems(8);
      const positions = calculateMasonryLayout(items, 1920, 1080, 10, 4);

      // Check that items are distributed across 4 columns
      const xValues = new Set(positions.map((p) => p.x));
      expect(xValues.size).toBeLessThanOrEqual(4);
    });

    test("all items have valid positions", () => {
      const items = createItems(10);
      const positions = calculateMasonryLayout(items, 1920, 1080, 8);

      for (const pos of positions) {
        expect(pos.width).toBeGreaterThan(0);
        expect(pos.height).toBeGreaterThan(0);
      }
    });
  });

  describe("calculateTreemapLayout", () => {
    test("returns empty array for no items", () => {
      const positions = calculateTreemapLayout([], 1920, 1080, 0);
      expect(positions).toHaveLength(0);
    });

    test("single item fills the canvas", () => {
      const items = createItems(1);
      const positions = calculateTreemapLayout(items, 1920, 1080, 0);
      expect(positions).toHaveLength(1);
      expect(positions[0].width).toBeGreaterThan(1000);
      expect(positions[0].height).toBeGreaterThan(500);
    });

    test("all items get valid positions", () => {
      const items = createItems(8);
      const positions = calculateTreemapLayout(items, 1920, 1080, 4);

      expect(positions).toHaveLength(8);
      for (const pos of positions) {
        expect(pos.width).toBeGreaterThan(0);
        expect(pos.height).toBeGreaterThan(0);
      }
    });
  });

  describe("calculatePackLayout", () => {
    test("returns empty array for no items", () => {
      const positions = calculatePackLayout([], 1920, 1080, 0);
      expect(positions).toHaveLength(0);
    });

    test("creates valid positions for multiple items", () => {
      const items = createItems(6);
      const positions = calculatePackLayout(items, 1920, 1080, 8);

      expect(positions).toHaveLength(6);
      for (const pos of positions) {
        expect(pos.width).toBeGreaterThan(0);
        expect(pos.height).toBeGreaterThan(0);
      }
    });
  });

  describe("calculateLayout dispatcher", () => {
    const items = createItems(4);
    const options = {
      canvasWidth: 1920,
      canvasHeight: 1080,
      gap: 10,
    };

    test("dispatches to grid layout", () => {
      const positions = calculateLayout(items, { ...options, type: "grid" });
      expect(positions).toHaveLength(4);
    });

    test("dispatches to dynamic layout", () => {
      const positions = calculateLayout(items, { ...options, type: "dynamic" });
      expect(positions).toHaveLength(4);
    });

    test("dispatches to masonry layout", () => {
      const positions = calculateLayout(items, { ...options, type: "masonry" });
      expect(positions).toHaveLength(4);
    });

    test("dispatches to treemap layout", () => {
      const positions = calculateLayout(items, { ...options, type: "treemap" });
      expect(positions).toHaveLength(4);
    });

    test("dispatches to pack layout", () => {
      const positions = calculateLayout(items, { ...options, type: "pack" });
      expect(positions).toHaveLength(4);
    });

    test("defaults to dynamic layout for unknown type", () => {
      const positions = calculateLayout(items, {
        ...options,
        type: "dynamic",
      });
      expect(positions).toHaveLength(4);
    });
  });

  describe("mediaToLayoutItem", () => {
    test("converts media info to layout item", () => {
      const info = { width: 1920, height: 1080, duration: 60, hasAudio: true, fps: 30 };
      const item = mediaToLayoutItem(info, 5);

      expect(item.index).toBe(5);
      expect(item.aspect).toBeCloseTo(16 / 9, 2);
    });

    test("uses default aspect ratio for undefined info", () => {
      const item = mediaToLayoutItem(undefined, 0);

      expect(item.index).toBe(0);
      expect(item.aspect).toBeCloseTo(16 / 9, 2);
    });
  });

  describe("clampPositions", () => {
    test("clamps positions within canvas bounds", () => {
      const positions = [
        { x: -10, y: -10, width: 100, height: 100, mediaIndex: 0 },
        { x: 1900, y: 1000, width: 100, height: 200, mediaIndex: 1 },
      ];

      const clamped = clampPositions(positions, 1920, 1080);

      expect(clamped[0].x).toBe(0);
      expect(clamped[0].y).toBe(0);
      expect(clamped[1].x + clamped[1].width).toBeLessThanOrEqual(1920);
      expect(clamped[1].y + clamped[1].height).toBeLessThanOrEqual(1080);
    });

    test("preserves valid positions", () => {
      const positions = [
        { x: 100, y: 100, width: 200, height: 200, mediaIndex: 0 },
      ];

      const clamped = clampPositions(positions, 1920, 1080);

      expect(clamped[0].x).toBe(100);
      expect(clamped[0].y).toBe(100);
      expect(clamped[0].width).toBe(200);
      expect(clamped[0].height).toBe(200);
    });
  });
});
