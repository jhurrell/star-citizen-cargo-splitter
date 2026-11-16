/* Each row's color in the ship view, its legend and its table swatch. */

import { parseScu } from "./cargo";
import type { Row } from "./state";

/* A validated categorical set for this page's background, assigned in order;
   past eight, rows share OTHER_COLOR rather than get hard-to-tell-apart hues. */
const CARGO_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#0ca30c", "#9085e9", "#e66767"];
export const OTHER_COLOR = "#6b7f8c";

export type Cargo = { name: string; color: string };
export type CargoColors = { byRow: Map<number, Cargo>; legend: (Cargo & { rowId: number })[] };

/* A color per row with cargo, in the order rows were added, so sorting never
   repaints a row; the legend lists them in the table's order. Each is named
   by its cargo and drop-off (see rowNames). */
export function cargoColors(rows: Row[]): CargoColors {
  const loaded = rows.filter((row) => parseScu(row.scu));
  const cargo = (row: Row) => row.cargo.trim() || "No cargo";
  const names = rowNames(loaded, cargo, new Map(rows.map((row, i) => [row.id, i + 1])));
  const byRow = new Map<number, Cargo>();
  for (const row of [...loaded].sort((a, b) => a.id - b.id)) {
    byRow.set(row.id, { name: names.get(row.id)!, color: CARGO_COLORS[byRow.size] ?? OTHER_COLOR });
  }
  const legend = loaded.map((row) => ({ ...byRow.get(row.id)!, rowId: row.id }));
  return { byRow, legend };
}

/* The rows to dim in the ship view. While some are pointed at (a table row,
   or a legend button) every other row is dimmed, so they stand out; otherwise
   the rows turned off in the legend. Pointed-at rows since deleted don't count. */
export function rowsToDim(
  rows: Pick<Row, "id">[],
  turnedOff: ReadonlySet<number>,
  pointed: readonly number[] | null,
): ReadonlySet<number> {
  const live = rows.filter((row) => pointed?.includes(row.id));
  if (!live.length) return turnedOff;
  return new Set(rows.filter((row) => !live.includes(row)).map((row) => row.id));
}

/* Each row's name: its cargo, then its drop-off, "Gold (Lorville)". Rows
   with the same cargo and drop-off (or both without one) add their row
   number in the table, "Gold (Lorville #3)" or "Gold (#3)". */
function rowNames(rows: Row[], cargoOf: (row: Row) => string, rowNumber: Map<number, number>) {
  const key = (row: Row) => `${cargoOf(row).toLowerCase()}\n${row.dropoff.trim().toLowerCase()}`;
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(key(row), (counts.get(key(row)) ?? 0) + 1);
  return new Map(
    rows.map((row) => {
      const number = counts.get(key(row))! > 1 ? `#${rowNumber.get(row.id)}` : "";
      const tag = [row.dropoff.trim(), number].filter(Boolean).join(" ");
      return [row.id, tag ? `${cargoOf(row)} (${tag})` : cargoOf(row)];
    }),
  );
}
