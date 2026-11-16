import { describe, expect, test } from "vite-plus/test";
import { computeTable, foreToAft, shortText, splitRows } from "../src/lib/calc";
import type { Position } from "../src/lib/cargo";
import { makeRow } from "../src/lib/state";
import { bay, containers, shipPositions } from "./helpers";

describe("computeTable", () => {
  const positions = [bay("Small", 2, 2, 2), bay("Big", 2, 8, 2)];

  test("only uses sizes that fit the row's position, and totals them", () => {
    const rows = [makeRow({ scu: "40", positions: ["Small"] }), makeRow({ scu: "40", positions: ["Big"] })];
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
  const parts = (rows: ReturnType<typeof makeRow>[]) => rows.map((r) => splitRows(rows, positions).get(r.id));

  test("one-position rows go in first; split rows fill free room in grid order", () => {
    const rows = [makeRow({ scu: "20", positions: ["C", "A"] }), makeRow({ scu: "10", positions: ["A"] })];
    expect(parts(rows)).toEqual([
      {
        parts: [
          { name: "A", scu: 6 },
          { name: "C", scu: 14 },
        ],
        short: 0,
      },
      { parts: [{ name: "A", scu: 10 }], short: 0 },
    ]);
  });

  test("what there's no room for goes in the last position and counts as short", () => {
    const rows = [makeRow({ scu: "40", positions: ["A", "B"] }), makeRow({ scu: "20", positions: ["C"] })];
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

  test("a row with no position is short only when no one position could hold it", () => {
    const rows = [makeRow({ scu: "16" }), makeRow({ scu: "17" }), makeRow({ scu: "9", positions: ["Elsewhere"] })];
    expect(parts(rows)).toEqual([
      { parts: [], short: 0 },
      { parts: [], short: 1 },
      { parts: [], short: 0 },
    ]);
  });

  test("a split row's containers are packed per position and counted once", () => {
    const rows = [makeRow({ scu: "32", positions: ["A", "B"] })];
    const calc = computeTable(rows, {}, containers, positions);
    expect(calc.byRow.get(rows[0].id)).toEqual({ counts: { 8: 4, 1: 0 }, leftover: 0 });
    expect(calc.byPosition.get("A")).toMatchObject({ scu: 16 });
    expect(calc.byPosition.get("B")).toMatchObject({ scu: 16 });
    expect(calc.totals.scu).toBe(32);
  });
});

describe("shortText", () => {
  test("says how much doesn't fit, or nothing when it all does", () => {
    expect(shortText({ parts: [{ name: "A", scu: 20 }], short: 4 })).toMatch(/^4 SCU more than this grid has room/);
    expect(shortText({ parts: [], short: 1 })).toMatch(/^More than any one grid holds/);
    expect(shortText({ parts: [{ name: "A", scu: 8 }], short: 0 })).toBe("");
  });
});

describe("foreToAft", () => {
  const names = (positions: Position[]) => foreToAft(positions).map((p) => p.name);

  test("puts the Hull C's fore racks first, keeping config order between them", () => {
    expect(names(shipPositions("ship-misc-hull-c"))).toEqual([
      "Upper - Fore",
      "Starboard - Fore",
      "Lower - Fore",
      "Port - Fore",
      "Upper - Aft",
      "Starboard - Aft",
      "Lower - Aft",
      "Port - Aft",
    ]);
  });

  test("keeps config order when nothing is further fore", () => {
    expect(names(shipPositions("ship-misc-hull-b"))).toEqual(shipPositions("ship-misc-hull-b").map((p) => p.name));
  });

  test("loads a Hull B grid from its fore end", () => {
    const positions = shipPositions("ship-misc-hull-b");
    const rows = [makeRow({ scu: "32", positions: ["Port - Upper"] })];
    const { placed } = computeTable(rows, {}, containers, positions).byPosition.get("Port - Upper")!;
    expect(placed.map(({ y, d }) => [y, y + d])).toEqual([[8, 16]]);
  });

  test("a split row fills the fore rack first", () => {
    const positions = shipPositions("ship-misc-hull-c");
    const rows = [makeRow({ scu: "600", positions: ["Upper - Aft", "Upper - Fore"] })];
    expect(splitRows(rows, positions).get(rows[0].id)!.parts).toEqual([
      { name: "Upper - Fore", scu: 576 },
      { name: "Upper - Aft", scu: 24 },
    ]);
  });
});
