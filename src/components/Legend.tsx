import { VIEWS, type LegendEntry, type View } from "../lib/emphasis";
import { pointHandlers } from "./pointing";

type Props = {
  view: View;
  onView: (view: View) => void;
  entries: LegendEntry[];
  /* Pick an entry out, or (again) stop picking it out. */
  onTogglePicked: (key: string) => void;
  /* The rows a button is pointed at (or focused), for the ship view to pick
     out; null when none. */
  onPointRows: (rowIds: number[] | null) => void;
};

/* The view switch (by drop-off, pick-up or cargo), then a toggle button per
   legend entry, with its swatch and name. Picking entries out dims every
   other entry's containers in the ship view; pointing at one dims every other
   entry's while you do. */
export function Legend({ view, onView, entries, onTogglePicked, onPointRows }: Props) {
  return (
    <>
      <div className="legend-views" role="group" aria-label="Color and pick out by">
        {VIEWS.map(({ view: v, label }) => (
          <button
            key={v}
            type="button"
            className={`btn${v === view ? " primary" : ""}`}
            aria-pressed={v === view}
            onClick={() => onView(v)}
          >
            {label}
          </button>
        ))}
      </div>
      <ul className="legend" aria-label="In the ship view">
        {entries.map(({ key, name, details, color, rowIds, on }) => (
          <li key={key}>
            <button
              type="button"
              className="legend-btn"
              aria-pressed={on}
              title={[details, on ? `Stop picking out ${name}` : `Pick out ${name}, dimming the rest`]
                .filter(Boolean)
                .join("\n")}
              onClick={() => onTogglePicked(key)}
              {...pointHandlers((pointed) => onPointRows(pointed ? rowIds : null))}
            >
              <Swatch color={color} />
              {name}
            </button>
          </li>
        ))}
      </ul>
    </>
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
