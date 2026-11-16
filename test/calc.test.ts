import { describe, expect, test } from "vite-plus/test";
import { computeTable, shortText, splitRows } from "../src/lib/calc";
import { sum } from "../src/lib/format";
import { makeRow } from "../src/lib/state";
import { bay, containers, shipPositions } from "./helpers";

describe("computeTable", () => {
  const positions = [bay("Small", 2, 2, 2), bay("Big", 2, 8, 2)];

  test("only uses sizes that fit the row's position, and totals them", () => {
    const rows = [
      makeRow({ scu: "40", picks: [{ name: "Small", order: 1 }] }),
      makeRow({ scu: "40", picks: [{ name: "Big", order: 2 }] }),
    ];
    const calc = computeTable(rows, {}, containers, positions);
    expect(calc.byRow.get(rows[0].id)).toEqual({ counts: { 8: 5, 1: 0 }, leftover: 0 });
    expect(calc.byRow.get(rows[1].id)).toEqual({ counts: { 32: 1, 8: 1, 1: 0 }, leftover: 0 });
    expect(calc.totals.counts).toEqual({ 32: 1, 8: 6, 1: 0 });
    expect(calc.byPosition.get("Small")!.scu).toBe(40); // over its capacity of 8
    expect(calc.byPosition.get("Small")!.placed).toHaveLength(1);
  });

  test("unchecked sizes are skipped and leave a leftover when nothing smaller fits", () => {
    const rows = [makeRow({ scu: "33" })];
    const calc = computeTable(rows, { 1: false }, containers, positions);
    expect(calc.byRow.get(rows[0].id)).toEqual({ counts: { 32: 1, 8: 0 }, leftover: 1 });
    expect(calc.showLeftover).toBe(true);
    expect([...calc.byPosition.values()].every((load) => load.scu === 0)).toBe(true); // no position, no load
  });
});

describe("splitRows", () => {
  const positions = [bay("A", 2, 4, 2), bay("B", 2, 4, 2), bay("C", 2, 4, 2)]; // 16 SCU each
  const parts = (rows: ReturnType<typeof makeRow>[], at = positions) => rows.map((r) => splitRows(rows, at).get(r.id));
  /* A row's picks, each [order, grid]. */
  const picks = (...list: [number, string][]) => list.map(([order, name]) => ({ name, order }));

  test("an earlier pick keeps its room; a later one takes what's left, then moves on", () => {
    const at = shipPositions("ship-misc-hull-b");
    const rows = [
      makeRow({ scu: "184", picks: picks([1, "Starboard - Upper"], [2, "Starboard - Lower"]) }),
      makeRow({ scu: "84", picks: picks([3, "Starboard - Lower"], [4, "Port - Lower"]) }),
    ];
    expect(parts(rows, at)).toEqual([
      {
        parts: [
          { name: "Starboard - Upper", scu: 128 },
          { name: "Starboard - Lower", scu: 56 },
        ],
        short: 0,
      },
      {
        parts: [
          { name: "Starboard - Lower", scu: 72 },
          { name: "Port - Lower", scu: 12 },
        ],
        short: 0,
      },
    ]);
  });

  test("picks fill in the order they were made, not table order", () => {
    const rows = [
      makeRow({ scu: "20", picks: picks([2, "C"], [3, "A"]) }),
      makeRow({ scu: "10", picks: picks([1, "A"]) }),
    ];
    expect(parts(rows)).toEqual([
      {
        parts: [
          { name: "C", scu: 16 },
          { name: "A", scu: 4 },
        ],
        short: 0,
      },
      { parts: [{ name: "A", scu: 10 }], short: 0 },
    ]);
  });

  test("a pick of a full grid gets nothing, and the row moves on to its next", () => {
    const rows = [
      makeRow({ scu: "16", picks: picks([1, "A"]) }),
      makeRow({ scu: "10", picks: picks([2, "A"], [3, "B"]) }),
    ];
    expect(parts(rows)[1]).toEqual({
      parts: [
        { name: "A", scu: 0 },
        { name: "B", scu: 10 },
      ],
      short: 0,
    });
  });

  test("ties from older saves go by table order", () => {
    const rows = [makeRow({ scu: "10", positions: ["A"] }), makeRow({ scu: "10", positions: ["A", "B"] })];
    expect(parts(rows)[1]!.parts).toEqual([
      { name: "A", scu: 6 },
      { name: "B", scu: 4 },
    ]);
  });

  test("what there's no room for goes in the last pick and counts as short", () => {
    const rows = [
      makeRow({ scu: "40", picks: picks([1, "A"], [2, "B"]) }),
      makeRow({ scu: "20", picks: picks([3, "C"]) }),
    ];
    expect(parts(rows)).toEqual([
      {
        parts: [
          { name: "A", scu: 16 },
          { name: "B", scu: 24 },
        ],
        short: 8,
      },
      { parts: [{ name: "C", scu: 20 }], short: 4 },
    ]);
  });

  test("a row with no grid is short only when no one grid could hold it", () => {
    const rows = [
      makeRow({ scu: "16" }),
      makeRow({ scu: "17" }),
      makeRow({ scu: "9", picks: picks([1, "Elsewhere"]) }),
    ];
    expect(parts(rows)).toEqual([
      { parts: [], short: 0 },
      { parts: [], short: 1 },
      { parts: [], short: 0 },
    ]);
  });

  test("a split row's containers are packed per grid and counted once", () => {
    const rows = [makeRow({ scu: "32", picks: picks([1, "A"], [2, "B"]) })];
    const calc = computeTable(rows, {}, containers, positions);
    expect(calc.byRow.get(rows[0].id)).toEqual({ counts: { 8: 4, 1: 0 }, leftover: 0 });
    expect(calc.byPosition.get("A")).toMatchObject({ scu: 16 });
    expect(calc.byPosition.get("B")).toMatchObject({ scu: 16 });
    expect(calc.totals.scu).toBe(32);
  });

  test("a grid's later cargo loads from aft, apart from what was there first", () => {
    const at = shipPositions("ship-misc-hull-b");
    const rows = [
      makeRow({ scu: "184", picks: picks([1, "Starboard - Upper"], [2, "Starboard - Lower"]) }),
      makeRow({ scu: "84", picks: picks([3, "Starboard - Lower"], [4, "Port - Lower"]) }),
    ];
    const { placed } = computeTable(rows, {}, containers, at).byPosition.get("Starboard - Lower")!;
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
    const at = shipPositions("ship-misc-hull-b");
    const rows = [makeRow({ scu: "32", picks: picks([1, "Port - Upper"]) })];
    const { placed } = computeTable(rows, {}, containers, at).byPosition.get("Port - Upper")!;
    expect(placed.map(({ y, d }) => [y, y + d])).toEqual([[8, 16]]);
  });
});

describe("shortText", () => {
  test("says how much doesn't fit, or nothing when it all does", () => {
    expect(shortText({ parts: [{ name: "A", scu: 20 }], short: 4 })).toMatch(/^4 SCU more than this grid has room/);
    expect(shortText({ parts: [], short: 1 })).toMatch(/^More than any one grid holds/);
    expect(shortText({ parts: [{ name: "A", scu: 8 }], short: 0 })).toBe("");
  });
});
