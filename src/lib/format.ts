/* Small text and number helpers shared across the page. */

export const fmt = (n: number): string => n.toLocaleString("en-US");

/* Compares names as people read them: "Hull 10" after "Hull 9", ignoring case. */
export const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export const plural = (n: number, word: string): string => `${fmt(n)} ${word}${n === 1 ? "" : "s"}`;

export const sum = <T>(items: T[], pick: (item: T) => number): number =>
  items.reduce((total, item) => total + pick(item), 0);

/* A name's initials, a letter per word: "Port - Upper" is PU, "Jackson's
   Swap" is JS. */
export const initialsOf = (name: string): string =>
  name
    .split(/[^A-Za-z0-9']+/)
    .filter((word) => /[A-Za-z0-9]/.test(word))
    .map((word) => word.replace(/'/g, "")[0].toUpperCase())
    .join("");

/* Short tags for names: each name's initials, or 1, 2, 3… when two names
   would share them. */
export function initials(names: string[]): string[] {
  const tags = names.map(initialsOf);
  return new Set(tags).size === tags.length && tags.every(Boolean) ? tags : names.map((_, i) => String(i + 1));
}
