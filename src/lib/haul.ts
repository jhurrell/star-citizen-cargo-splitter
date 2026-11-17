/* The Haul: everything the page shows about the deliveries in the selected
   ship, worked out from the saved state in one call. Each contract's sizes,
   which cargo grids each row is in, its container split, what each grid has
   room for, and how each grid is packed. Pure, so it can be unit tested
   through computeHaul. */

import { fitsInside, parseScu, type CargoGrid, type Container, type Layout, type Ship } from "./cargo";
import { sum } from "./format";
import { foreAxis } from "./mount";
import { addCounts, fillLargestFirst, loadGrid, type Counts, type Placed, type Sweep } from "./packing";
import { handsOut, rowsOn, type Contract, type LayoutRef, type Row, type Sort, type State } from "./state";

/* A container size's column: on when some contract hands the size out (for
   the haul), or when this one does (in a contract's header). */
export type SizeColumn = { size: number; on: boolean };

/* One cell under a size column: how many containers of that size, or none
   because the row's contract doesn't hand the size out. */
export type SizeCell = { kind: "count"; count: number } | { kind: "off" };

/* How much of a row goes in one of its grids. */
export type Part = { name: string; scu: number };

/* Why a row has remaining SCU: its plan has no grid, or its grids are out of room. */
export type RemainingReason = "noGrid" | "outOfRoom";

/* Why a row can't add a cargo grid to its plan:
   - "full": the grid has no room for any container.
   - "allPlaced": all of the row is in its grids already.
   - "tooSmall": none of the row's containers still to place would go in it. */
export type GridBlock = "full" | "allPlaced" | "tooSmall";

/* A row's button for one cargo grid: whether the grid is in the row's plan,
   and if not, why it can't be added (null when it can). */
export type GridChoice = { name: string; inPlan: boolean; block: GridBlock | null };

/* One row of the table, worked out. */
export type Delivery = {
  row: Row;
  /* Its contract's label. */
  contract: string;
  scu: number;
  /* The grids it's in, in its plan's order, with the SCU each takes. */
  parts: Part[];
  /* Its remaining SCU: in no grid yet. */
  remaining: number;
  remainingReason: RemainingReason | null;
  /* Its container split: one per size column, in column order. */
  cells: SizeCell[];
  /* SCU no turned-on size can make up. */
  leftover: number;
  /* One per cargo grid on the layout, in layout order. */
  grids: GridChoice[];
};

/* A cargo grid on the layout: the SCU it has free, whether no size any contract hands out
   can still go in, and where each container sits, tagged with its row's id. */
export type HaulGrid = { grid: CargoGrid; free: number; full: boolean; placed: Placed<number>[] };

/* The totals of some deliveries: SCU, remaining SCU, containers of each size
   and left over. */
export type Totals = { scu: number; remaining: number; cells: SizeCell[]; leftover: number };

/* One contract's table. */
export type ContractSection = {
  id: number;
  name: string;
  /* Its name, or "Contract N" by its place on the page. */
  label: string;
  sort: Sort;
  /* Whether its table is hidden. */
  collapsed: boolean;
  /* On for each size it hands out. */
  sizes: SizeColumn[];
  deliveries: Delivery[];
  /* Its total SCU is the one to check against the game's contract. */
  totals: Totals;
  /* Whether any of its rows has leftover, so its Left over column shows. */
  showLeftover: boolean;
  /* Whether any of its rows is in a grid, so its Reset has something to reset. */
  anyPlanned: boolean;
};

export type Haul = {
  ship: Ship | undefined;
  layout: Layout | undefined;
  /* The selected ship and layout's ids, for adding grids to plans and clearing them. */
  at: LayoutRef;
  sizes: SizeColumn[];
  contracts: ContractSection[];
  /* Every row, in table order. */
  deliveries: Delivery[];
  /* One per cargo grid on the layout, in layout order. */
  grids: HaulGrid[];
  /* The whole haul's totals, and the SCU free across all the grids. */
  totals: Totals & { free: number };
  /* Whether any row has leftover, so the Left over column shows. */
  showLeftover: boolean;
  /* Whether any row is in a grid, so there's something to clear. */
  anyPlanned: boolean;
};

/* The ship and layout a state's choice selects ("" is the first of each),
   and their ids. */
export function layoutOf(ships: Ship[], choice: Pick<State, "shipId" | "layoutId">) {
  const ship = ships.find((s) => s.id === choice.shipId) ?? ships[0];
  const layout = ship?.layouts.find((l) => l.id === choice.layoutId) ?? ship?.layouts[0];
  const at: LayoutRef = { ship: ship?.id ?? "", layout: layout?.id ?? "" };
  return { ship, layout, at };
}

/* Work out the Haul for the selected ship and layout, counting only the
   plan steps on that layout. */
export function computeHaul(state: State, ships: Ship[], containers: Container[]): Haul {
  const { ship, layout, at } = layoutOf(ships, state);
  const cargoGrids = layout?.grids ?? [];
  const contracts = state.contracts.map((c) => ({ ...c, rows: rowsOn(c.rows, at) }));
  /* Each row with the sizes its contract hands out, largest first. */
  const rows = contracts.flatMap((c) =>
    c.rows.map((row) => ({ row, sizes: containers.filter((k) => handsOut(c, k.size)).map((k) => k.size) })),
  );

  const anyHandsOut = (size: number) => contracts.some((c) => handsOut(c, size));
  const sizes: SizeColumn[] = containers.map(({ size }) => ({ size, on: anyHandsOut(size) }));
  const usable = containers.filter((c) => anyHandsOut(c.size));
  /* The sizes some contract hands out that fit each cargo grid's shape, largest first. */
  const fitting = new Map(cargoGrids.map((g) => [g.name, usable.filter((c) => fitsInside(c, g)).map((c) => c.size)]));
  const sizesFor = (grid: CargoGrid) => fitting.get(grid.name)!;
  const bySize = new Map(containers.map((c) => [c.size, c]));

  const filled = fillGrids(rows, cargoGrids, containers);
  const counted = new Map(
    rows.map(({ row }) => {
      const { parts, split, left } = filled.rows.get(row.id)!;
      /* A layout with no grids leaves nothing to place. */
      const remaining = cargoGrids.length ? scuOf(left) : 0;
      return [row.id, { row, scu: parseScu(row.scu), parts, remaining, left, ...split }];
    }),
  );

  /* Whether a container of each size could still go in each grid. */
  const room = new Map(
    cargoGrids.map((grid) => {
      const load = filled.loads.get(grid.name)!;
      const fits = new Map(sizesFor(grid).map((size) => [size, load.canPlace(bySize.get(size)!)]));
      return [grid.name, (size: number) => fits.get(size) ?? false];
    }),
  );
  const grids: HaulGrid[] = cargoGrids.map((grid) => {
    const placed = filled.loads.get(grid.name)!.placed();
    return {
      grid,
      free: grid.capacity - sum(placed, (p) => p.size),
      full: !sizesFor(grid).some(room.get(grid.name)!),
      placed,
    };
  });

  /* Counts under the sizes `on` says are in. */
  const cellsOf = (counts: Counts, on: (size: number) => boolean): SizeCell[] =>
    sizes.map(({ size }) => (on(size) ? { kind: "count", count: counts[size] ?? 0 } : { kind: "off" }));
  const deliveryOf = (row: Row, contract: Contract, label: string): Delivery => {
    const { scu, parts, remaining, left, counts, leftover } = counted.get(row.id)!;
    return {
      row,
      contract: label,
      scu,
      parts,
      remaining,
      remainingReason: !remaining ? null : parts.length ? "outOfRoom" : "noGrid",
      cells: cellsOf(counts, (size) => handsOut(contract, size)),
      leftover,
      grids: grids.map(({ grid, full }) => {
        const inPlan = parts.some((p) => p.name === grid.name);
        /* A grid already in the row's plan can still be taken out. */
        const block = inPlan ? null : gridBlock(scu, remaining, full, left, room.get(grid.name)!);
        return { name: grid.name, inPlan, block };
      }),
    };
  };
  /* The totals of some deliveries, with counts under the sizes `on` says are in. */
  const totalsOf = (deliveries: Delivery[], on: (size: number) => boolean): Totals => ({
    scu: sum(deliveries, (d) => d.scu),
    remaining: sum(deliveries, (d) => d.remaining),
    cells: cellsOf(
      deliveries.reduce((total, d) => addCounts(total, counted.get(d.row.id)!.counts), {} as Counts),
      on,
    ),
    leftover: sum(deliveries, (d) => d.leftover),
  });
  const sections: ContractSection[] = contracts.map((contract, i) => {
    const label = contract.name.trim() || `Contract ${i + 1}`;
    const deliveries = contract.rows.map((row) => deliveryOf(row, contract, label));
    return {
      id: contract.id,
      name: contract.name,
      label,
      sort: contract.sort,
      collapsed: contract.collapsed,
      sizes: containers.map(({ size }) => ({ size, on: handsOut(contract, size) })),
      deliveries,
      totals: totalsOf(deliveries, (size) => handsOut(contract, size)),
      showLeftover: deliveries.some((d) => d.leftover > 0),
      anyPlanned: deliveries.some((d) => d.parts.length > 0),
    };
  });
  const deliveries = sections.flatMap((c) => c.deliveries);
  const totals = totalsOf(deliveries, anyHandsOut);
  return {
    ship,
    layout,
    at,
    sizes,
    contracts: sections,
    deliveries,
    grids,
    totals: { ...totals, free: sum(grids, (g) => g.free) },
    showLeftover: totals.leftover > 0,
    anyPlanned: deliveries.some((d) => d.parts.length > 0),
  };
}

/* Each row comes in its container split: its SCU made into containers once,
   largest first, from the sizes its contract hands out, as the game hands
   them over, whatever grids it goes in. Grids then fill in loading plan order, across
   all rows: each step offers its grid the row's containers still to place,
   and the grid takes those it can (see loadGrid). The rest move on, whole, to
   the row's next step; what's left after the last is its remaining SCU. So a
   later step never takes room from an earlier one, a grid never takes more
   than it holds, and the table and ship view agree. Steps for grids not on
   this layout are ignored. */
function fillGrids(rows: { row: Row; sizes: number[] }[], cargoGrids: CargoGrid[], containers: Container[]) {
  const byName = new Set(cargoGrids.map((g) => g.name));
  const bySize = new Map(containers.map((c) => [c.size, c]));
  const loads = new Map(cargoGrids.map((g) => [g.name, loadGrid<number>(g, sweepOf(g))]));
  const filled = new Map(
    rows.map(({ row, sizes }) => {
      const split = fillLargestFirst(parseScu(row.scu), sizes);
      return [row.id, { parts: [] as Part[], split, left: { ...split.counts }, sizes }];
    }),
  );
  const steps = rows
    .flatMap(({ row }) => row.plan.filter((step) => byName.has(step.name)).map((step) => ({ ...step, rowId: row.id })))
    .sort((a, b) => a.order - b.order);
  for (const { rowId, name } of steps) {
    const { parts, left, sizes } = filled.get(rowId)!;
    const load = sizes
      .filter((size) => left[size])
      .map((size) => ({ container: bySize.get(size)!, count: left[size], tag: rowId }));
    const unfit = loads.get(name)!.add(load);
    const before = scuOf(left);
    for (const { container } of load) left[container.size] = unfit[container.size] ?? 0;
    parts.push({ name, scu: before - scuOf(left) });
  }
  return { loads, rows: filled };
}

/* The SCU of some containers. */
const scuOf = (counts: Counts) => sum(Object.entries(counts), ([size, n]) => Number(size) * n);

/* Why a row can't add a cargo grid to its plan (see GridBlock), or null if
   it can. A row with no SCU yet can add any grid with room. */
function gridBlock(
  scu: number,
  remaining: number,
  full: boolean,
  left: Counts,
  canPlace: (size: number) => boolean,
): GridBlock | null {
  if (full) return "full";
  if (!remaining) return scu > 0 ? "allPlaced" : null;
  return Object.keys(left).some((size) => left[Number(size)] > 0 && canPlace(Number(size))) ? null : "tooSmall";
}

/* Load a cargo grid from its fore end toward aft when its grid face runs
   fore–aft (so cargo added later loads from aft toward fore); otherwise (or
   with no place on the ship) a layer at a time from its grid face. */
function sweepOf(grid: CargoGrid): Sweep {
  const fore = grid.mount && foreAxis(grid.mount);
  return fore ? { axis: fore.axis, reverse: fore.pointsFore } : { axis: "z" };
}
