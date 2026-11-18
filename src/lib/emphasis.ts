/* Emphasis: each row's color and name, the ship view's legend, and which
   rows' containers show see-through. The legend groups the rows by drop-off,
   by pick-up, or one entry per row (the view), and the colors follow those
   groups. Worked out from the rows, which of them are in the ship view, and
   what's picked out or pointed at, in one call. Pure, so it can be unit
   tested through emphasize. */

import { parseScu } from "./cargo";
import type { Row } from "./state";

/* A validated categorical set for this page's background; past eight, groups
   share OTHER_COLOR rather than get hard-to-tell-apart hues. */
const CARGO_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#0ca30c", "#9085e9", "#e66767"];
export const OTHER_COLOR = "#6b7f8c";

/* How the legend groups rows, and so how the containers are colored. */
export type View = "dropoff" | "pickup" | "cargo";
export const VIEWS: { view: View; label: string }[] = [
  { view: "dropoff", label: "Drop-off" },
  { view: "pickup", label: "Pick-up" },
  { view: "cargo", label: "Cargo" },
];

/* A row's name and color, for its table swatch and its containers. */
export type Cargo = { name: string; color: string };

/* A legend button: a drop-off, a pick-up or a row, or the "Other …" entry for
   every group in grey. On while it's picked out. */
export type LegendEntry = { key: string; name: string; color: string; rowIds: number[]; on: boolean };

/* Which of CARGO_COLORS each group with SCU has, by group key; null for grey. */
export type Slots = ReadonlyMap<string, number | null>;

export type Emphasis = {
  byRow: Map<number, Cargo>;
  /* The groups in the ship view, in table order of their first row, with
     "Other …" last. */
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
  view: View;
  /* The colors handed out last time in this view (see Slots). */
  slots: Slots;
  /* Legend entries picked out, by key. */
  picked: ReadonlySet<string>;
  /* Rows pointed at in the table or legend; null when none. */
  pointed: readonly number[] | null;
};

/* A location as typed, tidied: trimmed, with runs of spaces made one. */
const tidy = (text: string) => text.trim().replace(/\s+/g, " ");

/* Every legend key is made here. They're text, so they serve as React keys
   and set members as they are; the first character says what kind each is:
   "@" and a location, tidied and lower-cased, so the same place matches
   whatever its case or spacing; "#" and a row's id; or "other", the grey
   entry. */
export const legendKey = {
  location: (text: string) => `@${tidy(text).toLowerCase()}`,
  row: (row: Pick<Row, "id">) => `#${row.id}`,
  other: "other",
};

/* How a view groups rows: each group's key and name, and the grey entry's name. */
type Grouping = { key: (row: Row) => string; name: (row: Row) => string; other: string };

/* Grouping by a location: "drop-off" or "pick-up", by that field. */
const byLocation = (field: "dropoff" | "pickup", label: string): Grouping => ({
  key: (row) => legendKey.location(row[field]),
  name: (row) => tidy(row[field]) || `No ${label}`,
  other: `Other ${label}s`,
});

const GROUPING: Record<View, Grouping> = {
  dropoff: byLocation("dropoff", "drop-off"),
  pickup: byLocation("pickup", "pick-up"),
  cargo: { key: legendKey.row, name: () => "", other: "Other rows" },
};

/* A group keeps its color while it has a row with SCU, so sorting, deleting
   or clearing another row never repaints it. A group that gets SCU takes the
   first color free, by the age of its oldest row, or grey when all eight are
   taken; a color comes free when its group has no row with SCU left. Keys of
   groups since gone (picked out) and ids of rows since deleted (pointed at)
   count for nothing. */
export function emphasize({ rows, inView, view, slots: before, picked, pointed }: EmphasisInput): Emphasis {
  const grouping = GROUPING[view];
  const loaded = rows.filter((row) => parseScu(row.scu));
  const slots = assignSlots(loaded, grouping.key, before);
  const cargo = (row: Row) => row.cargo.trim() || "No cargo";
  const names = rowNames(loaded, cargo, new Map(rows.map((row, i) => [row.id, i + 1])));
  const colorOf = (row: Row) => {
    const slot = slots.get(grouping.key(row))!;
    return slot === null ? OTHER_COLOR : CARGO_COLORS[slot];
  };
  const byRow = new Map(loaded.map((row) => [row.id, { name: names.get(row.id)!, color: colorOf(row) }]));

  /* The legend entry each row in the view is under. */
  const shown = loaded.filter((row) => inView.has(row.id));
  const entryOf = (row: Row) => (slots.get(grouping.key(row)) === null ? legendKey.other : grouping.key(row));
  const entries = new Map<string, LegendEntry>();
  for (const row of shown) {
    const key = entryOf(row);
    const entry = entries.get(key);
    if (entry) entry.rowIds.push(row.id);
    else
      entries.set(key, {
        key,
        name: view === "cargo" ? names.get(row.id)! : grouping.name(row),
        color: colorOf(row),
        rowIds: [row.id],
        on: picked.has(key),
      });
  }
  const other = entries.get(legendKey.other);
  if (other) {
    entries.delete(legendKey.other);
    entries.set(legendKey.other, { ...other, name: grouping.other });
  }
  const legend = [...entries.values()];

  /* While rows in the view are pointed at, every other row in it is dimmed,
     so they stand out; otherwise, while entries are picked out, every row in
     the view under another entry. */
  const lit = shown.filter((row) => pointed?.includes(row.id));
  const anyPicked = legend.some((entry) => entry.on);
  const dimmed = new Set(
    (lit.length
      ? shown.filter((row) => !lit.includes(row))
      : anyPicked
        ? shown.filter((row) => !picked.has(entryOf(row)))
        : []
    ).map((row) => row.id),
  );
  return { byRow, legend, dimmed, slots };
}

/* Keep each loaded group's color; give the rest the first free one, the group
   with the oldest row first, or grey. Returns `before` itself when nothing
   changed. */
function assignSlots(loaded: Row[], keyOf: (row: Row) => string, before: Slots): Slots {
  const oldest = new Map<string, number>();
  for (const row of loaded) oldest.set(keyOf(row), Math.min(oldest.get(keyOf(row)) ?? Infinity, row.id));
  const keys = [...oldest.keys()];
  const kept = keys.filter((key) => before.has(key));
  const taken = new Set(kept.map((key) => before.get(key)));
  const slots = new Map<string, number | null>(kept.map((key) => [key, before.get(key)!]));
  for (const key of keys.filter((k) => !before.has(k)).sort((a, b) => oldest.get(a)! - oldest.get(b)!)) {
    const free = CARGO_COLORS.findIndex((_, i) => !taken.has(i));
    slots.set(key, free < 0 ? null : free);
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
