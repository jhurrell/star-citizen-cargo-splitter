import { lazy, Suspense, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { Grid } from "../lib/cargo";
import { copyText } from "../lib/clipboard";
import { configError, containers, ships } from "../lib/config";
import { exportTable, tableAsMarkdown, tableAsTsv } from "../lib/export";
import { fmt, plural, sum } from "../lib/format";
import { computeHaul, selectLayout } from "../lib/haul";
import { useEmphasis, useTimedMessage } from "../lib/hooks";
import { loadState, makeRow, reducer, saveState, type Row } from "../lib/state";
import { CargoTable } from "./CargoTable";
import { ConfirmButton } from "./ConfirmButton";
import { MarkdownIcon, SpreadsheetIcon } from "./icons";
import { Legend } from "./Legend";
import { ShipPicker } from "./ShipPicker";

/* three.js is big, so the 3D view loads only when a grid has placements to show. */
const ShipView = lazy(() => import("./ShipView"));

const STATUS_MS = 2200; // how long a copy or clear message stays

/* The copy buttons: what each is called, how it writes the table and what it
   says once copied. */
const COPY_FORMATS = [
  {
    label: "Copy for a spreadsheet",
    toText: tableAsTsv,
    done: "Copied. Paste into a spreadsheet.",
    Icon: SpreadsheetIcon,
  },
  {
    label: "Copy as a Markdown table",
    toText: tableAsMarkdown,
    done: "Copied as a Markdown table.",
    Icon: MarkdownIcon,
  },
];

/* "512 SCU in 4 grids of 128 SCU": the layout's total, and each grid's size when they're all alike. */
function gridSummary(grid: Grid): string {
  const capacities = new Set(grid.positions.map((p) => p.capacity));
  const each = capacities.size === 1 ? ` of ${fmt([...capacities][0])} SCU` : "";
  return `${fmt(sum(grid.positions, (p) => p.capacity))} SCU in ${plural(grid.positions.length, "grid")}${each}`;
}

/* The whole tool. It reads localStorage, so it renders in the browser only. */
export function CargoVisualizer() {
  const [state, dispatch] = useReducer(reducer, undefined, () => loadState((choice) => selectLayout(ships, choice).at));
  const haul = useMemo(() => computeHaul(state, ships, containers), [state]);
  const { ship, layout, at, positions } = haul;
  /* Each row's color, the legend, and which rows show see-through. */
  const emphasis = useEmphasis(state.rows, haul);
  const isMounted = positions.length > 0 && positions.every((p) => p.mount);
  /* The grid being pointed at in the cargo table, lit up in the ship view. */
  const [highlight, setHighlight] = useState<string | null>(null);

  useEffect(() => saveState(state), [state]);

  /* After an action re-renders the table, move focus where the user expects it
     (the new row, the row after a deleted one, …). */
  const focusNext = useRef<string | null>(null);
  useEffect(() => {
    if (!focusNext.current) return;
    document.getElementById(focusNext.current)?.focus();
    focusNext.current = null;
  });
  const focusCargo = (row: Row | undefined) => {
    focusNext.current = row ? `r${row.id}-cargo` : "add-row";
  };

  const [status, showStatus] = useTimedMessage(STATUS_MS);

  function addRow() {
    const row = makeRow();
    focusCargo(row);
    dispatch({ type: "addRow", row });
  }

  function deleteRow(id: number) {
    const index = state.rows.findIndex((r) => r.id === id);
    focusCargo(state.rows[index + 1] ?? state.rows[index - 1]);
    dispatch({ type: "deleteRow", id });
  }

  /* Move to the next row's SCU, or add a row when already on the last one. */
  function focusNextScu(id: number) {
    const next = state.rows[state.rows.findIndex((r) => r.id === id) + 1];
    if (next) document.getElementById(`r${next.id}-scu`)?.focus();
    else addRow();
  }

  function clearTable() {
    const row = makeRow();
    focusCargo(row);
    dispatch({ type: "clearRows", row });
    showStatus("Table cleared");
  }

  /* Take every row out of this layout's grids. */
  function clearGrids() {
    dispatch({ type: "clearPicks", at });
    showStatus("Grids cleared");
  }

  async function copy({ toText, done }: (typeof COPY_FORMATS)[number]) {
    const ok = await copyText(toText(exportTable(haul)));
    showStatus(ok ? done : "Copy isn't available here");
  }

  const shipInfo = configError || (layout ? gridSummary(layout) : "");

  return (
    <>
      {/* The ship on the left, what to do with the table on the right; on a
          narrow window the actions wrap onto a line of their own. */}
      <div className="toolbar">
        <div className="toolbar-group">
          <ShipPicker
            ships={ships}
            value={ship?.id ?? ""}
            onChange={(shipId) => dispatch({ type: "selectShip", shipId })}
          />
          <label className="picker" hidden={(ship?.grids.length ?? 0) < 2}>
            <span>Layout</span>
            <select
              id="grid"
              value={layout?.id ?? ""}
              onChange={(e) => dispatch({ type: "selectGrid", gridId: e.target.value })}
            >
              {ship?.grids.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          <span className={`ship-info${configError ? " is-error" : ""}`} aria-live="polite">
            {shipInfo}
          </span>
        </div>
        <span className="spacer" />
        <div className="toolbar-group">
          <button type="button" className="btn primary" id="add-row" onClick={addRow}>
            Add row
          </button>
          {/* The copy formats as icons; each says what it does in its tooltip and to screen readers. */}
          <div className="btn-pair">
            {COPY_FORMATS.map((format) => (
              <button
                key={format.label}
                type="button"
                className="btn icon"
                onClick={() => void copy(format)}
                aria-label={format.label}
                data-tip={format.label}
              >
                <format.Icon />
              </button>
            ))}
          </div>
          <ConfirmButton
            label="Clear table"
            confirmAriaLabel="Confirm clearing the table"
            className="clear-table"
            onConfirm={clearTable}
          />
        </div>
      </div>
      {/* Copy and clear messages, as a toast at the foot of the window, so they never move the page. */}
      <p className="status" aria-live="polite" hidden={!status}>
        {status}
      </p>

      <div className="frame">
        <CargoTable
          haul={haul}
          sort={state.sort}
          cargoByRow={emphasis.byRow}
          onUpdate={(id, field, value) => dispatch({ type: "updateRow", id, field, value })}
          onTogglePick={(id, name) => dispatch({ type: "togglePick", id, grid: { ...at, name } })}
          onHighlight={setHighlight}
          onPointRows={emphasis.point}
          onDelete={deleteRow}
          onSort={(key) => dispatch({ type: "sortBy", key })}
          onToggleSize={(size, on) => dispatch({ type: "setSizeEnabled", size, on })}
          onScuEnter={focusNextScu}
          onClearGrids={clearGrids}
        />
      </div>

      <section className="section" aria-labelledby="ship-title">
        {/* The heading and the legend share a line. */}
        <div className="section-head">
          <h2 id="ship-title">Ship view</h2>
          {isMounted && <Legend entries={emphasis.legend} onTurnOff={emphasis.turnOff} onPointRows={emphasis.point} />}
        </div>
        {isMounted ? (
          <Suspense fallback={<p className="hint">Loading the 3D view…</p>}>
            <ShipView
              positions={positions}
              grids={haul.grids}
              cargoByRow={emphasis.byRow}
              dimmed={emphasis.dimmed}
              highlight={highlight}
            />
          </Suspense>
        ) : (
          <p className="hint">Ship's grid is not configured yet.</p>
        )}
      </section>
    </>
  );
}
