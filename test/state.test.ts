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
    expect(state.rows[0]).toMatchObject({ material: "Gold", scu: "8", picks: [{ name: "Port - Upper", order: 1 }] });
  });

  test("reads an older list of positions in order, dropping blanks and repeats", () => {
    const state = hydrate({ shipId: "x", rows: [{ scu: "8", positions: ["A", "", "B", "A"] }] });
    expect(state.rows[0].picks.map((p) => p.name)).toEqual(["A", "B"]);
  });

  test("reads saved picks, dropping ones without a grid or order", () => {
    const picks = [{ name: "A", order: 4 }, { name: "", order: 5 }, { name: "B" }, { name: "C", order: 2 }];
    const state = hydrate({ shipId: "x", rows: [{ scu: "8", picks }] });
    expect(state.rows[0].picks).toEqual([
      { name: "A", order: 4 },
      { name: "C", order: 2 },
    ]);
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

describe("reducer togglePick", () => {
  test("a new pick comes after every pick so far, in any row; picking again removes it", () => {
    const [a, b] = [makeRow(), makeRow()];
    let state = { ...defaultState(), rows: [a, b] };
    state = reducer(state, { type: "togglePick", id: a.id, name: "SU" });
    state = reducer(state, { type: "togglePick", id: b.id, name: "SL" });
    state = reducer(state, { type: "togglePick", id: a.id, name: "SL" });
    expect(state.rows.map((r) => r.picks)).toEqual([
      [
        { name: "SU", order: 1 },
        { name: "SL", order: 3 },
      ],
      [{ name: "SL", order: 2 }],
    ]);
    state = reducer(state, { type: "togglePick", id: a.id, name: "SU" });
    expect(state.rows[0].picks).toEqual([{ name: "SL", order: 3 }]);
  });
});

describe("reducer selectShip", () => {
  test("starts the new ship on its first layout", () => {
    const state = { ...defaultState(), shipId: "a", gridId: "cargo" };
    expect(reducer(state, { type: "selectShip", shipId: "b" })).toMatchObject({ shipId: "b", gridId: "" });
  });
});
