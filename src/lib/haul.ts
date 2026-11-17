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
   because the size is turned off. */
export type SizeCell = { kind: "count"; count: number } | { kind: "off" };

/* How much of a row goes in one of its grids. */
export type Part = { name: string; scu: number };

/* Why some of a row is in no grid: it has none, or its grids are out of room. */
export type UnassignedReason = "noGrid" | "outOfRoom";

/* Why a row can't pick a grid it isn't in yet:
   - "full": the grid has no room for any container.
   - "allAssigned": all of the row is in its grids already.
   - "tooSmall": none of the row's containers still to place would go in it. */
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
  /* Its container split: one per size column, in column order. */
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

  const filled = fillGrids(rows, positions, containers, allSizes);
  const counted = rows.map((row) => {
    const { parts, split, left } = filled.rows.get(row.id)!;
    /* A layout with no grids leaves nothing to assign. */
    const unassigned = positions.length ? scuOf(left) : 0;
    return { row, scu: parseScu(row.scu), parts, unassigned, left, ...split };
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
    sizes.map(({ size, on }) => (on ? { kind: "count", count: counts[size] ?? 0 } : { kind: "off" }));
  const deliveries: Delivery[] = counted.map(({ row, scu, parts, unassigned, left, counts, leftover }) => ({
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
      const block = picked ? null : pickBlock(scu, unassigned, grid, left, room.get(grid.position.name)!);
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
      cells: cellsOf(counted.reduce((total, d) => addCounts(total, d.counts), {} as Counts)),
      leftover,
      free: sum(grids, (g) => g.free),
    },
    showLeftover: leftover > 0,
    anyAssigned: deliveries.some((d) => d.parts.length > 0),
  };
}

/* Each row comes in its container split: its SCU made into containers once,
   largest first, from the sizes turned on, as the game hands them over,
   whatever grids it goes in. Grids then fill in the order they were picked,
   across all rows: each pick offers its grid the row's containers still to
   place, and the grid takes those it can (see loadGrid). The rest move on,
   whole, to the row's next pick; what's left after the last is still to place.
   So a later pick never takes room from an earlier one, a grid never takes
   more than it holds, and the table and ship view agree. Picks for grids not
   on this layout are ignored. */
function fillGrids(rows: Row[], positions: Position[], containers: Container[], sizes: number[]) {
  const byName = new Set(positions.map((p) => p.name));
  const bySize = new Map(containers.map((c) => [c.size, c]));
  const grids = new Map(positions.map((p) => [p.name, loadGrid<number>(p, sweepOf(p))]));
  const filled = new Map(
    rows.map((row) => {
      const split = fillLargestFirst(parseScu(row.scu), sizes);
      return [row.id, { parts: [] as Part[], split, left: { ...split.counts } }];
    }),
  );
  /* Ties (from older saves) go by table order. The sort is stable. */
  const picks = rows
    .flatMap((row) => row.picks.filter((p) => byName.has(p.name)).map((p) => ({ ...p, rowId: row.id })))
    .sort((a, b) => a.order - b.order);
  for (const { rowId, name } of picks) {
    const { parts, left } = filled.get(rowId)!;
    const load = sizes
      .filter((size) => left[size])
      .map((size) => ({ container: bySize.get(size)!, count: left[size], tag: rowId }));
    const unfit = grids.get(name)!.add(load);
    const before = scuOf(left);
    for (const { container } of load) left[container.size] = unfit[container.size] ?? 0;
    parts.push({ name, scu: before - scuOf(left) });
  }
  return { grids, rows: filled };
}

/* The SCU of some containers. */
const scuOf = (counts: Counts) => sum(Object.entries(counts), ([size, n]) => Number(size) * n);

/* Why a row can't pick a grid it isn't in (see PickBlock), or null if it can.
   A row with no SCU yet can pick any grid with room. */
function pickBlock(
  scu: number,
  unassigned: number,
  grid: HaulGrid,
  left: Counts,
  canPlace: (size: number) => boolean,
): PickBlock | null {
  if (grid.full) return "full";
  if (!unassigned) return scu > 0 ? "allAssigned" : null;
  return Object.keys(left).some((size) => left[Number(size)] > 0 && canPlace(Number(size))) ? null : "tooSmall";
}

/* Load a position from its fore end toward aft when its floor runs fore–aft
   (so cargo added later loads from aft toward fore); otherwise (or with no
   place on the ship) a layer at a time from its floor. */
function sweepOf(position: Position): Sweep {
  const fore = position.mount && foreAxis(position.mount);
  return fore ? { axis: fore.axis, reverse: fore.pointsFore } : { axis: "z" };
}
