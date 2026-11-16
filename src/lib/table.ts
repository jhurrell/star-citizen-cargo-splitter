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

/* A row's position on the selected grid, or undefined when it has none there. */
export const rowPosition = (positions: Position[], row: Row): Position | undefined =>
  positions.find((p) => p.name === row.position);

export type PositionEntry = { rows: number; scu: number; placed: Placed<number>[]; unfit: Counts };
export type Totals = Fill & { scu: number; unfit: Counts };
export type Calc = {
  byRow: Map<number, Fill>;
  /* By position name; "" collects cargo with no position chosen. */
  byPosition: Map<string, PositionEntry>;
  totals: Totals;
  showLeftover: boolean;
};

/* A row only uses checked container sizes that fit its position; each position
   is then packed, giving where each container sits (`placed`, tagged with the
   row id) and which don't fit (`unfit`). Only rows with SCU count as rows. */
export function computeTable(
  rows: Row[],
  enabled: State["enabled"],
  containers: Container[],
  positions: Position[],
): Calc {
  const usable = containers.filter((c) => isEnabled(enabled, c.size));
  const totals: Totals = {
    scu: 0,
    leftover: 0,
    counts: Object.fromEntries(usable.map((c) => [c.size, 0])),
    unfit: {},
  };
  const byRow = new Map<number, Fill>();
  const loads = new Map<string, Load<number>[]>();
  const byPosition = new Map<string, PositionEntry>(
    ["", ...positions.map((p) => p.name)].map((name) => [name, { rows: 0, scu: 0, placed: [], unfit: {} }]),
  );
  for (const row of rows) {
    const scu = parseScu(row.scu);
    const position = rowPosition(positions, row);
    const sizes = usable.filter((c) => !position || fitsInside(c, position)).map((c) => c.size);
    const fill = fillLargestFirst(scu, sizes);
    byRow.set(row.id, fill);
    totals.scu += scu;
    totals.leftover += fill.leftover;
    if (scu === 0) continue;
    const name = position?.name ?? "";
    const entry = byPosition.get(name)!;
    entry.rows += 1;
    entry.scu += scu;
    addCounts(totals.counts, fill.counts);
    const load = loads.get(name) ?? [];
    for (const container of containers) {
      const count = fill.counts[container.size];
      if (count) load.push({ container, count, tag: row.id });
    }
    loads.set(name, load);
  }
  for (const position of positions) {
    const entry = byPosition.get(position.name)!;
    Object.assign(entry, packContainers(position, loads.get(position.name) ?? []));
    addCounts(totals.unfit, entry.unfit);
  }
  return { byRow, byPosition, totals, showLeftover: totals.leftover > 0 };
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
export function cargoColors(rows: Row[]): { byRow: Map<number, Cargo>; materials: Cargo[] } {
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
  positions: Position[],
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
      rowPosition(positions, row)?.name ?? "",
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
