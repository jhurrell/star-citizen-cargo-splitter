import { describe, expect, test } from "vite-plus/test";
import { cargoColors, OTHER_COLOR } from "../src/lib/colors";
import { makeRow } from "../src/lib/state";

describe("cargoColors", () => {
  test("one color per row with SCU, by row age; past eight they share", () => {
    const rows = Array.from({ length: 10 }, (_, i) => makeRow({ material: `M${i}`, scu: "1" }));
    rows.push(makeRow({ material: "m0", scu: "1" }), makeRow({ material: "Empty", scu: "" }));
    const { byRow, legend } = cargoColors(rows);
    expect(legend).toHaveLength(11);
    expect(new Set(legend.slice(0, 8).map((c) => c.color)).size).toBe(8);
    expect(legend.slice(8).every((c) => c.color === OTHER_COLOR)).toBe(true);
    expect(byRow.get(rows[10].id)!.name).toBe("m0 (2)"); // same material, its own color and name
    expect(byRow.has(rows[11].id)).toBe(false);
  });

  test("sorting the table doesn't repaint a row", () => {
    const rows = ["b", "a"].map((material) => makeRow({ material, scu: "1" }));
    const before = cargoColors(rows).byRow.get(rows[0].id);
    expect(cargoColors([...rows].reverse()).byRow.get(rows[0].id)).toEqual(before);
  });
});
