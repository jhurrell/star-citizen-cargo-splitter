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
    expect(byRow.get(rows[0].id)!.name).toBe("M0 (#1)"); // shares a material; no route, so its row number
    expect(byRow.get(rows[10].id)!.name).toBe("m0 (#11)");
    expect(byRow.get(rows[1].id)!.name).toBe("M1"); // its material is its own
    expect(byRow.has(rows[11].id)).toBe(false);
  });

  test("rows sharing a material show their drop-off, or their row number when it's blank or not unique", () => {
    const rows = [
      makeRow({ material: "Gold", pickup: "Area18", dropoff: " Lorville ", scu: "1" }),
      makeRow({ material: "gold ", pickup: "New Babbage", dropoff: "Orison", scu: "1" }),
      makeRow({ material: "Gold", pickup: "Area18", dropoff: "", scu: "1" }),
      makeRow({ material: "Gold", pickup: "Crusader", dropoff: "Hurston", scu: "1" }),
      makeRow({ material: "Gold", pickup: "ArcCorp", dropoff: "hurston", scu: "1" }),
      makeRow({ material: "Iron", pickup: "Area18", dropoff: "Lorville", scu: "1" }),
    ];
    const names = cargoColors(rows).legend.map((c) => c.name);
    expect(names).toEqual(["Gold (Lorville)", "gold (Orison)", "Gold (#3)", "Gold (#4)", "Gold (#5)", "Iron"]);
  });

  test("sorting the table doesn't repaint a row", () => {
    const rows = ["b", "a"].map((material) => makeRow({ material, scu: "1" }));
    const before = cargoColors(rows).byRow.get(rows[0].id);
    expect(cargoColors([...rows].reverse()).byRow.get(rows[0].id)).toEqual(before);
  });
});
