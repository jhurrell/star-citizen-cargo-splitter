import { asText, type Container } from "./cargo";
import { collator } from "./format";

/* The page's saved state: the chosen ship and layout, which container sizes
   are on, the last sort and the cargo rows. Kept in localStorage. */

export type TextKey = "cargo" | "pickup" | "dropoff";
export const TEXT_COLUMNS: { key: TextKey; label: string }[] = [
  { key: "cargo", label: "Cargo" },
  { key: "pickup", label: "Pick-up" },
  { key: "dropoff", label: "Drop-off" },
];
const TEXT_KEYS = TEXT_COLUMNS.map((c) => c.key);

/* A ship and one of its layouts, by id. */
export type LayoutRef = { ship: string; layout: string };
/* A cargo grid, by its name on a ship's layout. Names are unique within a
   layout but not across ships. */
export type GridRef = LayoutRef & { name: string };
/* A cargo grid in a row's loading plan. `order` says when it was added:
   earlier steps, across all rows, fill first. */
export type PlanStep = GridRef & { order: number };

const isOn = (step: PlanStep, at: LayoutRef) => step.ship === at.ship && step.layout === at.layout;
const isGrid = (step: PlanStep, grid: GridRef) => isOn(step, grid) && step.name === grid.name;
/* No ship or layout: for rows made before any is known, and in tests. */
const NOWHERE: LayoutRef = { ship: "", layout: "" };
/* `plan` is the row's part of the loading plan: the cargo grids its cargo
   goes in, on every ship and layout; several on one layout split it across them. */
export type Row = Record<TextKey, string> & { id: number; scu: string; plan: PlanStep[] };
export type RowField = TextKey | "scu";
export type SortDir = 1 | -1;
export type Sort = { key: TextKey; dir: SortDir } | null;
export type State = {
  shipId: string; // "" means the first ship, by name
  layoutId: string; // "" means that ship's first layout
  enabled: Record<number, boolean>; // size → false when unchecked; sizes not listed are on
  sort: Sort;
  rows: Row[];
};

/* Container sizes are on unless unchecked. */
export const isEnabled = (enabled: State["enabled"], size: number): boolean => enabled[size] !== false;
export const enabledContainers = (containers: Container[], enabled: State["enabled"]): Container[] =>
  containers.filter((c) => isEnabled(enabled, c.size));

const STORE_KEY = "cargo-visualizer-v4";

let nextId = 1;
/* A row from saved or given values. Plan steps given without a ship and
   layout are taken to be on `at`. */
export function makeRow(values: Partial<Record<RowField | "plan", unknown>> = {}, at: LayoutRef = NOWHERE): Row {
  const text = (key: RowField) => asText(values[key]);
  return {
    id: nextId++,
    cargo: text("cargo"),
    pickup: text("pickup"),
    dropoff: text("dropoff"),
    scu: text("scu"),
    plan: readPlan(values.plan, at),
  };
}

/* A row's plan, each cargo grid once. Kept for every ship and layout, so
   switching back restores it. */
function readPlan(plan: unknown, at: LayoutRef): PlanStep[] {
  type Saved = { ship?: unknown; layout?: unknown; name?: unknown; order?: unknown } | null;
  const seen = new Set<string>();
  const key = (step: GridRef) => JSON.stringify([step.ship, step.layout, step.name]);
  return (Array.isArray(plan) ? plan : [])
    .map((step: Saved) => ({
      ship: asText(step?.ship) || at.ship,
      layout: asText(step?.layout) || at.layout,
      name: asText(step?.name),
      order: Number(step?.order),
    }))
    .filter((step) => step.name && Number.isFinite(step.order) && !seen.has(key(step)) && seen.add(key(step)));
}

/* The rows with only their plan on one ship and layout, which is all the
   table and ship view work from. */
export const rowsOn = (rows: Row[], at: LayoutRef): Row[] =>
  rows.map((row) => ({ ...row, plan: row.plan.filter((step) => isOn(step, at)) }));

/* The order for a new plan step: after every step so far. */
const nextOrder = (rows: Row[]) => 1 + Math.max(0, ...rows.flatMap((r) => r.plan.map((step) => step.order)));

export function defaultState(): State {
  return {
    shipId: "",
    layoutId: "",
    enabled: {},
    sort: null,
    rows: [
      makeRow({ cargo: "Example A", scu: "57" }),
      makeRow({ cargo: "Example B", scu: "100" }),
      makeRow({ cargo: "Example C", scu: "13" }),
    ],
  };
}

const isTextKey = (value: unknown): value is TextKey => TEXT_KEYS.includes(value as TextKey);

/* The actual ship and layout a state's choice means ("" is the first of
   each), which only the ship list knows. */
export type ResolveLayout = (choice: Pick<State, "shipId" | "layoutId">) => LayoutRef;
const asSaved: ResolveLayout = ({ shipId, layoutId }) => ({ ship: shipId, layout: layoutId });

/* Build a valid state from whatever was saved, falling back to defaults field
   by field. Plan steps saved without a ship and layout go on the saved choice's. */
export function hydrate(saved: unknown, resolve: ResolveLayout = asSaved): State {
  const result = defaultState();
  if (!saved || typeof saved !== "object") return result;
  const s = saved as Record<string, unknown>;
  const rows = Array.isArray(s.rows) ? (s.rows as Record<string, unknown>[]) : null;
  result.shipId = asText(s.shipId);
  result.layoutId = asText(s.layoutId);
  /* Sizes aren't known until containers.json is read, so keep every saved choice. */
  for (const [size, on] of Object.entries((s.enabled as object) ?? {})) {
    if (typeof on === "boolean") result.enabled[Number(size)] = on;
  }
  const sort = s.sort as { key?: unknown; dir?: unknown } | null;
  if (isTextKey(sort?.key) && (sort?.dir === 1 || sort?.dir === -1)) result.sort = { key: sort.key, dir: sort.dir };
  if (rows) result.rows = rows.map((r) => makeRow(r ?? {}, resolve(result)));
  return result;
}

export function loadState(resolve?: ResolveLayout): State {
  try {
    return hydrate(JSON.parse(localStorage.getItem(STORE_KEY) ?? "null"), resolve);
  } catch {
    return defaultState(); // storage blocked or corrupt: start fresh
  }
}

export function saveState({ shipId, layoutId, enabled, sort, rows }: State): void {
  try {
    const values = rows.map(({ id: _id, ...rest }) => rest);
    localStorage.setItem(STORE_KEY, JSON.stringify({ shipId, layoutId, enabled, sort, rows: values }));
  } catch {
    /* storage unavailable: the table still works for this visit */
  }
}

export type Action =
  | { type: "addRow"; row: Row }
  | { type: "deleteRow"; id: number }
  | { type: "updateRow"; id: number; field: RowField; value: string }
  /* Add a cargo grid to a row's plan, after every earlier step, or take it out. */
  | { type: "toggleGrid"; id: number; grid: GridRef }
  /* Take every row out of one ship and layout's grids. */
  | { type: "clearPlan"; at: LayoutRef }
  | { type: "sortBy"; key: TextKey }
  /* A new ship starts on its first layout. */
  | { type: "selectShip"; shipId: string }
  | { type: "selectLayout"; layoutId: string }
  | { type: "setSizeEnabled"; size: number; on: boolean }
  | { type: "clearRows"; row: Row };

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "addRow":
      return { ...state, rows: [...state.rows, action.row] };
    case "deleteRow":
      return { ...state, rows: state.rows.filter((r) => r.id !== action.id) };
    case "updateRow":
      return {
        ...state,
        rows: state.rows.map((r) => (r.id === action.id ? { ...r, [action.field]: action.value } : r)),
      };
    case "toggleGrid": {
      const { id, grid } = action;
      const order = nextOrder(state.rows);
      const toggle = (plan: PlanStep[]) =>
        plan.some((step) => isGrid(step, grid))
          ? plan.filter((step) => !isGrid(step, grid))
          : [...plan, { ...grid, order }];
      return { ...state, rows: state.rows.map((r) => (r.id === id ? { ...r, plan: toggle(r.plan) } : r)) };
    }
    case "clearPlan": {
      /* Steps on other ships and layouts stay, for switching back. */
      const { at } = action;
      return {
        ...state,
        rows: state.rows.map((r) => ({ ...r, plan: r.plan.filter((step) => !isOn(step, at)) })),
      };
    }
    case "sortBy": {
      /* Sorting reorders the rows once, like a spreadsheet; later edits don't
         move rows. Sorting the same column again reverses the order. */
      const { key } = action;
      const dir: SortDir = state.sort?.key === key ? (-state.sort.dir as SortDir) : 1;
      const rows = [...state.rows].sort((a, b) => compareRows(a[key], b[key], dir));
      return { ...state, sort: { key, dir }, rows };
    }
    case "selectShip":
      return { ...state, shipId: action.shipId, layoutId: "" };
    case "selectLayout":
      return { ...state, layoutId: action.layoutId };
    case "setSizeEnabled":
      return { ...state, enabled: { ...state.enabled, [action.size]: action.on } };
    case "clearRows":
      return { ...state, rows: [action.row] };
  }
}

/* Blank values always sort last, whichever way the sort runs. */
export function compareRows(a: string, b: string, dir: SortDir): number {
  const [x, y] = [a.trim(), b.trim()];
  if (!x || !y) return Number(!x) - Number(!y);
  return dir * collator.compare(x, y);
}
