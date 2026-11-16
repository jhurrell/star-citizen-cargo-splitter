import { asText } from "./cargo";

/* The page's saved state: the chosen ship and grid, which container sizes are
   on, the last sort and the cargo rows. Kept in localStorage. */

export type TextKey = "material" | "pickup" | "dropoff";
export const TEXT_COLUMNS: { key: TextKey; label: string }[] = [
  { key: "material", label: "Material" },
  { key: "pickup", label: "Pick-up" },
  { key: "dropoff", label: "Drop-off" },
];
const TEXT_KEYS = TEXT_COLUMNS.map((c) => c.key);

/* `positions` are the names of the positions the row's cargo goes in; several
   split it across them. */
export type Row = Record<TextKey, string> & { id: number; scu: string; positions: string[] };
export type RowField = TextKey | "scu";
export type SortDir = 1 | -1;
export type Sort = { key: TextKey; dir: SortDir } | null;
export type State = {
  shipId: string; // "" means the first ship in config.json
  gridId: string; // "" means that ship's first grid
  enabled: Record<number, boolean>; // size → false when unchecked; sizes not listed are on
  sort: Sort;
  rows: Row[];
};

/* Container sizes are on unless unchecked. */
export const isEnabled = (enabled: State["enabled"], size: number): boolean => enabled[size] !== false;

const STORE_KEY = "cargo-splitter-v3";
/* Position names saved before ships were selectable: the Hull B's relaxed grid. */
const LEGACY_SHIP = { shipId: "ship-misc-hull-b", gridId: "relaxed" };
const LEGACY_POSITIONS: Record<string, string> = {
  "Left Upper": "Port - Upper",
  "Left Lower": "Port - Lower",
  "Right Upper": "Starboard - Upper",
  "Right Lower": "Starboard - Lower",
};

let nextId = 1;
/* A row from saved or given values. Older saves have one "position" string. */
export function makeRow(values: Partial<Record<RowField | "position" | "positions", unknown>> = {}): Row {
  const text = (key: RowField) => asText(values[key]);
  const names = Array.isArray(values.positions) ? values.positions.map((n) => asText(n)) : [asText(values.position)];
  /* Kept even when they aren't on the selected grid, so switching back restores them. */
  const positions = [...new Set(names.filter(Boolean).map((n) => LEGACY_POSITIONS[n] ?? n))];
  return {
    id: nextId++,
    material: text("material"),
    pickup: text("pickup"),
    dropoff: text("dropoff"),
    scu: text("scu"),
    positions,
  };
}

export function defaultState(): State {
  return {
    shipId: "",
    gridId: "",
    enabled: {},
    sort: null,
    rows: [
      makeRow({ material: "Example A", scu: "57" }),
      makeRow({ material: "Example B", scu: "100" }),
      makeRow({ material: "Example C", scu: "13" }),
    ],
  };
}

const isTextKey = (value: unknown): value is TextKey => TEXT_KEYS.includes(value as TextKey);

/* Build a valid state from whatever was saved, falling back to defaults field by field. */
export function hydrate(saved: unknown): State {
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
  /* Sizes aren't known until config.json is read, so keep every saved choice. */
  for (const [size, on] of Object.entries((s.enabled as object) ?? {})) {
    if (typeof on === "boolean") result.enabled[Number(size)] = on;
  }
  const sort = s.sort as { key?: unknown; dir?: unknown } | null;
  if (isTextKey(sort?.key) && (sort?.dir === 1 || sort?.dir === -1)) result.sort = { key: sort.key, dir: sort.dir };
  if (rows) result.rows = rows.map((r) => makeRow(r ?? {}));
  return result;
}

export function loadState(): State {
  try {
    return hydrate(JSON.parse(localStorage.getItem(STORE_KEY) ?? "null"));
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
  | { type: "setPositions"; id: number; positions: string[] }
  | { type: "sortBy"; key: TextKey }
  | { type: "selectShip"; shipId: string; gridId: string }
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
    case "setPositions":
      return {
        ...state,
        rows: state.rows.map((r) => (r.id === action.id ? { ...r, positions: action.positions } : r)),
      };
    case "sortBy": {
      /* Sorting reorders the rows once, like a spreadsheet; later edits don't
         move rows. Sorting the same column again reverses the order. */
      const { key } = action;
      const dir: SortDir = state.sort?.key === key ? (-state.sort.dir as SortDir) : 1;
      const rows = [...state.rows].sort((a, b) => compareRows(a[key], b[key], dir));
      return { ...state, sort: { key, dir }, rows };
    }
    case "selectShip":
      return { ...state, shipId: action.shipId, gridId: action.gridId };
    case "selectGrid":
      return { ...state, gridId: action.gridId };
    case "setSizeEnabled":
      return { ...state, enabled: { ...state.enabled, [action.size]: action.on } };
    case "clearRows":
      return { ...state, rows: [action.row] };
  }
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/* Blank values always sort last, whichever way the sort runs. */
export function compareRows(a: string, b: string, dir: SortDir): number {
  const [x, y] = [a.trim(), b.trim()];
  if (!x || !y) return Number(!x) - Number(!y);
  return dir * collator.compare(x, y);
}
