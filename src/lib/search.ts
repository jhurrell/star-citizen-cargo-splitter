/* Finding names by what's typed: every word typed must appear somewhere in
   the name, in any order, ignoring case ("hull c" and "drake cat" both work). */

const wordsOf = (query: string) => query.toLowerCase().split(/\s+/).filter(Boolean);

/* The items whose name matches; all of them for a blank query. Names holding
   the whole query as typed come first, then the rest, each in their order. */
export function filterByName<T extends { name: string }>(items: T[], query: string): T[] {
  const words = wordsOf(query);
  const phrase = words.join(" ");
  const matches = items.filter((item) => {
    const name = item.name.toLowerCase();
    return words.every((word) => name.includes(word));
  });
  const hasPhrase = (item: T) => item.name.toLowerCase().includes(phrase);
  return [...matches.filter(hasPhrase), ...matches.filter((item) => !hasPhrase(item))];
}

/* A name cut into runs, marking the ones the query's words matched, to show
   them highlighted. */
export function matchedParts(name: string, query: string): { text: string; hit: boolean }[] {
  const lower = name.toLowerCase();
  const hit = Array.from(name, () => false);
  for (const word of wordsOf(query))
    for (let at = lower.indexOf(word); at !== -1; at = lower.indexOf(word, at + 1))
      hit.fill(true, at, at + word.length);
  const parts: { text: string; hit: boolean }[] = [];
  Array.from(name).forEach((char, i) => {
    const last = parts[parts.length - 1];
    if (last && last.hit === hit[i]) last.text += char;
    else parts.push({ text: char, hit: hit[i] });
  });
  return parts;
}
