/* The Haul: everything the page shows about the deliveries in the selected
   ship, worked out from the saved state in one call. Which grids each row is
   in, the containers each row needs, what each grid has room for, and how
   each grid is packed. Pure, so it can be unit tested through computeHaul. */

import { fitsInside, parseScu, type Container, type Grid, type Position, type Ship } from "./cargo";
import { sum } from "./format";
import { foreAxis } from "./mount";
import {
  addCounts,
  fillLargestFirst,
  packInTurn,
  type Counts,
  type Load,
  type Packing,
  type Placed,
  type Sweep,
} from "./packing";
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

  const splits = splitRows(rows, positions);
  const byName = new Map(positions.map((p) => [p.name, p]));
  const scuIn = new Map(positions.map((p) => [p.name, 0]));
  /* Each position's loads, a list per row with the order the row picked it. */
  const loads = new Map<string, { order: number; load: Load<number>[] }[]>(positions.map((p) => [p.name, []]));
  const totalCounts: Counts = Object.fromEntries(allSizes.map((size) => [size, 0]));

  /* Each part of a row only uses the sizes turned on that fit its position;
     a row with no position, and what its grids have no room for, any size
     turned on. What's in no grid (all of a row without one) is still counted,
     so a row's containers add up to its SCU. */
  const filled = rows.map((row) => {
    const scu = parseScu(row.scu);
    const { parts, unassigned } = splits.get(row.id)!;
    const inGrids = sum(parts, (p) => p.scu);
    const shares = [
      ...parts.map((p) => ({ ...p, position: byName.get(p.name) })),
      ...(!parts.length || scu > inGrids ? [{ scu: scu - inGrids, position: undefined }] : []),
    ];
    /* Counts list every size the row could use, so the rest show as won't fit. */
    const counts: Counts = {};
    let leftover = 0;
    for (const { position } of shares) for (const size of sizesFor(position)) counts[size] = 0;
    for (const { scu: shareScu, position } of shares) {
      if (!shareScu) continue;
      const part = fillLargestFirst(shareScu, sizesFor(position));
      addCounts(counts, part.counts);
      leftover += part.leftover;
      if (!position) continue;
      scuIn.set(position.name, scuIn.get(position.name)! + shareScu);
      const order = row.picks.find((p) => p.name === position.name)!.order;
      const load = containers
        .filter((container) => part.counts[container.size])
        .map((container) => ({ container, count: part.counts[container.size], tag: row.id }));
      loads.get(position.name)!.push({ order, load });
    }
    addCounts(totalCounts, counts);
    return { row, scu, parts, unassigned, counts, leftover };
  });

  /* Each position is packed a row at a time, in the order its rows picked
     it, to keep their cargo apart: the first from the fore end, later ones
     from aft (see packApart). */
  const grids: HaulGrid[] = positions.map((position) => {
    const free = position.capacity - scuIn.get(position.name)!;
    /* Ties (from older saves) keep table order. The sort is stable. */
    const turns = loads
      .get(position.name)!
      .sort((a, b) => a.order - b.order)
      .map((t) => t.load);
    return {
      position,
      free,
      full: !sizesFor(position).some((size) => size <= free),
      placed: packApart(position, turns).placed,
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
  const deliveries: Delivery[] = filled.map(({ row, scu, parts, unassigned, counts, leftover }) => ({
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
      return { name: grid.position.name, picked, block: picked ? null : pickBlock(scu, unassigned, grid, sizesFor) };
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

/* Grids fill in the order they were picked, across all rows: each pick takes
   what it can of its row's remaining SCU from the room its grid has left, so
   a later pick never takes room from an earlier one, and no grid takes more
   than it holds. What's left of a row after all its picks is unassigned.
   Picks for grids not on this layout are ignored, and a layout with no grids
   leaves nothing to assign. */
function splitRows(rows: Row[], positions: Position[]): Map<number, { parts: Part[]; unassigned: number }> {
  const room = new Map(positions.map((p) => [p.name, p.capacity]));
  const rest = new Map(rows.map((row) => [row.id, parseScu(row.scu)]));
  const parts = new Map(rows.map((row) => [row.id, [] as Part[]]));
  /* Ties (from older saves) go by table order. The sort is stable. */
  const picks = rows
    .flatMap((row) => row.picks.filter((p) => room.has(p.name)).map((p) => ({ ...p, rowId: row.id })))
    .sort((a, b) => a.order - b.order);
  for (const { rowId, name } of picks) {
    const scu = Math.min(rest.get(rowId)!, room.get(name)!);
    parts.get(rowId)!.push({ name, scu });
    rest.set(rowId, rest.get(rowId)! - scu);
    room.set(name, room.get(name)! - scu);
  }
  return new Map(
    rows.map((row) => [row.id, { parts: parts.get(row.id)!, unassigned: positions.length ? rest.get(row.id)! : 0 }]),
  );
}

/* Why a row can't pick a grid it isn't in (see PickBlock), or null if it can.
   The containers it would need there are its unassigned SCU filled largest
   first with the sizes that fit the grid. A row with no SCU yet can pick any
   grid with room. */
function pickBlock(
  scu: number,
  unassigned: number,
  grid: HaulGrid,
  sizesFor: (position: Position) => number[],
): PickBlock | null {
  if (grid.full) return "full";
  if (!unassigned) return scu > 0 ? "allAssigned" : null;
  const sizes = sizesFor(grid.position);
  const { counts } = fillLargestFirst(unassigned, sizes);
  const needed = sizes.filter((size) => counts[size] > 0);
  return needed.length && Math.min(...needed) <= grid.free ? null : "tooSmall";
}

/* Load a position from its fore end toward aft when its floor runs fore–aft
   (so cargo added later loads from aft toward fore); otherwise (or with no
   place on the ship) a layer at a time from its floor. */
function sweepOf(position: Position): Sweep {
  const fore = position.mount && foreAxis(position.mount);
  return fore ? { axis: fore.axis, reverse: fore.pointsFore } : { axis: "z" };
}

/* Pack a position's rows apart, in turn; if that leaves out more than one
   pile (biggest first) would, use the pile. */
function packApart(position: Position, turns: Load<number>[][]): Packing<number> {
  const apart = packInTurn(position, turns, sweepOf(position));
  const unfitScu = ({ unfit }: Packing<number>) => sum(Object.entries(unfit), ([size, n]) => Number(size) * n);
  if (!unfitScu(apart)) return apart;
  const pile = packInTurn(position, [turns.flat()], sweepOf(position));
  return unfitScu(pile) < unfitScu(apart) ? pile : apart;
}
