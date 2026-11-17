import { describe, expect, test } from "vite-plus/test";
import {
  axesOf,
  boundsOf,
  cameraPosition,
  containerBox,
  GAP,
  isMounted,
  sizeMarksOf,
  type Mounted,
} from "../src/components/ship/scene";
import { rotationOf, type Mount, type Vec3 } from "../src/lib/mount";
import type { Box } from "../src/lib/packing";
import { allShips, shipPositions } from "./helpers";

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

describe("containerBox", () => {
  test("is the container's cells less the gap, about their centre", () => {
    expect(containerBox({ x: 2, y: 0, z: 1, w: 2, d: 4, h: 2 })).toEqual({
      center: [3, 2, 2],
      scale: [2 - GAP, 4 - GAP, 2 - GAP],
    });
  });
});

describe("sizeMarksOf", () => {
  const box: Box = { x: 0, y: 0, z: 0, w: 2, d: 8, h: 2 }; // a 32 SCU container
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const inShip = (mount: Mount, v: Vec3) => rotationOf(mount).map((row) => dot(row, v)) as Vec3;

  test("reads upright in the ship on every grid: sides top-up, tops and bottoms top-fore", () => {
    const wrong: string[] = [];
    for (const ship of allShips)
      for (const layout of ship.grids)
        for (const { name, mount } of layout.positions.filter(isMounted)) {
          for (const mark of sizeMarksOf(box, mount)) {
            const facing = inShip(mount, mark.normal);
            const up = inShip(mount, mark.up);
            const sideways = Math.abs(facing[2]) <= Math.SQRT1_2 + 1e-9;
            /* At least as much as a 45° tilt allows. */
            if ((sideways ? up[2] : up[1]) < Math.SQRT1_2 - 1e-9)
              wrong.push(`${ship.id} ${name} [${mark.normal.join()}]`);
          }
        }
    expect(wrong).toEqual([]);
  });

  test("turns a hanging grid's side numbers over, and leaves its tops pointing fore", () => {
    const hanging: Mount = { at: [0, 0, 0], roll: 180, pitch: 0, yaw: 0 }; // the Argo RAFT's grid
    const marks = sizeMarksOf(box, hanging);
    expect(marks.find((m) => m.normal[0] === 1)!.up).toEqual([0, 0, -1]);
    expect(marks.find((m) => m.normal[2] === 1)!.up).toEqual([0, 1, 0]);
  });

  test("sits just off each face, square to it, and fits on it", () => {
    const level: Mount = { at: [0, 0, 0], roll: 0, pitch: 0, yaw: 0 };
    const half: Vec3 = [1 - GAP / 2, 4 - GAP / 2, 1 - GAP / 2];
    const { center } = containerBox(box);
    for (const mark of sizeMarksOf(box, level)) {
      const out = mark.at.map((a, i) => a - center[i]) as Vec3;
      expect(dot(out, mark.normal)).toBeCloseTo(Math.abs(dot(half, mark.normal)) + 0.01);
      expect([dot(mark.up, mark.normal), dot(mark.right, mark.normal), dot(mark.up, mark.right)]).toEqual([0, 0, 0]);
      const width = 2 * Math.abs(dot(half, mark.right));
      const height = 2 * Math.abs(dot(half, mark.up));
      expect(mark.side).toBeLessThan(Math.min(width, height));
    }
    /* The end faces are the container's 2 × 2 ends; the long sides are 8 long but 2 high. */
    expect(sizeMarksOf(box, level).map((m) => m.side.toFixed(2))).toEqual(Array(6).fill(((2 - GAP) * 0.7).toFixed(2)));
  });
});
