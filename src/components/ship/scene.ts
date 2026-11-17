/* The ship view's layout: each container's box and size numbers in its
   grid, and in ship coordinates the box around the cargo, the axes and labels
   around it, and where the camera looks from. Pure functions, so they can be
   unit tested; the components only hand the numbers to three.js. */

import type { Position } from "../../lib/cargo";
import { rotationOf, toShip, type Mount, type Vec3 } from "../../lib/mount";
import type { Box } from "../../lib/packing";

export type Mounted = Position & { mount: Mount };
/* A text label pinned to a ship point; drawn as HTML over the canvas. */
export type Label = { key: string; text: string; at: Vec3; className: string };
export type Bounds = { min: Vec3; max: Vec3; center: Vec3; radius: number };
export type View = "3d" | "top" | "bottom" | "port" | "starboard" | "fore" | "aft";

/* Where the camera looks from, as a direction from the ship's centre. The top
   and bottom views lean a hair aft and fore so "up" on screen is fore. */
export const VIEWS: Record<View, { label: string; from: Vec3 }> = {
  "3d": { label: "3D", from: [-0.9, -0.7, 0.8] }, // from port, aft and above
  top: { label: "Top", from: [0, -0.001, 1] },
  bottom: { label: "Bottom", from: [0, 0.001, -1] },
  port: { label: "Port side", from: [-1, 0, 0] },
  starboard: { label: "Starboard side", from: [1, 0, 0] },
  fore: { label: "From fore", from: [0, 1, 0] },
  aft: { label: "From aft", from: [0, -1, 0] },
};
export const FOV = 40;
export const GAP = 0.08; // between neighbouring containers, so each one shows

const MARK_LIFT = 0.01; // a size number's gap off its face, so it doesn't flicker into it
const MARK_SIZE = 0.7; // of the face's shorter edge

export const sizeOf = (p: Position): Vec3 => [p.x, p.y, p.z];

/* A container's box in its grid's cells: its centre, and its size less GAP. */
export function containerBox(b: Box): { center: Vec3; scale: Vec3 } {
  return { center: [b.x + b.w / 2, b.y + b.d / 2, b.z + b.h / 2], scale: [b.w - GAP, b.d - GAP, b.h - GAP] };
}

/* A size number on one face of a container, in its grid's cells: where it
   sits, the way it faces, which way its top and its right point, and its
   width and height. */
export type SizeMark = { at: Vec3; normal: Vec3; up: Vec3; right: Vec3; side: number };

/* The grid's axes, in the order a number's top prefers them when two point
   up (or fore) as much: the grid's own up first. */
const AXES: Vec3[] = [
  [0, 0, 1],
  [0, 1, 0],
  [1, 0, 0],
  [0, 0, -1],
  [0, -1, 0],
  [-1, 0, 0],
];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const SIDEWAYS = Math.SQRT1_2 + 1e-9; // a face this far from level, or less, counts as a side

/* A container's size on each of its six faces, so it reads from any side.
   Upright in the ship's terms: on a face that faces sideways in the ship, the
   number's top points to the ship's up; on one facing up or down, fore. Of
   the face's edges, its top runs along the one that points most that way, so
   it stays square on the face. */
export function sizeMarksOf(b: Box, mount: Mount): SizeMark[] {
  const r = rotationOf(mount);
  const inShip = (v: Vec3): Vec3 => r.map((row) => dot(row, v)) as Vec3;
  const { center } = containerBox(b);
  const half: Vec3 = [(b.w - GAP) / 2, (b.d - GAP) / 2, (b.h - GAP) / 2];
  return AXES.map((normal) => {
    const facing = inShip(normal);
    const toward: Vec3 = Math.abs(facing[2]) <= SIDEWAYS ? [0, 0, 1] : [0, 1, 0];
    const edges = AXES.filter((axis) => dot(axis, normal) === 0);
    const up = edges.reduce((best, axis) =>
      dot(inShip(axis), toward) > dot(inShip(best), toward) + 1e-9 ? axis : best,
    );
    const right: Vec3 = [
      up[1] * normal[2] - up[2] * normal[1],
      up[2] * normal[0] - up[0] * normal[2],
      up[0] * normal[1] - up[1] * normal[0],
    ];
    const depth = Math.abs(dot(normal, half)) + MARK_LIFT;
    return {
      at: center.map((c, i) => c + normal[i] * depth) as Vec3,
      normal,
      up,
      right,
      side: Math.min(Math.abs(dot(right, half)), Math.abs(dot(up, half))) * 2 * MARK_SIZE,
    };
  });
}
export const isMounted = (p: Position): p is Mounted => p.mount !== null;

/* The box around every mounted position, in ship coordinates. */
export function boundsOf(positions: Mounted[]): Bounds {
  if (!positions.length) return { min: [0, 0, 0], max: [0, 0, 0], center: [0, 0, 0], radius: 10 };
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of positions)
    for (const x of [0, p.x])
      for (const y of [0, p.y])
        for (const z of [0, p.z])
          toShip(p.mount, sizeOf(p), [x, y, z]).forEach((n, i) => {
            min[i] = Math.min(min[i], n);
            max[i] = Math.max(max[i], n);
          });
  const center = min.map((n, i) => (n + max[i]) / 2) as Vec3;
  const radius = Math.max(4, Math.hypot(...max.map((n, i) => n - min[i])) / 2);
  return { min, max, center, radius };
}

/* A position's name, over the middle of the far side of its hold. */
export const gridLabel = (p: Mounted): Label => ({
  key: `grid:${p.name}`,
  text: p.name,
  at: toShip(p.mount, sizeOf(p), [p.x / 2, p.y / 2, p.z]),
  className: "ship-label",
});

/* Room around the cargo for the axes and the fore cone. */
export const padOf = (bounds: Bounds) => Math.max(3, bounds.radius * 0.25);
/* The ground's height: below the bottom of the lowest grid's hold (so below
   even a full grid), with a gap. */
export const groundOf = (bounds: Bounds) => bounds.min[2] - Math.max(1.5, padOf(bounds) * 0.5);
export const coneOf = (bounds: Bounds) => ({ length: padOf(bounds) * 0.7, radius: padOf(bounds) * 0.25 });

export type Axis = { plus: string; minus: string; from: Vec3; to: Vec3 };

/* The ship's three axes through the middle of the cargo, past its edges;
   top–bottom stops at the ground. Fore–aft comes first. */
export function axesOf(bounds: Bounds): Axis[] {
  const { min, max } = bounds;
  const [cx, cy, cz] = bounds.center;
  const pad = padOf(bounds);
  return [
    { plus: "Fore", minus: "Aft", from: [cx, min[1] - pad, cz], to: [cx, max[1] + pad, cz] },
    { plus: "Starboard", minus: "Port", from: [min[0] - pad, cy, cz], to: [max[0] + pad, cy, cz] },
    { plus: "Top", minus: "Bottom", from: [cx, cy, groundOf(bounds)], to: [cx, cy, max[2] + pad] },
  ];
}

/* Each axis end's name. Fore sits past the cone's tip, Bottom just under the ground. */
export function directionLabels(bounds: Bounds): Label[] {
  const beyond = (point: Vec3, axis: number, by: number): Vec3 =>
    point.map((n, i) => (i === axis ? n + by : n)) as Vec3;
  return axesOf(bounds).flatMap(({ plus, minus, from, to }) => [
    {
      key: plus,
      text: plus,
      at: plus === "Fore" ? beyond(to, 1, coneOf(bounds).length + 1.5) : to,
      className: "ship-dir is-positive",
    },
    { key: minus, text: minus, at: minus === "Bottom" ? beyond(from, 2, -1) : from, className: "ship-dir" },
  ]);
}

/* Where the camera sits for a view: along the view's direction from the
   centre, far enough back to frame the cargo plus the axes, cone and labels. */
export function cameraPosition(view: View, bounds: Bounds): Vec3 {
  const [dx, dy, dz] = VIEWS[view].from;
  const length = Math.hypot(dx, dy, dz);
  const distance = ((bounds.radius + padOf(bounds)) * 0.85) / Math.sin(((FOV / 2) * Math.PI) / 180);
  const [cx, cy, cz] = bounds.center;
  return [cx + (dx / length) * distance, cy + (dy / length) * distance, cz + (dz / length) * distance];
}
