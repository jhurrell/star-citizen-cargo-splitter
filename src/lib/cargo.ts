import { collator } from "./format";
import { parseMount, type Mount } from "./mount";

/* The cargo domain: container and ship shapes, read from containers.json and
   ships.json, and the SCU a row asks for. Pure functions, so they can be unit tested. */

/* The most SCU a row can ask for; it keeps the SCU column four digits wide. */
export const MAX_SCU = 9_999;

/* x × y × z extents in whole SCU cells. Axes follow Star Citizen: x is
   port–starboard, y is fore–aft and z is height. */
export type Shape = { x: number; y: number; z: number };
export type Placement = [w: number, d: number, h: number];
export type Container = { size: number; placements: Placement[] };
/* A cargo grid: where containers lock and stack. `mount` places it on the
   ship for the ship view; see mount.ts. */
export type CargoGrid = Shape & { name: string; capacity: number; mount: Mount | null };
/* One arrangement of a ship's cargo grids. */
export type Layout = { id: string; name: string; grids: CargoGrid[] };
export type Ship = { id: string; name: string; layouts: Layout[] };

/* Loosely typed data, as read from containers.json or ships.json. */
type Raw = Record<string, unknown> | null | undefined;

const list = (value: unknown): Raw[] => (Array.isArray(value) ? value : []);
const positiveInt = (n: unknown): number => (Number.isInteger(n) && (n as number) > 0 ? (n as number) : 0);
/* A config or saved value as text: strings and numbers as written, anything else as `fallback`. */
export const asText = (value: unknown, fallback = ""): string =>
  typeof value === "string" || typeof value === "number" ? String(value) : fallback;

/* Accepts "1,200" or "57", up to MAX_SCU; anything else counts as 0. */
export function parseScu(value: string): number {
  const n = Math.floor(Number(value.replace(/,/g, "")));
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_SCU) : 0;
}

/* Whether typed SCU is past MAX_SCU, so the field can refuse it. */
export const isOverMaxScu = (value: string): boolean => Number(value.replace(/,/g, "")) > MAX_SCU;

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

/* A cargo grid, or null if malformed. Its capacity is its volume in SCU. */
function parseCargoGrid(item: Raw): CargoGrid | null {
  const name = asText(item?.name);
  const shape = parseShape(item);
  return name && shape ? { name, ...shape, capacity: shape.x * shape.y * shape.z, mount: parseMount(item) } : null;
}

/* The ships from ships.json (a list), sorted by name. Malformed cargo grids
   are skipped, and so are layouts left with no grids and ships with no layouts. */
export function parseShips(items: unknown): Ship[] {
  return list(items)
    .map((ship) => ({
      id: asText(ship?.id),
      name: asText(ship?.name ?? ship?.id),
      layouts: list(ship?.layouts)
        .map((layout) => ({
          id: asText(layout?.id),
          name: asText(layout?.name ?? layout?.id),
          grids: list(layout?.grids)
            .map(parseCargoGrid)
            .filter((g): g is CargoGrid => g !== null),
        }))
        .filter((layout) => layout.id && layout.grids.length > 0),
    }))
    .filter((ship) => ship.id && ship.layouts.length > 0)
    .sort((a, b) => collator.compare(a.name, b.name));
}

/* Whether a container fits a space in at least one of its placements. */
export const fitsInside = (box: Container, space: Shape): boolean =>
  box.placements.some(([w, d, h]) => w <= space.x && d <= space.y && h <= space.z);
