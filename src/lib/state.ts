import { asText } from "./cargo";
import { collator } from "./format";

/* The page's saved state: the chosen ship and layout, and the contracts,
   each with its container sizes, its last sort and its cargo rows. Kept in
   localStorage. */

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
/* A contract: its deliveries, and the container sizes it hands out: every
   size but those it skips. */
export type Contract = {
  id: number;
  name: string; // "" shows as "Contract N"
  /* The sizes it hands out (see handsOut): size → false when skipped; sizes
     not listed are on. Named "enabled" because that's its name in saved
     tables, kept so saves still load. */
  enabled: Record<number, boolean>;
  sort: Sort;
  /* Its table hidden, leaving just its bar, so the ship view comes up the page. */
  collapsed: boolean;
  rows: Row[];
};
export type State = {
  shipId: string; // "" means the first ship, by name
  layoutId: string; // "" means that ship's first layout
  /* At least one, in page order. */
  contracts: Contract[];
};

/* Whether a contract hands out a size: every size it doesn't skip. */
export const handsOut = (contract: Pick<Contract, "enabled">, size: number): boolean =>
  contract.enabled[size] !== false;

/* Every row, in page order. */
export const allRows = (state: Pick<State, "contracts">): Row[] => state.contracts.flatMap((c) => c.rows);

const STORE_KEY = "cargo-visualizer-v5";

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

/* A contract from saved or given values; with no rows given, it has none. */
export function makeContract(
  values: { name?: unknown; enabled?: unknown; sort?: unknown; collapsed?: unknown; rows?: unknown } = {},
  at: LayoutRef = NOWHERE,
): Contract {
  const enabled: Record<number, boolean> = {};
  /* Sizes aren't known until containers.json is read, so keep every saved choice. */
  for (const [size, on] of Object.entries((values.enabled as object) ?? {})) {
    if (typeof on === "boolean") enabled[Number(size)] = on;
  }
  const rows = Array.isArray(values.rows) ? (values.rows as Record<string, unknown>[]) : [];
  return {
    id: nextId++,
    name: asText(values.name),
    enabled,
    sort: readSort(values.sort),
    collapsed: values.collapsed === true,
    rows: rows.map((r) => makeRow(r ?? {}, at)),
  };
}

/* A saved sort, if it's a valid one. */
function readSort(value: unknown): Sort {
  const sort = value as { key?: unknown; dir?: unknown } | null;
  const key = sort?.key as TextKey;
  return TEXT_KEYS.includes(key) && (sort?.dir === 1 || sort?.dir === -1) ? { key, dir: sort.dir } : null;
}

export function defaultState(): State {
  return {
    shipId: "",
    layoutId: "",
    contracts: [
      makeContract({
        rows: [
          { cargo: "Example A", scu: "57" },
          { cargo: "Example B", scu: "100" },
          { cargo: "Example C", scu: "13" },
        ],
      }),
    ],
  };
}

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
  const contracts = Array.isArray(s.contracts) ? (s.contracts as Record<string, unknown>[]) : [];
  result.shipId = asText(s.shipId);
  result.layoutId = asText(s.layoutId);
  if (contracts.length) result.contracts = contracts.map((c) => makeContract(c ?? {}, resolve(result)));
  return result;
}

export function loadState(resolve?: ResolveLayout): State {
  try {
    return hydrate(JSON.parse(localStorage.getItem(STORE_KEY) ?? "null"), resolve);
  } catch {
    return defaultState(); // storage blocked or corrupt: start fresh
  }
}

export function saveState({ shipId, layoutId, contracts }: State): void {
  try {
    const values = contracts.map(({ id: _id, rows, ...contract }) => ({
      ...contract,
      rows: rows.map(({ id: _rowId, ...row }) => row),
    }));
    localStorage.setItem(STORE_KEY, JSON.stringify({ shipId, layoutId, contracts: values }));
  } catch {
    /* storage unavailable: the table still works for this visit */
  }
}

export type Action =
  | { type: "addContract"; contract: Contract }
  | { type: "deleteContract"; id: number }
  | { type: "renameContract"; id: number; name: string }
  /* Hide a contract's table, or show it again. */
  | { type: "setCollapsed"; id: number; collapsed: boolean }
  /* Skip a size in a contract, or hand it out again. */
  | { type: "setHandsOut"; id: number; size: number; on: boolean }
  | { type: "addRow"; contractId: number; row: Row }
  | { type: "deleteRow"; id: number }
  | { type: "updateRow"; id: number; field: RowField; value: string }
  /* Add a cargo grid to a row's plan, after every earlier step, or take it out. */
  | { type: "toggleGrid"; id: number; grid: GridRef }
  /* Take every row of one contract out of one ship and layout's grids. */
  | { type: "resetPlan"; id: number; at: LayoutRef }
  /* Sort one contract's rows. */
  | { type: "sortBy"; id: number; key: TextKey }
  /* A new ship starts on its first layout. */
  | { type: "selectShip"; shipId: string }
  | { type: "selectLayout"; layoutId: string }
  /* Leave just this contract, which the caller makes with one blank row. */
  | { type: "resetAll"; contract: Contract };

export function reducer(state: State, action: Action): State {
  /* Change one contract, by id. */
  const contract = (id: number, change: (c: Contract) => Contract): State => ({
    ...state,
    contracts: state.contracts.map((c) => (c.id === id ? change(c) : c)),
  });
  /* Change every contract's rows. */
  const rows = (change: (rows: Row[]) => Row[]): State => ({
    ...state,
    contracts: state.contracts.map((c) => ({ ...c, rows: change(c.rows) })),
  });
  switch (action.type) {
    case "addContract":
      return { ...state, contracts: [...state.contracts, action.contract] };
    case "deleteContract":
      /* The haul always keeps one contract. */
      if (state.contracts.length < 2) return state;
      return { ...state, contracts: state.contracts.filter((c) => c.id !== action.id) };
    case "renameContract":
      return contract(action.id, (c) => ({ ...c, name: action.name }));
    case "setCollapsed":
      return contract(action.id, (c) => ({ ...c, collapsed: action.collapsed }));
    case "setHandsOut":
      return contract(action.id, (c) => ({ ...c, enabled: { ...c.enabled, [action.size]: action.on } }));
    case "addRow":
      /* Shows the table, so the new row can be typed in. */
      return contract(action.contractId, (c) => ({ ...c, collapsed: false, rows: [...c.rows, action.row] }));
    case "deleteRow":
      return rows((list) => list.filter((r) => r.id !== action.id));
    case "updateRow":
      return rows((list) => list.map((r) => (r.id === action.id ? { ...r, [action.field]: action.value } : r)));
    case "toggleGrid": {
      const { id, grid } = action;
      const order = nextOrder(allRows(state));
      const toggle = (plan: PlanStep[]) =>
        plan.some((step) => isGrid(step, grid))
          ? plan.filter((step) => !isGrid(step, grid))
          : [...plan, { ...grid, order }];
      return rows((list) => list.map((r) => (r.id === id ? { ...r, plan: toggle(r.plan) } : r)));
    }
    case "resetPlan": {
      /* Steps on other ships and layouts stay, for switching back. */
      const { at } = action;
      return contract(action.id, (c) => ({
        ...c,
        rows: c.rows.map((r) => ({ ...r, plan: r.plan.filter((step) => !isOn(step, at)) })),
      }));
    }
    case "sortBy": {
      /* Sorting reorders a contract's rows once, like a spreadsheet; later
         edits don't move rows. Sorting the same column again reverses the order. */
      const { key } = action;
      return contract(action.id, (c) => {
        const dir: SortDir = c.sort?.key === key ? (-c.sort.dir as SortDir) : 1;
        return { ...c, sort: { key, dir }, rows: [...c.rows].sort((a, b) => compareRows(a[key], b[key], dir)) };
      });
    }
    case "selectShip":
      return { ...state, shipId: action.shipId, layoutId: "" };
    case "selectLayout":
      return { ...state, layoutId: action.layoutId };
    case "resetAll":
      return { ...state, contracts: [action.contract] };
  }
}

/* Blank values always sort last, whichever way the sort runs. */
export function compareRows(a: string, b: string, dir: SortDir): number {
  const [x, y] = [a.trim(), b.trim()];
  if (!x || !y) return Number(!x) - Number(!y);
  return dir * collator.compare(x, y);
}
