import { describe, expect, test } from "vite-plus/test";
import { emphasize, OTHER_COLOR, type EmphasisInput, type Slots } from "../src/lib/emphasis";
import { makeRow, type Row } from "../src/lib/state";

/* Emphasis with nothing turned off or pointed at, and every row in view,
   unless the test says otherwise. */
const emphasis = (rows: Row[], more: Partial<EmphasisInput> = {}) =>
  emphasize({
    rows,
    inView: new Set(rows.map((row) => row.id)),
    slots: new Map(),
    turnedOff: new Set(),
    pointed: null,
    ...more,
  });
const loaded = (n: number) => Array.from({ length: n }, (_, i) => makeRow({ cargo: `M${i}`, scu: "1" }));
const colorOf = (slots: Slots, rows: Row[], row: Row) => emphasis(rows, { slots }).byRow.get(row.id)?.color;

describe("colors", () => {
  test("one per row with SCU, by row age; past eight, grey in one Other entry", () => {
    const rows = loaded(10);
    rows.push(makeRow({ cargo: "Empty", scu: "" }));
    const { byRow, legend } = emphasis(rows);
    expect(new Set(rows.slice(0, 8).map((r) => byRow.get(r.id)!.color)).size).toBe(8);
    expect(rows.slice(8, 10).every((r) => byRow.get(r.id)!.color === OTHER_COLOR)).toBe(true);
    expect(byRow.has(rows[10].id)).toBe(false);
    expect(legend).toHaveLength(9);
    expect(legend.at(-1)).toMatchObject({ name: "Other rows", color: OTHER_COLOR, rowIds: [rows[8].id, rows[9].id] });
  });

  test("a row keeps its color when an earlier row is deleted or its SCU cleared", () => {
    const rows = loaded(3);
    const { slots } = emphasis(rows);
    const before = colorOf(slots, rows, rows[2]);
    expect(colorOf(slots, rows.slice(1), rows[2])).toBe(before);
    const cleared = [{ ...rows[0], scu: "" }, ...rows.slice(1)];
    expect(colorOf(slots, cleared, rows[2])).toBe(before);
  });

  test("a freed color goes to the next row to get SCU; grey rows stay grey", () => {
    const rows = loaded(9);
    const { slots, byRow } = emphasis(rows);
    const freed = byRow.get(rows[3].id)!.color;
    const left = rows.filter((r) => r !== rows[3]);
    const after = emphasis(left, { slots });
    expect(after.byRow.get(rows[8].id)!.color).toBe(OTHER_COLOR);
    const added = makeRow({ cargo: "New", scu: "5" });
    expect(colorOf(after.slots, [...left, added], added)).toBe(freed);
  });

  test("hands back the same colors when none changed", () => {
    const rows = loaded(2);
    const { slots } = emphasis(rows);
    expect(emphasis(rows, { slots }).slots).toBe(slots);
    expect(emphasis([...rows].reverse(), { slots }).slots).toBe(slots); // sorting repaints nothing
  });
});

describe("names", () => {
  test("cargo and drop-off, with the row number when another has the same cargo and drop-off", () => {
    const rows = [
      makeRow({ cargo: "Gold", pickup: "Area18", dropoff: " Lorville ", scu: "1" }),
      makeRow({ cargo: "gold ", pickup: "New Babbage", dropoff: "Orison", scu: "1" }),
      makeRow({ cargo: "Gold", pickup: "Area18", dropoff: "", scu: "1" }),
      makeRow({ cargo: "Gold", pickup: "Crusader", dropoff: "Hurston", scu: "1" }),
      makeRow({ cargo: "Gold", pickup: "ArcCorp", dropoff: "hurston", scu: "1" }),
      makeRow({ cargo: "Iron", pickup: "Area18", dropoff: "Lorville", scu: "1" }),
      makeRow({ cargo: "", scu: "1" }),
      makeRow({ cargo: "", scu: "1" }),
    ];
    expect(emphasis(rows).legend.map((e) => e.name)).toEqual([
      "Gold (Lorville)",
      "gold (Orison)",
      "Gold", // the only Gold with no drop-off
      "Gold (Hurston #4)",
      "Gold (hurston #5)",
      "Iron (Lorville)",
      "No cargo (#7)",
      "No cargo (#8)",
    ]);
  });
});

describe("legend", () => {
  test("only rows in the ship view, in table order", () => {
    const rows = loaded(3);
    const { legend } = emphasis([rows[2], rows[0], rows[1]], { inView: new Set([rows[0].id, rows[2].id]) });
    expect(legend.map((e) => e.rowIds)).toEqual([[rows[2].id], [rows[0].id]]);
  });

  test("an entry is on while any of its rows shows in full", () => {
    const rows = loaded(10);
    const { legend } = emphasis(rows, { turnedOff: new Set([rows[0].id, rows[8].id]) });
    expect(legend[0].on).toBe(false);
    expect(legend[1].on).toBe(true);
    expect(legend.at(-1)!.on).toBe(true); // Other rows: row 10 still shows
  });
});

describe("dimming", () => {
  const rows = loaded(3);
  const [a, b, c] = rows.map((r) => r.id);

  test("with nothing pointed at, the rows turned off in the legend", () => {
    expect([...emphasis(rows, { turnedOff: new Set([b]) }).dimmed]).toEqual([b]);
  });

  test("while rows in view are pointed at, every other row in view, turned off or not", () => {
    expect([...emphasis(rows, { turnedOff: new Set([b]), pointed: [b] }).dimmed]).toEqual([a, c]);
    expect([...emphasis(rows, { pointed: [a, c] }).dimmed]).toEqual([b]); // a legend's "Other rows"
  });

  test("pointing at a row with nothing in view changes nothing", () => {
    const inView = new Set([a, b]);
    expect([...emphasis(rows, { inView, turnedOff: new Set([b]), pointed: [c] }).dimmed]).toEqual([b]);
  });

  test("ids of rows since deleted count for nothing", () => {
    expect([...emphasis(rows, { turnedOff: new Set([9]) }).dimmed]).toEqual([]);
    expect([...emphasis(rows, { pointed: [9] }).dimmed]).toEqual([]);
    expect([...emphasis(rows, { pointed: [9, a] }).dimmed]).toEqual([b, c]);
  });
});
