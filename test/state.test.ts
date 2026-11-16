import { describe, expect, test } from "vite-plus/test";
import { compareRows, defaultState, hydrate, isEnabled, makeRow, reducer } from "../src/lib/state";

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

describe("isEnabled", () => {
  test("sizes are on unless unchecked", () => {
    expect(isEnabled({ 32: false }, 32)).toBe(false);
    expect(isEnabled({ 32: false }, 8)).toBe(true);
  });
});
