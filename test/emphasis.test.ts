import { describe, expect, test } from "vite-plus/test";
import { emphasize, OTHER_COLOR, OTHER_KEY, type EmphasisInput, type Slots } from "../src/lib/emphasis";
import { makeRow, type Row } from "../src/lib/state";

/* Emphasis in the Cargo view, with nothing picked out or pointed at, and
   every row in view, unless the test says otherwise. */
const emphasis = (rows: Row[], more: Partial<EmphasisInput> = {}) =>
  emphasize({
    rows,
    inView: new Set(rows.map((row) => row.id)),
    view: "cargo",
    slots: new Map(),
    picked: new Set(),
    pointed: null,
    ...more,
  });
const loaded = (n: number) => Array.from({ length: n }, (_, i) => makeRow({ cargo: `M${i}`, scu: "1" }));
const colorOf = (slots: Slots, rows: Row[], row: Row) => emphasis(rows, { slots }).byRow.get(row.id)?.color;
/* The Cargo view's key for a row. */
const keyOf = (row: Row) => `#${row.id}`;

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

  test("an entry is on while it's picked out", () => {
    const rows = loaded(10);
    const { legend } = emphasis(rows, { picked: new Set([keyOf(rows[1]), OTHER_KEY]) });
    expect(legend.map((e) => e.on).slice(0, 3)).toEqual([false, true, false]);
    expect(legend.at(-1)).toMatchObject({ key: OTHER_KEY, on: true });
  });
});

describe("drop-off and pick-up views", () => {
  const rows = [
    makeRow({ cargo: "Gold", pickup: "Area18", dropoff: "Lorville", scu: "1" }),
    makeRow({ cargo: "Iron", pickup: "Area18", dropoff: "  lorville ", scu: "1" }),
    makeRow({ cargo: "Tin", pickup: "Orison", dropoff: "Jackson's  Swap", scu: "1" }),
    makeRow({ cargo: "Zinc", pickup: "", dropoff: "", scu: "1" }),
  ];
  const [gold, iron, tin, zinc] = rows.map((r) => r.id);

  test("one entry per drop-off, matched whatever the case or spacing, named as first typed", () => {
    const { legend, byRow } = emphasis(rows, { view: "dropoff" });
    expect(legend.map(({ name, rowIds }) => ({ name, rowIds }))).toEqual([
      { name: "Lorville", rowIds: [gold, iron] },
      { name: "Jackson's Swap", rowIds: [tin] },
      { name: "No drop-off", rowIds: [zinc] },
    ]);
    expect(byRow.get(gold)!.color).toBe(byRow.get(iron)!.color); // a drop-off's rows share its color
    expect(byRow.get(gold)!.color).not.toBe(byRow.get(tin)!.color);
    expect(byRow.get(iron)!.name).toBe("Iron (lorville)"); // a container still says what's in it
  });

  test("one entry per pick-up", () => {
    expect(emphasis(rows, { view: "pickup" }).legend.map((e) => e.name)).toEqual(["Area18", "Orison", "No pick-up"]);
  });

  test("picking out a drop-off dims every other drop-off's rows, from any contract", () => {
    const { legend, dimmed } = emphasis(rows, { view: "dropoff", picked: new Set(["@lorville"]) });
    expect(legend[0].on).toBe(true);
    expect([...dimmed]).toEqual([tin, zinc]);
  });

  test("a drop-off keeps its color when another drop-off goes", () => {
    const { slots, byRow } = emphasis(rows, { view: "dropoff" });
    const after = emphasis(rows.slice(2), { view: "dropoff", slots });
    expect(after.byRow.get(tin)!.color).toBe(byRow.get(tin)!.color);
  });

  test("past eight drop-offs, the rest share grey in one Other drop-offs entry", () => {
    const many = Array.from({ length: 9 }, (_, i) => makeRow({ dropoff: `D${i}`, scu: "1" }));
    expect(emphasis(many, { view: "dropoff" }).legend.at(-1)).toMatchObject({
      key: OTHER_KEY,
      name: "Other drop-offs",
      color: OTHER_COLOR,
    });
  });
});

describe("dimming", () => {
  const rows = loaded(3);
  const [a, b, c] = rows.map((r) => r.id);

  test("with nothing picked out or pointed at, none", () => {
    expect([...emphasis(rows).dimmed]).toEqual([]);
  });

  test("with entries picked out, every row in view under another entry", () => {
    expect([...emphasis(rows, { picked: new Set([keyOf(rows[1])]) }).dimmed]).toEqual([a, c]);
  });

  test("while rows in view are pointed at, every other row in view, picked out or not", () => {
    expect([...emphasis(rows, { picked: new Set([keyOf(rows[1])]), pointed: [a] }).dimmed]).toEqual([b, c]);
    expect([...emphasis(rows, { pointed: [a, c] }).dimmed]).toEqual([b]); // a legend's "Other rows"
  });

  test("pointing at a row with nothing in view changes nothing", () => {
    const inView = new Set([a, b]);
    expect([...emphasis(rows, { inView, picked: new Set([keyOf(rows[1])]), pointed: [c] }).dimmed]).toEqual([a]);
  });

  test("keys of entries since gone and ids of rows since deleted count for nothing", () => {
    expect([...emphasis(rows, { picked: new Set(["#999"]) }).dimmed]).toEqual([]);
    expect([...emphasis(rows, { pointed: [9] }).dimmed]).toEqual([]);
    expect([...emphasis(rows, { pointed: [9, a] }).dimmed]).toEqual([b, c]);
  });
});
