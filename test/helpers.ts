import ships from "../src/config/ships.json";
import { parseShips, placementsOf, type CargoGrid, type Container, type Ship } from "../src/lib/cargo";
import { computeHaul, type Haul } from "../src/lib/haul";
import { makeRow, type Contract, type LayoutRef, type Row, type State } from "../src/lib/state";

/* Test fixtures shared by several test files. */

export const container = (size: number, x: number, y: number, z: number, lieFlat = true): Container => ({
  size,
  placements: placementsOf({ x, y, z }, lieFlat),
});

/* 32, 8 and 1 SCU containers, as containers.json has them. */
export const containers = [container(32, 2, 8, 2), container(8, 2, 2, 2), container(1, 1, 1, 1)];

/* A cargo grid with no place on the ship. */
export const bay = (name: string, x: number, y: number, z: number): CargoGrid => ({
  name,
  x,
  y,
  z,
  capacity: x * y * z,
  mount: null,
});

/* The ships in ships.json. */
export const allShips: Ship[] = parseShips(ships);

/* A ship's first layout, from ships.json. */
const firstLayout = (id: string) => allShips.find((s) => s.id === id)!.layouts[0];

/* The cargo grids of a ship's first layout, from ships.json. */
export const shipGrids = (id: string): CargoGrid[] => firstLayout(id).grids;

/* A ship with one layout of these cargo grids, and where its plan steps go. */
export const TEST_AT: LayoutRef = { ship: "test-ship", layout: "test-layout" };
const testShip = (grids: CargoGrid[]): Ship => ({
  id: TEST_AT.ship,
  name: "Test ship",
  layouts: [{ id: TEST_AT.layout, name: "Test layout", grids }],
});

/* A row whose plan is on the test ship. */
export const testRow = (values: Parameters<typeof makeRow>[0] = {}): Row => makeRow(values, TEST_AT);

/* A contract of these rows, handing out every size but those `enabled` turns off. */
let nextContract = 1;
export const contractOf = (
  rows: Row[],
  sizes: Partial<Pick<Contract, "name" | "enabled" | "sort">> = {},
): Contract => ({
  id: nextContract++,
  name: "",
  enabled: {},
  sort: null,
  collapsed: false,
  ...sizes,
  rows,
});

/* The Haul for these contracts on a test ship with these cargo grids. */
export function haulOfContracts(contracts: Contract[], grids: CargoGrid[]): Haul {
  const state: State = { shipId: TEST_AT.ship, layoutId: TEST_AT.layout, contracts };
  return computeHaul(state, [testShip(grids)], containers);
}

/* The Haul for these rows, all in one contract, on a test ship with these cargo grids. */
export const haulOf = (rows: Row[], grids: CargoGrid[], enabled: Contract["enabled"] = {}): Haul =>
  haulOfContracts([contractOf(rows, { enabled })], grids);

/* The Haul for these rows, in one contract, on a ship from ships.json, on its first layout. */
export function haulOnShip(shipId: string, rows: Row[]): Haul {
  return computeHaul({ shipId, layoutId: "", contracts: [contractOf(rows)] }, allShips, containers);
}

/* A row whose plan is on a ships.json ship's first layout. */
export const shipRow = (shipId: string, values: Parameters<typeof makeRow>[0]): Row =>
  makeRow(values, { ship: shipId, layout: firstLayout(shipId).id });
