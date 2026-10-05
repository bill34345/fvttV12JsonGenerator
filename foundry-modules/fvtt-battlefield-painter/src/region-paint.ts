import { gridCellAtOffset, type FoundryGridLike } from "./grid-adapter";
import type { GridCell } from "./geometry";

/** Exact 14.364 Region polygonTree tests include holes; elevation is intentionally irrelevant to a floor tile. */
export function cellsForRegions(grid: FoundryGridLike & { getOffsetRange(bounds: any): number[] },
  regions: readonly any[], sceneBounds: { x: number; y: number; width: number; height: number }): GridCell[] {
  const cells = new Map<string, GridCell>();
  let scanned = 0;
  for (const region of regions) {
    if (!region?.polygonTree?.testPoint || !region.bounds) throw new Error("所选区域缺少有效的轮廓。");
    const b = region.bounds;
    const x = Math.max(sceneBounds.x, b.x), y = Math.max(sceneBounds.y, b.y);
    const width = Math.min(sceneBounds.x + sceneBounds.width, b.x + b.width) - x;
    const height = Math.min(sceneBounds.y + sceneBounds.height, b.y + b.height) - y;
    if (width <= 0 || height <= 0) continue;
    const [i0, j0, i1, j1] = grid.getOffsetRange({ x, y, width, height });
    if (![i0, j0, i1, j1].every(Number.isInteger)) throw new Error("无法计算区域格位。");
    scanned += (i1! - i0!) * (j1! - j0!);
    if (scanned > 10000) throw new Error("所选区域过大，请分批铺设（每次检查最多10000格）。");
    for (let i = i0!; i < i1!; i++) for (let j = j0!; j < j1!; j++) {
      const cell = gridCellAtOffset(grid, { i, j });
      if (cell.center.x < x || cell.center.x >= x + width || cell.center.y < y || cell.center.y >= y + height) continue;
      if (region.polygonTree.testPoint(cell.center)) cells.set(cell.key, cell);
    }
  }
  return [...cells.values()];
}
