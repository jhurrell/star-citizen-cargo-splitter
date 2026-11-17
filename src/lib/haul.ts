/* The Haul: everything the page shows about the deliveries in the selected
   ship, worked out from the saved state in one call. Which grids each row is
   in, the containers each row needs, what each grid has room for, and how
   each grid is packed. Pure, so it can be unit tested through computeHaul. */

import { fitsInside, parseScu, type Container, type Grid, type Position, type Ship } from "./cargo";
import { sum } from "./format";
import { foreAxis } from "./mount";
import { addCounts, fillLargestFirst, loadGrid, type Counts, type Placed, type Sweep } from "./packing";
import { isEnabled, rowsOn, type LayoutRef, type Row, type State } from "./state";

/* A container size's column, on unless turned off in its header. */
export type SizeColumn = { size: number; on: boolean };

/* One cell under a size column: how many containers of that size, or none
   because the size is turned off, or because it won't fit the row's grids. */
export type SizeCell = { kind: "count"; count: number } | { kind: "off" } | { kind: "wontFit" };

/* How much of a row goes in one of its grids. */
export type Part = { name: string; scu: number };

/* Why some of a row is in no grid: it has none, or its grids are out of room. */
export type UnassignedReason = "noGrid" | "outOfRoom";

/* Why a row can't pick a grid it isn't in yet:
   - "full": the grid has no room for any container.
   - "allAssigned": all of the row is in its grids already.
   - "tooSmall": the grid's free SCU is less than the smallest container the
     rest of the row would need there, so none of them would go in. */
export type PickBlock = "full" | "allAssigned" | "tooSmall";

/* A row's button for one grid: whether the row is in it, and if not, why it
   can't pick it (null when it can). */
export type GridChoice = { name: string; picked: boolean; block: PickBlock | null };

/* One row of the table, worked out. */
export type Delivery = {
  row: Row;
  scu: number;
  /* The grids it's in, in the order it picked them, with the SCU each takes. */
  parts: Part[];
  unassigned: number;
  unassignedReason: UnassignedReason | null;
  /* One per size column, in column order. */
  cells: SizeCell[];
  /* SCU no turned-on size can make up. */
  leftover: number;
  /* One per grid on the layout, in layout order. */
  grids: GridChoice[];
};

/* A grid on the layout: the SCU it has free, whether that's too little for
   any size turned on that fits it, and where each container sits, tagged
   with its row's id. */
export type HaulGrid = { position: Position; free: number; full: boolean; placed: Placed<number>[] };

export type Haul = {
  ship: Ship | undefined;
  layout: Grid | undefined;
  /* The selected ship and layout's ids, for picking and clearing grids. */
  at: LayoutRef;
  /* The layout's positions, as ships.json has them. */
  positions: Position[];
  sizes: SizeColumn[];
  deliveries: Delivery[];
  grids: HaulGrid[];
  totals: {
    scu: number;
    unassigned: number;
    /* Only "count" or "off". */
    cells: SizeCell[];
    leftover: number;
    /* SCU free across all the grids. */
    free: number;
  };
  /* Whether any row has leftover, so the Left over column shows. */
  showLeftover: boolean;
  /* Whether any row is in a grid, so there's something to clear. */
  anyAssigned: boolean;
};

/* The ship and layout a state's choice selects ("" is the first of each),
   and their ids. */
export function selectLayout(ships: Ship[], choice: Pick<State, "shipId" | "gridId">) {
  const ship = ships.find((s) => s.id === choice.shipId) ?? ships[0];
  const layout = ship?.grids.find((g) => g.id === choice.gridId) ?? ship?.grids[0];
  const at: LayoutRef = { ship: ship?.id ?? "", layout: layout?.id ?? "" };
  return { ship, layout, at };
}

/* Work out the Haul for the selected ship and layout, counting only the
   picks made on that layout. */
export function computeHaul(state: State, ships: Ship[], containers: Container[]): Haul {
  const { ship, layout, at } = selectLayout(ships, state);
  const positions = layout?.positions ?? [];
  const rows = rowsOn(state.rows, at);

  const sizes: SizeColumn[] = containers.map(({ size }) => ({ size, on: isEnabled(state.enabled, size) }));
  const usable = containers.filter((c) => isEnabled(state.enabled, c.size));
  const allSizes = usable.map((c) => c.size);
  /* The sizes turned on that fit each position's shape, largest first. */
  const fitting = new Map(positions.map((p) => [p.name, usable.filter((c) => fitsInside(c, p)).map((c) => c.size)]));
  const sizesFor = (position: Position | undefined) => (position ? fitting.get(position.name)! : allSizes);
  const bySize = new Map(containers.map((c) => [c.size, c]));

  const filled = fillGrids(rows, positions, containers, sizesFor);
  const totalCounts: Counts = Object.fromEntries(allSizes.map((size) => [size, 0]));

  /* Each row's containers: those its grids took, then what's left of it made
     up with any size turned on. Counts list every size the row could use, so
     the rest show as won't fit. Left over is what no size turned on makes up;
     it takes no grid room and isn't unassigned, as no grid could take it. */
  const counted = rows.map((row) => {
    const { parts, placed, rest } = filled.rows.get(row.id)!;
    const loose = fillLargestFirst(rest, allSizes);
    /* A layout with no grids leaves nothing to assign. */
    const unassigned = positions.length ? rest - loose.leftover : 0;
    const counts: Counts = {};
    for (const part of parts) for (const size of sizesFor(filled.byName.get(part.name))) counts[size] = 0;
    if (!parts.length || unassigned) for (const size of allSizes) counts[size] = 0;
    addCounts(counts, placed);
    addCounts(counts, Object.fromEntries(Object.entries(loose.counts).filter(([, n]) => n > 0)));
    addCounts(totalCounts, counts);
    return { row, scu: parseScu(row.scu), parts, unassigned, counts, leftover: loose.leftover };
  });

  /* Whether a container of each size could still go in each grid. */
  const room = new Map(
    positions.map((position) => {
      const load = filled.grids.get(position.name)!;
      const fits = new Map(sizesFor(position).map((size) => [size, load.canPlace(bySize.get(size)!)]));
      return [position.name, (size: number) => fits.get(size) ?? false];
    }),
  );
  const grids: HaulGrid[] = positions.map((position) => {
    const placed = filled.grids.get(position.name)!.placed();
    return {
      position,
      free: position.capacity - sum(placed, (p) => p.size),
      full: !sizesFor(position).some(room.get(position.name)!),
      placed,
    };
  });

  const cellsOf = (counts: Counts): SizeCell[] =>
    sizes.map(({ size, on }) =>
      !on
        ? { kind: "off" }
        : Object.hasOwn(counts, size)
          ? { kind: "count", count: counts[size] }
          : { kind: "wontFit" },
    );
  const deliveries: Delivery[] = counted.map(({ row, scu, parts, unassigned, counts, leftover }) => ({
    row,
    scu,
    parts,
    unassigned,
    unassignedReason: !unassigned ? null : parts.length ? "outOfRoom" : "noGrid",
    cells: cellsOf(counts),
    leftover,
    grids: grids.map((grid) => {
      const picked = parts.some((p) => p.name === grid.position.name);
      /* A row that already has a grid can still give it up. */
      const block = picked ? null : pickBlock(scu, unassigned, grid, sizesFor, room.get(grid.position.name)!);
      return { name: grid.position.name, picked, block };
    }),
  }));

  const leftover = sum(deliveries, (d) => d.leftover);
  return {
    ship,
    layout,
    at,
    positions,
    sizes,
    deliveries,
    grids,
    totals: {
      scu: sum(deliveries, (d) => d.scu),
      unassigned: sum(deliveries, (d) => d.unassigned),
      cells: cellsOf(totalCounts),
      leftover,
      free: sum(grids, (g) => g.free),
    },
    showLeftover: leftover > 0,
    anyAssigned: deliveries.some((d) => d.parts.length > 0),
  };
}

/* Grids fill in the order they were picked, across all rows. Each pick makes
   what's left of its row into containers, largest first with the sizes turned
   on that fit its grid, and the grid takes those it can place (see loadGrid).
   What it can't moves on to the row's next pick; what's left after the last
   is the row's rest. So a later pick never takes room from an earlier one, a
   grid never takes more than it holds, and the table and ship view agree.
   Picks for grids not on this layout are ignored. */
function fillGrids(
  rows: Row[],
  positions: Position[],
  containers: Container[],
  sizesFor: (position: Position) => number[],
) {
  const byName = new Map(positions.map((p) => [p.name, p]));
  const bySize = new Map(containers.map((c) => [c.size, c]));
  const grids = new Map(positions.map((p) => [p.name, loadGrid<number>(p, sweepOf(p))]));
  const filled = new Map(
    rows.map((row) => [row.id, { parts: [] as Part[], placed: {} as Counts, rest: parseScu(row.scu) }]),
  );
  /* Ties (from older saves) go by table order. The sort is stable. */
  const picks = rows
    .flatMap((row) => row.picks.filter((p) => byName.has(p.name)).map((p) => ({ ...p, rowId: row.id })))
    .sort((a, b) => a.order - b.order);
  for (const { rowId, name } of picks) {
    const row = filled.get(rowId)!;
    const sizes = sizesFor(byName.get(name)!);
    const { counts } = fillLargestFirst(row.rest, sizes);
    const load = sizes
      .filter((size) => counts[size])
      .map((size) => ({ container: bySize.get(size)!, count: counts[size], tag: rowId }));
    const unfit = grids.get(name)!.add(load);
    const placed = Object.fromEntries(load.map(({ container: { size }, count }) => [size, count - (unfit[size] ?? 0)]));
    const scu = sum(Object.entries(placed), ([size, n]) => Number(size) * n);
    addCounts(row.placed, placed);
    row.parts.push({ name, scu });
    row.rest -= scu;
  }
  return { byName, grids, rows: filled };
}

/* Why a row can't pick a grid it isn't in (see PickBlock), or null if it can.
   The containers it would need there are its unassigned SCU filled largest
   first with the sizes that fit the grid; the smallest must still go in, as
   `canPlace` says. A row with no SCU yet can pick any grid with room. */
function pickBlock(
  scu: number,
  unassigned: number,
  grid: HaulGrid,
  sizesFor: (position: Position) => number[],
  canPlace: (size: number) => boolean,
): PickBlock | null {
  if (grid.full) return "full";
  if (!unassigned) return scu > 0 ? "allAssigned" : null;
  const sizes = sizesFor(grid.position);
  const { counts } = fillLargestFirst(unassigned, sizes);
  const needed = sizes.filter((size) => counts[size] > 0);
  return needed.length && canPlace(Math.min(...needed)) ? null : "tooSmall";
}

/* Load a position from its fore end toward aft when its floor runs fore–aft
   (so cargo added later loads from aft toward fore); otherwise (or with no
   place on the ship) a layer at a time from its floor. */
function sweepOf(position: Position): Sweep {
  const fore = position.mount && foreAxis(position.mount);
  return fore ? { axis: fore.axis, reverse: fore.pointsFore } : { axis: "z" };
}
