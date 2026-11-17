import { describe, expect, test } from "vite-plus/test";
import rawContainers from "../src/config/containers.json";
import rawShips from "../src/config/ships.json";
import { parseContainers, parseShips, type Position } from "../src/lib/cargo";
import { packContainers } from "../src/lib/packing";
import { foreAxis, mountMatrix, parseMount, rotationOf, toShip, type Mount, type Vec3 } from "../src/lib/mount";

const mount = (roll = 0, pitch = 0, yaw = 0, at: Vec3 = [0, 0, 0]): Mount => ({ at, roll, pitch, yaw });
/* Where the position's own x, y and z axes point on the ship. */
const axes = (m: Mount) => {
  const r = rotationOf(m);
  return [0, 1, 2].map((j) => r.map((row) => row[j]));
};

describe("parseMount", () => {
  test("needs a numeric at; rotate defaults to none", () => {
    expect(parseMount({ at: { x: 1, y: -2, z: 0.5 } })).toEqual(mount(0, 0, 0, [1, -2, 0.5]));
    expect(parseMount({ at: { x: 1, y: 2 } })).toBeNull();
    expect(parseMount({ at: { x: "1", y: 2, z: 3 } })).toBeNull();
    expect(parseMount({})).toBeNull();
    expect(parseMount({ at: { x: 0, y: 0, z: 0 }, rotate: { roll: 45, yaw: "x" } })).toEqual(mount(45));
  });
});

describe("rotationOf", () => {
  test("roll tips the top toward starboard", () => {
    expect(axes(mount(90))[2]).toEqual([1, 0, 0]);
  });

  test("pitch tips the fore end up", () => {
    expect(axes(mount(0, 90))[1]).toEqual([0, 0, 1]);
  });

  test("yaw turns the fore end toward starboard", () => {
    expect(axes(mount(0, 0, 90))[1]).toEqual([1, 0, 0]);
  });

  test("applies roll, then pitch, then yaw", () => {
    /* Roll 90 points up at starboard; yaw 90 then swings starboard round to aft. */
    expect(axes(mount(90, 0, 90))[2]).toEqual([0, -1, 0]);
  });
});

describe("foreAxis", () => {
  test("finds the floor axis that runs fore–aft, if any", () => {
    expect(foreAxis(mount(45))).toEqual({ axis: "y", pointsFore: true }); // Hull B: rolled only
    expect(foreAxis(mount(0, 0, 180))).toEqual({ axis: "y", pointsFore: false });
    expect(foreAxis(mount(0, 0, -90))).toEqual({ axis: "x", pointsFore: true });
    expect(foreAxis(mount(0, 90))).toBeNull(); // a Hull C rack: stacks fore–aft
  });
});

describe("toShip", () => {
  test("puts the floor's centre at `at` and stacks along the turned z", () => {
    const m = mount(90, 0, 0, [8, 0, 0]);
    expect(toShip(m, [8, 12, 6], [4, 6, 0])).toEqual([8, 0, 0]);
    expect(toShip(m, [8, 12, 6], [4, 6, 6])).toEqual([14, 0, 0]);
  });

  test("matches the three.js matrix", () => {
    const m = mount(30, -20, 70, [1, 2, 3]);
    const e = mountMatrix(m, [4, 16, 2]);
    const local: Vec3 = [1, 5, 2];
    const viaMatrix = [0, 1, 2].map((i) => e[i] * local[0] + e[4 + i] * local[1] + e[8 + i] * local[2] + e[12 + i]);
    toShip(m, [4, 16, 2], local).forEach((n, i) => expect(viaMatrix[i]).toBeCloseTo(n, 9));
  });
});

describe("ships.json mounts", () => {
  const containers = parseContainers(rawContainers);
  const cells = (position: Position) => {
    /* Fill each mounted position with 1 SCU boxes and list the ship cells they cover. */
    const unit = containers.find((c) => c.size === 1)!;
    const { placed } = packContainers(position, [{ container: unit, count: position.capacity, tag: 0 }]);
    return placed.map((b) =>
      toShip(position.mount!, [position.x, position.y, position.z], [b.x + 0.5, b.y + 0.5, b.z + 0.5]),
    );
  };

  /* Two unit cells that don't overlap, however turned, have centres at least 1
     apart (their inscribed balls can't overlap), so closer centres mean a clash. */
  test("no two positions of a grid overlap", () => {
    for (const ship of parseShips(rawShips))
      for (const grid of ship.grids) {
        const buckets = new Map<string, { point: Vec3; name: string }[]>();
        const key = (p: number[]) => p.map((n) => Math.floor(n)).join();
        for (const position of grid.positions.filter((p) => p.mount))
          for (const point of cells(position)) {
            for (const dx of [-1, 0, 1])
              for (const dy of [-1, 0, 1])
                for (const dz of [-1, 0, 1])
                  for (const other of buckets.get(key([point[0] + dx, point[1] + dy, point[2] + dz])) ?? []) {
                    if (other.name === position.name) continue;
                    const distance = Math.hypot(...point.map((n, i) => n - other.point[i]));
                    expect(
                      distance,
                      `${ship.name} / ${grid.name}: ${position.name} clashes with ${other.name}`,
                    ).toBeGreaterThan(0.999);
                  }
            const bucket = buckets.get(key(point)) ?? [];
            bucket.push({ point, name: position.name });
            buckets.set(key(point), bucket);
          }
      }
  });

  test("a grid is either fully mounted or not at all", () => {
    for (const ship of parseShips(rawShips))
      for (const grid of ship.grids) {
        const mounted = grid.positions.filter((p) => p.mount).length;
        expect([0, grid.positions.length], `${ship.name} / ${grid.name}`).toContain(mounted);
      }
  });
});
