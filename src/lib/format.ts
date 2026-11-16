/* Small text and number helpers shared across the page. */

export const fmt = (n: number): string => n.toLocaleString("en-US");

/* Compares names as people read them: "Hull 10" after "Hull 9", ignoring case. */
export const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export const plural = (n: number, word: string): string => `${fmt(n)} ${word}${n === 1 ? "" : "s"}`;

export const sum = <T>(items: T[], pick: (item: T) => number): number =>
  items.reduce((total, item) => total + pick(item), 0);

/* Short tags for names: each name's initials ("Port - Upper" is PU), or 1, 2,
   3… when two names would share them. */
export function initials(names: string[]): string[] {
  const tags = names.map((name) =>
    name
      .split(/[^A-Za-z0-9]+/)
      .filter(Boolean)
      .map((word) => word[0].toUpperCase())
      .join(""),
  );
  return new Set(tags).size === tags.length && tags.every(Boolean) ? tags : names.map((_, i) => String(i + 1));
}
