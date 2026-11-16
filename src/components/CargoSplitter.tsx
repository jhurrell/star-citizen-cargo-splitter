import { lazy, Suspense, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { computeTable, selection } from "../lib/calc";
import { copyText } from "../lib/clipboard";
import { cargoColors } from "../lib/colors";
import { configError, containers, ships } from "../lib/config";
import { exportTable, tableAsMarkdown, tableAsTsv } from "../lib/export";
import { fmt, plural, sum } from "../lib/format";
import { useTimedFlag, useTimedMessage } from "../lib/hooks";
import { isEnabled, loadState, makeRow, reducer, saveState, type RowField, type TextKey } from "../lib/state";
import { CargoTable } from "./CargoTable";
import { Legend } from "./Legend";

/* three.js is big, so the 3D view loads only when a grid has placements to show. */
const ShipView = lazy(() => import("./ShipView"));

const STATUS_MS = 2200; // how long a copy or clear message stays
const DISARM_MS = 3000; // how long Clear table waits for the second click

/* The whole tool. It reads localStorage, so it renders in the browser only. */
export function CargoSplitter() {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);
  const { ship, grid, positions } = selection(ships, state);
  const calc = useMemo(
    () => computeTable(state.rows, state.enabled, containers, positions),
    [state.rows, state.enabled, positions],
  );
  const colors = useMemo(() => cargoColors(state.rows), [state.rows]);
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

  const [status, showStatus] = useTimedMessage(STATUS_MS);
  const [clearArmed, setClearArmed] = useTimedFlag(DISARM_MS);

  function addRow() {
    const row = makeRow();
    focusNext.current = `r${row.id}-material`;
    dispatch({ type: "addRow", row });
  }

  function deleteRow(id: number) {
    const index = state.rows.findIndex((r) => r.id === id);
    const next = state.rows[index + 1] ?? state.rows[index - 1];
    focusNext.current = next ? `r${next.id}-material` : "add-row";
    dispatch({ type: "deleteRow", id });
  }

  /* Move to the next row's SCU, or add a row when already on the last one. */
  function focusNextScu(id: number) {
    const next = state.rows[state.rows.findIndex((r) => r.id === id) + 1];
    if (next) document.getElementById(`r${next.id}-scu`)?.focus();
    else addRow();
  }

  function clearTable() {
    if (!clearArmed) return setClearArmed(true);
    setClearArmed(false);
    const row = makeRow();
    focusNext.current = `r${row.id}-material`;
    dispatch({ type: "clearRows", row });
    showStatus("Table cleared");
  }

  async function copy(format: "tsv" | "markdown") {
    const sizes = containers.map((c) => c.size).filter((size) => isEnabled(state.enabled, size));
    const table = exportTable(state.rows, calc, sizes);
    const ok = await copyText(format === "tsv" ? tableAsTsv(table) : tableAsMarkdown(table));
    if (!ok) showStatus("Copy isn't available here");
    else showStatus(format === "tsv" ? "Copied. Paste into a spreadsheet." : "Copied as a Markdown table.");
  }

  const capacities = new Set(grid?.positions.map((p) => p.capacity));
  const shipInfo =
    configError ||
    (grid
      ? `${fmt(sum(grid.positions, (p) => p.capacity))} SCU in ${plural(grid.positions.length, "grid")}` +
        (capacities.size === 1 ? ` of ${fmt([...capacities][0])} SCU` : "")
      : "");

  return (
    <>
      <div className="ship-bar">
        <label className="picker">
          <span>Ship</span>
          <select
            id="ship"
            value={ship?.id ?? ""}
            disabled={ships.length === 0}
            onChange={(e) => {
              const shipId = e.target.value;
              /* A new ship starts on its first cargo grid. */
              const gridId = ships.find((s) => s.id === shipId)?.grids[0]?.id ?? "";
              dispatch({ type: "selectShip", shipId, gridId });
            }}
          >
            {ships.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="picker" hidden={(ship?.grids.length ?? 0) < 2}>
          <span>Layout</span>
          <select
            id="grid"
            value={grid?.id ?? ""}
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

      <div className="toolbar">
        <button type="button" className="btn primary" id="add-row" onClick={addRow}>
          Add row
        </button>
        <button type="button" className="btn" onClick={() => void copy("tsv")}>
          Copy for Spreadsheet
        </button>
        <button type="button" className="btn" onClick={() => void copy("markdown")}>
          Copy Markdown
        </button>
        <span className="status" aria-live="polite">
          {status}
        </span>
        <span className="spacer" />
        <button type="button" className={`btn${clearArmed ? " is-armed" : ""}`} onClick={clearTable}>
          {clearArmed ? "Click again to clear" : "Clear table"}
        </button>
      </div>

      <div className="frame">
        <CargoTable
          state={state}
          calc={calc}
          containers={containers}
          positions={positions}
          cargoByRow={colors.byRow}
          onUpdate={(id: number, field: RowField, value: string) => dispatch({ type: "updateRow", id, field, value })}
          onTogglePick={(id: number, name: string) => dispatch({ type: "togglePick", id, name })}
          onHighlight={setHighlight}
          onDelete={deleteRow}
          onSort={(key: TextKey) => dispatch({ type: "sortBy", key })}
          onToggleSize={(size: number, on: boolean) => dispatch({ type: "setSizeEnabled", size, on })}
          onScuEnter={focusNextScu}
        />
      </div>

      <p className="hint">
        Click the arrow beside Material, Pick-up or Drop-off to sort by that column, and again to reverse it. Press{" "}
        <kbd>Enter</kbd> in the SCU column to jump to the next row, or add one if you're on the last row. Click a grid
        button to put a row in that grid; each button shows the SCU the grid has available. To split a big delivery,
        turn on several grids: grids fill in the order you pick them, and a later pick only takes the room an earlier
        one left. An amber edge and SCU mean a row has more than its grids have room for; point at the SCU to see how
        much. Point at a grid button to see it in the ship view. Your table is kept in this browser.
      </p>

      <section className="section" aria-labelledby="ship-title">
        <h2 id="ship-title">Ship view</h2>
        {isMounted ? (
          <>
            <Legend entries={colors.legend} />
            <Suspense fallback={<p className="hint">Loading the 3D view…</p>}>
              <ShipView positions={positions} loads={calc.byPosition} cargoByRow={colors.byRow} highlight={highlight} />
            </Suspense>
            <p className="hint">
              Each grid placed on the ship as config.json says. Drag to turn, scroll to zoom, right-drag to pan. The
              pale blue face of each grid is its floor; containers stack away from it. Point at a container to see what
              it holds.
            </p>
          </>
        ) : (
          <p className="hint">
            config.json doesn't say where this ship's grids sit on it yet. Give each of its positions an "at" (and, if
            it's turned, a "rotate") to see it here.
          </p>
        )}
      </section>
    </>
  );
}
