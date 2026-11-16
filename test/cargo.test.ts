import { describe, expect, test } from "vite-plus/test";
import config from "../config.json";
import { fitsInside, parseContainers, parseScu, parseShips, placementsOf, type Placement } from "../src/lib/cargo";
import { container } from "./helpers";

const sorted = (placements: Placement[]) => placements.map((p) => p.join("x")).sort();

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
    const scu32 = container(32, 2, 8, 2);
    expect(fitsInside(scu32, { x: 8, y: 2, z: 2 })).toBe(true);
    expect(fitsInside(scu32, { x: 2, y: 2, z: 8 })).toBe(false);
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
