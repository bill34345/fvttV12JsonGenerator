export interface Point {
  x: number;
  y: number;
}

export interface GridOffset {
  i: number;
  j: number;
}

export interface GridCellInput {
  key: string;
  offset: GridOffset;
  center: Point;
  vertices: Point[];
}

export interface GridCell extends GridCellInput {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CellBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export interface PolygonRegionShape {
  type: "polygon";
  points: number[];
  hole: false;
}

export type BoundarySegment = [number, number, number, number];

const precision = (value: number): number => Math.round(value * 1000) / 1000;

export const boundsForPoints = (points: readonly Point[]): CellBounds => {
  if (!points.length) throw new Error("Cannot calculate bounds without points");

  const xs = points.map(({ x }) => x);
  const ys = points.map(({ y }) => y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);

  return {
    x: precision(x),
    y: precision(y),
    width: precision(maxX - x),
    height: precision(maxY - y),
    centerX: precision((x + maxX) / 2),
    centerY: precision((y + maxY) / 2),
  };
};

export const normalizeCell = (input: GridCellInput): GridCell => {
  if (input.vertices.length < 3) {
    throw new Error(`Terrain cell ${input.key} requires at least three vertices`);
  }

  const bounds = boundsForPoints(input.vertices);
  return {
    ...input,
    center: { x: precision(input.center.x), y: precision(input.center.y) },
    vertices: input.vertices.map(({ x, y }) => ({
      x: precision(x),
      y: precision(y),
    })),
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  };
};

export const boundsForVertices = (cells: readonly GridCell[]): CellBounds =>
  boundsForPoints(cells.flatMap(({ vertices }) => vertices));

export const regionShapesForCells = (
  cells: readonly GridCell[],
): PolygonRegionShape[] =>
  cells.map(({ vertices }) => ({
    type: "polygon",
    points: vertices.flatMap(({ x, y }) => [x, y]),
    hole: false,
  }));

const pointKey = ({ x, y }: Point): string => `${precision(x)},${precision(y)}`;

const edgeKey = (a: Point, b: Point): string =>
  [pointKey(a), pointKey(b)].sort().join("|");

export const boundarySegments = (
  cells: readonly GridCell[],
): BoundarySegment[] => {
  const edges = new Map<
    string,
    { count: number; segment: BoundarySegment }
  >();

  for (const { vertices } of cells) {
    for (let index = 0; index < vertices.length; index += 1) {
      const a = vertices[index];
      const b = vertices[(index + 1) % vertices.length];
      if (!a || !b) continue;

      const key = edgeKey(a, b);
      const existing = edges.get(key);
      if (existing) existing.count += 1;
      else {
        edges.set(key, {
          count: 1,
          segment: [a.x, a.y, b.x, b.y],
        });
      }
    }
  }

  return [...edges.values()]
    .filter(({ count }) => count === 1)
    .map(({ segment }) => segment);
};

