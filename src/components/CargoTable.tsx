import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Container, Counts, Fill, Position } from "../lib/cargo";
import { TEXT_COLUMNS, type Row, type RowField, type Sort, type State, type TextKey } from "../lib/state";
import { fmt, isEnabled, plural, positionText, shortText, type Calc, type Split } from "../lib/table";
import { WarnNote } from "./WarnNote";

type Props = {
  state: State;
  calc: Calc;
  containers: Container[];
  positions: Position[];
  onUpdate: (id: number, field: RowField, value: string) => void;
  onSetPositions: (id: number, names: string[]) => void;
  onDelete: (id: number) => void;
  onSort: (key: TextKey) => void;
  onToggleSize: (size: number, on: boolean) => void;
  onScuEnter: (id: number) => void;
};

/* The editable cargo grid: Material / Pick-up / Drop-off, SCU, a column per
   container size, Left over (only when some SCU can't be placed), Position. */
export function CargoTable({ state, calc, containers, positions, ...actions }: Props) {
  /* Free room in each position, for the position menus. */
  const free = new Map(positions.map((p) => [p.name, p.capacity - calc.byPosition.get(p.name)!.scu]));
  const columnCount = TEXT_COLUMNS.length + 1 + containers.length + 1 + 1;
  return (
    <table className="grid" id="cargo">
      <thead>
        <tr>
          {TEXT_COLUMNS.map(({ key, label }) => (
            <SortHead key={key} sortKey={key} label={label} sort={state.sort} onSort={actions.onSort} />
          ))}
          <th className="label num">SCU</th>
          {containers.map(({ size }, i) => (
            <SizeHead
              key={size}
              size={size}
              first={i === 0}
              on={isEnabled(state.enabled, size)}
              onToggle={actions.onToggleSize}
            />
          ))}
          <th className="label num sep leftover" hidden={!calc.showLeftover}>
            Left over
          </th>
          <th className="label sep">Position</th>
        </tr>
      </thead>
      <tbody>
        {state.rows.length === 0 ? (
          <tr className="empty-row">
            <td colSpan={columnCount}>
              No rows yet. Click <strong>Add row</strong> to start.
            </td>
          </tr>
        ) : (
          state.rows.map((row) => (
            <CargoRow
              key={row.id}
              row={row}
              fill={calc.byRow.get(row.id)!}
              split={calc.splits.get(row.id)!}
              free={free}
              showLeftover={calc.showLeftover}
              containers={containers}
              enabled={state.enabled}
              positions={positions}
              {...actions}
            />
          ))
        )}
      </tbody>
      <tfoot>
        <tr>
          <td className="label" colSpan={TEXT_COLUMNS.length}>
            Total · {plural(state.rows.length, "row")}
          </td>
          <td className="foot-scu">{fmt(calc.totals.scu)}</td>
          <CalcCells
            fill={calc.totals}
            showLeftover={calc.showLeftover}
            containers={containers}
            enabled={state.enabled}
          />
          <td className="sep" />
        </tr>
      </tfoot>
    </table>
  );
}

function SortHead({
  sortKey,
  label,
  sort,
  onSort,
}: {
  sortKey: TextKey;
  label: string;
  sort: Sort;
  onSort: (key: TextKey) => void;
}) {
  const dir = sort?.key === sortKey ? sort.dir : 0;
  return (
    <th className="label sort-th" aria-sort={dir === 1 ? "ascending" : dir === -1 ? "descending" : "none"}>
      <div className="sortable">
        {label}
        <button
          type="button"
          className={`icon-btn sort-btn${dir ? " is-active" : ""}`}
          id={`sort-${sortKey}`}
          aria-label={`Sort by ${label}`}
          title={`Sort by ${label}`}
          onClick={() => onSort(sortKey)}
        >
          {dir === 1 ? "↑" : dir === -1 ? "↓" : "↕"}
        </button>
      </div>
    </th>
  );
}

function SizeHead({
  size,
  first,
  on,
  onToggle,
}: {
  size: number;
  first: boolean;
  on: boolean;
  onToggle: (size: number, on: boolean) => void;
}) {
  return (
    <th className={`size-toggle${on ? "" : " is-off"}${first ? " sep" : ""}`}>
      <label title={`${on ? "Uncheck to skip" : "Check to use"} ${size} SCU containers`}>
        <input type="checkbox" id={`size-${size}`} checked={on} onChange={(e) => onToggle(size, e.target.checked)} />
        <span className="size">{size}</span>
      </label>
    </th>
  );
}

function CargoRow({
  row,
  fill,
  showLeftover,
  containers,
  enabled,
  positions,
  split,
  free,
  onUpdate,
  onSetPositions,
  onDelete,
  onScuEnter,
}: Omit<Props, "state" | "calc" | "onSort" | "onToggleSize"> & {
  row: Row;
  fill: Fill;
  split: Split;
  free: Map<string, number>;
  showLeftover: boolean;
  enabled: State["enabled"];
}) {
  const field = (key: RowField) => ({
    id: `r${row.id}-${key}`,
    value: row[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => onUpdate(row.id, key, e.target.value),
  });
  return (
    <tr className={split.short ? "needs-split" : undefined}>
      {TEXT_COLUMNS.map(({ key, label }, i) => {
        const input = <input className="field" aria-label={label} {...field(key)} />;
        return (
          <td className="edit" key={key}>
            {i > 0 ? (
              input
            ) : (
              <div className="material-cell">
                <button
                  type="button"
                  className="icon-btn row-del"
                  aria-label="Delete row"
                  title="Delete row"
                  onClick={() => onDelete(row.id)}
                >
                  ×
                </button>
                {input}
              </div>
            )}
          </td>
        );
      })}
      <td className="edit scu-cell">
        <input
          className="field scu"
          inputMode="numeric"
          placeholder="0"
          aria-label="SCU"
          {...field("scu")}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            onScuEnter(row.id);
          }}
        />
      </td>
      <CalcCells fill={fill} showLeftover={showLeftover} containers={containers} enabled={enabled} />
      <td className="edit sep">
        <PositionPicker row={row} split={split} positions={positions} free={free} onSetPositions={onSetPositions} />
      </td>
    </tr>
  );
}

/* The Position cell: the row's positions (with each one's share when it's
   split) and a menu of checkboxes to choose them. Flags a row whose positions
   don't have room for all of it. */
function PositionPicker({
  row,
  split,
  positions,
  free,
  onSetPositions,
}: {
  row: Row;
  split: Split;
  positions: Position[];
  free: Map<string, number>;
  onSetPositions: (id: number, names: string[]) => void;
}) {
  const menuId = `r${row.id}-positions`;
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const { parts, short } = split;
  const share = new Map(parts.map((p) => [p.name, p.scu]));

  /* The menu sits in the top layer, outside the table's scroll frame, so it
     closes rather than drift when anything behind it scrolls. */
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (!menu.current?.contains(e.target as Node)) menu.current?.hidePopover();
    };
    addEventListener("scroll", close, true);
    addEventListener("resize", close);
    return () => {
      removeEventListener("scroll", close, true);
      removeEventListener("resize", close);
    };
  }, [open]);

  /* Under the button before it shows; once it has a size, kept on screen,
     above the button when there's no room below. */
  function place(measured: boolean) {
    const [b, m] = [button.current!.getBoundingClientRect(), menu.current!];
    const [w, h] = measured ? [m.offsetWidth, m.offsetHeight] : [0, 0];
    m.style.minWidth = `${b.width}px`;
    m.style.left = `${Math.max(8, Math.min(b.left, innerWidth - w - 8))}px`;
    m.style.top = `${b.bottom + h > innerHeight - 8 ? Math.max(8, b.top - h) : b.bottom}px`;
  }

  /* Ticking a position can change the button's height, so follow it. */
  useLayoutEffect(() => {
    if (open) place(true);
  });

  const toggle = (name: string, on: boolean) =>
    onSetPositions(row.id, on ? [...row.positions, name] : row.positions.filter((n) => n !== name));
  const flag = short ? (parts.length ? `${fmt(short)} SCU short` : "Needs splitting") : "";

  return (
    <>
      <button
        ref={button}
        type="button"
        className="field pos-btn"
        id={`r${row.id}-position`}
        popoverTarget={menuId}
        aria-label={`Position: ${positionText(split) || "none"}${flag ? `. ${shortText(split)}` : ""}`}
        title={shortText(split) || undefined}
        disabled={positions.length === 0}
      >
        <span className="pos-parts">
          {parts.length === 0 && <span className="pos-none">—</span>}
          {parts.length === 1 && <span>{parts[0].name}</span>}
          {parts.length > 1 &&
            parts.map((p) => (
              <span key={p.name} className="pos-part">
                <span>{p.name}</span>
                <span className="pos-scu">{fmt(p.scu)}</span>
              </span>
            ))}
          {flag && <WarnNote>{flag}</WarnNote>}
        </span>
        <span className="pos-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      <div
        ref={menu}
        id={menuId}
        popover="auto"
        className="pos-menu"
        role="group"
        aria-label="Positions for this row"
        onBeforeToggle={(e) => {
          if (e.newState === "open") place(false);
        }}
        onToggle={(e) => {
          setOpen(e.newState === "open");
          if (e.newState === "open") place(true);
        }}
      >
        {positions.map((p) => {
          const on = share.has(p.name);
          return (
            <label key={p.name} className="pos-option">
              <input type="checkbox" checked={on} onChange={(e) => toggle(p.name, e.target.checked)} />
              <span>{p.name}</span>
              <span className="pos-room">
                {on ? `${fmt(share.get(p.name)!)} here` : `${fmt(Math.max(0, free.get(p.name)!))} free`}
              </span>
            </label>
          );
        })}
        <p className="pos-help">Choose several to split this row. It fills them in this order.</p>
      </div>
    </>
  );
}

/* Look, text and tooltip for a container count. `counts` holds only the sizes
   the row could use, so a checked size missing from it is too big for the
   row's position. */
function countCell(size: number, counts: Counts, on: boolean) {
  if (!on) return { look: "off", text: "–", title: undefined };
  if (!Object.hasOwn(counts, size))
    return { look: "off", text: "–", title: `${size} SCU containers don't fit this position` };
  const n = counts[size];
  return { look: n ? "has" : "zero", text: fmt(n), title: undefined };
}

/* Container counts and Left over for one row, or the total row. */
function CalcCells({
  fill,
  showLeftover,
  containers,
  enabled,
}: {
  fill: Fill;
  showLeftover: boolean;
  containers: Container[];
  enabled: State["enabled"];
}) {
  return (
    <>
      {containers.map(({ size }, i) => {
        const cell = countCell(size, fill.counts, isEnabled(enabled, size));
        return (
          <td key={size} className={`count${i === 0 ? " sep" : ""}`} data-state={cell.look} title={cell.title}>
            {cell.text}
          </td>
        );
      })}
      <td className="leftover sep" data-state={fill.leftover ? "warn" : "zero"} hidden={!showLeftover}>
        {fmt(fill.leftover)}
      </td>
    </>
  );
}
