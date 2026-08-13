import type { GridCell, GridOffset } from "./geometry";

export interface TerrainClusterOptions {
  maxCells?: number;
  getAdjacentOffsets?: (offset: GridOffset) => readonly GridOffset[];
}

const offsetKey = ({ i, j }: GridOffset): string => `${i}:${j}`;

const squareAdjacentOffsets = ({ i, j }: GridOffset): GridOffset[] => [
  { i: i - 1, j },
  { i: i + 1, j },
  { i, j: j - 1 },
  { i, j: j + 1 },
];

const sortedOffsets = (offsets: readonly GridOffset[]): GridOffset[] =>
  [...offsets].sort((a, b) => offsetKey(a).localeCompare(offsetKey(b)));

export const clusterCells = (
  cells: readonly GridCell[],
  {
    maxCells = 16,
    getAdjacentOffsets = squareAdjacentOffsets,
  }: TerrainClusterOptions = {},
): GridCell[][] => {
  if (!Number.isInteger(maxCells) || maxCells < 1) {
    throw new Error("Terrain cluster maxCells must be a positive integer");
  }

  const byKey = new Map(cells.map((cell) => [cell.key, cell]));
  const remaining = new Set([...byKey.keys()].sort());
  const clusters: GridCell[][] = [];

  while (remaining.size) {
    const rootKey = [...remaining][0]!;
    const queue = [rootKey];
    const queued = new Set([rootKey]);
    const cluster: GridCell[] = [];
    remaining.delete(rootKey);

    while (queue.length && cluster.length < maxCells) {
      const key = queue.shift()!;
      remaining.delete(key);
      const current = byKey.get(key);
      if (!current) continue;
      cluster.push(current);

      for (const offset of sortedOffsets(getAdjacentOffsets(current.offset))) {
        const adjacentKey = offsetKey(offset);
        if (!remaining.has(adjacentKey) || queued.has(adjacentKey)) continue;
        queued.add(adjacentKey);
        queue.push(adjacentKey);
      }
    }

    clusters.push(cluster);
  }

  return clusters;
};
