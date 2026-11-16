import { describe, expect, test } from "vite-plus/test";
import { axesOf, boundsOf, cameraPosition, isMounted, type Mounted } from "../src/components/ship/scene";
import { shipPositions } from "./helpers";

/* A 2 × 4 × 1 grid whose floor is centred on the origin. */
const flat: Mounted = {
  name: "Flat",
  x: 2,
  y: 4,
  z: 1,
  capacity: 8,
  mount: { at: [0, 0, 0], roll: 0, pitch: 0, yaw: 0 },
};

describe("boundsOf", () => {
  test("boxes a grid from its floor centre up", () => {
    expect(boundsOf([flat])).toMatchObject({ min: [-1, -2, 0], max: [1, 2, 1], center: [0, 0, 0.5] });
  });

  test("has a default for no grids", () => {
    expect(boundsOf([])).toEqual({ min: [0, 0, 0], max: [0, 0, 0], center: [0, 0, 0], radius: 10 });
  });

  test("boxes every grid of a configured ship", () => {
    const grids = shipPositions("ship-misc-hull-b").filter(isMounted);
    const { min, max } = boundsOf(grids);
    for (let i = 0; i < 3; i++) expect(max[i]).toBeGreaterThan(min[i]);
  });
});

describe("axesOf", () => {
  test("runs fore–aft past both ends, and top–bottom down to the ground", () => {
    const bounds = boundsOf([flat]);
    const [foreAft, , topBottom] = axesOf(bounds);
    expect(foreAft.from[1]).toBeLessThan(bounds.min[1]);
    expect(foreAft.to[1]).toBeGreaterThan(bounds.max[1]);
    expect(topBottom.from[2]).toBeLessThan(bounds.min[2]);
  });
});

describe("cameraPosition", () => {
  test("looks down from above for the top view", () => {
    const [x, , z] = cameraPosition("top", boundsOf([flat]));
    expect(x).toBe(0);
    expect(z).toBeGreaterThan(10);
  });
});
