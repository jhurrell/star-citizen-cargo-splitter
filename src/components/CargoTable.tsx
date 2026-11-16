import type { Container, Counts, Fill, Position } from "../lib/cargo";
import { TEXT_COLUMNS, type Row, type RowField, type Sort, type State, type TextKey } from "../lib/state";
import { fmt, isEnabled, plural, rowPosition, type Calc } from "../lib/table";

type Props = {
  state: State;
  calc: Calc;
  containers: Container[];
  positions: Position[];
  onUpdate: (id: number, field: RowField, value: string) => void;
  onDelete: (id: number) => void;
  onSort: (key: TextKey) => void;
  onToggleSize: (size: number, on: boolean) => void;
  onScuEnter: (id: number) => void;
};

/* The editable cargo grid: Material / Pick-up / Drop-off, SCU, a column per
   container size, Left over (only when some SCU can't be placed), Position. */
export function CargoTable({ state, calc, containers, positions, ...actions }: Props) {
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
  onUpdate,
  onDelete,
  onScuEnter,
}: Omit<Props, "state" | "calc" | "onSort" | "onToggleSize"> & {
  row: Row;
  fill: Fill;
  showLeftover: boolean;
  enabled: State["enabled"];
}) {
  const field = (key: RowField) => ({
    id: `r${row.id}-${key}`,
    value: row[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onUpdate(row.id, key, e.target.value),
  });
  return (
    <tr>
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
        <select
          className="field"
          aria-label="Position"
          {...field("position")}
          value={rowPosition(positions, row)?.name ?? ""}
        >
          {["", ...positions.map((p) => p.name)].map((name) => (
            <option key={name} value={name}>
              {name || "—"}
            </option>
          ))}
        </select>
      </td>
    </tr>
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
