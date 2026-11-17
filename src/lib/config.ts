import rawContainers from "../config/containers.json";
import rawShips from "../config/ships.json";
import { parseContainers, parseShips } from "./cargo";

/* Container sizes and ships, read once from containers.json and ships.json,
   which are bundled into the app. A JSON syntax error stops the build
   instead, with its line number. Whatever is usable is used: without sizes
   all cargo shows as Left over, and without ships there are no cargo grids. */
export const containers = parseContainers(rawContainers);
export const ships = parseShips(rawShips);

/* Shown in place of the ship summary when either file has nothing usable. */
export const configError = [
  containers.length ? "" : "Couldn't read containers.json: it lists no usable containers.",
  ships.length ? "" : "Couldn't read ships.json: it lists no usable ships.",
]
  .filter(Boolean)
  .join(" ");
