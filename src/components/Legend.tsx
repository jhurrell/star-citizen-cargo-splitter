import type { LegendEntry } from "../lib/emphasis";
import { pointHandlers } from "./pointing";

type Props = {
  entries: LegendEntry[];
  /* Turn the given rows off, or (with false) back on. */
  onTurnOff: (rowIds: number[], off: boolean) => void;
  /* The rows a button is pointed at (or focused), for the ship view to pick
     out; null when none. */
  onPointRows: (rowIds: number[] | null) => void;
};

/* A toggle button per legend entry, with its swatch and name. Turning one off
   dims its rows' containers in the ship view; pointing at one dims every
   other row's. */
export function Legend({ entries, onTurnOff, onPointRows }: Props) {
  return (
    <ul className="legend" aria-label="Rows in the ship view">
      {entries.map(({ name, color, rowIds, on }) => (
        <li key={rowIds.join()}>
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
        </li>
      ))}
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
