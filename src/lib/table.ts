/* Everything the page derives from its state: each row's containers, each
   position's packing and totals, the copy formats and the load plan colors.
   Pure functions, so they can be unit tested. */

import {
  addCounts,
  fillLargestFirst,
  fitsInside,
  packContainers,
  parseScu,
  type Container,
  type Counts,
  type Fill,
  type Load,
  type Placed,
  type Position,
  type Ship,
} from "./cargo";
import { TEXT_COLUMNS, type Row, type State } from "./state";

export const fmt = (n: number): string => n.toLocaleString("en-US");
export const plural = (n: number, word: string): string => `${fmt(n)} ${word}${n === 1 ? "" : "s"}`;
export const sum = <T>(items: T[], pick: (item: T) => number): number =>
  items.reduce((total, item) => total + pick(item), 0);

export const isEnabled = (enabled: State["enabled"], size: number): boolean => enabled[size] !== false;

/* The selected ship and grid, falling back to the first of each. */
export function selection(ships: Ship[], state: Pick<State, "shipId" | "gridId">) {
  const ship = ships.find((s) => s.id === state.shipId) ?? ships[0];
  const grid = ship?.grids.find((g) => g.id === state.gridId) ?? ship?.grids[0];
  return { ship, grid, positions: grid?.positions ?? [] };
}

/* A row's positions on the selected grid, in the grid's order. */
export const rowPositions = (positions: Position[], row: Row): Position[] =>
  positions.filter((p) => row.positions.includes(p.name));

/* How much of a row goes in each of its positions (in the grid's order), and
   `short`: how much of it there's no room for, so it needs splitting further.
   A row with no position is short by what's more than any one position holds. */
export type Part = { name: string; scu: number };
export type Split = { parts: Part[]; short: number };

/* Rows with one position go in first, in table order, as they can go nowhere
   else. Then each split row, in table order, fills its positions' free room in
   the grid's order. What's left over still goes in its last position, so the
   SCU by position table shows it over capacity. */
export function splitRows(rows: Row[], positions: Position[]): Map<number, Split> {
  const room = new Map(positions.map((p) => [p.name, p.capacity]));
  const largest = Math.max(0, ...positions.map((p) => p.capacity));
  const splits = new Map<number, Split>();
  const chosen = new Map(rows.map((row) => [row.id, rowPositions(positions, row)]));
  const count = (row: Row) => chosen.get(row.id)!.length;
  for (const row of [...rows.filter((r) => count(r) === 1), ...rows.filter((r) => count(r) > 1)]) {
    let rest = parseScu(row.scu);
    const parts = chosen.get(row.id)!.map((p) => {
      const scu = Math.min(rest, Math.max(0, room.get(p.name)!));
      rest -= scu;
      room.set(p.name, room.get(p.name)! - scu);
      return { name: p.name, scu };
    });
    const last = parts[parts.length - 1];
    last.scu += rest;
    room.set(last.name, room.get(last.name)! - rest);
    splits.set(row.id, { parts, short: rest });
  }
  for (const row of rows.filter((r) => count(r) === 0))
    splits.set(row.id, { parts: [], short: positions.length ? Math.max(0, parseScu(row.scu) - largest) : 0 });
  return splits;
}

export type PositionEntry = { rows: number; scu: number; placed: Placed<number>[]; unfit: Counts };
export type Totals = Fill & { rows: number; scu: number; unfit: Counts };
export type Calc = {
  byRow: Map<number, Fill>;
  splits: Map<number, Split>;
  /* By position name; "" collects cargo with no position chosen. A split row
     counts as a row in each of its positions. */
  byPosition: Map<string, PositionEntry>;
  totals: Totals;
  showLeftover: boolean;
};

/* Each part of a row only uses checked container sizes that fit its position;
   each position is then packed, giving where each container sits (`placed`,
   tagged with the row id) and which don't fit (`unfit`). Only rows with SCU
   count as rows. */
export function computeTable(
  rows: Row[],
  enabled: State["enabled"],
  containers: Container[],
  positions: Position[],
): Calc {
  const usable = containers.filter((c) => isEnabled(enabled, c.size));
  const totals: Totals = {
    rows: 0,
    scu: 0,
    leftover: 0,
    counts: Object.fromEntries(usable.map((c) => [c.size, 0])),
    unfit: {},
  };
  const byName = new Map(positions.map((p) => [p.name, p]));
  /* Checked sizes that fit the named position; "" (no position) takes any. */
  const sizesFor = (name: string) => {
    const position = byName.get(name);
    return usable.filter((c) => !position || fitsInside(c, position)).map((c) => c.size);
  };
  const splits = splitRows(rows, positions);
  const byRow = new Map<number, Fill>();
  const loads = new Map<string, Load<number>[]>();
  const byPosition = new Map<string, PositionEntry>(
    ["", ...positions.map((p) => p.name)].map((name) => [name, { rows: 0, scu: 0, placed: [], unfit: {} }]),
  );
  for (const row of rows) {
    const scu = parseScu(row.scu);
    const { parts } = splits.get(row.id)!;
    const shares = parts.length ? parts : [{ name: "", scu }];
    /* Counts list every size the row could use, so the table can grey out the rest. */
    const fill: Fill = { counts: {}, leftover: 0 };
    for (const { name } of shares) for (const size of sizesFor(name)) fill.counts[size] = 0;
    for (const share of shares) {
      if (!share.scu) continue;
      const part = fillLargestFirst(share.scu, sizesFor(share.name));
      addCounts(fill.counts, part.counts);
      fill.leftover += part.leftover;
      const entry = byPosition.get(share.name)!;
      entry.rows += 1;
      entry.scu += share.scu;
      const load = loads.get(share.name) ?? [];
      for (const container of containers) {
        const count = part.counts[container.size];
        if (count) load.push({ container, count, tag: row.id });
      }
      loads.set(share.name, load);
    }
    byRow.set(row.id, fill);
    if (scu) totals.rows += 1;
    totals.scu += scu;
    totals.leftover += fill.leftover;
    addCounts(totals.counts, fill.counts);
  }
  for (const position of positions) {
    const entry = byPosition.get(position.name)!;
    Object.assign(entry, packContainers(position, loads.get(position.name) ?? []));
    addCounts(totals.unfit, entry.unfit);
  }
  return { byRow, splits, byPosition, totals, showLeftover: totals.leftover > 0 };
}

export type LoadLook = "ok" | "full" | "over";

/* How full `scu` makes a hold of `capacity` SCU. */
export function loadOf(scu: number, capacity: number): { look: LoadLook; percent: number; label: string } {
  const free = capacity - scu;
  return {
    look: free < 0 ? "over" : free === 0 ? "full" : "ok",
    percent: Math.min(100, (scu / capacity) * 100),
    label: free < 0 ? `${fmt(-free)} over` : fmt(free),
  };
}

export const hasUnfit = (unfit: Counts): boolean => Object.keys(unfit).length > 0;

/* "2 × 32 SCU, 1 × 8 SCU won't fit", largest first. */
export function unfitText(unfit: Counts): string {
  const sizes = Object.keys(unfit)
    .map(Number)
    .sort((a, b) => b - a);
  return `${sizes.map((size) => `${fmt(unfit[size])} × ${size} SCU`).join(", ")} won't fit`;
}

/* Load plan colors, one per material in the order rows were added. A validated
   categorical set for this page's background; past eight, materials share OTHER_COLOR. */
const CARGO_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#0ca30c", "#9085e9", "#e66767"];
export const OTHER_COLOR = "#6b7f8c";
export type Cargo = { name: string; color: string };

/* A color per material with cargo, keyed case-insensitively, in the order rows
   were added, so sorting rows never repaints a material. */
export type CargoColors = { byRow: Map<number, Cargo>; materials: Cargo[] };
export function cargoColors(rows: Row[]): CargoColors {
  const byMaterial = new Map<string, Cargo>();
  const byRow = new Map<number, Cargo>();
  for (const row of [...rows].sort((a, b) => a.id - b.id)) {
    if (!parseScu(row.scu)) continue;
    const key = row.material.trim().toLowerCase();
    if (!byMaterial.has(key)) {
      const color = CARGO_COLORS[byMaterial.size] ?? OTHER_COLOR;
      byMaterial.set(key, { name: row.material.trim() || "No material", color });
    }
    byRow.set(row.id, byMaterial.get(key)!);
  }
  return { byRow, materials: [...byMaterial.values()] };
}

type Cell = string | number;
type Column = { label: string; numeric: boolean };

/* Columns, rows and totals for the copy buttons. Values stay raw (numbers as
   numbers) so each format can render them its own way. */
export function exportTable(
  rows: Row[],
  calc: Calc,
  sizes: number[],
): { columns: Column[]; rows: Cell[][]; totals: Cell[] } {
  const leftover = <T>(value: T): T[] => (calc.showLeftover ? [value] : []);
  const columns: Column[] = [
    ...TEXT_COLUMNS.map((c) => ({ label: c.label, numeric: false })),
    { label: "SCU", numeric: true },
    ...sizes.map((s) => ({ label: String(s), numeric: true })),
    ...leftover({ label: "Left over", numeric: true }),
    { label: "Position", numeric: false },
  ];
  const body = rows.map((row) => {
    const fill = calc.byRow.get(row.id)!;
    return [
      ...TEXT_COLUMNS.map((c) => row[c.key]),
      parseScu(row.scu),
      ...sizes.map((s) => fill.counts[s] ?? 0),
      ...leftover(fill.leftover),
      positionText(calc.splits.get(row.id)!),
    ];
  });
  const totals = [
    "Total",
    ...TEXT_COLUMNS.slice(1).map(() => ""),
    calc.totals.scu,
    ...sizes.map((s) => calc.totals.counts[s] ?? 0),
    ...leftover(calc.totals.leftover),
    "",
  ];
  return { columns, rows: body, totals };
}

/* "Port - Upper", or for a split row "Port - Upper (128), Port - Lower (44)". */
export function positionText({ parts }: Split): string {
  if (parts.length < 2) return parts[0]?.name ?? "";
  return parts.map((p) => `${p.name} (${fmt(p.scu)})`).join(", ");
}

/* "Needs 72 SCU more room", or "" when the row fits where it's going. */
export function shortText({ parts, short }: Split): string {
  if (!short) return "";
  return parts.length
    ? `${fmt(short)} SCU more than ${parts.length === 1 ? "this position has" : "these positions have"} room for. Choose another position to split it.`
    : `More than any one position holds. Choose positions to split it.`;
}

type Export = ReturnType<typeof exportTable>;

/* Tab-separated, for pasting into a spreadsheet. */
export function tableAsTsv({ columns, rows }: Export): string {
  const line = (cells: Cell[]) => cells.map((v) => String(v).replace(/[\t\r\n]+/g, " ")).join("\t");
  return [columns.map((c) => c.label), ...rows].map(line).join("\n");
}

/* GitHub-style Markdown table: numeric columns are right-aligned (`---:`) and
   padded so the raw text lines up too. The total row is bold. */
export function tableAsMarkdown({ columns, rows, totals }: Export): string {
  const cell = (v: Cell, numeric: boolean) =>
    numeric && typeof v === "number" ? fmt(v) : String(v).replace(/\s+/g, " ").trim().replace(/\|/g, "\\|");
  const bold = (text: string) => (text ? `**${text}**` : "");
  const body = [
    ...rows.map((r) => r.map((v, i) => cell(v, columns[i].numeric))),
    totals.map((v, i) => bold(cell(v, columns[i].numeric))),
  ];
  const header = columns.map((c) => c.label);
  const widths = columns.map((_, i) => Math.max(3, header[i].length, ...body.map((r) => r[i].length)));
  const pad = (text: string, i: number) => (columns[i].numeric ? text.padStart(widths[i]) : text.padEnd(widths[i]));
  const line = (cells: string[]) => `| ${cells.map(pad).join(" | ")} |`;
  const rule = `| ${columns.map((c, i) => (c.numeric ? `${"-".repeat(widths[i] - 1)}:` : "-".repeat(widths[i]))).join(" | ")} |`;
  return [line(header), rule, ...body.map(line)].join("\n");
}
