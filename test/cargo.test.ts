import { describe, expect, test } from "vite-plus/test";
import rawContainers from "../src/config/containers.json";
import rawShips from "../src/config/ships.json";
import {
  fitsInside,
  isOverMaxScu,
  parseContainers,
  parseScu,
  parseShips,
  placementsOf,
  type Placement,
} from "../src/lib/cargo";
import { container } from "./helpers";

const sorted = (placements: Placement[]) => placements.map((p) => p.join("x")).sort();

describe("parseScu", () => {
  test("accepts thousands separators and rejects junk", () => {
    expect(parseScu("1,200")).toBe(1200);
    expect(parseScu("57.9")).toBe(57);
    expect(parseScu("-3")).toBe(0);
    expect(parseScu("abc")).toBe(0);
    expect(parseScu("99999999999")).toBe(9_999);
  });
});

describe("isOverMaxScu", () => {
  test("refuses more than 9,999, with or without a comma", () => {
    expect(isOverMaxScu("9,999")).toBe(false);
    expect(isOverMaxScu("9999")).toBe(false);
    expect(isOverMaxScu("10000")).toBe(true);
    expect(isOverMaxScu("10,000")).toBe(true);
    expect(isOverMaxScu("")).toBe(false);
    expect(isOverMaxScu("abc")).toBe(false);
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
    const containers = parseContainers([
      { capacity: 8, x: 2, y: 2, z: 2 },
      { capacity: 32, x: 2, y: 8, z: 2, lieFlat: true },
      { capacity: 8, x: 1, y: 1, z: 8 },
      { capacity: 4, x: 2, y: 2 },
      { x: 1, y: 1, z: 1 },
    ]);
    expect(containers.map((c) => c.size)).toEqual([32, 8]);
    expect(containers[1].placements).toEqual([[2, 2, 2]]);
  });

  test("copes with a missing or malformed list", () => {
    expect(parseContainers(undefined)).toEqual([]);
    expect(parseContainers("nope")).toEqual([]);
    expect(parseShips({ ships: [] })).toEqual([]);
  });
});

describe("parseShips", () => {
  test("drops malformed cargo grids, empty layouts and ships without layouts, sorted by name", () => {
    const ships = parseShips([
      {
        id: "z",
        name: "Zeta",
        layouts: [
          {
            id: "l",
            grids: [
              { name: "Bay", x: 2, y: 2, z: 2 },
              { name: "Bad", x: 2 },
            ],
          },
        ],
      },
      { id: "a", name: "Alpha", layouts: [{ id: "l", grids: [{ name: "Hold", x: 4, y: 4, z: 2 }] }] },
      { id: "e", name: "Empty", layouts: [{ id: "l", grids: [] }] },
    ]);
    expect(ships.map((s) => s.name)).toEqual(["Alpha", "Zeta"]);
    expect(ships[1].layouts[0].grids).toEqual([{ name: "Bay", x: 2, y: 2, z: 2, capacity: 8, mount: null }]);
  });
});

describe("fitsInside", () => {
  test("checks every placement against the space", () => {
    const scu32 = container(32, 2, 8, 2);
    expect(fitsInside(scu32, { x: 8, y: 2, z: 2 })).toBe(true);
    expect(fitsInside(scu32, { x: 2, y: 2, z: 8 })).toBe(false);
  });
});

describe("containers.json and ships.json", () => {
  test("list usable containers and ships", () => {
    expect(parseContainers(rawContainers).length).toBeGreaterThan(0);
    expect(parseShips(rawShips).length).toBeGreaterThan(0);
  });

  test("every cargo grid takes at least one container size", () => {
    const containers = parseContainers(rawContainers);
    for (const ship of parseShips(rawShips))
      for (const layout of ship.layouts)
        for (const grid of layout.grids)
          expect(
            containers.some((c) => fitsInside(c, grid)),
            `${ship.name} / ${layout.name} / ${grid.name}`,
          ).toBe(true);
  });

  test("grid names are unique within each layout, as plans rely on", () => {
    for (const ship of parseShips(rawShips))
      for (const layout of ship.layouts) {
        const names = layout.grids.map((g) => g.name);
        expect(new Set(names).size, `${ship.name} / ${layout.name}`).toBe(names.length);
      }
  });

  test("each ship's stated capacity matches every layout's volume", () => {
    for (const ship of rawShips)
      for (const layout of ship.layouts) {
        const volume = layout.grids.reduce((total, g) => total + g.x * g.y * g.z, 0);
        expect(volume, `${ship.name} / ${layout.name}`).toBe(ship.capacity);
      }
  });
});
