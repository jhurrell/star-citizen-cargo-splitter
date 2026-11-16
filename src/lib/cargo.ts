import { parseMount, type Mount } from "./mount";

/* The cargo domain: container and ship shapes, read from containers.json and
   ships.json, and
   the SCU a row asks for. Pure functions, so they can be unit tested. */

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

/* Loosely typed data, as read from containers.json or ships.json. */
type Raw = Record<string, unknown> | null | undefined;

const list = (value: unknown): Raw[] => (Array.isArray(value) ? value : []);
const positiveInt = (n: unknown): number => (Number.isInteger(n) && (n as number) > 0 ? (n as number) : 0);
/* A config or saved value as text: strings and numbers as written, anything else as `fallback`. */
export const asText = (value: unknown, fallback = ""): string =>
  typeof value === "string" || typeof value === "number" ? String(value) : fallback;

/* Accepts "1,200" or "57"; anything else counts as 0. */
export function parseScu(value: string): number {
  const n = Math.floor(Number(value.replace(/,/g, "")));
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_SCU) : 0;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/* Read x × y × z as whole SCU cells, or null if any is missing. */
function parseShape(item: Raw): Shape | null {
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

/* Containers from containers.json (a list), largest first. A size listed
   twice keeps its first entry; entries without a size or shape are skipped. */
export function parseContainers(items: unknown): Container[] {
  const bySize = new Map<number, Container>();
  for (const item of list(items)) {
    const size = positiveInt(item?.capacity);
    const shape = parseShape(item);
    if (size && shape && !bySize.has(size)) {
      bySize.set(size, { size, placements: placementsOf(shape, item?.lieFlat === true) });
    }
  }
  return [...bySize.values()].sort((a, b) => b.size - a.size);
}

/* A cargo grid position, or null if malformed. Its capacity is its volume in SCU. */
function parsePosition(item: Raw): Position | null {
  const name = asText(item?.name);
  const shape = parseShape(item);
  return name && shape ? { name, ...shape, capacity: shape.x * shape.y * shape.z, mount: parseMount(item) } : null;
}

/* The ships from ships.json (a list), sorted by name. Malformed positions are
   skipped, and so are grids left with no positions and ships with no grids. */
export function parseShips(items: unknown): Ship[] {
  return list(items)
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
