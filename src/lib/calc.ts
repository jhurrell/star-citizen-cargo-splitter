/* What the page works out from its state: which grids each row goes in, the
   containers each row needs, and how each grid is packed. Pure functions, so
   they can be unit tested. */

import { fitsInside, parseScu, type Container, type Position, type Ship } from "./cargo";
import { fmt, sum } from "./format";
import { foreAxis } from "./mount";
import {
  addCounts,
  fillLargestFirst,
  packInTurn,
  type Fill,
  type Load,
  type Packing,
  type Placed,
  type Sweep,
} from "./packing";
import { enabledContainers, type Row, type State } from "./state";

/* The selected ship and grid layout, falling back to the first of each. */
export function selection(ships: Ship[], state: Pick<State, "shipId" | "gridId">) {
  const ship = ships.find((s) => s.id === state.shipId) ?? ships[0];
  const grid = ship?.grids.find((g) => g.id === state.gridId) ?? ship?.grids[0];
  return { ship, grid, positions: grid?.positions ?? [] };
}

/* How much of a row goes in each of its grids, in the order it picked them,
   and `short`: how much of it there's no room for, so it needs splitting
   further. A row with no grid is short by what's more than any one holds. */
export type Part = { name: string; scu: number };
export type Split = { parts: Part[]; short: number };

/* Grids fill in the order they were picked, across all rows: each pick takes
   what it can of its row's remaining SCU from the room its grid has left, so
   a later pick never takes room from an earlier one, and no grid takes more
   than it holds. What's left of a row after all its picks is its `short`.
   Picks for grids not on this layout are ignored. */
export function splitRows(rows: Row[], positions: Position[]): Map<number, Split> {
  const room = new Map(positions.map((p) => [p.name, p.capacity]));
  const largest = Math.max(0, ...positions.map((p) => p.capacity));
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
    rows.map((row) => {
      const rowParts = parts.get(row.id)!;
      const rowRest = rest.get(row.id)!;
      const short = rowParts.length ? rowRest : positions.length ? Math.max(0, rowRest - largest) : 0;
      return [row.id, { parts: rowParts, short }];
    }),
  );
}

/* Why a row still needs splitting, or "" when it fits where it's going. */
export function shortText({ parts, short }: Split): string {
  if (!short) return "";
  if (!parts.length) return "More than any one grid holds. Choose grids to split it.";
  const where = parts.length === 1 ? "this grid has" : "these grids have";
  return `${fmt(short)} SCU more than ${where} room for. Choose another grid to split it.`;
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

/* A position's cargo: its SCU (more than its capacity when over) and where
   each container sits, tagged with its row's id. */
export type GridLoad = { scu: number; placed: Placed<number>[] };
export type Calc = {
  byRow: Map<number, Fill>;
  splits: Map<number, Split>;
  byPosition: Map<string, GridLoad>;
  totals: Fill & { scu: number };
  showLeftover: boolean;
};

/* Each part of a row only uses the container sizes turned on that fit its position;
   a row with no position, and what a row's grids have no room for, any size turned on. Each position is then packed a
   row at a time, in the order its rows picked it, to keep their cargo apart:
   the first from the fore end, later ones from aft (see packApart). */
export function computeTable(
  rows: Row[],
  enabled: State["enabled"],
  containers: Container[],
  positions: Position[],
): Calc {
  const usable = enabledContainers(containers, enabled);
  const byName = new Map(positions.map((p) => [p.name, p]));
  const sizesFor = (position: Position | undefined) =>
    usable.filter((c) => !position || fitsInside(c, position)).map((c) => c.size);

  const splits = splitRows(rows, positions);
  /* Each position's loads, a list per row with the order the row picked it. */
  const loads = new Map<string, { order: number; load: Load<number>[] }[]>(positions.map((p) => [p.name, []]));
  const byPosition = new Map<string, GridLoad>(positions.map((p) => [p.name, { scu: 0, placed: [] }]));
  const byRow = new Map<number, Fill>();
  const totals: Calc["totals"] = { scu: 0, leftover: 0, counts: Object.fromEntries(usable.map((c) => [c.size, 0])) };

  for (const row of rows) {
    const scu = parseScu(row.scu);
    const { parts } = splits.get(row.id)!;
    const inGrids = sum(parts, (p) => p.scu);
    /* What's in no grid (all of a row without one) is still counted, so a
       row's containers add up to its SCU. */
    const shares = [
      ...parts.map((p) => ({ ...p, position: byName.get(p.name) })),
      ...(!parts.length || scu > inGrids ? [{ scu: scu - inGrids, position: undefined }] : []),
    ];
    /* Counts list every size the row could use, so the table can grey out the rest. */
    const fill: Fill = { counts: {}, leftover: 0 };
    for (const { position } of shares) for (const size of sizesFor(position)) fill.counts[size] = 0;
    for (const { scu: shareScu, position } of shares) {
      if (!shareScu) continue;
      const part = fillLargestFirst(shareScu, sizesFor(position));
      addCounts(fill.counts, part.counts);
      fill.leftover += part.leftover;
      if (!position) continue;
      byPosition.get(position.name)!.scu += shareScu;
      const order = row.picks.find((p) => p.name === position.name)!.order;
      const load = containers
        .filter((container) => part.counts[container.size])
        .map((container) => ({ container, count: part.counts[container.size], tag: row.id }));
      loads.get(position.name)!.push({ order, load });
    }
    byRow.set(row.id, fill);
    totals.scu += scu;
    totals.leftover += fill.leftover;
    addCounts(totals.counts, fill.counts);
  }
  for (const position of positions) {
    /* Ties (from older saves) keep table order. The sort is stable. */
    const turns = loads
      .get(position.name)!
      .sort((a, b) => a.order - b.order)
      .map((t) => t.load);
    byPosition.get(position.name)!.placed = packApart(position, turns).placed;
  }
  return { byRow, splits, byPosition, totals, showLeftover: totals.leftover > 0 };
}
