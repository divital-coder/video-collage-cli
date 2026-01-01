/**
 * Advanced Layout Engine for Video Collage CLI
 *
 * Provides multiple layout algorithms for dynamically tiling videos
 * within canvas space, preserving aspect ratios and eliminating
 * fixed square constraints.
 */

import type { MediaInfo, CellPosition } from "./types";

export interface LayoutItem {
  index: number;
  aspect: number;  // width / height
  area?: number;   // optional weight for treemap
}

export type LayoutType = "grid" | "dynamic" | "masonry" | "treemap" | "pack";

export interface LayoutOptions {
  type: LayoutType;
  canvasWidth: number;
  canvasHeight: number;
  gap?: number;
  columns?: number;
  rows?: number;
  padding?: number;
}

/**
 * Main layout calculator - dispatches to appropriate algorithm
 */
export function calculateLayout(
  items: LayoutItem[],
  options: LayoutOptions
): CellPosition[] {
  const { type, canvasWidth, canvasHeight, gap = 0 } = options;

  switch (type) {
    case "grid":
      return calculateGridLayout(items.length, canvasWidth, canvasHeight, options.columns, options.rows, gap);
    case "masonry":
      return calculateMasonryLayout(items, canvasWidth, canvasHeight, gap, options.columns);
    case "treemap":
      return calculateTreemapLayout(items, canvasWidth, canvasHeight, gap);
    case "pack":
      return calculatePackLayout(items, canvasWidth, canvasHeight, gap);
    case "dynamic":
    default:
      return calculateDynamicLayout(items, canvasWidth, canvasHeight, gap);
  }
}

/**
 * Traditional uniform grid layout
 */
export function calculateGridLayout(
  mediaCount: number,
  canvasWidth: number,
  canvasHeight: number,
  columns?: number,
  rows?: number,
  gap: number = 0
): CellPosition[] {
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

/**
 * Dynamic row-based layout that preserves aspect ratios.
 * Groups items into rows with heights calculated to fill space optimally.
 */
export function calculateDynamicLayout(
  items: LayoutItem[],
  canvasWidth: number,
  canvasHeight: number,
  gap: number = 0
): CellPosition[] {
  if (items.length === 0) {
    return [];
  }

  if (items.length === 1) {
    // Single item fills the canvas while preserving aspect ratio
    const item = items[0];
    const canvasAspect = canvasWidth / canvasHeight;
    let width: number, height: number, x: number, y: number;

    if (item.aspect > canvasAspect) {
      width = canvasWidth - gap * 2;
      height = Math.floor(width / item.aspect);
      x = gap;
      y = Math.floor((canvasHeight - height) / 2);
    } else {
      height = canvasHeight - gap * 2;
      width = Math.floor(height * item.aspect);
      x = Math.floor((canvasWidth - width) / 2);
      y = gap;
    }

    return [{
      x, y, width, height,
      mediaIndex: item.index,
    }];
  }

  // Calculate optimal row distribution using linear partitioning
  const rows = partitionIntoRows(items, canvasWidth, canvasHeight, gap);

  const positions: CellPosition[] = [];
  let currentY = gap;
  const availableHeight = canvasHeight - gap * (rows.length + 1);

  // Calculate total ideal height
  let totalIdealHeight = 0;
  for (const row of rows) {
    const totalGaps = gap * (row.length - 1);
    const availableWidth = canvasWidth - gap * 2 - totalGaps;
    const totalAspect = row.reduce((sum, item) => sum + item.aspect, 0);
    totalIdealHeight += availableWidth / totalAspect;
  }

  // Scale factor to fit all rows
  const scaleFactor = availableHeight / totalIdealHeight;

  for (const row of rows) {
    if (row.length === 0) continue;

    const totalGaps = gap * (row.length - 1);
    const availableWidth = canvasWidth - gap * 2 - totalGaps;
    const totalAspect = row.reduce((sum, item) => sum + item.aspect, 0);
    const rowHeight = Math.floor((availableWidth / totalAspect) * scaleFactor);

    let currentX = gap;

    for (let i = 0; i < row.length; i++) {
      const item = row[i];
      // Last item in row takes remaining space to avoid gaps
      const isLast = i === row.length - 1;
      const cellWidth = isLast
        ? canvasWidth - gap - currentX
        : Math.floor(rowHeight * item.aspect);

      positions.push({
        x: currentX,
        y: currentY,
        width: cellWidth,
        height: rowHeight,
        mediaIndex: item.index,
      });

      currentX += cellWidth + gap;
    }

    currentY += rowHeight + gap;
  }

  return positions;
}

/**
 * Partition items into rows using greedy algorithm optimized for visual balance
 */
function partitionIntoRows(
  items: LayoutItem[],
  canvasWidth: number,
  canvasHeight: number,
  gap: number
): LayoutItem[][] {
  // Sort by aspect ratio for better grouping (wide with wide)
  const sorted = [...items].sort((a, b) => b.aspect - a.aspect);

  // Calculate optimal number of rows based on canvas aspect
  const canvasAspect = canvasWidth / canvasHeight;
  const avgAspect = items.reduce((sum, i) => sum + i.aspect, 0) / items.length;
  const targetRows = Math.max(1, Math.round(Math.sqrt(items.length / (canvasAspect / avgAspect))));
  const targetItemsPerRow = Math.ceil(items.length / targetRows);

  const rows: LayoutItem[][] = [];
  let currentRow: LayoutItem[] = [];

  for (const item of sorted) {
    currentRow.push(item);

    if (currentRow.length >= targetItemsPerRow) {
      rows.push(currentRow);
      currentRow = [];
    }
  }

  if (currentRow.length > 0) {
    // Distribute orphaned items
    if (currentRow.length === 1 && rows.length > 0) {
      // Move to previous row if it would look better
      const prevRow = rows[rows.length - 1];
      if (prevRow.length <= targetItemsPerRow + 1) {
        prevRow.push(currentRow[0]);
      } else {
        rows.push(currentRow);
      }
    } else {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Masonry layout (Pinterest-style vertical columns)
 * Items flow into the shortest column, preserving aspect ratios
 */
export function calculateMasonryLayout(
  items: LayoutItem[],
  canvasWidth: number,
  canvasHeight: number,
  gap: number = 0,
  columnCount?: number
): CellPosition[] {
  if (items.length === 0) return [];

  // Auto-calculate column count based on item count and canvas aspect
  const cols = columnCount || Math.max(2, Math.ceil(Math.sqrt(items.length)));
  const colWidth = Math.floor((canvasWidth - gap * (cols + 1)) / cols);

  // Track height of each column
  const colHeights: number[] = new Array(cols).fill(gap);
  const positions: CellPosition[] = [];

  for (const item of items) {
    // Find shortest column
    let minHeight = Infinity;
    let targetCol = 0;
    for (let c = 0; c < cols; c++) {
      if (colHeights[c] < minHeight) {
        minHeight = colHeights[c];
        targetCol = c;
      }
    }

    const x = gap + targetCol * (colWidth + gap);
    const y = colHeights[targetCol];
    const height = Math.floor(colWidth / item.aspect);

    positions.push({
      x,
      y,
      width: colWidth,
      height,
      mediaIndex: item.index,
    });

    colHeights[targetCol] += height + gap;
  }

  // Scale to fit canvas height if needed
  const maxHeight = Math.max(...colHeights);
  if (maxHeight > canvasHeight) {
    const scale = (canvasHeight - gap) / maxHeight;
    for (const pos of positions) {
      pos.y = Math.floor(pos.y * scale);
      pos.height = Math.floor(pos.height * scale);
    }
  }

  return positions;
}

/**
 * Treemap layout - fills entire canvas with no gaps between items.
 * Uses squarified treemap algorithm for optimal aspect ratios.
 */
export function calculateTreemapLayout(
  items: LayoutItem[],
  canvasWidth: number,
  canvasHeight: number,
  gap: number = 0
): CellPosition[] {
  if (items.length === 0) return [];

  // Assign area weights based on aspect ratio (wider items get more space)
  const totalArea = (canvasWidth - gap * 2) * (canvasHeight - gap * 2);
  const weightedItems = items.map((item, i) => ({
    ...item,
    area: item.area || Math.max(1, item.aspect),
  }));

  // Normalize areas
  const totalWeight = weightedItems.reduce((sum, item) => sum + item.area!, 0);
  for (const item of weightedItems) {
    item.area = (item.area! / totalWeight) * totalArea;
  }

  // Sort by area descending for better layout
  weightedItems.sort((a, b) => b.area! - a.area!);

  // Squarified treemap algorithm
  const rect = {
    x: gap,
    y: gap,
    width: canvasWidth - gap * 2,
    height: canvasHeight - gap * 2,
  };

  return squarify(weightedItems, rect, gap);
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Squarified treemap implementation
 */
function squarify(
  items: LayoutItem[],
  rect: Rect,
  gap: number
): CellPosition[] {
  if (items.length === 0) return [];
  if (items.length === 1) {
    return [{
      x: Math.floor(rect.x),
      y: Math.floor(rect.y),
      width: Math.floor(rect.width),
      height: Math.floor(rect.height),
      mediaIndex: items[0].index,
    }];
  }

  const positions: CellPosition[] = [];
  let remaining = [...items];
  let currentRect = { ...rect };

  while (remaining.length > 0) {
    const isWide = currentRect.width >= currentRect.height;
    const side = isWide ? currentRect.height : currentRect.width;

    // Find optimal row for current orientation
    const { row, rest } = layoutRow(remaining, side, currentRect);

    // Calculate positions for this row
    const rowArea = row.reduce((sum, item) => sum + item.area!, 0);
    const rowSize = rowArea / side;

    let offset = 0;
    for (const item of row) {
      const itemSize = item.area! / rowSize;

      if (isWide) {
        positions.push({
          x: Math.floor(currentRect.x),
          y: Math.floor(currentRect.y + offset),
          width: Math.floor(rowSize - gap / 2),
          height: Math.floor(itemSize - gap / 2),
          mediaIndex: item.index,
        });
      } else {
        positions.push({
          x: Math.floor(currentRect.x + offset),
          y: Math.floor(currentRect.y),
          width: Math.floor(itemSize - gap / 2),
          height: Math.floor(rowSize - gap / 2),
          mediaIndex: item.index,
        });
      }
      offset += itemSize;
    }

    // Update remaining rect
    if (isWide) {
      currentRect.x += rowSize;
      currentRect.width -= rowSize;
    } else {
      currentRect.y += rowSize;
      currentRect.height -= rowSize;
    }

    remaining = rest;
  }

  return positions;
}

/**
 * Find optimal row of items for squarified treemap
 */
function layoutRow(
  items: LayoutItem[],
  side: number,
  rect: Rect
): { row: LayoutItem[]; rest: LayoutItem[] } {
  if (items.length === 0) return { row: [], rest: [] };
  if (items.length === 1) return { row: items, rest: [] };

  const row: LayoutItem[] = [items[0]];
  let rowArea = items[0].area!;
  let bestAspect = worstAspectRatio(row, side);

  for (let i = 1; i < items.length; i++) {
    const testRow = [...row, items[i]];
    const testArea = rowArea + items[i].area!;
    const testAspect = worstAspectRatio(testRow, side);

    if (testAspect > bestAspect) {
      // Adding this item makes aspect ratio worse, stop here
      break;
    }

    row.push(items[i]);
    rowArea = testArea;
    bestAspect = testAspect;
  }

  return {
    row,
    rest: items.slice(row.length),
  };
}

/**
 * Calculate worst aspect ratio in a row
 */
function worstAspectRatio(row: LayoutItem[], side: number): number {
  const totalArea = row.reduce((sum, item) => sum + item.area!, 0);
  const rowWidth = totalArea / side;

  let worst = 0;
  for (const item of row) {
    const itemHeight = item.area! / rowWidth;
    const aspect = Math.max(rowWidth / itemHeight, itemHeight / rowWidth);
    worst = Math.max(worst, aspect);
  }
  return worst;
}

/**
 * Pack layout - bin packing algorithm that places items to minimize wasted space.
 * Good for mixed aspect ratios with varying sizes.
 */
export function calculatePackLayout(
  items: LayoutItem[],
  canvasWidth: number,
  canvasHeight: number,
  gap: number = 0
): CellPosition[] {
  if (items.length === 0) return [];

  // Calculate ideal item size based on count
  const avgArea = (canvasWidth * canvasHeight) / items.length;
  const targetHeight = Math.sqrt(avgArea);

  // Calculate dimensions for each item
  const itemDims = items.map(item => ({
    ...item,
    width: Math.floor(targetHeight * item.aspect),
    height: Math.floor(targetHeight),
  }));

  // Sort by height descending for shelf algorithm
  itemDims.sort((a, b) => b.height - a.height);

  // Simple shelf packing
  const shelves: { y: number; height: number; width: number }[] = [];
  const positions: CellPosition[] = [];

  for (const item of itemDims) {
    let placed = false;

    // Try to fit on existing shelf
    for (const shelf of shelves) {
      if (shelf.width + item.width + gap <= canvasWidth && item.height <= shelf.height) {
        positions.push({
          x: shelf.width + gap,
          y: shelf.y,
          width: item.width,
          height: item.height,
          mediaIndex: item.index,
        });
        shelf.width += item.width + gap;
        placed = true;
        break;
      }
    }

    // Create new shelf
    if (!placed) {
      const shelfY = shelves.length === 0
        ? gap
        : shelves[shelves.length - 1].y + shelves[shelves.length - 1].height + gap;

      shelves.push({
        y: shelfY,
        height: item.height,
        width: item.width + gap,
      });

      positions.push({
        x: gap,
        y: shelfY,
        width: item.width,
        height: item.height,
        mediaIndex: item.index,
      });
    }
  }

  // Scale to fit canvas
  const maxY = Math.max(...positions.map(p => p.y + p.height));
  const maxX = Math.max(...positions.map(p => p.x + p.width));

  const scaleX = (canvasWidth - gap * 2) / maxX;
  const scaleY = (canvasHeight - gap * 2) / maxY;
  const scale = Math.min(scaleX, scaleY);

  const offsetX = Math.floor((canvasWidth - maxX * scale) / 2);
  const offsetY = Math.floor((canvasHeight - maxY * scale) / 2);

  for (const pos of positions) {
    pos.x = Math.floor(pos.x * scale + offsetX);
    pos.y = Math.floor(pos.y * scale + offsetY);
    pos.width = Math.floor(pos.width * scale);
    pos.height = Math.floor(pos.height * scale);
  }

  return positions;
}

/**
 * Get media info as LayoutItem format
 */
export function mediaToLayoutItem(info: MediaInfo | undefined, index: number): LayoutItem {
  return {
    index,
    aspect: info ? info.width / info.height : 16 / 9,
  };
}

/**
 * Validate and adjust positions to ensure they fit within canvas bounds
 */
export function clampPositions(
  positions: CellPosition[],
  canvasWidth: number,
  canvasHeight: number
): CellPosition[] {
  return positions.map(pos => ({
    ...pos,
    x: Math.max(0, Math.min(pos.x, canvasWidth - pos.width)),
    y: Math.max(0, Math.min(pos.y, canvasHeight - pos.height)),
    width: Math.min(pos.width, canvasWidth - pos.x),
    height: Math.min(pos.height, canvasHeight - pos.y),
  }));
}
