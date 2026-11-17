import { describe, expect, test } from "vite-plus/test";
import { sum } from "../src/lib/format";
import type { Haul, SizeCell } from "../src/lib/haul";
import { makeRow, type Row } from "../src/lib/state";
import { bay, haulOf, haulOnShip, shipRow, testRow } from "./helpers";

/* The parts of a Haul a test looks at, found by row or grid. */
const deliveryOf = (haul: Haul, row: Row) => haul.deliveries.find((d) => d.row.id === row.id)!;
const gridOf = (haul: Haul, name: string) => haul.grids.find((g) => g.position.name === name)!;
/* Size cells in column order (32, 8, 1): a count, "off" or "wontFit". */
const show = (cells: SizeCell[]) => cells.map((cell) => (cell.kind === "count" ? cell.count : cell.kind));
/* A row's picks, each [order, grid]. */
const picks = (...list: [number, string][]) => list.map(([order, name]) => ({ name, order }));

describe("selection", () => {
  test("picks the first ship and layout for an empty choice, and gives their ids", () => {
    const haul = haulOnShip("", []);
    expect(haul.at).toEqual({ ship: haul.ship!.id, layout: haul.layout!.id });
    expect(haul.positions).toBe(haul.layout!.positions);
  });

  test("counts only picks on the selected ship and layout", () => {
    const row = shipRow("ship-misc-hull-b", { scu: "8", picks: picks([1, "Port - Upper"]) });
    expect(deliveryOf(haulOnShip("ship-misc-hull-b", [row]), row).parts).toEqual([{ name: "Port - Upper", scu: 8 }]);
    /* The Hull A has a grid of the same name, but the pick was made on the Hull B. */
    expect(deliveryOf(haulOnShip("ship-misc-hull-a", [row]), row).parts).toEqual([]);
  });
});

describe("container sizes", () => {
  const positions = [bay("Small", 2, 2, 2), bay("Big", 2, 8, 2)];

  test("only uses sizes that fit the row's grid, and totals them", () => {
    const rows = [testRow({ scu: "8", picks: picks([1, "Small"]) }), testRow({ scu: "32", picks: picks([2, "Big"]) })];
    const haul = haulOf(rows, positions);
    expect(show(deliveryOf(haul, rows[0]).cells)).toEqual(["wontFit", 1, 0]);
    expect(show(deliveryOf(haul, rows[1]).cells)).toEqual([1, 0, 0]);
    expect(show(haul.totals.cells)).toEqual([1, 1, 0]);
    expect(gridOf(haul, "Small").placed).toHaveLength(1);
  });

  test("a grid never takes more than it holds; the rest is counted with any size", () => {
    const row = testRow({ scu: "40", picks: picks([1, "Small"]) });
    const haul = haulOf([row], positions);
    expect(gridOf(haul, "Small").free).toBe(0);
    expect(deliveryOf(haul, row)).toMatchObject({ unassigned: 32, unassignedReason: "outOfRoom", leftover: 0 });
    expect(show(deliveryOf(haul, row).cells)).toEqual([1, 1, 0]);
    expect(haul.totals.scu).toBe(40);
  });

  test("sizes turned off are skipped and leave a leftover when nothing smaller fits", () => {
    const row = testRow({ scu: "33" });
    const haul = haulOf([row], positions, { 1: false });
    expect(show(deliveryOf(haul, row).cells)).toEqual([1, 0, "off"]);
    expect(show(haul.totals.cells)).toEqual([1, 0, "off"]);
    expect(deliveryOf(haul, row).leftover).toBe(1);
    expect(haul.showLeftover).toBe(true);
    expect(haul.grids.map((g) => g.free)).toEqual([8, 32]); // no grid, no load
  });

  test("a split row's containers are packed per grid and counted once", () => {
    const grids = [bay("A", 2, 4, 2), bay("B", 2, 4, 2)];
    const row = testRow({ scu: "32", picks: picks([1, "A"], [2, "B"]) });
    const haul = haulOf([row], grids);
    expect(show(deliveryOf(haul, row).cells)).toEqual(["wontFit", 4, 0]);
    expect(haul.grids.map((g) => g.free)).toEqual([0, 0]);
    expect(haul.totals.scu).toBe(32);
  });
});

describe("grid room", () => {
  const positions = [bay("Small", 2, 2, 2), bay("Big", 2, 8, 2)];

  test("each grid has its free SCU, and is full when no size turned on fits that", () => {
    const rows = [testRow({ scu: "6", picks: picks([1, "Small"]) })];
    expect(gridOf(haulOf(rows, positions), "Small")).toMatchObject({ free: 2, full: false }); // a 1 still fits
    expect(gridOf(haulOf(rows, positions, { 1: false }), "Small")).toMatchObject({ free: 2, full: true });
    expect(gridOf(haulOf(rows, positions), "Big")).toMatchObject({ free: 32, full: false });
  });

  test("a grid with no size turned on that fits its shape is full, even when empty", () => {
    const haul = haulOf([], positions, { 1: false, 8: false });
    expect(gridOf(haul, "Small")).toMatchObject({ free: 8, full: true }); // 32 SCU is too long for it
    expect(gridOf(haul, "Big")).toMatchObject({ free: 32, full: false });
  });

  test("totals the SCU in no grid and the room free, and whether any row is in a grid", () => {
    const rows = [
      testRow({ scu: "40", picks: picks([1, "Small"]) }), // 32 over
      testRow({ scu: "5" }), // no grid
      testRow({ scu: "4", picks: picks([2, "Big"]) }),
    ];
    const haul = haulOf(rows, positions);
    expect(haul.totals).toMatchObject({ unassigned: 37, free: 28 });
    expect(haul.anyAssigned).toBe(true);
    expect(haulOf([testRow({ scu: "5" })], positions).anyAssigned).toBe(false);
  });
});

describe("splitting across grids", () => {
  const positions = [bay("A", 2, 4, 2), bay("B", 2, 4, 2), bay("C", 2, 4, 2)]; // 16 SCU each
  const split = (haul: Haul, rows: Row[]) =>
    rows.map((row) => {
      const { parts, unassigned } = deliveryOf(haul, row);
      return { parts, unassigned };
    });

  test("an earlier pick keeps its room; a later one takes what's left, then moves on", () => {
    const hull = "ship-misc-hull-b";
    const rows = [
      shipRow(hull, { scu: "184", picks: picks([1, "Starboard - Upper"], [2, "Starboard - Lower"]) }),
      shipRow(hull, { scu: "84", picks: picks([3, "Starboard - Lower"], [4, "Port - Lower"]) }),
    ];
    expect(split(haulOnShip(hull, rows), rows)).toEqual([
      {
        parts: [
          { name: "Starboard - Upper", scu: 128 },
          { name: "Starboard - Lower", scu: 56 },
        ],
        unassigned: 0,
      },
      {
        parts: [
          { name: "Starboard - Lower", scu: 72 },
          { name: "Port - Lower", scu: 12 },
        ],
        unassigned: 0,
      },
    ]);
  });

  test("picks fill in the order they were made, not table order", () => {
    const rows = [
      testRow({ scu: "20", picks: picks([2, "C"], [3, "A"]) }),
      testRow({ scu: "10", picks: picks([1, "A"]) }),
    ];
    expect(split(haulOf(rows, positions), rows)).toEqual([
      {
        parts: [
          { name: "C", scu: 16 },
          { name: "A", scu: 4 },
        ],
        unassigned: 0,
      },
      { parts: [{ name: "A", scu: 10 }], unassigned: 0 },
    ]);
  });

  test("a pick of a full grid gets nothing, and the row moves on to its next", () => {
    const rows = [
      testRow({ scu: "16", picks: picks([1, "A"]) }),
      testRow({ scu: "10", picks: picks([2, "A"], [3, "B"]) }),
    ];
    expect(split(haulOf(rows, positions), rows)[1]).toEqual({
      parts: [
        { name: "A", scu: 0 },
        { name: "B", scu: 10 },
      ],
      unassigned: 0,
    });
  });

  test("ties from older saves go by table order", () => {
    const rows = [testRow({ scu: "10", positions: ["A"] }), testRow({ scu: "10", positions: ["A", "B"] })];
    expect(split(haulOf(rows, positions), rows)[1].parts).toEqual([
      { name: "A", scu: 6 },
      { name: "B", scu: 4 },
    ]);
  });

  test("what there's no room for stays out of every grid and counts as unassigned", () => {
    const rows = [
      testRow({ scu: "40", picks: picks([1, "A"], [2, "B"]) }),
      testRow({ scu: "20", picks: picks([3, "C"]) }),
    ];
    expect(split(haulOf(rows, positions), rows)).toEqual([
      {
        parts: [
          { name: "A", scu: 16 },
          { name: "B", scu: 16 },
        ],
        unassigned: 8,
      },
      { parts: [{ name: "C", scu: 16 }], unassigned: 4 },
    ]);
  });

  test("a later pick of a full grid gets nothing from it", () => {
    const rows = [testRow({ scu: "16", picks: picks([1, "A"]) }), testRow({ scu: "4", picks: picks([2, "A"]) })];
    expect(split(haulOf(rows, positions), rows)[1]).toEqual({ parts: [{ name: "A", scu: 0 }], unassigned: 4 });
  });

  test("a row with no grid on this layout is all unassigned", () => {
    const rows = [testRow({ scu: "16" }), testRow({ scu: "9", picks: picks([1, "Elsewhere"]) }), testRow({ scu: "" })];
    expect(split(haulOf(rows, positions), rows)).toEqual([
      { parts: [], unassigned: 16 },
      { parts: [], unassigned: 9 },
      { parts: [], unassigned: 0 },
    ]);
  });

  test("a layout with no grids leaves nothing to assign", () => {
    const rows = [testRow({ scu: "16" })];
    expect(split(haulOf(rows, []), rows)).toEqual([{ parts: [], unassigned: 0 }]);
  });

  test("says why some of a row is in no grid", () => {
    const rows = [
      testRow({ scu: "20", picks: picks([1, "A"]) }), // 4 over
      testRow({ scu: "57" }),
      testRow({ scu: "8", picks: picks([2, "B"]) }),
    ];
    const haul = haulOf(rows, positions);
    expect(rows.map((row) => deliveryOf(haul, row).unassignedReason)).toEqual(["outOfRoom", "noGrid", null]);
  });
});

describe("loading order", () => {
  const hull = "ship-misc-hull-b";

  test("a grid's later cargo loads from aft, apart from what was there first", () => {
    const rows = [
      shipRow(hull, { scu: "184", picks: picks([1, "Starboard - Upper"], [2, "Starboard - Lower"]) }),
      shipRow(hull, { scu: "84", picks: picks([3, "Starboard - Lower"], [4, "Port - Lower"]) }),
    ];
    const { placed } = gridOf(haulOnShip(hull, rows), "Starboard - Lower");
    /* y runs aft to fore here. In each lane across the grid, the first row's
       cargo is all fore of the second's. */
    const ends = (id: number, x: number) =>
      placed.filter((p) => p.tag === id && p.x === x).flatMap(({ y, d }) => [y, y + d]);
    expect(sum(placed, (p) => p.size)).toBe(128); // all of it still fits
    expect(Math.max(...placed.filter((p) => p.tag === rows[0].id).map(({ y, d }) => y + d))).toBe(16);
    for (const x of [0, 2])
      expect(Math.max(...ends(rows[1].id, x))).toBeLessThanOrEqual(Math.min(...ends(rows[0].id, x)));
  });

  test("a grid loads from its fore end", () => {
    const rows = [shipRow(hull, { scu: "32", picks: picks([1, "Port - Upper"]) })];
    const { placed } = gridOf(haulOnShip(hull, rows), "Port - Upper");
    expect(placed.map(({ y, d }) => [y, y + d])).toEqual([[8, 16]]);
  });
});

describe("grid choices", () => {
  const positions = [bay("Small", 2, 2, 2), bay("Big", 2, 8, 2), bay("Long", 2, 8, 2)];
  const blocks = (rows: Row[], row: Row) =>
    Object.fromEntries(deliveryOf(haulOf(rows, positions), row).grids.map((g) => [g.name, g.block]));

  test("a row with SCU left can pick a grid with room for its smallest container", () => {
    const row = testRow({ scu: "40" }); // 32 + 8 in Big; 8 × 5 in Small
    expect(blocks([row], row)).toEqual({ Small: null, Big: null, Long: null });
  });

  test("lists every grid, whether the row is in it, and none it's in is blocked", () => {
    const row = testRow({ scu: "8", picks: picks([1, "Big"]) });
    expect(deliveryOf(haulOf([row], positions), row).grids).toEqual([
      { name: "Small", picked: false, block: "allAssigned" },
      { name: "Big", picked: true, block: null },
      { name: "Long", picked: false, block: "allAssigned" },
    ]);
  });

  test("not a grid others have left too little room in for the row's containers", () => {
    const other = testRow({ scu: "25", picks: picks([1, "Big"]) }); // leaves 7 free, room for 1s
    const row = testRow({ scu: "40" }); // a 32 and an 8
    expect(blocks([other, row], row)).toMatchObject({ Big: "tooSmall", Long: null });
    const odd = testRow({ scu: "41" }); // a 32, an 8 and a 1, which fits
    expect(blocks([other, odd], odd)).toMatchObject({ Big: null });
  });

  test("not a full grid; a row with no SCU yet can pick any other", () => {
    const filler = testRow({ scu: "8", picks: picks([1, "Small"]) });
    const blank = testRow();
    expect(blocks([filler, blank], blank)).toEqual({ Small: "full", Big: null, Long: null });
  });

  test("the rows come out in table order with their text", () => {
    const rows = [testRow({ cargo: "Gold", scu: "1" }), makeRow({ cargo: "Tin" })];
    expect(haulOf(rows, positions).deliveries.map((d) => d.row.cargo)).toEqual(["Gold", "Tin"]);
  });
});
