import { asText, type Container } from "./cargo";
import { collator } from "./format";

/* The page's saved state: the chosen ship and grid, which container sizes are
   on, the last sort and the cargo rows. Kept in localStorage. */

export type TextKey = "cargo" | "pickup" | "dropoff";
export const TEXT_COLUMNS: { key: TextKey; label: string }[] = [
  { key: "cargo", label: "Cargo" },
  { key: "pickup", label: "Pick-up" },
  { key: "dropoff", label: "Drop-off" },
];
const TEXT_KEYS = TEXT_COLUMNS.map((c) => c.key);

/* A ship and one of its layouts, by id. */
export type LayoutRef = { ship: string; layout: string };
/* A grid (a ships.json position), by its name on a ship's layout. Names are
   unique within a layout but not across ships. */
export type GridRef = LayoutRef & { name: string };
/* A grid a row's cargo goes in. `order` says when it was picked: earlier
   picks, across all rows, fill first. */
export type GridPick = GridRef & { order: number };

const isOn = (pick: GridPick, at: LayoutRef) => pick.ship === at.ship && pick.layout === at.layout;
const isGrid = (pick: GridPick, grid: GridRef) => isOn(pick, grid) && pick.name === grid.name;
/* No ship or layout: for rows made before any is known, and in tests. */
const NOWHERE: LayoutRef = { ship: "", layout: "" };
/* `picks` are the grids the row's cargo goes in, on every ship and layout;
   several on one layout split it across them. */
export type Row = Record<TextKey, string> & { id: number; scu: string; picks: GridPick[] };
export type RowField = TextKey | "scu";
export type SortDir = 1 | -1;
export type Sort = { key: TextKey; dir: SortDir } | null;
export type State = {
  shipId: string; // "" means the first ship, by name
  gridId: string; // "" means that ship's first grid
  enabled: Record<number, boolean>; // size → false when unchecked; sizes not listed are on
  sort: Sort;
  rows: Row[];
};

/* Container sizes are on unless unchecked. */
export const isEnabled = (enabled: State["enabled"], size: number): boolean => enabled[size] !== false;
export const enabledContainers = (containers: Container[], enabled: State["enabled"]): Container[] =>
  containers.filter((c) => isEnabled(enabled, c.size));

const STORE_KEY = "cargo-visualizer-v3";
/* Position names saved before ships were selectable: the Hull B's relaxed grid. */
const LEGACY_SHIP = { shipId: "ship-misc-hull-b", gridId: "relaxed" };
const LEGACY_POSITIONS: Record<string, string> = {
  "Left Upper": "Port - Upper",
  "Left Lower": "Port - Lower",
  "Right Upper": "Starboard - Upper",
  "Right Lower": "Starboard - Lower",
};

let nextId = 1;
/* A row from saved or given values. Saved picks that don't say which ship
   and layout they're on (older saves) are taken to be on `at`. */
export function makeRow(
  values: Partial<Record<RowField | "picks" | "positions" | "position", unknown>> = {},
  at: LayoutRef = NOWHERE,
): Row {
  const text = (key: RowField) => asText(values[key]);
  return {
    id: nextId++,
    cargo: text("cargo"),
    pickup: text("pickup"),
    dropoff: text("dropoff"),
    scu: text("scu"),
    picks: readPicks(values, at),
  };
}

/* A row's picks, each grid once. Kept for every ship and layout, so
   switching back restores them. Older saves list grid names, a "positions"
   list or one "position", in the order picked within the row. */
function readPicks(
  { picks, positions, position }: Partial<Record<"picks" | "positions" | "position", unknown>>,
  at: LayoutRef,
): GridPick[] {
  type Saved = { ship?: unknown; layout?: unknown; name?: unknown; order?: unknown } | null;
  const saved = Array.isArray(picks)
    ? picks.map((p: Saved) => ({
        ship: asText(p?.ship) || at.ship,
        layout: asText(p?.layout) || at.layout,
        name: asText(p?.name),
        order: Number(p?.order),
      }))
    : (Array.isArray(positions) ? positions : [position]).map((name, i) => ({
        ...at,
        name: asText(name),
        order: i + 1,
      }));
  const seen = new Set<string>();
  const key = (p: GridRef) => JSON.stringify([p.ship, p.layout, p.name]);
  return saved
    .map((p) => ({ ...p, name: LEGACY_POSITIONS[p.name] ?? p.name }))
    .filter((p) => p.name && Number.isFinite(p.order) && !seen.has(key(p)) && seen.add(key(p)));
}

/* The rows with only their picks on one ship and layout, which is all the
   table and ship view work from. */
export const rowsOn = (rows: Row[], at: LayoutRef): Row[] =>
  rows.map((row) => ({ ...row, picks: row.picks.filter((p) => isOn(p, at)) }));

/* The order for a new pick: after every pick so far. */
const nextOrder = (rows: Row[]) => 1 + Math.max(0, ...rows.flatMap((r) => r.picks.map((p) => p.order)));

export function defaultState(): State {
  return {
    shipId: "",
    gridId: "",
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
export type ResolveLayout = (choice: Pick<State, "shipId" | "gridId">) => LayoutRef;
const asSaved: ResolveLayout = ({ shipId, gridId }) => ({ ship: shipId, layout: gridId });

/* Build a valid state from whatever was saved, falling back to defaults field
   by field. Picks saved without a ship and layout go on the saved choice's. */
export function hydrate(saved: unknown, resolve: ResolveLayout = asSaved): State {
  const result = defaultState();
  if (!saved || typeof saved !== "object") return result;
  const s = saved as Record<string, unknown>;
  const rows = Array.isArray(s.rows) ? (s.rows as Record<string, unknown>[]) : null;
  if (typeof s.shipId === "string") {
    result.shipId = s.shipId;
    result.gridId = asText(s.gridId);
  } else if (rows?.some((r) => Object.hasOwn(LEGACY_POSITIONS, asText(r?.position)))) {
    Object.assign(result, LEGACY_SHIP); // keep older saves on the grid they were made for
  }
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

export function saveState({ shipId, gridId, enabled, sort, rows }: State): void {
  try {
    const values = rows.map(({ id: _id, ...rest }) => rest);
    localStorage.setItem(STORE_KEY, JSON.stringify({ shipId, gridId, enabled, sort, rows: values }));
  } catch {
    /* storage unavailable: the table still works for this visit */
  }
}

export type Action =
  | { type: "addRow"; row: Row }
  | { type: "deleteRow"; id: number }
  | { type: "updateRow"; id: number; field: RowField; value: string }
  /* Pick a grid for a row, after every earlier pick, or unpick it. */
  | { type: "togglePick"; id: number; grid: GridRef }
  /* Take every row out of one ship and layout's grids. */
  | { type: "clearPicks"; at: LayoutRef }
  | { type: "sortBy"; key: TextKey }
  /* A new ship starts on its first layout. */
  | { type: "selectShip"; shipId: string }
  | { type: "selectGrid"; gridId: string }
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
    case "togglePick": {
      const { id, grid } = action;
      const order = nextOrder(state.rows);
      const toggle = (picks: GridPick[]) =>
        picks.some((p) => isGrid(p, grid)) ? picks.filter((p) => !isGrid(p, grid)) : [...picks, { ...grid, order }];
      return { ...state, rows: state.rows.map((r) => (r.id === id ? { ...r, picks: toggle(r.picks) } : r)) };
    }
    case "clearPicks": {
      /* Picks on other ships and layouts stay, for switching back. */
      const { at } = action;
      return { ...state, rows: state.rows.map((r) => ({ ...r, picks: r.picks.filter((p) => !isOn(p, at)) })) };
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
      return { ...state, shipId: action.shipId, gridId: "" };
    case "selectGrid":
      return { ...state, gridId: action.gridId };
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
