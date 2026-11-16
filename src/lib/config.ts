import raw from "../../config.json";
import { parseContainers, parseShips } from "./cargo";

/* Container sizes and ships, read once from config.json, which is bundled into
   the app. A JSON syntax error stops the build instead, with its line number.
   Whatever is usable is used: without sizes all cargo shows as Left over, and
   without ships there are no positions. */
export const containers = parseContainers(raw);
export const ships = parseShips(raw);

const missing = [containers.length ? "" : "containers", ships.length ? "" : "ships"].filter(Boolean);
/* Shown in place of the ship summary when config.json can't be used. */
export const configError = missing.length
  ? `Couldn't read config.json: it lists no usable ${missing.join(" or ")}.`
  : "";
