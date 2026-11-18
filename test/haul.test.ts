import { describe, expect, test } from "vite-plus/test";
import { sum } from "../src/lib/format";
import type { Haul, SizeCell } from "../src/lib/haul";
import { makeRow, type Row } from "../src/lib/state";
import { bay, contractOf, haulOf, haulOfContracts, haulOnShip, shipRow, testRow } from "./helpers";

/* The parts of a Haul a test looks at, found by row or grid. */
const deliveryOf = (haul: Haul, row: Row) => haul.deliveries.find((d) => d.row.id === row.id)!;
const gridOf = (haul: Haul, name: string) => haul.grids.find((g) => g.grid.name === name)!;
/* Size cells in column order (32, 8, 1): a count or "off". */
const show = (cells: SizeCell[]) => cells.map((cell) => (cell.kind === "count" ? cell.count : cell.kind));
/* A row's plan, each step [order, grid]. */
const plan = (...list: [number, string][]) => list.map(([order, name]) => ({ name, order }));

describe("selection", () => {
  test("chooses the first ship and layout for an empty choice, and gives their ids", () => {
    const haul = haulOnShip("", []);
    expect(haul.at).toEqual({ ship: haul.ship!.id, layout: haul.layout!.id });
    expect(haul.grids.map((g) => g.grid)).toEqual(haul.layout!.grids);
  });

  test("counts only plan steps on the selected ship and layout", () => {
    const row = shipRow("ship-misc-hull-b", { scu: "8", plan: plan([1, "Port - Upper"]) });
    expect(deliveryOf(haulOnShip("ship-misc-hull-b", [row]), row).parts).toEqual([{ name: "Port - Upper", scu: 8 }]);
    /* The Hull A has a grid of the same name, but the plan step is on the Hull B. */
    expect(deliveryOf(haulOnShip("ship-misc-hull-a", [row]), row).parts).toEqual([]);
  });
});

describe("container sizes", () => {
  const cargoGrids = [bay("Small", 2, 2, 2), bay("Big", 2, 8, 2)];

  test("splits each delivery largest first, whatever its grid, and totals them", () => {
    const rows = [testRow({ scu: "8", plan: plan([1, "Small"]) }), testRow({ scu: "32", plan: plan([2, "Big"]) })];
    const haul = haulOf(rows, cargoGrids);
    expect(show(deliveryOf(haul, rows[0]).cells)).toEqual([0, 1, 0]);
    expect(show(deliveryOf(haul, rows[1]).cells)).toEqual([1, 0, 0]);
    expect(show(haul.totals.cells)).toEqual([1, 1, 0]);
    expect(gridOf(haul, "Small").placed).toHaveLength(1);
  });

  test("a grid never takes more than it holds; the rest is counted with any size", () => {
    const row = testRow({ scu: "40", plan: plan([1, "Small"]) });
    const haul = haulOf([row], cargoGrids);
    expect(gridOf(haul, "Small").free).toBe(0);
    expect(deliveryOf(haul, row)).toMatchObject({ remaining: 32, remainingReason: "outOfRoom", leftover: 0 });
    expect(show(deliveryOf(haul, row).cells)).toEqual([1, 1, 0]);
    expect(haul.totals.scu).toBe(40);
  });

  test("sizes turned off are skipped and leave a leftover when nothing smaller fits", () => {
    const row = testRow({ scu: "33" });
    const haul = haulOf([row], cargoGrids, { 1: false });
    expect(show(deliveryOf(haul, row).cells)).toEqual([1, 0, "off"]);
    expect(show(haul.totals.cells)).toEqual([1, 0, "off"]);
    expect(deliveryOf(haul, row).leftover).toBe(1);
    expect(haul.showLeftover).toBe(true);
    expect(haul.grids.map((g) => g.free)).toEqual([8, 32]); // no grid, no load
  });

  test("a container no grid's shape takes stays unplaced, never split smaller", () => {
    const grids = [bay("A", 2, 4, 2), bay("B", 2, 4, 2)]; // 16 SCU each, too short for a 32
    const row = testRow({ scu: "32", plan: plan([1, "A"], [2, "B"]) });
    const haul = haulOf([row], grids);
    expect(show(deliveryOf(haul, row).cells)).toEqual([1, 0, 0]); // the game hands over one 32
    expect(deliveryOf(haul, row)).toMatchObject({ remaining: 32, remainingReason: "outOfRoom" });
    expect(haul.grids.map((g) => g.free)).toEqual([16, 16]);
    expect(haul.totals.scu).toBe(32);
  });
});

describe("grid room", () => {
  const cargoGrids = [bay("Small", 2, 2, 2), bay("Big", 2, 8, 2)];

  test("each grid has its free SCU, and is full when no size turned on can still go in", () => {
    const tall = [bay("Tall", 2, 2, 3)]; // an 8 on the grid face leaves a layer 1 SCU high
    const rows = [testRow({ scu: "8", plan: plan([1, "Tall"]) })];
    expect(gridOf(haulOf(rows, tall), "Tall")).toMatchObject({ free: 4, full: false }); // a 1 still fits
    expect(gridOf(haulOf(rows, tall, { 1: false }), "Tall")).toMatchObject({ free: 4, full: true });
    expect(gridOf(haulOf(rows, cargoGrids), "Big")).toMatchObject({ free: 32, full: false });
  });

  test("full goes by what can still be placed, not the SCU free", () => {
    /* Two 8s fill the grid face; a third would stand 4 high, so 8 SCU is free but no 8 fits. */
    const bays = [bay("Bay 1", 4, 2, 3), bay("Bay 2", 4, 2, 3)];
    const row = testRow({ scu: "24", plan: plan([1, "Bay 1"]) });
    const haul = haulOf([row], bays, { 1: false });
    expect(gridOf(haul, "Bay 1")).toMatchObject({ free: 8, full: true });
    expect(deliveryOf(haul, row).grids.map((g) => g.block)).toEqual([null, null]);
  });

  test("left over SCU takes no room in its grid", () => {
    const rows = [testRow({ scu: "6", plan: plan([1, "Small"]) })];
    const haul = haulOf(rows, cargoGrids, { 1: false }); // 6 SCU with only 8s and 32s
    expect(gridOf(haul, "Small")).toMatchObject({ free: 8, placed: [] });
    expect(deliveryOf(haul, rows[0])).toMatchObject({ leftover: 6, remaining: 0, remainingReason: null });
  });

  test("a grid with no size turned on that fits its shape is full, even when empty", () => {
    const haul = haulOf([], cargoGrids, { 1: false, 8: false });
    expect(gridOf(haul, "Small")).toMatchObject({ free: 8, full: true }); // 32 SCU is too long for it
    expect(gridOf(haul, "Big")).toMatchObject({ free: 32, full: false });
  });

  test("totals the SCU in no grid and the room free, and whether any row is in a grid", () => {
    const rows = [
      testRow({ scu: "40", plan: plan([1, "Small"]) }), // 32 over
      testRow({ scu: "5" }), // no grid
      testRow({ scu: "4", plan: plan([2, "Big"]) }),
    ];
    const haul = haulOf(rows, cargoGrids);
    expect(haul.totals).toMatchObject({ remaining: 37, free: 28 });
    expect(haul.contracts[0].anyPlanned).toBe(true);
    expect(haulOf([testRow({ scu: "5" })], cargoGrids).contracts[0].anyPlanned).toBe(false);
  });
});

describe("splitting across grids", () => {
  const cargoGrids = [bay("A", 2, 4, 2), bay("B", 2, 4, 2), bay("C", 2, 4, 2)]; // 16 SCU each
  const split = (haul: Haul, rows: Row[]) =>
    rows.map((row) => {
      const { parts, remaining } = deliveryOf(haul, row);
      return { parts, remaining };
    });

  test("an earlier plan step keeps its room; a later one takes what's left, then moves on", () => {
    const hull = "ship-misc-hull-b";
    const rows = [
      shipRow(hull, { scu: "184", plan: plan([1, "Starboard - Upper"], [2, "Starboard - Lower"]) }),
      shipRow(hull, { scu: "84", plan: plan([3, "Starboard - Lower"], [4, "Port - Lower"]) }),
    ];
    expect(split(haulOnShip(hull, rows), rows)).toEqual([
      {
        parts: [
          { name: "Starboard - Upper", scu: 128 },
          { name: "Starboard - Lower", scu: 56 },
        ],
        remaining: 0,
      },
      {
        parts: [
          { name: "Starboard - Lower", scu: 72 },
          { name: "Port - Lower", scu: 12 },
        ],
        remaining: 0,
      },
    ]);
  });

  test("plan steps fill in the order they were added, not table order", () => {
    const rows = [testRow({ scu: "20", plan: plan([2, "C"], [3, "A"]) }), testRow({ scu: "10", plan: plan([1, "A"]) })];
    expect(split(haulOf(rows, cargoGrids), rows)).toEqual([
      {
        parts: [
          { name: "C", scu: 16 },
          { name: "A", scu: 4 },
        ],
        remaining: 0,
      },
      { parts: [{ name: "A", scu: 10 }], remaining: 0 },
    ]);
  });

  test("a plan step on a full grid gets nothing, and the row moves on to its next", () => {
    const rows = [testRow({ scu: "16", plan: plan([1, "A"]) }), testRow({ scu: "10", plan: plan([2, "A"], [3, "B"]) })];
    expect(split(haulOf(rows, cargoGrids), rows)[1]).toEqual({
      parts: [
        { name: "A", scu: 0 },
        { name: "B", scu: 10 },
      ],
      remaining: 0,
    });
  });

  test("containers a grid can't place move on to the row's next grid, whole", () => {
    const bays = [bay("Bay 1", 4, 2, 3), bay("Bay 2", 4, 2, 3)]; // 24 SCU each, but only two 8s
    const row = testRow({ scu: "24", plan: plan([1, "Bay 1"], [2, "Bay 2"]) });
    const haul = haulOf([row], bays);
    expect(split(haul, [row])).toEqual([
      {
        parts: [
          { name: "Bay 1", scu: 16 },
          { name: "Bay 2", scu: 8 },
        ],
        remaining: 0,
      },
    ]);
    expect(show(deliveryOf(haul, row).cells)).toEqual([0, 3, 0]); // still three 8s, not 4s
    expect(haul.grids.map((g) => g.placed.length)).toEqual([2, 1]);
  });

  test("with no next grid, what can't be placed is remaining", () => {
    const bays = [bay("Bay 1", 4, 2, 3), bay("Bay 2", 4, 2, 3)];
    const row = testRow({ scu: "24", plan: plan([1, "Bay 1"]) });
    const delivery = deliveryOf(haulOf([row], bays), row);
    expect(delivery).toMatchObject({ remaining: 8, remainingReason: "outOfRoom" });
    expect(delivery.grids.map((g) => g.block)).toEqual([null, null]); // Bay 2 can take it
  });

  test("what there's no room for stays out of every grid and counts as remaining", () => {
    const rows = [testRow({ scu: "40", plan: plan([1, "A"], [2, "B"]) }), testRow({ scu: "20", plan: plan([3, "C"]) })];
    expect(split(haulOf(rows, cargoGrids, { 32: false }), rows)).toEqual([
      {
        parts: [
          { name: "A", scu: 16 },
          { name: "B", scu: 16 },
        ],
        remaining: 8,
      },
      { parts: [{ name: "C", scu: 16 }], remaining: 4 },
    ]);
  });

  test("a later plan step on a full grid gets nothing from it", () => {
    const rows = [testRow({ scu: "16", plan: plan([1, "A"]) }), testRow({ scu: "4", plan: plan([2, "A"]) })];
    expect(split(haulOf(rows, cargoGrids), rows)[1]).toEqual({ parts: [{ name: "A", scu: 0 }], remaining: 4 });
  });

  test("a row with no grid on this layout is all remaining", () => {
    const rows = [testRow({ scu: "16" }), testRow({ scu: "9", plan: plan([1, "Elsewhere"]) }), testRow({ scu: "" })];
    expect(split(haulOf(rows, cargoGrids), rows)).toEqual([
      { parts: [], remaining: 16 },
      { parts: [], remaining: 9 },
      { parts: [], remaining: 0 },
    ]);
  });

  test("a layout with no grids leaves nothing to place", () => {
    const rows = [testRow({ scu: "16" })];
    expect(split(haulOf(rows, []), rows)).toEqual([{ parts: [], remaining: 0 }]);
  });

  test("says why some of a row is in no grid", () => {
    const rows = [
      testRow({ scu: "20", plan: plan([1, "A"]) }), // 4 over
      testRow({ scu: "57" }),
      testRow({ scu: "8", plan: plan([2, "B"]) }),
    ];
    const haul = haulOf(rows, cargoGrids);
    expect(rows.map((row) => deliveryOf(haul, row).remainingReason)).toEqual(["outOfRoom", "noGrid", null]);
  });
});

describe("loading order", () => {
  const hull = "ship-misc-hull-b";

  test("a grid's later cargo loads from aft, apart from what was there first", () => {
    const rows = [
      shipRow(hull, { scu: "184", plan: plan([1, "Starboard - Upper"], [2, "Starboard - Lower"]) }),
      shipRow(hull, { scu: "84", plan: plan([3, "Starboard - Lower"], [4, "Port - Lower"]) }),
    ];
    const { placed } = gridOf(haulOnShip(hull, rows), "Starboard - Lower");
    /* y runs aft to fore here. In each lane across the grid, the first row's
       cargo is all fore of the second's. */
    const ends = (id: number, x: number) =>
      placed.filter((p) => p.tag === id && p.x === x).flatMap(({ y, d }) => [y, y + d]);
    expect(sum(placed, (p) => p.size)).toBe(128); // all of it still fits
    expect(Math.max(...placed.filter((p) => p.tag === rows[0].id).map(({ y, d }) => y + d))).toBe(16);
    for (const x of [0, 2])
      expect(Math.max(...ends(rows[1].id, x))).toBeLessThanOrEqual(Math.min(...ends(rows[0].id, x)));
  });

  test("a grid loads from its fore end", () => {
    const rows = [shipRow(hull, { scu: "32", plan: plan([1, "Port - Upper"]) })];
    const { placed } = gridOf(haulOnShip(hull, rows), "Port - Upper");
    expect(placed.map(({ y, d }) => [y, y + d])).toEqual([[8, 16]]);
  });
});

describe("grid choices", () => {
  const cargoGrids = [bay("Small", 2, 2, 2), bay("Big", 2, 8, 2), bay("Long", 2, 8, 2)];
  const blocks = (rows: Row[], row: Row) =>
    Object.fromEntries(deliveryOf(haulOf(rows, cargoGrids), row).grids.map((g) => [g.name, g.block]));

  test("a row with SCU left can add a grid with room for its smallest container", () => {
    const row = testRow({ scu: "40" }); // 32 + 8 in Big; 8 × 5 in Small
    expect(blocks([row], row)).toEqual({ Small: null, Big: null, Long: null });
  });

  test("lists every grid, whether the row is in it, and none it's in is blocked", () => {
    const row = testRow({ scu: "8", plan: plan([1, "Big"]) });
    expect(deliveryOf(haulOf([row], cargoGrids), row).grids).toEqual([
      { name: "Small", inPlan: false, block: "allPlaced" },
      { name: "Big", inPlan: true, block: null },
      { name: "Long", inPlan: false, block: "allPlaced" },
    ]);
  });

  test("not a grid others have left too little room in for the row's containers", () => {
    const other = testRow({ scu: "25", plan: plan([1, "Big"]) }); // leaves 7 free, room for 1s
    const row = testRow({ scu: "40" }); // a 32 and an 8
    expect(blocks([other, row], row)).toMatchObject({ Big: "tooSmall", Long: null });
    const odd = testRow({ scu: "41" }); // a 32, an 8 and a 1, which fits
    expect(blocks([other, odd], odd)).toMatchObject({ Big: null });
  });

  test("not a full grid; a row with no SCU yet can add any other", () => {
    const filler = testRow({ scu: "8", plan: plan([1, "Small"]) });
    const blank = testRow();
    expect(blocks([filler, blank], blank)).toEqual({ Small: "full", Big: null, Long: null });
  });

  test("the rows come out in table order with their text", () => {
    const rows = [testRow({ cargo: "Gold", scu: "1" }), makeRow({ cargo: "Tin" })];
    expect(haulOf(rows, cargoGrids).deliveries.map((d) => d.row.cargo)).toEqual(["Gold", "Tin"]);
  });
});

describe("contracts", () => {
  test("each delivery is split from the sizes its own contract hands out", () => {
    const junior = testRow({ scu: "40" });
    const senior = testRow({ scu: "40" });
    const haul = haulOfContracts([contractOf([junior], { enabled: { 32: false } }), contractOf([senior])], []);
    expect(show(deliveryOf(haul, junior).cells)).toEqual(["off", 5, 0]);
    expect(show(deliveryOf(haul, senior).cells)).toEqual([1, 1, 0]);
    expect(show(haul.totals.cells)).toEqual([1, 6, 0]);
  });

  test("a size no contract hands out is off for the haul", () => {
    const row = testRow({ scu: "40" });
    const haul = haulOfContracts([contractOf([row], { enabled: { 32: false } })], []);
    expect(haul.sizes.map((s) => s.on)).toEqual([false, true, true]);
  });

  test("each contract's table has its label, sizes and totals", () => {
    const haul = haulOfContracts(
      [
        contractOf([testRow({ scu: "40" }), testRow({ scu: "9" })], {
          name: "Senior",
          enabled: { 32: false, 1: false },
        }),
        contractOf([]),
      ],
      [],
    );
    expect(
      haul.contracts.map(({ label, totals, showLeftover, sizes }) => ({ label, totals, showLeftover, sizes })),
    ).toEqual([
      {
        label: "Senior",
        totals: {
          scu: 49,
          remaining: 0,
          cells: [{ kind: "off" }, { kind: "count", count: 6 }, { kind: "off" }],
          leftover: 1,
        },
        showLeftover: true,
        sizes: [
          { size: 32, on: false },
          { size: 8, on: true },
          { size: 1, on: false },
        ],
      },
      {
        label: "Contract 2",
        totals: { scu: 0, remaining: 0, cells: [0, 0, 0].map((count) => ({ kind: "count", count })), leftover: 0 },
        showLeftover: false,
        sizes: [
          { size: 32, on: true },
          { size: 8, on: true },
          { size: 1, on: true },
        ],
      },
    ]);
    expect(haul.deliveries.map((d) => d.contract)).toEqual(["Senior", "Senior"]);
  });

  test("a grid too small for a contract's containers is blocked for that contract's rows only", () => {
    const big = testRow({ scu: "32" });
    const small = testRow({ scu: "8" });
    const haul = haulOfContracts(
      [contractOf([big], { enabled: { 8: false, 1: false } }), contractOf([small])],
      [bay("Small", 2, 2, 2)],
    );
    expect(deliveryOf(haul, big).grids[0].block).toBe("tooSmall");
    expect(deliveryOf(haul, small).grids[0].block).toBeNull();
  });
});
