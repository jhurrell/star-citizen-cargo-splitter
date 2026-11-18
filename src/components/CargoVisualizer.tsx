import { lazy, Suspense, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { Layout } from "../lib/cargo";
import { copyText } from "../lib/clipboard";
import { configError, containers, ships } from "../lib/config";
import { exportTable, tableAsMarkdown, tableAsTsv } from "../lib/export";
import { fmt, plural, sum } from "../lib/format";
import { computeHaul, layoutOf } from "../lib/haul";
import { useEmphasis, useTimedMessage } from "../lib/hooks";
import { allRows, loadState, makeContract, makeRow, reducer, saveState, type Contract, type Row } from "../lib/state";
import { CargoTable } from "./CargoTable";
import { ConfirmButton } from "./ConfirmButton";
import { ChevronIcon, MarkdownIcon, SpreadsheetIcon } from "./icons";
import { Legend } from "./Legend";
import { ShipPicker } from "./ShipPicker";

/* three.js is big, so the 3D view loads only when a grid has placements to show. */
const ShipView = lazy(() => import("./ShipView"));

const STATUS_MS = 2200; // how long a copy or reset message stays

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
function layoutSummary(layout: Layout): string {
  const capacities = new Set(layout.grids.map((g) => g.capacity));
  const each = capacities.size === 1 ? ` of ${fmt([...capacities][0])} SCU` : "";
  return `${fmt(sum(layout.grids, (g) => g.capacity))} SCU in ${plural(layout.grids.length, "grid")}${each}`;
}

/* The whole tool. It reads localStorage, so it renders in the browser only. */
export function CargoVisualizer() {
  const [state, dispatch] = useReducer(reducer, undefined, () => loadState((choice) => layoutOf(ships, choice).at));
  const haul = useMemo(() => computeHaul(state, ships, containers), [state]);
  const { ship, layout, at } = haul;
  /* Each row's color, the legend, and which rows show see-through. */
  const rows = useMemo(() => allRows(state), [state]);
  const emphasis = useEmphasis(rows, haul);
  const isMounted = !!layout && layout.grids.every((g) => g.mount);
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
  const focusCargo = (row: Row) => {
    focusNext.current = `r${row.id}-cargo`;
  };
  /* The contract a row is in, and the row's place in it. */
  const findRow = (id: number) => {
    const contract = state.contracts.find((c) => c.rows.some((r) => r.id === id))!;
    return { contract, index: contract.rows.findIndex((r) => r.id === id) };
  };

  const [status, showStatus] = useTimedMessage(STATUS_MS);

  /* A new contract with one blank row, its name ready to type. */
  function newContract(): Contract {
    const contract = makeContract({ rows: [{}] });
    focusNext.current = `c${contract.id}-name`;
    return contract;
  }

  function addContract() {
    dispatch({ type: "addContract", contract: newContract() });
  }

  function deleteContract(id: number) {
    const index = state.contracts.findIndex((c) => c.id === id);
    const next = state.contracts[index + 1] ?? state.contracts[index - 1];
    focusNext.current = next ? `c${next.id}-name` : "add-contract";
    dispatch({ type: "deleteContract", id });
  }

  function addRow(contractId: number) {
    const row = makeRow();
    focusCargo(row);
    dispatch({ type: "addRow", contractId, row });
  }

  /* Focus the next row in the deleted row's contract, or the one before, or
     the contract's Add row when it was the last. */
  function deleteRow(id: number) {
    const { contract, index } = findRow(id);
    const next = contract.rows[index + 1] ?? contract.rows[index - 1];
    if (next) focusCargo(next);
    else focusNext.current = `c${contract.id}-add-row`;
    dispatch({ type: "deleteRow", id });
  }

  /* Move to the next row's SCU in the contract, or add a row to it when
     already on its last one. */
  function focusNextScu(id: number) {
    const { contract, index } = findRow(id);
    const next = contract.rows[index + 1];
    if (next) document.getElementById(`r${next.id}-scu`)?.focus();
    else addRow(contract.id);
  }

  function resetAll() {
    dispatch({ type: "resetAll", contract: newContract() });
    showStatus("All reset");
  }

  /* Take a contract's rows out of this layout's grids. */
  function resetGrids(id: number) {
    dispatch({ type: "resetPlan", id, at });
    showStatus("Grids reset");
  }

  async function copy({ toText, done }: (typeof COPY_FORMATS)[number]) {
    const ok = await copyText(toText(exportTable(haul)));
    showStatus(ok ? done : "Copy isn't available here");
  }

  const shipInfo = configError || (layout ? layoutSummary(layout) : "");

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
          <label className="picker" hidden={(ship?.layouts.length ?? 0) < 2}>
            <span>Layout</span>
            <select
              id="layout"
              value={layout?.id ?? ""}
              onChange={(e) => dispatch({ type: "selectLayout", layoutId: e.target.value })}
            >
              {ship?.layouts.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
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
          <button type="button" className="btn primary" id="add-contract" onClick={addContract}>
            Add contract
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
            label="Reset all"
            confirmAriaLabel="Confirm resetting all contracts"
            className="reset-all"
            onConfirm={resetAll}
          />
        </div>
      </div>
      {/* Copy and reset messages, as a toast at the foot of the window, so they never move the page. */}
      <p className="status" aria-live="polite" hidden={!status}>
        {status}
      </p>

      {/* Each contract: a bar with its show/hide toggle, name, Add row and Delete
          contract, over its table. */}
      <div className="contracts">
        {haul.contracts.map((table, i) => (
          <section key={table.id} className="contract" aria-label={table.label}>
            <div className="contract-bar">
              <button
                type="button"
                className={`btn icon contract-toggle${table.collapsed ? " is-collapsed" : ""}`}
                aria-expanded={!table.collapsed}
                aria-controls={`c${table.id}-table`}
                aria-label={`${table.label}'s table`}
                data-tip={table.collapsed ? "Show table" : "Hide table"}
                onClick={() => dispatch({ type: "setCollapsed", id: table.id, collapsed: !table.collapsed })}
              >
                <ChevronIcon />
              </button>
              <input
                className="contract-name"
                id={`c${table.id}-name`}
                aria-label="Contract name"
                placeholder={`Contract ${i + 1}`}
                value={table.name}
                onChange={(e) => dispatch({ type: "renameContract", id: table.id, name: e.target.value })}
              />
              <button type="button" className="btn" id={`c${table.id}-add-row`} onClick={() => addRow(table.id)}>
                Add row
              </button>
              {haul.contracts.length > 1 && (
                <ConfirmButton
                  label="Delete contract"
                  ariaLabel={`Delete ${table.label} and its rows`}
                  confirmAriaLabel={`Confirm deleting ${table.label} and its rows`}
                  className="delete-contract"
                  onConfirm={() => deleteContract(table.id)}
                />
              )}
              {/* While the table is hidden, what's in it. */}
              {table.collapsed && (
                <span className="contract-summary">
                  {plural(table.deliveries.length, "row")} · {fmt(table.totals.scu)} SCU
                </span>
              )}
            </div>
            <div className="frame" id={`c${table.id}-table`} hidden={table.collapsed}>
              <CargoTable
                table={table}
                grids={haul.grids}
                free={haul.totals.free}
                cargoByRow={emphasis.byRow}
                onUpdate={(id, field, value) => dispatch({ type: "updateRow", id, field, value })}
                onToggleGrid={(id, name) => dispatch({ type: "toggleGrid", id, grid: { ...at, name } })}
                onHighlight={setHighlight}
                onPointRows={emphasis.point}
                onDelete={deleteRow}
                onSort={(key) => dispatch({ type: "sortBy", id: table.id, key })}
                onToggleSize={(size, on) => dispatch({ type: "setSizeEnabled", id: table.id, size, on })}
                onScuEnter={focusNextScu}
                onResetGrids={() => resetGrids(table.id)}
              />
            </div>
          </section>
        ))}
      </div>

      <section className="section" aria-labelledby="ship-title">
        {/* The heading and the legend share a line. */}
        <div className="section-head">
          <h2 id="ship-title">Ship view</h2>
          {isMounted && (
            <Legend
              view={emphasis.view}
              onView={emphasis.changeView}
              entries={emphasis.legend}
              onTogglePicked={emphasis.togglePicked}
              onPointRows={emphasis.point}
            />
          )}
        </div>
        {layout && isMounted ? (
          <Suspense fallback={<p className="hint">Loading the 3D view…</p>}>
            <ShipView
              layout={layout}
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
