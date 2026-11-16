import { shortText, type Calc, type Split } from "../lib/calc";
import type { Container, Position } from "../lib/cargo";
import type { Cargo } from "../lib/colors";
import { fmt, initials, plural } from "../lib/format";
import type { Counts, Fill } from "../lib/packing";
import { isEnabled, TEXT_COLUMNS, type Row, type RowField, type Sort, type State, type TextKey } from "../lib/state";
import { Swatch } from "./Legend";

type Props = {
  state: State;
  calc: Calc;
  containers: Container[];
  positions: Position[];
  /* Each row's color in the ship view, for its swatch. */
  cargoByRow: Map<number, Cargo>;
  onUpdate: (id: number, field: RowField, value: string) => void;
  /* Pick a grid for a row (after every earlier pick), or unpick it. */
  onTogglePick: (id: number, name: string) => void;
  /* The grid the pointer or focus is on, for the ship view; null when none. */
  onHighlight: (name: string | null) => void;
  onDelete: (id: number) => void;
  onSort: (key: TextKey) => void;
  onToggleSize: (size: number, on: boolean) => void;
  onScuEnter: (id: number) => void;
};
type RowActions = Pick<Props, "onUpdate" | "onTogglePick" | "onHighlight" | "onDelete" | "onScuEnter">;

/* A container size's column, on unless turned off in its header. */
type SizeColumn = { size: number; on: boolean };
/* A grid's button: its short tag and the SCU it has free (below 0 when over). */
type GridButton = { name: string; tag: string; free: number };

/* The editable cargo table: Material / Pick-up / Drop-off, SCU, a column per
   container size, Left over (only when some SCU can't be placed), Grid. */
export function CargoTable({
  state,
  calc,
  containers,
  positions,
  cargoByRow,
  onSort,
  onToggleSize,
  ...rowActions
}: Props) {
  const sizes: SizeColumn[] = containers.map(({ size }) => ({ size, on: isEnabled(state.enabled, size) }));
  const tags = initials(positions.map((p) => p.name));
  const grids: GridButton[] = positions.map((p, i) => ({
    name: p.name,
    tag: tags[i],
    free: p.capacity - calc.byPosition.get(p.name)!.scu,
  }));
  /* Material, Pick-up and Drop-off; SCU; the sizes; Left over; Grid. */
  const columnCount = TEXT_COLUMNS.length + 1 + sizes.length + 1 + 1;
  return (
    <table className="grid" id="cargo">
      <thead>
        <tr>
          {TEXT_COLUMNS.map(({ key, label }) => (
            <SortHead key={key} sortKey={key} label={label} sort={state.sort} onSort={onSort} />
          ))}
          <th className="label num">SCU</th>
          {sizes.map(({ size, on }, i) => (
            <SizeHead key={size} size={size} first={i === 0} on={on} onToggle={onToggleSize} />
          ))}
          <th className="label num sep leftover" hidden={!calc.showLeftover}>
            Left over
          </th>
          <th className="label sep">Grid</th>
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
              cargo={cargoByRow.get(row.id)}
              sizes={sizes}
              grids={grids}
              showLeftover={calc.showLeftover}
              {...rowActions}
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
          <CalcCells fill={calc.totals} sizes={sizes} showLeftover={calc.showLeftover} />
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
      <button
        type="button"
        className="size-btn"
        aria-pressed={on}
        aria-label={`${size} SCU containers`}
        title={`${on ? "Using" : "Skipping"} ${size} SCU containers. Click to ${on ? "skip" : "use"} them.`}
        onClick={() => onToggle(size, !on)}
      >
        {size}
      </button>
    </th>
  );
}

function CargoRow({
  row,
  fill,
  split,
  cargo,
  sizes,
  grids,
  showLeftover,
  onUpdate,
  onTogglePick,
  onHighlight,
  onDelete,
  onScuEnter,
}: RowActions & {
  row: Row;
  fill: Fill;
  split: Split;
  cargo: Cargo | undefined;
  sizes: SizeColumn[];
  grids: GridButton[];
  showLeftover: boolean;
}) {
  const why = shortText(split) || undefined;
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
                {/* The row's color in the ship view; a gap until it has SCU. */}
                <span className="row-swatch" title={cargo ? "This row's color in the ship view" : undefined}>
                  {cargo && <Swatch color={cargo.color} />}
                </span>
                {input}
              </div>
            )}
          </td>
        );
      })}
      {/* Amber when the row's grids don't have room for all of it; the tooltip says how much. */}
      <td className="edit scu-cell" data-short={split.short ? "" : undefined} title={why}>
        <input
          className="field scu"
          inputMode="numeric"
          placeholder="0"
          aria-label="SCU"
          aria-description={why}
          {...field("scu")}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            onScuEnter(row.id);
          }}
        />
      </td>
      <CalcCells fill={fill} sizes={sizes} showLeftover={showLeftover} />
      <td className="edit sep">
        <GridPicks row={row} split={split} grids={grids} onTogglePick={onTogglePick} onHighlight={onHighlight} />
      </td>
    </tr>
  );
}

/* The Grid cell: a toggle button per grid showing the SCU it has available.
   Pointing at (or tabbing to) a button lights that grid up in the ship view. */
function GridPicks({
  row,
  split,
  grids,
  onTogglePick,
  onHighlight,
}: Pick<RowActions, "onTogglePick" | "onHighlight"> & {
  row: Row;
  split: Split;
  grids: GridButton[];
}) {
  const share = new Map(split.parts.map((p) => [p.name, p.scu]));
  return (
    <div className="grid-cell">
      {/* At most four buttons a line, so a ship with many grids stays narrow. */}
      <div
        className="grid-picks"
        role="group"
        aria-label="Grids for this row"
        style={{ gridTemplateColumns: `repeat(${Math.min(grids.length, 4)}, auto)` }}
      >
        {grids.map(({ name, tag, free }) => {
          const on = share.has(name);
          const lines = [
            name,
            `${fmt(free)} SCU available`,
            ...(on && split.parts.length > 1 ? [`${fmt(share.get(name)!)} SCU of this row`] : []),
          ];
          return (
            <button
              key={name}
              type="button"
              className="grid-pick"
              aria-pressed={on}
              aria-label={lines.join(", ")}
              title={lines.join("\n")}
              data-over={free < 0 || undefined}
              onClick={() => onTogglePick(row.id, name)}
              onMouseEnter={() => onHighlight(name)}
              onMouseLeave={() => onHighlight(null)}
              onFocus={() => onHighlight(name)}
              onBlur={() => onHighlight(null)}
            >
              <span className="grid-tag">{tag}</span>
              <span className="grid-free">{fmt(free)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* Look, text and tooltip for a container count. `counts` holds only the sizes
   the row could use, so a checked size missing from it is too big for the
   row's position. */
function countCell(size: number, counts: Counts, on: boolean) {
  if (!on) return { look: "off", text: "–", title: undefined };
  if (!Object.hasOwn(counts, size))
    return { look: "off", text: "–", title: `${size} SCU containers don't fit this row's grids` };
  const n = counts[size];
  return { look: n ? "has" : "zero", text: fmt(n), title: undefined };
}

/* Container counts and Left over for one row, or the total row. */
function CalcCells({ fill, sizes, showLeftover }: { fill: Fill; sizes: SizeColumn[]; showLeftover: boolean }) {
  return (
    <>
      {sizes.map(({ size, on }, i) => {
        const cell = countCell(size, fill.counts, on);
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
