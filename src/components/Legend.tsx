import { OTHER_COLOR, type Cargo } from "../lib/colors";

/* A swatch and name per row with cargo; past the palette, one "Other rows". */
export function Legend({ entries }: { entries: Cargo[] }) {
  const named = entries.filter((entry) => entry.color !== OTHER_COLOR);
  return (
    <ul className="legend" aria-label="Rows">
      {named.map((entry) => (
        <li key={entry.name}>
          <Swatch color={entry.color} />
          {entry.name}
        </li>
      ))}
      {named.length < entries.length && (
        <li>
          <Swatch color={OTHER_COLOR} />
          Other rows
        </li>
      )}
    </ul>
  );
}

/* A small square of a row's color. */
export function Swatch({ color }: { color: string }) {
  return (
    <svg className="swatch" viewBox="0 0 10 10" aria-hidden="true">
      <rect width="10" height="10" fill={color} />
    </svg>
  );
}
