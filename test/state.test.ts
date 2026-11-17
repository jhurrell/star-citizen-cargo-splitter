import { describe, expect, test } from "vite-plus/test";
import {
  compareRows,
  defaultState,
  hydrate,
  isEnabled,
  makeRow,
  reducer,
  rowsOn,
  type LayoutRef,
  type State,
} from "../src/lib/state";

const hullA: LayoutRef = { ship: "ship-misc-hull-a", layout: "default" };
const hullB: LayoutRef = { ship: "ship-misc-hull-b", layout: "relaxed" };
const planNames = (state: State, at: LayoutRef) => rowsOn(state.rows, at).map((r) => r.plan.map((step) => step.name));

describe("compareRows", () => {
  test("sorts numerically and keeps blanks last in both directions", () => {
    expect(["b10", "", "b2"].sort((a, b) => compareRows(a, b, 1))).toEqual(["b2", "b10", ""]);
    expect(["b10", "", "b2"].sort((a, b) => compareRows(a, b, -1))).toEqual(["b10", "b2", ""]);
  });
});

describe("hydrate", () => {
  test("falls back to defaults for junk", () => {
    expect(hydrate("nope").rows.map((r) => r.cargo)).toEqual(["Example A", "Example B", "Example C"]);
  });

  test("reads a saved plan, dropping steps without a grid or order", () => {
    const plan = [
      { ...hullA, name: "A", order: 4 },
      { ...hullA, name: "", order: 5 },
      { ...hullA, name: "B" },
      { ...hullB, name: "A", order: 2 }, // the same name on another ship is another grid
      { ...hullA, name: "A", order: 6 }, // a repeat
    ];
    const state = hydrate({ shipId: "x", rows: [{ scu: "8", plan }] });
    expect(state.rows[0].plan).toEqual([
      { ...hullA, name: "A", order: 4 },
      { ...hullB, name: "A", order: 2 },
    ]);
  });

  test("puts plan steps saved without a ship on the saved ship and layout, as the ship list resolves them", () => {
    const saved = { shipId: "", layoutId: "", rows: [{ scu: "8", plan: [{ name: "Port - Upper", order: 1 }] }] };
    const state = hydrate(saved, () => hullA);
    expect(state.rows[0].plan).toEqual([{ ...hullA, name: "Port - Upper", order: 1 }]);
  });

  test("keeps saved size choices and a valid sort only", () => {
    const state = hydrate({ shipId: "x", enabled: { 32: false, 8: "yes" }, sort: { key: "cargo", dir: 2 } });
    expect(state.enabled).toEqual({ 32: false });
    expect(state.sort).toBeNull();
  });
});

describe("reducer sortBy", () => {
  test("sorts once, then reverses on the same column", () => {
    const start = { ...defaultState(), rows: ["b", "a", "c"].map((cargo) => makeRow({ cargo })) };
    const once = reducer(start, { type: "sortBy", key: "cargo" });
    expect(once.rows.map((r) => r.cargo)).toEqual(["a", "b", "c"]);
    const twice = reducer(once, { type: "sortBy", key: "cargo" });
    expect(twice.rows.map((r) => r.cargo)).toEqual(["c", "b", "a"]);
    expect(twice.sort).toEqual({ key: "cargo", dir: -1 });
  });
});

describe("isEnabled", () => {
  test("sizes are on unless unchecked", () => {
    expect(isEnabled({ 32: false }, 32)).toBe(false);
    expect(isEnabled({ 32: false }, 8)).toBe(true);
  });
});

describe("reducer toggleGrid", () => {
  test("a new plan step comes after every step so far, in any row; toggling again removes it", () => {
    const [a, b] = [makeRow(), makeRow()];
    let state = { ...defaultState(), rows: [a, b] };
    state = reducer(state, { type: "toggleGrid", id: a.id, grid: { ...hullA, name: "SU" } });
    state = reducer(state, { type: "toggleGrid", id: b.id, grid: { ...hullA, name: "SL" } });
    state = reducer(state, { type: "toggleGrid", id: a.id, grid: { ...hullA, name: "SL" } });
    expect(state.rows.map((r) => r.plan)).toEqual([
      [
        { ...hullA, name: "SU", order: 1 },
        { ...hullA, name: "SL", order: 3 },
      ],
      [{ ...hullA, name: "SL", order: 2 }],
    ]);
    state = reducer(state, { type: "toggleGrid", id: a.id, grid: { ...hullA, name: "SU" } });
    expect(state.rows[0].plan).toEqual([{ ...hullA, name: "SL", order: 3 }]);
  });

  test("a plan step stays on its ship: another ship's grid of the same name isn't in the plan", () => {
    const row = makeRow();
    const state = reducer(
      { ...defaultState(), rows: [row] },
      { type: "toggleGrid", id: row.id, grid: { ...hullB, name: "Port - Upper" } },
    );
    expect(planNames(state, hullB)).toEqual([["Port - Upper"]]);
    expect(planNames(state, hullA)).toEqual([[]]); // switching ships: no grid
    const back = reducer(reducer(state, { type: "selectShip", shipId: hullA.ship }), {
      type: "selectShip",
      shipId: hullB.ship,
    });
    expect(planNames(back, hullB)).toEqual([["Port - Upper"]]); // switching back restores it
  });
});

describe("reducer clearPlan", () => {
  test("takes every row out of one ship and layout's grids, keeping other ships' plan steps", () => {
    const a = makeRow({ plan: [{ name: "Port - Upper", order: 1 }] }, hullA);
    const b = makeRow({ plan: [{ name: "Port - Upper", order: 2 }] }, hullB);
    const state = reducer({ ...defaultState(), rows: [a, b] }, { type: "clearPlan", at: hullA });
    expect(planNames(state, hullA)).toEqual([[], []]);
    expect(planNames(state, hullB)).toEqual([[], ["Port - Upper"]]);
  });
});

describe("reducer selectShip", () => {
  test("starts the new ship on its first layout", () => {
    const state = { ...defaultState(), shipId: "a", layoutId: "cargo" };
    expect(reducer(state, { type: "selectShip", shipId: "b" })).toMatchObject({ shipId: "b", layoutId: "" });
  });
});
