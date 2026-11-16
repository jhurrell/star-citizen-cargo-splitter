import { OTHER_COLOR, type CargoColors } from "../lib/colors";

/* A toggle button per row with cargo, with its swatch and name; past the
   palette, one "Other rows" for the rest. Turning one off dims that row's
   containers in the ship view. */
export function Legend({
  entries,
  dimmed,
  onDim,
}: {
  entries: CargoColors["legend"];
  dimmed: ReadonlySet<number>;
  /* Dim the given rows, or (with false) show them again. */
  onDim: (rowIds: number[], dim: boolean) => void;
}) {
  const named = entries.filter((entry) => entry.color !== OTHER_COLOR);
  const others = entries.filter((entry) => entry.color === OTHER_COLOR).map((entry) => entry.rowId);
  return (
    <ul className="legend" aria-label="Rows in the ship view">
      {named.map((entry) => (
        <li key={entry.rowId}>
          <LegendButton name={entry.name} color={entry.color} rowIds={[entry.rowId]} dimmed={dimmed} onDim={onDim} />
        </li>
      ))}
      {others.length > 0 && (
        <li>
          <LegendButton name="Other rows" color={OTHER_COLOR} rowIds={others} dimmed={dimmed} onDim={onDim} />
        </li>
      )}
    </ul>
  );
}

/* On while any of its rows shows at full strength. */
function LegendButton({
  name,
  color,
  rowIds,
  dimmed,
  onDim,
}: {
  name: string;
  color: string;
  rowIds: number[];
  dimmed: ReadonlySet<number>;
  onDim: (rowIds: number[], dim: boolean) => void;
}) {
  const on = rowIds.some((id) => !dimmed.has(id));
  return (
    <button
      type="button"
      className="legend-btn"
      aria-pressed={on}
      title={on ? `Dim ${name} in the ship view` : `Show ${name} in full in the ship view`}
      onClick={() => onDim(rowIds, on)}
    >
      <Swatch color={color} />
      {name}
    </button>
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
