import config from "../config.json";
import { parseShips, placementsOf, type Container, type Position } from "../src/lib/cargo";

/* Test fixtures shared by several test files. */

export const container = (size: number, x: number, y: number, z: number, lieFlat = true): Container => ({
  size,
  placements: placementsOf({ x, y, z }, lieFlat),
});

/* 32, 8 and 1 SCU containers, as config.json has them. */
export const containers = [container(32, 2, 8, 2), container(8, 2, 2, 2), container(1, 1, 1, 1)];

/* A position with no place on the ship. */
export const bay = (name: string, x: number, y: number, z: number): Position => ({
  name,
  x,
  y,
  z,
  capacity: x * y * z,
  mount: null,
});

/* A ship's first layout, from config.json. */
export const shipPositions = (id: string): Position[] =>
  parseShips(config).find((s) => s.id === id)!.grids[0].positions;
