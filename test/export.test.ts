import { describe, expect, test } from "vite-plus/test";
import { computeTable } from "../src/lib/calc";
import { exportTable, gridText, tableAsMarkdown, tableAsTsv } from "../src/lib/export";
import { makeRow } from "../src/lib/state";
import { bay, containers } from "./helpers";

describe("copy formats", () => {
  const positions = [bay("Bay", 2, 8, 2)];
  const rows = [makeRow({ cargo: "Gold | Ore", pickup: "Area18", scu: "1,033", positions: ["Bay"] })];
  const calc = computeTable(rows, {}, containers, positions);
  const table = exportTable(rows, calc, [32, 8, 1]);

  test("TSV has a header and one line per row", () => {
    expect(tableAsTsv(table).split("\n")).toEqual([
      "Cargo\tPick-up\tDrop-off\tSCU\tRemaining\t32\t8\t1\tGrids",
      "Gold | Ore\tArea18\t\t1033\t1001\t32\t1\t1\tBay",
    ]);
  });

  test("Markdown escapes pipes, right-aligns numbers and bolds the total", () => {
    const lines = tableAsMarkdown(table).split("\n");
    const cells = (line: string) => line.slice(2, -2).split(" | ");
    expect(cells(lines[1]).map((rule) => rule.endsWith(":"))).toEqual([
      false,
      false,
      false,
      true,
      true,
      true,
      true,
      true,
      false,
    ]);
    expect(cells(lines[2]).map((cell) => cell.trim())).toEqual([
      "Gold \\| Ore",
      "Area18",
      "",
      "1,033",
      "1,001",
      "32",
      "1",
      "1",
      "Bay",
    ]);
    expect(cells(lines[2])[3]).toBe("    1,033"); // padded to the bold total's width
    expect(cells(lines[3]).map((cell) => cell.trim())).toEqual([
      "**Total**",
      "",
      "",
      "**1,033**",
      "**1,001**",
      "**32**",
      "**1**",
      "**1**",
      "",
    ]);
    expect(new Set(lines.map((line) => line.length)).size).toBe(1);
  });
});

describe("gridText", () => {
  test("names one grid, or each grid's share of a split row", () => {
    expect(gridText({ parts: [{ name: "A", scu: 8 }], unassigned: 0 })).toBe("A");
    const split = {
      parts: [
        { name: "A", scu: 1200 },
        { name: "B", scu: 16 },
      ],
      unassigned: 0,
    };
    expect(gridText(split)).toBe("A (1,200), B (16)");
    expect(gridText({ parts: [], unassigned: 0 })).toBe("");
    const full = {
      parts: [
        { name: "A", scu: 0 },
        { name: "B", scu: 10 },
      ],
      unassigned: 0,
    };
    expect(gridText(full)).toBe("B"); // A was full when it was picked
  });
});
