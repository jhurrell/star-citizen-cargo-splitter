import { describe, expect, test } from "vite-plus/test";
import {
  allRows,
  compareRows,
  defaultState,
  handsOut,
  hydrate,
  makeContract,
  makeRow,
  reducer,
  rowsOn,
  type Contract,
  type LayoutRef,
  type Row,
  type State,
} from "../src/lib/state";

const hullA: LayoutRef = { ship: "ship-misc-hull-a", layout: "default" };
const hullB: LayoutRef = { ship: "ship-misc-hull-b", layout: "relaxed" };
/* A state with these contracts, each a list of rows. */
const withContracts = (...lists: Row[][]): State => ({
  ...defaultState(),
  contracts: lists.map((rows) => ({ ...makeContract(), rows })),
});
const planNames = (state: State, at: LayoutRef) =>
  rowsOn(allRows(state), at).map((r) => r.plan.map((step) => step.name));
const cargoOf = (state: State) => state.contracts.map((c) => c.rows.map((r) => r.cargo));

describe("compareRows", () => {
  test("sorts numerically and keeps blanks last in both directions", () => {
    expect(["b10", "", "b2"].sort((a, b) => compareRows(a, b, 1))).toEqual(["b2", "b10", ""]);
    expect(["b10", "", "b2"].sort((a, b) => compareRows(a, b, -1))).toEqual(["b10", "b2", ""]);
  });
});

describe("hydrate", () => {
  test("falls back to defaults for junk: one contract of example rows", () => {
    expect(cargoOf(hydrate("nope"))).toEqual([["Example A", "Example B", "Example C"]]);
  });

  test("reads a saved plan, dropping steps without a grid or order", () => {
    const plan = [
      { ...hullA, name: "A", order: 4 },
      { ...hullA, name: "", order: 5 },
      { ...hullA, name: "B" },
      { ...hullB, name: "A", order: 2 }, // the same name on another ship is another grid
      { ...hullA, name: "A", order: 6 }, // a repeat
    ];
    const state = hydrate({ shipId: "x", contracts: [{ rows: [{ scu: "8", plan }] }] });
    expect(allRows(state)[0].plan).toEqual([
      { ...hullA, name: "A", order: 4 },
      { ...hullB, name: "A", order: 2 },
    ]);
  });

  test("puts plan steps saved without a ship on the saved ship and layout, as the ship list resolves them", () => {
    const saved = { contracts: [{ rows: [{ scu: "8", plan: [{ name: "Port - Upper", order: 1 }] }] }] };
    const state = hydrate(saved, () => hullA);
    expect(allRows(state)[0].plan).toEqual([{ ...hullA, name: "Port - Upper", order: 1 }]);
  });

  test("reads each contract's name, skipped sizes, a valid sort only and whether it's hidden", () => {
    const state = hydrate({
      contracts: [
        {
          name: "Senior",
          enabled: { 4: false, 2: "yes" },
          sort: { key: "dropoff", dir: -1 },
          collapsed: true,
          rows: [],
        },
        { sort: { key: "cargo", dir: 2 }, collapsed: "yes", rows: [{ cargo: "Gold" }] },
      ],
    });
    expect(state.contracts.map(({ name, enabled, sort, collapsed }) => ({ name, enabled, sort, collapsed }))).toEqual([
      { name: "Senior", enabled: { 4: false }, sort: { key: "dropoff", dir: -1 }, collapsed: true },
      { name: "", enabled: {}, sort: null, collapsed: false },
    ]);
    expect(cargoOf(state)).toEqual([[], ["Gold"]]);
  });
});

describe("handsOut", () => {
  test("every size the contract doesn't skip", () => {
    const contract: Pick<Contract, "enabled"> = { enabled: { 24: false, 16: true } };
    expect([32, 24, 16].map((size) => handsOut(contract, size))).toEqual([true, false, true]);
  });
});

describe("reducer contracts", () => {
  test("skips a size in one contract only, and hands it out again", () => {
    let state = withContracts([], []);
    const { id } = state.contracts[0];
    state = reducer(state, { type: "setHandsOut", id, size: 24, on: false });
    expect(state.contracts.map((c) => c.enabled)).toEqual([{ 24: false }, {}]);
    state = reducer(state, { type: "setHandsOut", id, size: 24, on: true });
    expect(state.contracts[0].enabled).toEqual({ 24: true });
  });

  test("adds, renames and deletes contracts, but never the last one", () => {
    let state = withContracts([makeRow({ cargo: "Gold" })]);
    const added = makeContract({ rows: [{}] });
    state = reducer(state, { type: "addContract", contract: added });
    state = reducer(state, { type: "renameContract", id: added.id, name: "Junior" });
    expect(state.contracts.map((c) => c.name)).toEqual(["", "Junior"]);
    state = reducer(state, { type: "deleteContract", id: state.contracts[0].id });
    expect(cargoOf(state)).toEqual([[""]]);
    expect(reducer(state, { type: "deleteContract", id: added.id })).toBe(state);
  });

  test("adds a row to its contract, and a contract keeps going when its last row is deleted", () => {
    let state = withContracts([], []);
    const row = makeRow({ cargo: "Tin" });
    state = reducer(state, { type: "addRow", contractId: state.contracts[1].id, row });
    expect(cargoOf(state)).toEqual([[], ["Tin"]]);
    state = reducer(state, { type: "deleteRow", id: row.id });
    expect(cargoOf(state)).toEqual([[], []]);
  });

  test("hides a contract's table and shows it again, and adding a row shows it", () => {
    let state = withContracts([], []);
    const { id } = state.contracts[0];
    state = reducer(state, { type: "setCollapsed", id, collapsed: true });
    expect(state.contracts.map((c) => c.collapsed)).toEqual([true, false]);
    state = reducer(state, { type: "addRow", contractId: id, row: makeRow() });
    expect(state.contracts[0].collapsed).toBe(false);
  });

  test("resetting all leaves just the contract given", () => {
    const contract = makeContract({ rows: [{}] });
    const state = reducer(withContracts([makeRow()], [makeRow()]), { type: "resetAll", contract });
    expect(state.contracts).toEqual([contract]);
  });
});

describe("reducer sortBy", () => {
  test("sorts one contract's rows once, then reverses on the same column; other contracts stay put", () => {
    const start = withContracts(
      ["b", "a", "c"].map((cargo) => makeRow({ cargo })),
      ["z", "y"].map((cargo) => makeRow({ cargo })),
    );
    const { id } = start.contracts[0];
    const once = reducer(start, { type: "sortBy", id, key: "cargo" });
    expect(cargoOf(once)).toEqual([
      ["a", "b", "c"],
      ["z", "y"],
    ]);
    const twice = reducer(once, { type: "sortBy", id, key: "cargo" });
    expect(cargoOf(twice)).toEqual([
      ["c", "b", "a"],
      ["z", "y"],
    ]);
    expect(twice.contracts.map((c) => c.sort)).toEqual([{ key: "cargo", dir: -1 }, null]);
  });
});

describe("reducer toggleGrid", () => {
  test("a new plan step comes after every step so far, in any row of any contract; toggling again removes it", () => {
    const [a, b] = [makeRow(), makeRow()];
    let state = withContracts([a], [b]);
    state = reducer(state, { type: "toggleGrid", id: a.id, grid: { ...hullA, name: "SU" } });
    state = reducer(state, { type: "toggleGrid", id: b.id, grid: { ...hullA, name: "SL" } });
    state = reducer(state, { type: "toggleGrid", id: a.id, grid: { ...hullA, name: "SL" } });
    expect(allRows(state).map((r) => r.plan)).toEqual([
      [
        { ...hullA, name: "SU", order: 1 },
        { ...hullA, name: "SL", order: 3 },
      ],
      [{ ...hullA, name: "SL", order: 2 }],
    ]);
    state = reducer(state, { type: "toggleGrid", id: a.id, grid: { ...hullA, name: "SU" } });
    expect(allRows(state)[0].plan).toEqual([{ ...hullA, name: "SL", order: 3 }]);
  });

  test("a plan step stays on its ship: another ship's grid of the same name isn't in the plan", () => {
    const row = makeRow();
    const state = reducer(withContracts([row]), {
      type: "toggleGrid",
      id: row.id,
      grid: { ...hullB, name: "Port - Upper" },
    });
    expect(planNames(state, hullB)).toEqual([["Port - Upper"]]);
    expect(planNames(state, hullA)).toEqual([[]]); // switching ships: no grid
    const back = reducer(reducer(state, { type: "selectShip", shipId: hullA.ship }), {
      type: "selectShip",
      shipId: hullB.ship,
    });
    expect(planNames(back, hullB)).toEqual([["Port - Upper"]]); // switching back restores it
  });
});

describe("reducer resetPlan", () => {
  test("takes one contract's rows out of one ship and layout's grids, keeping the rest", () => {
    const a = makeRow({ plan: [{ name: "Port - Upper", order: 1 }] }, hullA);
    const b = makeRow({ plan: [{ name: "Port - Upper", order: 2 }] }, hullB);
    const c = makeRow({ plan: [{ name: "Port - Lower", order: 3 }] }, hullA);
    const start = withContracts([a, b], [c]);
    const state = reducer(start, { type: "resetPlan", id: start.contracts[0].id, at: hullA });
    expect(planNames(state, hullA)).toEqual([[], [], ["Port - Lower"]]); // the other contract keeps its grid
    expect(planNames(state, hullB)).toEqual([[], ["Port - Upper"], []]); // so does the other ship
  });
});

describe("reducer selectShip", () => {
  test("starts the new ship on its first layout", () => {
    const state = { ...defaultState(), shipId: "a", layoutId: "cargo" };
    expect(reducer(state, { type: "selectShip", shipId: "b" })).toMatchObject({ shipId: "b", layoutId: "" });
  });
});
