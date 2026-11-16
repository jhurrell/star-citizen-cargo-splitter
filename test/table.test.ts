import { describe, expect, test } from "vite-plus/test";
import config from "../config.json";
import { parseShips, placementsOf, type Container, type Position } from "../src/lib/cargo";
import { compareRows, defaultState, hydrate, makeRow, reducer } from "../src/lib/state";
import {
  cargoColors,
  computeTable,
  exportTable,
  foreToAft,
  OTHER_COLOR,
  splitRows,
  tableAsMarkdown,
  tableAsTsv,
} from "../src/lib/table";

const container = (size: number, x: number, y: number, z: number): Container => ({
  size,
  placements: placementsOf({ x, y, z }, true),
});
const containers = [container(32, 2, 8, 2), container(8, 2, 2, 2), container(1, 1, 1, 1)];
const bay = (name: string, x: number, y: number, z: number): Position => ({
  name,
  x,
  y,
  z,
  capacity: x * y * z,
  mount: null,
});

describe("compareRows", () => {
  test("sorts numerically and keeps blanks last in both directions", () => {
    expect(["b10", "", "b2"].sort((a, b) => compareRows(a, b, 1))).toEqual(["b2", "b10", ""]);
    expect(["b10", "", "b2"].sort((a, b) => compareRows(a, b, -1))).toEqual(["b10", "b2", ""]);
  });
});

describe("hydrate", () => {
  test("falls back to defaults for junk", () => {
    expect(hydrate("nope").rows.map((r) => r.material)).toEqual(["Example A", "Example B", "Example C"]);
  });

  test("moves old position names onto the Hull B relaxed grid", () => {
    const state = hydrate({ rows: [{ material: "Gold", scu: "8", position: "Left Upper" }] });
    expect(state).toMatchObject({ shipId: "ship-misc-hull-b", gridId: "relaxed" });
    expect(state.rows[0]).toMatchObject({ material: "Gold", scu: "8", positions: ["Port - Upper"] });
  });

  test("reads a saved list of positions, dropping blanks and repeats", () => {
    const state = hydrate({ shipId: "x", rows: [{ scu: "8", positions: ["A", "", "B", "A"] }] });
    expect(state.rows[0].positions).toEqual(["A", "B"]);
  });

  test("keeps saved size choices and a valid sort only", () => {
    const state = hydrate({ shipId: "x", enabled: { 32: false, 8: "yes" }, sort: { key: "material", dir: 2 } });
    expect(state.enabled).toEqual({ 32: false });
    expect(state.sort).toBeNull();
  });
});

describe("reducer sortBy", () => {
  test("sorts once, then reverses on the same column", () => {
    const start = { ...defaultState(), rows: ["b", "a", "c"].map((material) => makeRow({ material })) };
    const once = reducer(start, { type: "sortBy", key: "material" });
    expect(once.rows.map((r) => r.material)).toEqual(["a", "b", "c"]);
    const twice = reducer(once, { type: "sortBy", key: "material" });
    expect(twice.rows.map((r) => r.material)).toEqual(["c", "b", "a"]);
    expect(twice.sort).toEqual({ key: "material", dir: -1 });
  });
});

describe("computeTable", () => {
  const positions = [bay("Small", 2, 2, 2), bay("Big", 2, 8, 2)];

  test("only uses sizes that fit the row's position, and totals them", () => {
    const rows = [makeRow({ scu: "40", positions: ["Small"] }), makeRow({ scu: "40", positions: ["Big"] })];
    const calc = computeTable(rows, {}, containers, positions);
    expect(calc.byRow.get(rows[0].id)).toEqual({ counts: { 8: 5, 1: 0 }, leftover: 0 });
    expect(calc.byRow.get(rows[1].id)).toEqual({ counts: { 32: 1, 8: 1, 1: 0 }, leftover: 0 });
    expect(calc.totals.counts).toEqual({ 32: 1, 8: 6, 1: 0 });
    expect(calc.byPosition.get("Small")!.unfit).toEqual({ 8: 4 });
    expect(calc.byPosition.get("Big")!.unfit).toEqual({ 8: 1 });
    expect(calc.totals.unfit).toEqual({ 8: 5 });
  });

  test("unchecked sizes are skipped and leave a leftover when nothing smaller fits", () => {
    const rows = [makeRow({ scu: "33" })];
    const calc = computeTable(rows, { 1: false }, containers, positions);
    expect(calc.byRow.get(rows[0].id)).toEqual({ counts: { 32: 1, 8: 0 }, leftover: 1 });
    expect(calc.showLeftover).toBe(true);
    expect(calc.byPosition.get("")).toMatchObject({ rows: 1, scu: 33 });
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
    expect(calc.byPosition.get("A")).toMatchObject({ rows: 1, scu: 16, unfit: {} });
    expect(calc.byPosition.get("B")).toMatchObject({ rows: 1, scu: 16, unfit: {} });
    expect(calc.totals.rows).toBe(1);
    expect(tableAsTsv(exportTable(rows, calc, [32, 8, 1])).split("\n")[1]).toMatch(/\tA \(16\), B \(16\)$/);
  });
});

describe("foreToAft", () => {
  const grid = (id: string) => parseShips(config).find((s) => s.id === id)!.grids[0].positions;
  const names = (positions: Position[]) => foreToAft(positions).map((p) => p.name);

  test("puts the Hull C's fore racks first, keeping config order between them", () => {
    expect(names(grid("ship-misc-hull-c"))).toEqual([
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
    expect(names(grid("ship-misc-hull-b"))).toEqual(grid("ship-misc-hull-b").map((p) => p.name));
  });

  test("a split row fills the fore rack first", () => {
    const positions = grid("ship-misc-hull-c");
    const rows = [makeRow({ scu: "600", positions: ["Upper - Aft", "Upper - Fore"] })];
    expect(splitRows(rows, positions).get(rows[0].id)!.parts).toEqual([
      { name: "Upper - Fore", scu: 576 },
      { name: "Upper - Aft", scu: 24 },
    ]);
  });
});

describe("copy formats", () => {
  const positions = [bay("Bay", 2, 8, 2)];
  const rows = [makeRow({ material: "Gold | Ore", pickup: "Area18", scu: "1,033", positions: ["Bay"] })];
  const calc = computeTable(rows, {}, containers, positions);
  const table = exportTable(rows, calc, [32, 8, 1]);

  test("TSV has a header and one line per row", () => {
    expect(tableAsTsv(table).split("\n")).toEqual([
      "Material\tPick-up\tDrop-off\tSCU\t32\t8\t1\tGrid",
      "Gold | Ore\tArea18\t\t1033\t32\t1\t1\tBay",
    ]);
  });

  test("Markdown escapes pipes, right-aligns numbers and bolds the total", () => {
    const lines = tableAsMarkdown(table).split("\n");
    const cells = (line: string) => line.slice(2, -2).split(" | ");
    expect(cells(lines[1]).map((rule) => rule.endsWith(":"))).toEqual([
      false,
      false,
      false,
      true,
      true,
      true,
      true,
      false,
    ]);
    expect(cells(lines[2]).map((cell) => cell.trim())).toEqual([
      "Gold \\| Ore",
      "Area18",
      "",
      "1,033",
      "32",
      "1",
      "1",
      "Bay",
    ]);
    expect(cells(lines[2])[3]).toBe("    1,033"); // padded to the bold total's width
    expect(cells(lines[3]).map((cell) => cell.trim())).toEqual([
      "**Total**",
      "",
      "",
      "**1,033**",
      "**32**",
      "**1**",
      "**1**",
      "",
    ]);
    expect(new Set(lines.map((line) => line.length)).size).toBe(1);
  });
});

describe("cargoColors", () => {
  test("one color per material, case-insensitive, by row age; past eight they share", () => {
    const rows = Array.from({ length: 10 }, (_, i) => makeRow({ material: `M${i}`, scu: "1" }));
    rows.push(makeRow({ material: "m0", scu: "1" }), makeRow({ material: "Empty", scu: "" }));
    const { byRow, materials } = cargoColors(rows);
    expect(materials).toHaveLength(10);
    expect(byRow.get(rows[10].id)).toBe(byRow.get(rows[0].id));
    expect(materials[8].color).toBe(OTHER_COLOR);
    expect(byRow.has(rows[11].id)).toBe(false);
  });
});
