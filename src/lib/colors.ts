/* Each row's color in the ship view, its legend and its table swatch. */

import { parseScu } from "./cargo";
import type { Row } from "./state";

/* A validated categorical set for this page's background, assigned in order;
   past eight, rows share OTHER_COLOR rather than get hard-to-tell-apart hues. */
const CARGO_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#0ca30c", "#9085e9", "#e66767"];
export const OTHER_COLOR = "#6b7f8c";

export type Cargo = { name: string; color: string };
export type CargoColors = { byRow: Map<number, Cargo>; legend: Cargo[] };

/* A color per row with cargo, in the order rows were added, so sorting never
   repaints a row. Each is named by its material; rows sharing a material are
   told apart by number, "Gold", "Gold (2)", in the same order. */
export function cargoColors(rows: Row[]): CargoColors {
  const byRow = new Map<number, Cargo>();
  const seen = new Map<string, number>();
  for (const row of [...rows].sort((a, b) => a.id - b.id)) {
    if (!parseScu(row.scu)) continue;
    const material = row.material.trim() || "No material";
    const n = (seen.get(material.toLowerCase()) ?? 0) + 1;
    seen.set(material.toLowerCase(), n);
    byRow.set(row.id, {
      name: n > 1 ? `${material} (${n})` : material,
      color: CARGO_COLORS[byRow.size] ?? OTHER_COLOR,
    });
  }
  return { byRow, legend: [...byRow.values()] };
}
