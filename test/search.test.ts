import { describe, expect, test } from "vite-plus/test";
import { filterByName, matchedParts } from "../src/lib/search";

const ships = ["Drake Caterpillar", "MISC Hull C", "MISC Hull B", "Crusader C2 Hercules"].map((name) => ({ name }));
const names = (query: string) => filterByName(ships, query).map((s) => s.name);

describe("filterByName", () => {
  test("matches text anywhere in the name, ignoring case", () => {
    expect(names("cat")).toEqual(["Drake Caterpillar"]);
    expect(names("HULL")).toEqual(["MISC Hull C", "MISC Hull B"]);
  });

  test("every word must match, in any order", () => {
    expect(names("drake cat")).toEqual(["Drake Caterpillar"]);
    expect(names("herc  c2")).toEqual(["Crusader C2 Hercules"]);
    expect(names("drake hull")).toEqual([]);
  });

  test("names holding the whole phrase come first", () => {
    expect(names("hull c")).toEqual(["MISC Hull C", "MISC Hull B"]); // "c" is in "MISC" too
  });

  test("a blank query keeps every name", () => {
    expect(names("  ")).toHaveLength(4);
  });
});

describe("matchedParts", () => {
  test("marks each run the words matched", () => {
    expect(matchedParts("MISC Hull C", "hull c")).toEqual([
      { text: "MIS", hit: false },
      { text: "C", hit: true },
      { text: " ", hit: false },
      { text: "Hull", hit: true },
      { text: " ", hit: false },
      { text: "C", hit: true },
    ]);
    expect(matchedParts("Nomad", "")).toEqual([{ text: "Nomad", hit: false }]);
  });
});
