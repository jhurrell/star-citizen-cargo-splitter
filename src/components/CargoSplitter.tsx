import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { configError, containers, ships } from "../lib/config";
import { loadState, makeRow, reducer, saveState, type RowField, type TextKey } from "../lib/state";
import {
  computeTable,
  exportTable,
  fmt,
  isEnabled,
  plural,
  selection,
  sum,
  tableAsMarkdown,
  tableAsTsv,
} from "../lib/table";
import { CargoTable } from "./CargoTable";
import { LoadPlan } from "./LoadPlan";
import { PositionsTable } from "./PositionsTable";

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
    const table = exportTable(state.rows, calc, sizes, positions);
    const ok = await copyText(format === "tsv" ? tableAsTsv(table) : tableAsMarkdown(table));
    if (!ok) showStatus("Copy isn't available here");
    else showStatus(format === "tsv" ? "Copied. Paste into a spreadsheet." : "Copied as a Markdown table.");
  }

  const capacities = new Set(grid?.positions.map((p) => p.capacity));
  const shipInfo =
    configError ||
    (grid
      ? `${fmt(sum(grid.positions, (p) => p.capacity))} SCU in ${plural(grid.positions.length, "position")}` +
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
          <span>Cargo grid</span>
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
          onUpdate={(id: number, field: RowField, value: string) => dispatch({ type: "updateRow", id, field, value })}
          onDelete={deleteRow}
          onSort={(key: TextKey) => dispatch({ type: "sortBy", key })}
          onToggleSize={(size: number, on: boolean) => dispatch({ type: "setSizeEnabled", size, on })}
          onScuEnter={focusNextScu}
        />
      </div>

      <p className="hint">
        Click the arrow beside Material, Pick-up or Drop-off to sort by that column, and again to reverse it. Press{" "}
        <kbd>Enter</kbd> in the SCU column to jump to the next row, or add one if you're on the last row. Your table is
        kept in this browser.
      </p>

      <section className="summary" aria-labelledby="positions-title">
        <h2 id="positions-title">SCU by position</h2>
        <div className="frame">
          <PositionsTable calc={calc} positions={positions} />
        </div>
        <p className="hint">
          Containers lie flat, with their longest side level, and can turn to point fore–aft or port–starboard. Every
          container sits on the floor or fully on other containers. The packing is a quick estimate, so a tight load it
          says won't fit may still fit by hand.
        </p>
      </section>

      <section className="summary" aria-labelledby="plan-title">
        <h2 id="plan-title">Load plan</h2>
        <LoadPlan calc={calc} positions={positions} rows={state.rows} />
        <p className="hint">
          Each position as packed for the Fit column, seen from above its fore–starboard corner. Colors follow the
          material; point at a container to see what it holds.
        </p>
      </section>
    </>
  );
}

/* A message that clears itself `ms` after it was last shown. */
function useTimedMessage(ms: number): [string, (message: string) => void] {
  /* `shown` counts showings, so the same message twice restarts the timer. */
  const [message, setMessage] = useState({ text: "", shown: 0 });
  useEffect(() => {
    if (!message.text) return;
    const timer = setTimeout(() => setMessage((m) => ({ ...m, text: "" })), ms);
    return () => clearTimeout(timer);
  }, [message, ms]);
  return [message.text, (text) => setMessage((m) => ({ text, shown: m.shown + 1 }))];
}

/* A flag that turns itself off `ms` after it was turned on: the two-step Clear
   table, since the artifact viewer can't show confirm() dialogs. */
function useTimedFlag(ms: number): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!on) return;
    const timer = setTimeout(() => setOn(false), ms);
    return () => clearTimeout(timer);
  }, [on, ms]);
  return [on, setOn];
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for views that refuse the async clipboard API.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      /* not supported */
    }
    ta.remove();
    return ok;
  }
}
