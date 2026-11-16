import { describe, expect, test } from "vite-plus/test";
import { cargoColors, OTHER_COLOR, rowsToDim } from "../src/lib/colors";
import { makeRow } from "../src/lib/state";

describe("cargoColors", () => {
  test("one color per row with SCU, by row age; past eight they share", () => {
    const rows = Array.from({ length: 10 }, (_, i) => makeRow({ cargo: `M${i}`, scu: "1" }));
    rows.push(makeRow({ cargo: "m0", scu: "1" }), makeRow({ cargo: "Empty", scu: "" }));
    const { byRow, legend } = cargoColors(rows);
    expect(legend).toHaveLength(11);
    expect(new Set(legend.slice(0, 8).map((c) => c.color)).size).toBe(8);
    expect(legend.slice(8).every((c) => c.color === OTHER_COLOR)).toBe(true);
    expect(byRow.get(rows[0].id)!.name).toBe("M0 (#1)"); // shares a cargo; no drop-off, so its row number
    expect(byRow.get(rows[10].id)!.name).toBe("m0 (#11)");
    expect(byRow.get(rows[1].id)!.name).toBe("M1"); // its cargo is its own
    expect(byRow.has(rows[11].id)).toBe(false);
    expect(legend.map((c) => c.rowId)).toEqual(rows.slice(0, 11).map((r) => r.id)); // for the legend's buttons
  });

  test("rows show their drop-off, and their row number when another has the same cargo and drop-off", () => {
    const rows = [
      makeRow({ cargo: "Gold", pickup: "Area18", dropoff: " Lorville ", scu: "1" }),
      makeRow({ cargo: "gold ", pickup: "New Babbage", dropoff: "Orison", scu: "1" }),
      makeRow({ cargo: "Gold", pickup: "Area18", dropoff: "", scu: "1" }),
      makeRow({ cargo: "Gold", pickup: "Crusader", dropoff: "Hurston", scu: "1" }),
      makeRow({ cargo: "Gold", pickup: "ArcCorp", dropoff: "hurston", scu: "1" }),
      makeRow({ cargo: "Iron", pickup: "Area18", dropoff: "Lorville", scu: "1" }),
    ];
    const names = cargoColors(rows).legend.map((c) => c.name);
    expect(names).toEqual([
      "Gold (Lorville)",
      "gold (Orison)",
      "Gold", // the only Gold with no drop-off
      "Gold (Hurston #4)",
      "Gold (hurston #5)",
      "Iron (Lorville)",
    ]);
  });

  test("sorting the table doesn't repaint a row, but reorders the legend", () => {
    const rows = ["b", "a"].map((cargo) => makeRow({ cargo, scu: "1" }));
    const before = cargoColors(rows).byRow.get(rows[0].id);
    const sorted = cargoColors([...rows].reverse());
    expect(sorted.byRow.get(rows[0].id)).toEqual(before);
    expect(sorted.legend.map((c) => c.name)).toEqual(["a", "b"]);
  });
});

describe("rowsToDim", () => {
  const rows = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const turnedOff = new Set([2]);

  test("with nothing pointed at, the rows turned off in the legend", () => {
    expect(rowsToDim(rows, turnedOff, null)).toBe(turnedOff);
  });

  test("every row but the ones pointed at, turned off or not", () => {
    expect([...rowsToDim(rows, turnedOff, [2])]).toEqual([1, 3]);
    expect([...rowsToDim(rows, turnedOff, [1, 3])]).toEqual([2]); // a legend's "Other rows"
  });

  test("pointed-at rows since deleted don't count", () => {
    expect(rowsToDim(rows, turnedOff, [9])).toBe(turnedOff);
    expect([...rowsToDim(rows, turnedOff, [9, 1])]).toEqual([2, 3]);
  });
});
