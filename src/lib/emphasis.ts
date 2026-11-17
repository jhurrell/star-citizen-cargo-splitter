/* Emphasis: each row's color and name, the ship view's legend, and which
   rows' containers show see-through. Worked out from the rows, which of them
   are in the ship view, and what's turned off or pointed at, in one call.
   Pure, so it can be unit tested through emphasize. */

import { parseScu } from "./cargo";
import type { Row } from "./state";

/* A validated categorical set for this page's background; past eight, rows
   share OTHER_COLOR rather than get hard-to-tell-apart hues. */
const CARGO_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#0ca30c", "#9085e9", "#e66767"];
export const OTHER_COLOR = "#6b7f8c";

/* A row's name and color, for its table swatch and its containers. */
export type Cargo = { name: string; color: string };

/* A legend button: one row, or "Other rows" for every row in grey. On while
   any of its rows shows in full. */
export type LegendEntry = { name: string; color: string; rowIds: number[]; on: boolean };

/* Which of CARGO_COLORS each row with SCU has, by row id; null for grey. */
export type Slots = ReadonlyMap<number, number | null>;

export type Emphasis = {
  byRow: Map<number, Cargo>;
  /* The rows in the ship view, in table order, with "Other rows" last. */
  legend: LegendEntry[];
  /* Rows whose containers show see-through. */
  dimmed: ReadonlySet<number>;
  /* The colors as handed out, to pass back in next time. The same object as
     was passed in when nothing changed. */
  slots: Slots;
};

export type EmphasisInput = {
  /* In table order. */
  rows: Row[];
  /* Rows with containers in the ship view. */
  inView: ReadonlySet<number>;
  /* The colors handed out last time (see Slots). */
  slots: Slots;
  /* Rows turned off in the legend. */
  turnedOff: ReadonlySet<number>;
  /* Rows pointed at in the table or legend; null when none. */
  pointed: readonly number[] | null;
};

/* A row keeps its color while it has SCU, so sorting, deleting or clearing
   another row never repaints it. A row that gets SCU takes the first color
   free, by row age, or grey when all eight are taken; a color comes free when
   its row is deleted or its SCU cleared. Ids of rows since deleted (turned
   off or pointed at) count for nothing. */
export function emphasize({ rows, inView, slots: before, turnedOff, pointed }: EmphasisInput): Emphasis {
  const loaded = rows.filter((row) => parseScu(row.scu));
  const slots = assignSlots(loaded, before);
  const cargo = (row: Row) => row.cargo.trim() || "No cargo";
  const names = rowNames(loaded, cargo, new Map(rows.map((row, i) => [row.id, i + 1])));
  const byRow = new Map(
    loaded.map((row) => {
      const slot = slots.get(row.id)!;
      return [row.id, { name: names.get(row.id)!, color: slot === null ? OTHER_COLOR : CARGO_COLORS[slot] }];
    }),
  );

  const shown = loaded.filter((row) => inView.has(row.id));
  const entry = (name: string, color: string, rowIds: number[]): LegendEntry => ({
    name,
    color,
    rowIds,
    on: rowIds.some((id) => !turnedOff.has(id)),
  });
  const others = shown.filter((row) => slots.get(row.id) === null).map((row) => row.id);
  const legend = [
    ...shown
      .filter((row) => slots.get(row.id) !== null)
      .map((row) => entry(byRow.get(row.id)!.name, byRow.get(row.id)!.color, [row.id])),
    ...(others.length ? [entry("Other rows", OTHER_COLOR, others)] : []),
  ];

  /* While rows in the view are pointed at, every other row in it is dimmed,
     so they stand out; otherwise the rows turned off. */
  const lit = shown.filter((row) => pointed?.includes(row.id));
  const dimmed = new Set(
    (lit.length ? shown.filter((row) => !lit.includes(row)) : rows.filter((row) => turnedOff.has(row.id))).map(
      (row) => row.id,
    ),
  );
  return { byRow, legend, dimmed, slots };
}

/* Keep each loaded row's color; give the rest the first free one, oldest row
   first, or grey. Returns `before` itself when nothing changed. */
function assignSlots(loaded: Row[], before: Slots): Slots {
  const kept = loaded.filter((row) => before.has(row.id));
  const taken = new Set(kept.map((row) => before.get(row.id)));
  const slots = new Map<number, number | null>(kept.map((row) => [row.id, before.get(row.id)!]));
  for (const row of loaded.filter((r) => !before.has(r.id)).sort((a, b) => a.id - b.id)) {
    const free = CARGO_COLORS.findIndex((_, i) => !taken.has(i));
    slots.set(row.id, free < 0 ? null : free);
    taken.add(free);
  }
  return slots.size === before.size && kept.length === before.size ? before : slots;
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
