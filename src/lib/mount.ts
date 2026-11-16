/* Where a cargo grid position sits on its ship, for the ship view.

   In ships.json a position may add:
     "at":     { "x": 0, "y": 4, "z": 2 }                 where the centre of its floor is, in SCU
     "rotate": { "roll": 0, "pitch": 0, "yaw": 0 }        how it is turned, in degrees (optional)

   Ship axes (as for container shapes): x is port (−) to starboard (+), y is
   aft (−) to fore (+), z is bottom (−) to top (+). The origin is up to you;
   the middle of the cargo section on the spine is a good choice.

   A position's own axes start lined up with the ship's: its x × y floor lies
   flat with z, the way its containers stack, pointing up. Then it is turned
   about the ship's axes, in this order:
     roll   about the fore–aft axis; positive tips its top toward starboard
     pitch  about the port–starboard axis; positive tips its fore end up
     yaw    about the up axis; positive turns its fore end toward starboard
   and moved so its floor's centre is at `at`. */

export type Vec3 = [x: number, y: number, z: number];
export type Mount = { at: Vec3; roll: number; pitch: number; yaw: number };
type Matrix3 = [Vec3, Vec3, Vec3];

const isNumber = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

/* A position's mount, or null when it has no usable "at" (it then stays out of the ship view). */
export function parseMount(item: unknown): Mount | null {
  const { at, rotate } = record(item);
  const { x, y, z } = record(at);
  if (!isNumber(x) || !isNumber(y) || !isNumber(z)) return null;
  const { roll, pitch, yaw } = record(rotate);
  const angle = (n: unknown) => (isNumber(n) ? n : 0);
  return { at: [x, y, z], roll: angle(roll), pitch: angle(pitch), yaw: angle(yaw) };
}

const multiply = (a: Matrix3, b: Matrix3): Matrix3 =>
  a.map((row) => [0, 1, 2].map((j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j])) as Matrix3;

/* Rotations about the ship's axes, by the right-hand rule. */
function about(axis: 0 | 1 | 2, degrees: number): Matrix3 {
  const t = (degrees * Math.PI) / 180;
  const [c, s] = [Math.cos(t), Math.sin(t)];
  if (axis === 0)
    return [
      [1, 0, 0],
      [0, c, -s],
      [0, s, c],
    ];
  if (axis === 1)
    return [
      [c, 0, s],
      [0, 1, 0],
      [-s, 0, c],
    ];
  return [
    [c, -s, 0],
    [s, c, 0],
    [0, 0, 1],
  ];
}

/* Roll, then pitch, then yaw. Rounded so quarter turns come out exact. */
export function rotationOf({ roll, pitch, yaw }: Mount): Matrix3 {
  const r = multiply(multiply(about(2, -yaw), about(0, pitch)), about(1, roll));
  return r.map((row) => row.map((n) => Math.round(n * 1e9) / 1e9 + 0)) as Matrix3;
}

/* A point in the position's own cells (x, y along its floor, z up from it) as a ship point. */
export function toShip(mount: Mount, size: Vec3, local: Vec3): Vec3 {
  const r = rotationOf(mount);
  const p: Vec3 = [local[0] - size[0] / 2, local[1] - size[1] / 2, local[2]];
  return r.map((row, i) => mount.at[i] + row[0] * p[0] + row[1] * p[1] + row[2] * p[2]) as Vec3;
}

/* The same transform as a column-major 4 × 4 matrix, for three.js. */
export function mountMatrix(mount: Mount, size: Vec3): number[] {
  const r = rotationOf(mount);
  const origin = toShip(mount, size, [0, 0, 0]);
  return [r[0][0], r[1][0], r[2][0], 0, r[0][1], r[1][1], r[2][1], 0, r[0][2], r[1][2], r[2][2], 0, ...origin, 1];
}

/* Which of a position's floor axes runs fore–aft, and whether it points fore,
   so its cargo can be loaded from the fore end. Null when neither does (a
   rack facing fore or aft, whose cargo stacks fore or aft from its floor). */
export function foreAxis(mount: Mount): { axis: "x" | "y"; pointsFore: boolean } | null {
  const r = rotationOf(mount);
  const [x, y] = [r[1][0], r[1][1]]; // how far each floor axis points fore
  const axis = Math.abs(y) >= Math.abs(x) ? "y" : "x";
  const along = axis === "y" ? y : x;
  return Math.abs(along) > 0.5 ? { axis, pointsFore: along > 0 } : null;
}
