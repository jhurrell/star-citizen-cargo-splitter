import type { Container, Shape } from "./cargo";

/* Turning a row's SCU into containers, and packing containers into a grid.
   Pure functions, so they can be unit tested. */

/* Container counts by size, e.g. { 32: 2, 8: 1 }. */
export type Counts = Record<number, number>;
export type Fill = { counts: Counts; leftover: number };
export type Box = { x: number; y: number; z: number; w: number; d: number; h: number };
export type Load<Tag> = { container: Container; count: number; tag: Tag };
export type Placed<Tag> = Box & { size: number; tag: Tag };
export type Packing<Tag> = { placed: Placed<Tag>[]; unfit: Counts };

/* Fill `scu` using `sizes` (largest first): as many of the biggest as fit,
   then the next size down. */
export function fillLargestFirst(scu: number, sizes: number[]): Fill {
  const counts: Counts = {};
  let rest = scu;
  for (const size of sizes) {
    counts[size] = Math.floor(rest / size);
    rest -= counts[size] * size;
  }
  return { counts, leftover: rest };
}

/* Add `extra` into `into`, in place. */
export function addCounts(into: Counts, extra: Counts): Counts {
  for (const [size, n] of Object.entries(extra)) into[Number(size)] = (into[Number(size)] ?? 0) + n;
  return into;
}

/* Which way packing sweeps a space. "z" fills the bottom layer before the
   next. "x" or "y" fills along that face axis from 0 instead, each spot as
   high as it stacks before moving on; `reverse` then mirrors the result so it
   fills from the far end (the fore end, say). */
export type Sweep = { axis: "x" | "y" | "z"; reverse?: boolean };

/* Pack containers into a space of x × y × z SCU cells (z is height). `tag`
   says whose cargo each container is. Each container sits in one of its
   placements (see placementsOf), on the grid face or wholly on top of others.
   Greedy: biggest first, each in the first spot that takes it, in `sweep`
   order. This can miss a packing that exists, so it may report a load as not
   fitting when a cleverer layout would. */
export function packContainers<Tag>(space: Shape, load: Load<Tag>[], sweep: Sweep = { axis: "z" }): Packing<Tag> {
  return packInTurn(space, [load], sweep);
}

/* Pack loads one after another, each biggest first, to keep them apart: the
   first from the start of a face-axis sweep, every later one from its far
   end, so the first sits at one end and the rest build up from the other. A
   "z" sweep has no far end, so each just takes the next free spots. A load's
   containers go on the grid face or on its own containers where they can, and on
   another load's only when there's nowhere else. */
export function packInTurn<Tag>(space: Shape, loads: Load<Tag>[][], sweep: Sweep = { axis: "z" }): Packing<Tag> {
  const packing = startPacking<Tag>(space, sweep);
  const unfit: Counts = {};
  for (const load of loads) addCounts(unfit, packing.add(load));
  return { placed: packing.placed(), unfit };
}

/* A grid filled a load (one row's containers) at a time, as packInTurn packs
   them. A load that doesn't all fit apart from the loads before it may make
   the grid repack everything as one pile, mixing loads, when that keeps every
   container already in it and places more of the new load. So a load never
   loses room to a later one, though its containers may move. */
export type GridLoad<Tag> = {
  /* Place what of a load fits, and say what doesn't, by size. */
  add(load: Load<Tag>[]): Counts;
  /* Whether a container could still go in, on the grid face or on others. */
  canPlace(container: Container): boolean;
  placed(): Placed<Tag>[];
};

export function loadGrid<Tag>(space: Shape, sweep: Sweep = { axis: "z" }): GridLoad<Tag> {
  let packing = startPacking<Tag>(space, sweep);
  /* What's in the grid, in the order it was added. */
  const kept: Load<Tag>[] = [];
  return {
    add(load) {
      const apart = startPacking(space, sweep, packing.state);
      let unfit = apart.add(load);
      packing = apart;
      if (scuOf(unfit)) {
        const pile = startPacking<Tag>(space, sweep);
        const pileUnfit = pile.add([...kept, ...load]);
        /* A pile places each size in the order added, so what it leaves out
           of a size is the last of it: the new load's, when there's no more
           of that size than the new load has. */
        const loadCounts = countsOf(load);
        const keepsAll = Object.entries(pileUnfit).every(([size, n]) => n <= (loadCounts[Number(size)] ?? 0));
        if (keepsAll && scuOf(pileUnfit) < scuOf(unfit)) [packing, unfit] = [pile, pileUnfit];
      }
      kept.push(...without(load, unfit));
      return unfit;
    },
    canPlace: (container) => packing.canPlace(container),
    placed: () => packing.placed(),
  };
}

/* The SCU of some containers. */
const scuOf = (counts: Counts) => Object.entries(counts).reduce((total, [size, n]) => total + Number(size) * n, 0);

const countsOf = <Tag>(load: Load<Tag>[]) =>
  addCounts({}, Object.fromEntries(load.map((l) => [l.container.size, l.count])));

/* A load less `unfit`, taken from the last of each size. */
function without<Tag>(load: Load<Tag>[], unfit: Counts): Load<Tag>[] {
  const left = { ...unfit };
  return [...load]
    .reverse()
    .map((l) => {
      const out = Math.min(l.count, left[l.container.size] ?? 0);
      left[l.container.size] = (left[l.container.size] ?? 0) - out;
      return { ...l, count: l.count - out };
    })
    .reverse()
    .filter((l) => l.count > 0);
}

/* What a packing so far holds: each cell's load (its turn + 1, or 0 while
   empty), the containers placed (unmirrored, see Sweep), and how many loads. */
type PackState<Tag> = { filled: Uint16Array; boxes: Placed<Tag>[]; turns: number };

/* A space packed a load at a time, carrying on from `from` if given. */
function startPacking<Tag>(space: Shape, sweep: Sweep, from?: PackState<Tag>) {
  const { x: X, y: Y, z: Z } = space;
  const state: PackState<Tag> = from
    ? { filled: from.filled.slice(), boxes: [...from.boxes], turns: from.turns }
    : { filled: new Uint16Array(X * Y * Z), boxes: [], turns: 0 };
  const { filled } = state;
  const cell = (x: number, y: number, z: number) => (z * Y + y) * X + x;
  const everyCell = (box: Box, test: (i: number) => boolean) => {
    for (let z = box.z; z < box.z + box.h; z++)
      for (let y = box.y; y < box.y + box.d; y++)
        for (let x = box.x; x < box.x + box.w; x++) if (!test(cell(x, y, z))) return false;
    return true;
  };
  const isFree = (box: Box) => everyCell(box, (i) => !filled[i]);
  /* On the grid face or wholly on containers; with `turn`, only that load's. */
  const isSupported = (box: Box, turn?: number) =>
    box.z === 0 ||
    everyCell({ ...box, z: box.z - 1, h: 1 }, (i) => (turn === undefined ? filled[i] > 0 : filled[i] === turn + 1));
  const occupy = (box: Box, turn: number) =>
    everyCell(box, (i) => {
      filled[i] = turn + 1;
      return true;
    });
  const fits = (box: Box, onTurn?: number) =>
    box.x >= 0 &&
    box.y >= 0 &&
    box.x + box.w <= X &&
    box.y + box.d <= Y &&
    box.z + box.h <= Z &&
    isSupported(box, onTurn) &&
    isFree(box);

  /* The first spot for a container, in sweep order, on the grid face or on its
     own load's containers; failing that, on any. */
  const findSpot = (container: Container, turn: number) =>
    findSpotOn(container, turn > 0, turn) ?? findSpotOn(container, turn > 0);

  /* The first spot that takes a container, in sweep order, resting only on
     `onTurn`'s containers if given. For "z": each layer from the grid face. For a
     face axis: each step along it, then up, then across; from its far end,
     the container's far edge goes at each step. */
  function findSpotOn({ placements }: Container, fromEnd: boolean, onTurn?: number): Box | null {
    if (sweep.axis === "z") {
      for (let z = 0; z < Z; z++)
        for (let y = 0; y < Y; y++)
          for (let x = 0; x < X; x++)
            for (const [w, d, h] of placements) if (fits({ x, y, z, w, d, h }, onTurn)) return { x, y, z, w, d, h };
      return null;
    }
    const alongX = sweep.axis === "x";
    const [length, width] = alongX ? [X, Y] : [Y, X];
    for (let step = 0; step < length; step++)
      for (let z = 0; z < Z; z++)
        for (let b = 0; b < width; b++)
          for (const [w, d, h] of placements) {
            const a = fromEnd ? length - step - (alongX ? w : d) : step;
            const box = alongX ? { x: a, y: b, z, w, d, h } : { x: b, y: a, z, w, d, h };
            if (fits(box, onTurn)) return box;
          }
    return null;
  }

  return {
    state,
    /* Pack a load, biggest first, and say what doesn't fit, by size. */
    add(load: Load<Tag>[]): Counts {
      const turn = state.turns++;
      const unfit: Counts = {};
      /* The sort is stable, so cargo of one size keeps its order. */
      for (const { container, count, tag } of [...load].sort((a, b) => b.container.size - a.container.size)) {
        const { size } = container;
        for (let n = 0; n < count; n++) {
          /* Space only shrinks, so once a size fails, the rest of that size fails too. */
          const spot = unfit[size] ? null : findSpot(container, turn);
          if (!spot) {
            unfit[size] = (unfit[size] ?? 0) + count - n;
            break;
          }
          occupy(spot, turn);
          state.boxes.push({ ...spot, size, tag });
        }
      }
      return unfit;
    },
    canPlace: (container: Container) => findSpotOn(container, false) !== null,
    /* Where each container sits, mirrored for a reverse sweep. */
    placed: (): Placed<Tag>[] =>
      state.boxes.map((box) => ({
        ...box,
        x: sweep.reverse && sweep.axis === "x" ? X - box.x - box.w : box.x,
        y: sweep.reverse && sweep.axis === "y" ? Y - box.y - box.d : box.y,
      })),
  };
}
