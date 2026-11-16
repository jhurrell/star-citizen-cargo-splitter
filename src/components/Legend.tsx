import { OTHER_COLOR, type CargoColors } from "../lib/colors";
import { pointHandlers } from "./pointing";

type Props = {
  entries: CargoColors["legend"];
  /* Rows turned off, whose containers show dimmed. */
  turnedOff: ReadonlySet<number>;
  /* Turn the given rows off, or (with false) back on. */
  onTurnOff: (rowIds: number[], off: boolean) => void;
  /* The rows a button is pointed at (or focused), for the ship view to pick
     out; null when none. */
  onPointRows: (rowIds: number[] | null) => void;
};

/* A toggle button per row with cargo, with its swatch and name; past the
   palette, one "Other rows" for the rest. Turning one off dims that row's
   containers in the ship view; pointing at one dims every other row's. */
export function Legend({ entries, ...actions }: Props) {
  const named = entries.filter((entry) => entry.color !== OTHER_COLOR);
  const others = entries.filter((entry) => entry.color === OTHER_COLOR).map((entry) => entry.rowId);
  return (
    <ul className="legend" aria-label="Rows in the ship view">
      {named.map((entry) => (
        <li key={entry.rowId}>
          <LegendButton name={entry.name} color={entry.color} rowIds={[entry.rowId]} {...actions} />
        </li>
      ))}
      {others.length > 0 && (
        <li>
          <LegendButton name="Other rows" color={OTHER_COLOR} rowIds={others} {...actions} />
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
  turnedOff,
  onTurnOff,
  onPointRows,
}: Omit<Props, "entries"> & { name: string; color: string; rowIds: number[] }) {
  const on = rowIds.some((id) => !turnedOff.has(id));
  return (
    <button
      type="button"
      className="legend-btn"
      aria-pressed={on}
      title={on ? `Dim ${name} in the ship view` : `Show ${name} in full in the ship view`}
      onClick={() => onTurnOff(rowIds, on)}
      {...pointHandlers((pointed) => onPointRows(pointed ? rowIds : null))}
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
