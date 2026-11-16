import { describe, expect, test } from "vite-plus/test";
import config from "../config.json";
import {
  addCounts,
  drawOrder,
  fillLargestFirst,
  fitsInside,
  packContainers,
  parseContainers,
  parseScu,
  parseShips,
  placementsOf,
  type Container,
  type Placement,
  type Shape,
} from "../src/lib/cargo";

const sorted = (placements: Placement[]) => placements.map((p) => p.join("x")).sort();
const box = (size: number, x: number, y: number, z: number, lieFlat = false): Container => ({
  size,
  placements: placementsOf({ x, y, z }, lieFlat),
});
const pack = (space: Shape, ...load: [Container, number][]) =>
  packContainers(
    space,
    load.map(([container, count]) => ({ container, count, tag: 1 })),
  );

describe("fillLargestFirst", () => {
  test("uses the biggest sizes first and reports the leftover", () => {
    expect(fillLargestFirst(75, [32, 8, 1])).toEqual({ counts: { 32: 2, 8: 1, 1: 3 }, leftover: 0 });
    expect(fillLargestFirst(7, [8, 2])).toEqual({ counts: { 8: 0, 2: 3 }, leftover: 1 });
  });
});

describe("parseScu", () => {
  test("accepts thousands separators and rejects junk", () => {
    expect(parseScu("1,200")).toBe(1200);
    expect(parseScu("57.9")).toBe(57);
    expect(parseScu("-3")).toBe(0);
    expect(parseScu("abc")).toBe(0);
    expect(parseScu("99999999999")).toBe(10_000_000);
  });
});

describe("placementsOf", () => {
  test("a lieFlat container keeps its long side level", () => {
    expect(sorted(placementsOf({ x: 2, y: 8, z: 2 }, true))).toEqual(["2x8x2", "8x2x2"]);
  });

  test("a flat 4 SCU container never stands on edge", () => {
    expect(placementsOf({ x: 2, y: 2, z: 1 }, true)).toEqual([[2, 2, 1]]);
  });

  test("other containers may turn any way, lowest first", () => {
    const placements = placementsOf({ x: 1, y: 2, z: 3 }, false);
    expect(placements).toHaveLength(6);
    expect(placements[0][2]).toBe(1);
  });

  test("a cube has one placement", () => {
    expect(placementsOf({ x: 2, y: 2, z: 2 }, true)).toEqual([[2, 2, 2]]);
  });
});

describe("parseContainers", () => {
  test("sorts largest first, keeps the first of a repeated size and skips bad entries", () => {
    const containers = parseContainers({
      containers: [
        { capacity: 8, x: 2, y: 2, z: 2 },
        { capacity: 32, x: 2, y: 8, z: 2, lieFlat: true },
        { capacity: 8, x: 1, y: 1, z: 8 },
        { capacity: 4, x: 2, y: 2 },
        { x: 1, y: 1, z: 1 },
      ],
    });
    expect(containers.map((c) => c.size)).toEqual([32, 8]);
    expect(containers[1].placements).toEqual([[2, 2, 2]]);
  });

  test("copes with a missing or malformed config", () => {
    expect(parseContainers(undefined)).toEqual([]);
    expect(parseContainers({ containers: "nope" })).toEqual([]);
  });
});

describe("parseShips", () => {
  test("drops malformed positions, empty grids and gridless ships, sorted by name", () => {
    const ships = parseShips({
      ships: [
        {
          id: "z",
          name: "Zeta",
          grids: [
            {
              id: "g",
              positions: [
                { name: "Bay", x: 2, y: 2, z: 2 },
                { name: "Bad", x: 2 },
              ],
            },
          ],
        },
        { id: "a", name: "Alpha", grids: [{ id: "g", positions: [{ name: "Hold", x: 4, y: 4, z: 2 }] }] },
        { id: "e", name: "Empty", grids: [{ id: "g", positions: [] }] },
      ],
    });
    expect(ships.map((s) => s.name)).toEqual(["Alpha", "Zeta"]);
    expect(ships[1].grids[0].positions).toEqual([{ name: "Bay", x: 2, y: 2, z: 2, capacity: 8, mount: null }]);
  });
});

describe("fitsInside", () => {
  test("checks every placement against the space", () => {
    const scu32 = box(32, 2, 8, 2, true);
    expect(fitsInside(scu32, { x: 8, y: 2, z: 2 })).toBe(true);
    expect(fitsInside(scu32, { x: 2, y: 2, z: 8 })).toBe(false);
  });
});

describe("packContainers", () => {
  const scu32 = box(32, 2, 8, 2, true);
  const scu8 = box(8, 2, 2, 2);
  const scu1 = box(1, 1, 1, 1);

  test("fills a space exactly", () => {
    const { placed, unfit } = pack({ x: 4, y: 16, z: 2 }, [scu32, 4]);
    expect(placed).toHaveLength(4);
    expect(unfit).toEqual({});
  });

  test("reports what doesn't fit, by size", () => {
    expect(pack({ x: 2, y: 8, z: 2 }, [scu32, 2], [scu1, 3]).unfit).toEqual({ 32: 1, 1: 3 });
  });

  test("places biggest first, never overlapping and always inside the space", () => {
    const space = { x: 8, y: 12, z: 6 };
    const { placed, unfit } = pack(space, [scu1, 10], [scu32, 10], [scu8, 20]);
    expect(unfit).toEqual({});
    expect(placed.map((p) => p.size).slice(0, 10)).toEqual(Array(10).fill(32));
    const cells = new Set();
    for (const p of placed) {
      expect(p.x + p.w <= space.x && p.y + p.d <= space.y && p.z + p.h <= space.z).toBe(true);
      for (let z = p.z; z < p.z + p.h; z++)
        for (let y = p.y; y < p.y + p.d; y++)
          for (let x = p.x; x < p.x + p.w; x++) {
            const key = `${x},${y},${z}`;
            expect(cells.has(key)).toBe(false);
            cells.add(key);
          }
    }
    expect(cells.size).toBe(10 * 32 + 20 * 8 + 10);
  });

  test("every container sits on the floor or fully on others", () => {
    const { placed } = pack({ x: 2, y: 2, z: 4 }, [scu8, 1], [scu1, 4]);
    const on = (x: number, y: number, z: number) =>
      z < 0 || placed.some((p) => x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.d && z >= p.z && z < p.z + p.h);
    for (const p of placed)
      for (let y = p.y; y < p.y + p.d; y++) for (let x = p.x; x < p.x + p.w; x++) expect(on(x, y, p.z - 1)).toBe(true);
  });
});

describe("drawOrder", () => {
  test("draws a container below before the one on top", () => {
    const top = { x: 0, y: 0, z: 2, w: 2, d: 2, h: 2 };
    const bottom = { x: 0, y: 0, z: 0, w: 2, d: 2, h: 2 };
    expect(drawOrder([top, bottom])).toEqual([bottom, top]);
  });
});

describe("addCounts", () => {
  test("adds counts in place", () => {
    expect(addCounts({ 8: 1 }, { 8: 2, 1: 3 })).toEqual({ 8: 3, 1: 3 });
  });
});

describe("config.json", () => {
  test("lists usable containers and ships", () => {
    expect(parseContainers(config).length).toBeGreaterThan(0);
    expect(parseShips(config).length).toBeGreaterThan(0);
  });

  test("every position takes at least one container size", () => {
    const containers = parseContainers(config);
    for (const ship of parseShips(config))
      for (const grid of ship.grids)
        for (const position of grid.positions)
          expect(
            containers.some((c) => fitsInside(c, position)),
            `${ship.name} / ${grid.name} / ${position.name}`,
          ).toBe(true);
  });

  test("each ship's stated capacity matches every grid's volume", () => {
    for (const ship of config.ships)
      for (const grid of ship.grids) {
        const volume = grid.positions.reduce((total, p) => total + p.x * p.y * p.z, 0);
        expect(volume, `${ship.name} / ${grid.name}`).toBe(ship.capacity);
      }
  });
});
