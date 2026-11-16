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
   repaints a row. Each is named by its material. Rows that share a material
   add their drop-off, "Gold (Lorville)", or their row number in the table,
   "Gold (#3)", when it's blank or another row of that material has it too. */
export function cargoColors(rows: Row[]): CargoColors {
  const loaded = rows.filter((row) => parseScu(row.scu));
  const material = (row: Row) => row.material.trim() || "No material";
  const tags = dropoffTags(loaded, material, new Map(rows.map((row, i) => [row.id, i + 1])));
  const byRow = new Map<number, Cargo>();
  for (const row of [...loaded].sort((a, b) => a.id - b.id)) {
    const tag = tags.get(row.id);
    byRow.set(row.id, {
      name: tag ? `${material(row)} (${tag})` : material(row),
      color: CARGO_COLORS[byRow.size] ?? OTHER_COLOR,
    });
  }
  return { byRow, legend: [...byRow].map(([rowId, cargo]) => ({ ...cargo, rowId })) };
}

/* A tag for each row whose material another row shares, keyed by row id. */
function dropoffTags(rows: Row[], material: (row: Row) => string, rowNumber: Map<number, number>) {
  const tags = new Map<number, string>();
  const byMaterial = new Map<string, Row[]>();
  for (const row of rows) {
    const key = material(row).toLowerCase();
    byMaterial.set(key, [...(byMaterial.get(key) ?? []), row]);
  }
  for (const group of byMaterial.values()) {
    if (group.length < 2) continue;
    const dropoffs = group.map((row) => row.dropoff.trim());
    const key = (dropoff: string) => dropoff.toLowerCase();
    group.forEach((row, i) => {
      const unique = dropoffs[i] && dropoffs.filter((d) => key(d) === key(dropoffs[i])).length === 1;
      tags.set(row.id, unique ? dropoffs[i] : `#${rowNumber.get(row.id)}`);
    });
  }
  return tags;
}
