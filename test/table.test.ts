import { describe, expect, test } from "vite-plus/test";
import { placementsOf, type Container, type Position } from "../src/lib/cargo";
import { compareRows, defaultState, hydrate, makeRow, reducer } from "../src/lib/state";
import { cargoColors, computeTable, exportTable, OTHER_COLOR, tableAsMarkdown, tableAsTsv } from "../src/lib/table";

const container = (size: number, x: number, y: number, z: number): Container => ({
  size,
  placements: placementsOf({ x, y, z }, true),
});
const containers = [container(32, 2, 8, 2), container(8, 2, 2, 2), container(1, 1, 1, 1)];
const bay = (name: string, x: number, y: number, z: number): Position => ({ name, x, y, z, capacity: x * y * z });

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
    expect(state.rows[0]).toMatchObject({ material: "Gold", scu: "8", position: "Port - Upper" });
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
    const rows = [makeRow({ scu: "40", position: "Small" }), makeRow({ scu: "40", position: "Big" })];
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

describe("copy formats", () => {
  const positions = [bay("Bay", 2, 8, 2)];
  const rows = [makeRow({ material: "Gold | Ore", pickup: "Area18", scu: "1,033", position: "Bay" })];
  const calc = computeTable(rows, {}, containers, positions);
  const table = exportTable(rows, calc, [32, 8, 1], positions);

  test("TSV has a header and one line per row", () => {
    expect(tableAsTsv(table).split("\n")).toEqual([
      "Material\tPick-up\tDrop-off\tSCU\t32\t8\t1\tPosition",
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
