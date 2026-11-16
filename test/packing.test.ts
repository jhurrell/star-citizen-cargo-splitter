import { describe, expect, test } from "vite-plus/test";
import type { Container, Shape } from "../src/lib/cargo";
import { addCounts, fillLargestFirst, packContainers, packInTurn } from "../src/lib/packing";
import { container } from "./helpers";

const box = (size: number, x: number, y: number, z: number) => container(size, x, y, z, false);
const pack = (space: Shape, ...load: [Container, number][]) =>
  packContainers(
    space,
    load.map(([c, count]) => ({ container: c, count, tag: 1 })),
  );

describe("fillLargestFirst", () => {
  test("uses the biggest sizes first and reports the leftover", () => {
    expect(fillLargestFirst(75, [32, 8, 1])).toEqual({ counts: { 32: 2, 8: 1, 1: 3 }, leftover: 0 });
    expect(fillLargestFirst(7, [8, 2])).toEqual({ counts: { 8: 0, 2: 3 }, leftover: 1 });
  });
});

describe("packContainers", () => {
  const scu32 = container(32, 2, 8, 2);
  const scu8 = box(8, 2, 2, 2);
  const scu1 = box(1, 1, 1, 1);

  test("a floor-axis sweep stacks each spot full height, and reverse starts at the far end", () => {
    const units = [{ container: scu1, count: 4, tag: 1 }];
    const space = { x: 2, y: 4, z: 2 };
    const cells = (sweep: Parameters<typeof packContainers>[2]) =>
      packContainers(space, units, sweep).placed.map(({ x, y, z }) => `${x}${y}${z}`);
    expect(cells({ axis: "z" })).toEqual(["000", "100", "010", "110"]);
    expect(cells({ axis: "y" })).toEqual(["000", "100", "001", "101"]);
    expect(cells({ axis: "y", reverse: true })).toEqual(["030", "130", "031", "131"]);
    expect(cells({ axis: "x", reverse: true })).toEqual(["100", "110", "120", "130"]);
  });

  test("fills a space exactly", () => {
    const { placed, unfit } = pack({ x: 4, y: 16, z: 2 }, [scu32, 4]);
    expect(placed).toHaveLength(4);
    expect(unfit).toEqual({});
  });

  test("reports what doesn't fit, by size", () => {
    expect(pack({ x: 2, y: 8, z: 2 }, [scu32, 2], [scu1, 3]).unfit).toEqual({ 32: 1, 1: 3 });
  });

  test("places biggest first, never overlapping and always inside the space", () => {
    const space = { x: 8, y: 12, z: 6 };
    const { placed, unfit } = pack(space, [scu1, 10], [scu32, 10], [scu8, 20]);
    expect(unfit).toEqual({});
    expect(placed.map((p) => p.size).slice(0, 10)).toEqual(Array(10).fill(32));
    const cells = new Set();
    for (const p of placed) {
      expect(p.x + p.w <= space.x && p.y + p.d <= space.y && p.z + p.h <= space.z).toBe(true);
      for (let z = p.z; z < p.z + p.h; z++)
        for (let y = p.y; y < p.y + p.d; y++)
          for (let x = p.x; x < p.x + p.w; x++) {
            const key = `${x},${y},${z}`;
            expect(cells.has(key)).toBe(false);
            cells.add(key);
          }
    }
    expect(cells.size).toBe(10 * 32 + 20 * 8 + 10);
  });

  test("every container sits on the floor or fully on others", () => {
    const { placed } = pack({ x: 2, y: 2, z: 4 }, [scu8, 1], [scu1, 4]);
    const on = (x: number, y: number, z: number) =>
      z < 0 || placed.some((p) => x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.d && z >= p.z && z < p.z + p.h);
    for (const p of placed)
      for (let y = p.y; y < p.y + p.d; y++) for (let x = p.x; x < p.x + p.w; x++) expect(on(x, y, p.z - 1)).toBe(true);
  });
});

describe("packInTurn", () => {
  const scu8 = box(8, 2, 2, 2);
  const space = { x: 2, y: 8, z: 2 };
  const turn = (tag: number, count: number) => [{ container: scu8, count, tag }];
  const spans = (sweep: Parameters<typeof packInTurn>[2]) =>
    packInTurn(space, [turn(1, 1), turn(2, 1), turn(3, 1)], sweep).placed.map(({ tag, y }) => `${tag}@${y}`);

  test("the first load goes at the start of the sweep, later ones build up from the far end", () => {
    expect(spans({ axis: "y" })).toEqual(["1@0", "2@6", "3@4"]);
    expect(spans({ axis: "y", reverse: true })).toEqual(["1@6", "2@0", "3@2"]); // fore end at the top
  });

  test("a later load from the far end still uses every spot", () => {
    const { placed, unfit } = packInTurn(space, [turn(1, 1), turn(2, 3)], { axis: "y" });
    expect(unfit).toEqual({});
    expect(placed.map(({ tag, y }) => `${tag}@${y}`)).toEqual(["1@0", "2@6", "2@4", "2@2"]);
  });

  test("a load goes on the floor or its own containers before on another load's", () => {
    const tall = { x: 2, y: 8, z: 4 };
    const at = ({ tag, y, z }: { tag: number; y: number; z: number }) => `${tag}@${y},${z}`;
    /* Load 3 has floor at y 4, so it doesn't stack on load 2 at the far end. */
    expect(packInTurn(tall, [turn(1, 1), turn(2, 1), turn(3, 1)], { axis: "y" }).placed.map(at)).toEqual([
      "1@0,0",
      "2@6,0",
      "3@4,0",
    ]);
    /* A load still stacks on its own containers. */
    expect(packInTurn(tall, [turn(1, 1), turn(2, 2)], { axis: "y" }).placed.map(at)).toEqual([
      "1@0,0",
      "2@6,0",
      "2@6,2",
    ]);
    /* With no floor left, it stacks on another load's. */
    expect(
      packInTurn(tall, [turn(1, 1), turn(2, 5), turn(3, 1)], { axis: "y" })
        .placed.map(at)
        .at(-1),
    ).toBe("3@2,2");
  });

  test("a z sweep has no far end, so loads just follow on", () => {
    expect(spans({ axis: "z" })).toEqual(["1@0", "2@2", "3@4"]);
  });
});

describe("addCounts", () => {
  test("adds counts in place", () => {
    expect(addCounts({ 8: 1 }, { 8: 2, 1: 3 })).toEqual({ 8: 3, 1: 3 });
  });
});
