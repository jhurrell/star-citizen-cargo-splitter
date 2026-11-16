/* What the page works out from its state: which grids each row goes in, the
   containers each row needs, and how each grid is packed. Pure functions, so
   they can be unit tested. */

import { fitsInside, parseScu, type Container, type Position, type Ship } from "./cargo";
import { fmt } from "./format";
import { foreAxis } from "./mount";
import { addCounts, fillLargestFirst, packContainers, type Fill, type Load, type Placed, type Sweep } from "./packing";
import { isEnabled, type Row, type State } from "./state";

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
   a later pick never takes room from an earlier one. What's left of a row
   after all its picks still goes in its last-picked grid, so that grid shows
   as over capacity. Picks for grids not on this layout are ignored. */
export function splitRows(rows: Row[], positions: Position[]): Map<number, Split> {
  const room = new Map(positions.map((p) => [p.name, p.capacity]));
  const largest = Math.max(0, ...positions.map((p) => p.capacity));
  const rest = new Map(rows.map((row) => [row.id, parseScu(row.scu)]));
  const parts = new Map(rows.map((row) => [row.id, [] as Part[]]));
  const take = (rowId: number, name: string, scu: number) => {
    rest.set(rowId, rest.get(rowId)! - scu);
    room.set(name, room.get(name)! - scu);
  };

  /* Ties (from older saves) go by table order. The sort is stable. */
  const picks = rows
    .flatMap((row) => row.picks.filter((p) => room.has(p.name)).map((p) => ({ ...p, rowId: row.id })))
    .sort((a, b) => a.order - b.order);
  for (const { rowId, name } of picks) {
    const scu = Math.min(rest.get(rowId)!, Math.max(0, room.get(name)!));
    parts.get(rowId)!.push({ name, scu });
    take(rowId, name, scu);
  }

  const splits = new Map<number, Split>();
  for (const row of rows) {
    const rowParts = parts.get(row.id)!;
    const short = rest.get(row.id)!;
    const last = rowParts[rowParts.length - 1];
    if (last) {
      last.scu += short;
      take(row.id, last.name, short);
      splits.set(row.id, { parts: rowParts, short });
    } else {
      splits.set(row.id, { parts: [], short: positions.length ? Math.max(0, short - largest) : 0 });
    }
  }
  return splits;
}

/* Why a row still needs splitting, or "" when it fits where it's going. */
export function shortText({ parts, short }: Split): string {
  if (!short) return "";
  if (!parts.length) return "More than any one grid holds. Choose grids to split it.";
  const where = parts.length === 1 ? "this grid has" : "these grids have";
  return `${fmt(short)} SCU more than ${where} room for. Choose another grid to split it.`;
}

/* Load a position from its fore end toward aft when its floor runs fore–aft;
   otherwise (or with no place on the ship) a layer at a time from its floor. */
function sweepOf(position: Position): Sweep {
  const fore = position.mount && foreAxis(position.mount);
  return fore ? { axis: fore.axis, reverse: fore.pointsFore } : { axis: "z" };
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

/* Each part of a row only uses checked container sizes that fit its position
   (a row with no position, any checked size); each position is then packed. */
export function computeTable(
  rows: Row[],
  enabled: State["enabled"],
  containers: Container[],
  positions: Position[],
): Calc {
  const usable = containers.filter((c) => isEnabled(enabled, c.size));
  const byName = new Map(positions.map((p) => [p.name, p]));
  const sizesFor = (position: Position | undefined) =>
    usable.filter((c) => !position || fitsInside(c, position)).map((c) => c.size);

  const splits = splitRows(rows, positions);
  const loads = new Map<string, Load<number>[]>(positions.map((p) => [p.name, []]));
  const byPosition = new Map<string, GridLoad>(positions.map((p) => [p.name, { scu: 0, placed: [] }]));
  const byRow = new Map<number, Fill>();
  const totals: Calc["totals"] = { scu: 0, leftover: 0, counts: Object.fromEntries(usable.map((c) => [c.size, 0])) };

  for (const row of rows) {
    const scu = parseScu(row.scu);
    const { parts } = splits.get(row.id)!;
    const shares = parts.length
      ? parts.map((p) => ({ ...p, position: byName.get(p.name) }))
      : [{ scu, position: undefined }];
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
      for (const container of containers) {
        const count = part.counts[container.size];
        if (count) loads.get(position.name)!.push({ container, count, tag: row.id });
      }
    }
    byRow.set(row.id, fill);
    totals.scu += scu;
    totals.leftover += fill.leftover;
    addCounts(totals.counts, fill.counts);
  }
  for (const position of positions)
    byPosition.get(position.name)!.placed = packContainers(
      position,
      loads.get(position.name)!,
      sweepOf(position),
    ).placed;
  return { byRow, splits, byPosition, totals, showLeftover: totals.leftover > 0 };
}
