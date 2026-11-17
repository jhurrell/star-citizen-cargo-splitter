/* The cargo table as text, for the copy buttons. */

import { fmt } from "./format";
import type { Haul, Part, SizeCell } from "./haul";
import { TEXT_COLUMNS } from "./state";

type Cell = string | number;
type Column = { label: string; numeric: boolean };
export type ExportedTable = { columns: Column[]; rows: Cell[][]; totals: Cell[] };

/* "Port - Upper", or for a split row (in plan order) "Port - Upper (128), Port - Lower (44)".
   A plan step that got nothing, as its grid was already full, is left out. */
export function gridText({ parts }: { parts: Part[] }): string {
  const used = parts.filter((p) => p.scu > 0);
  const shown = used.length ? used : parts.slice(-1);
  if (shown.length < 2) return shown[0]?.name ?? "";
  return shown.map((p) => `${p.name} (${fmt(p.scu)})`).join(", ");
}

/* Columns, rows and totals for the copy buttons: the table's columns, less
   the sizes turned off. Values stay raw (numbers as numbers) so each format
   can render them its own way. */
export function exportTable({ sizes, deliveries, totals, showLeftover }: Haul): ExportedTable {
  const leftover = <T>(value: T): T[] => (showLeftover ? [value] : []);
  const onSizes = sizes.filter((column) => column.on);
  /* The counts of the sizes turned on, in column order. */
  const cellsOf = (cells: SizeCell[]) => cells.flatMap((cell) => (cell.kind === "count" ? [cell.count] : []));
  const columns: Column[] = [
    ...TEXT_COLUMNS.map((c) => ({ label: c.label, numeric: false })),
    { label: "SCU", numeric: true },
    { label: "Remaining", numeric: true },
    ...onSizes.map(({ size }) => ({ label: String(size), numeric: true })),
    ...leftover({ label: "Left over", numeric: true }),
    { label: "Grids", numeric: false },
  ];
  const body = deliveries.map((delivery) => [
    ...TEXT_COLUMNS.map((c) => delivery.row[c.key]),
    delivery.scu,
    delivery.remaining,
    ...cellsOf(delivery.cells),
    ...leftover(delivery.leftover),
    gridText(delivery),
  ]);
  const totalRow = [
    "Total",
    ...TEXT_COLUMNS.slice(1).map(() => ""),
    totals.scu,
    totals.remaining,
    ...cellsOf(totals.cells),
    ...leftover(totals.leftover),
    "",
  ];
  return { columns, rows: body, totals: totalRow };
}

/* Tab-separated, for pasting into a spreadsheet. */
export function tableAsTsv({ columns, rows }: ExportedTable): string {
  const line = (cells: Cell[]) => cells.map((v) => String(v).replace(/[\t\r\n]+/g, " ")).join("\t");
  return [columns.map((c) => c.label), ...rows].map(line).join("\n");
}

/* GitHub-style Markdown table: numeric columns are right-aligned (`---:`) and
   padded so the raw text lines up too. The total row is bold. */
export function tableAsMarkdown({ columns, rows, totals }: ExportedTable): string {
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
