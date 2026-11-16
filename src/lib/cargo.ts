import { parseMount, type Mount } from "./mount";

/* Cargo Splitter's pure logic: config parsing, container splitting and 3D
   packing. No DOM or React, so it can be unit tested. */

const MAX_SCU = 10_000_000;

/* x × y × z extents in whole SCU cells. Axes follow Star Citizen: x is
   port–starboard, y is fore–aft and z is height. */
export type Shape = { x: number; y: number; z: number };
export type Placement = [w: number, d: number, h: number];
export type Container = { size: number; placements: Placement[] };
/* `mount` places it on the ship for the ship view; see mount.ts. */
export type Position = Shape & { name: string; capacity: number; mount: Mount | null };
export type Grid = { id: string; name: string; positions: Position[] };
export type Ship = { id: string; name: string; grids: Grid[] };
/* Container counts by size, e.g. { 32: 2, 8: 1 }. */
export type Counts = Record<number, number>;
export type Fill = { counts: Counts; leftover: number };
export type Box = { x: number; y: number; z: number; w: number; d: number; h: number };
export type Load<Tag> = { container: Container; count: number; tag: Tag };
export type Placed<Tag> = Box & { size: number; tag: Tag };
export type Packing<Tag> = { placed: Placed<Tag>[]; unfit: Counts };

/* Loosely typed config data, as read from config.json. */
type Raw = Record<string, unknown> | null | undefined;

const list = (value: unknown): Raw[] => (Array.isArray(value) ? value : []);
const positiveInt = (n: unknown): number => (Number.isInteger(n) && (n as number) > 0 ? (n as number) : 0);
/* A config or saved value as text: strings and numbers as written, anything else as `fallback`. */
export const asText = (value: unknown, fallback = ""): string =>
  typeof value === "string" || typeof value === "number" ? String(value) : fallback;

/* Fill `scu` using `sizes` (largest first): as many of the biggest as fit,
   then the next size down. */
export function fillLargestFirst(scu: number, sizes: number[]): Fill {
  const counts: Counts = {};
  let rest = scu;
  for (const size of sizes) {
    counts[size] = Math.floor(rest / size);
    rest -= counts[size] * size;
  }
  return { counts, leftover: rest };
}

/* Accepts "1,200" or "57"; anything else counts as 0. */
export function parseScu(value: string): number {
  const n = Math.floor(Number(value.replace(/,/g, "")));
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_SCU) : 0;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/* Read x × y × z as whole SCU cells, or null if any is missing. */
export function parseShape(item: Raw): Shape | null {
  const [x, y, z] = [item?.x, item?.y, item?.z].map(positiveInt);
  return x && y && z ? { x, y, z } : null;
}

/* The ways a container can sit, as [x, y, z] extents, lowest first. A lieFlat
   container keeps its long side horizontal; any other may be turned any way. */
export function placementsOf({ x, y, z }: Shape, lieFlat: boolean): Placement[] {
  const longest = Math.max(x, y, z);
  const isCube = x === y && y === z;
  const all: Placement[] = [
    [x, y, z],
    [y, x, z],
    [x, z, y],
    [z, x, y],
    [y, z, x],
    [z, y, x],
  ];
  const allowed = all.filter(([, , h]) => !lieFlat || isCube || h < longest);
  const unique = [...new Map(allowed.map((p) => [p.join(), p])).values()];
  return unique.sort((a, b) => a[2] - b[2]);
}

/* Containers from config.json, largest first. A size listed twice keeps its
   first entry; entries without a size or shape are skipped. */
export function parseContainers(config: unknown): Container[] {
  const bySize = new Map<number, Container>();
  for (const item of list((config as Raw)?.containers)) {
    const size = positiveInt(item?.capacity);
    const shape = parseShape(item);
    if (size && shape && !bySize.has(size)) {
      bySize.set(size, { size, placements: placementsOf(shape, item?.lieFlat === true) });
    }
  }
  return [...bySize.values()].sort((a, b) => b.size - a.size);
}

/* A cargo grid position, or null if malformed. Its capacity is its volume in SCU. */
export function parsePosition(item: Raw): Position | null {
  const name = asText(item?.name);
  const shape = parseShape(item);
  return name && shape ? { name, ...shape, capacity: shape.x * shape.y * shape.z, mount: parseMount(item) } : null;
}

/* The ship list from config.json, sorted by name. Malformed positions are
   skipped, and so are grids left with no positions and ships with no grids. */
export function parseShips(config: unknown): Ship[] {
  return list((config as Raw)?.ships)
    .map((ship) => ({
      id: asText(ship?.id),
      name: asText(ship?.name ?? ship?.id),
      grids: list(ship?.grids)
        .map((grid) => ({
          id: asText(grid?.id),
          name: asText(grid?.name ?? grid?.id),
          positions: list(grid?.positions)
            .map(parsePosition)
            .filter((p): p is Position => p !== null),
        }))
        .filter((grid) => grid.id && grid.positions.length > 0),
    }))
    .filter((ship) => ship.id && ship.grids.length > 0)
    .sort((a, b) => collator.compare(a.name, b.name));
}

/* Whether a container fits a space in at least one of its placements. */
export const fitsInside = (box: Container, space: Shape): boolean =>
  box.placements.some(([w, d, h]) => w <= space.x && d <= space.y && h <= space.z);

/* Which way packing sweeps a space. "z" fills the bottom layer before the
   next. "x" or "y" fills along that floor axis from 0 instead, each spot as
   high as it stacks before moving on; `reverse` then mirrors the result so it
   fills from the far end (the fore end, say). */
export type Sweep = { axis: "x" | "y" | "z"; reverse?: boolean };

/* Pack containers into a space of x × y × z SCU cells (z is height). `tag`
   says whose cargo each container is. Each container sits in one of its
   placements (see placementsOf), on the floor or wholly on top of others.
   Greedy: biggest first, each in the first spot that takes it, in `sweep`
   order. This can miss a packing that exists, so it may report a load as not
   fitting when a cleverer layout would. */
export function packContainers<Tag>(space: Shape, load: Load<Tag>[], sweep: Sweep = { axis: "z" }): Packing<Tag> {
  const { x: X, y: Y, z: Z } = space;
  const filled = new Uint8Array(X * Y * Z);
  const cell = (x: number, y: number, z: number) => (z * Y + y) * X + x;
  const everyCell = (box: Box, test: (i: number) => boolean) => {
    for (let z = box.z; z < box.z + box.h; z++)
      for (let y = box.y; y < box.y + box.d; y++)
        for (let x = box.x; x < box.x + box.w; x++) if (!test(cell(x, y, z))) return false;
    return true;
  };
  const isFree = (box: Box) => everyCell(box, (i) => !filled[i]);
  const isSupported = (box: Box) => box.z === 0 || everyCell({ ...box, z: box.z - 1, h: 1 }, (i) => filled[i] === 1);
  const occupy = (box: Box) =>
    everyCell(box, (i) => {
      filled[i] = 1;
      return true;
    });

  /* Every corner cell in sweep order: the sweep axis outermost, then height,
     then the other floor axis. */
  const corners: [number, number, number][] = [];
  const [outer, inner] = sweep.axis === "x" ? [X, Y] : [Y, X];
  if (sweep.axis === "z") {
    for (let z = 0; z < Z; z++) for (let y = 0; y < Y; y++) for (let x = 0; x < X; x++) corners.push([x, y, z]);
  } else {
    for (let a = 0; a < outer; a++)
      for (let z = 0; z < Z; z++)
        for (let b = 0; b < inner; b++) corners.push(sweep.axis === "x" ? [a, b, z] : [b, a, z]);
  }

  function findSpot(container: Container): Box | null {
    for (const [x, y, z] of corners)
      for (const [w, d, h] of container.placements) {
        const box = { x, y, z, w, d, h };
        if (x + w <= X && y + d <= Y && z + h <= Z && isSupported(box) && isFree(box)) return box;
      }
    return null;
  }

  const placed: Placed<Tag>[] = [];
  const unfit: Counts = {};
  /* Biggest first; the sort is stable, so cargo of one size keeps its row order. */
  const order = [...load].sort((a, b) => b.container.size - a.container.size);
  for (const { container, count, tag } of order) {
    const { size } = container;
    for (let n = 0; n < count; n++) {
      /* Space only shrinks, so once a size fails, the rest of that size fails too. */
      const spot = unfit[size] ? null : findSpot(container);
      if (!spot) {
        unfit[size] = (unfit[size] ?? 0) + count - n;
        break;
      }
      occupy(spot);
      placed.push({ ...spot, size, tag });
    }
  }
  if (sweep.reverse && sweep.axis === "x") for (const box of placed) box.x = X - box.x - box.w;
  if (sweep.reverse && sweep.axis === "y") for (const box of placed) box.y = Y - box.y - box.d;
  return { placed, unfit };
}

/* Painter's order for packed containers in the isometric view, which looks down
   from the +x, +y, +z side: a container that is wholly on the far (lower) side
   of another along some axis is drawn first. Two containers apart both ways
   along different axes can't overlap on screen, so they get no order. */
export function drawOrder<B extends Box>(boxes: B[]): B[] {
  const farSide = (a: Box, b: Box) => a.x + a.w <= b.x || a.y + a.d <= b.y || a.z + a.h <= b.z;
  const sorted = [...boxes].sort((a, b) => a.x + a.y + a.z - (b.x + b.y + b.z));
  const after: number[][] = sorted.map(() => []);
  const waitingOn = sorted.map(() => 0);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const iFirst = farSide(sorted[i], sorted[j]);
      const jFirst = farSide(sorted[j], sorted[i]);
      if (iFirst === jFirst) continue;
      const [first, second] = iFirst ? [i, j] : [j, i];
      after[first].push(second);
      waitingOn[second] += 1;
    }
  }
  const order: B[] = [];
  const ready = sorted.map((_, i) => i).filter((i) => waitingOn[i] === 0);
  for (let i = ready.shift(); i !== undefined; i = ready.shift()) {
    order.push(sorted[i]);
    for (const j of after[i]) if (--waitingOn[j] === 0) ready.push(j);
  }
  /* A cycle can't happen with these shapes in practice; draw any leftovers last. */
  if (order.length < sorted.length) order.push(...sorted.filter((box) => !order.includes(box)));
  return order;
}

/* Add `extra` into `into`, in place. */
export function addCounts(into: Counts, extra: Counts): Counts {
  for (const [size, n] of Object.entries(extra)) into[Number(size)] = (into[Number(size)] ?? 0) + n;
  return into;
}
