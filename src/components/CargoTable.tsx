import { isOverMaxScu } from "../lib/cargo";
import type { Cargo } from "../lib/emphasis";
import { fmt, initials, plural } from "../lib/format";
import type { ContractTable, Delivery, GridBlock, HaulGrid, SizeCell, SizeColumn } from "../lib/haul";
import { TEXT_COLUMNS, type RowField, type Sort, type TextKey } from "../lib/state";
import { ConfirmButton } from "./ConfirmButton";
import { Swatch } from "./Legend";
import { pointHandlers } from "./pointing";

type Props = {
  /* The contract this table shows. */
  table: ContractTable;
  /* Every cargo grid on the layout, in layout order. */
  grids: HaulGrid[];
  /* SCU free across all the grids. */
  free: number;
  /* Each row's color in the ship view, for its swatch. */
  cargoByRow: Map<number, Cargo>;
  onUpdate: (id: number, field: RowField, value: string) => void;
  /* Add a cargo grid to a row's plan (after every earlier step), or take it out. */
  onToggleGrid: (id: number, name: string) => void;
  /* The grid the pointer or focus is on, for the ship view; null when none. */
  onHighlight: (name: string | null) => void;
  /* The row whose Cargo, Pick-up or Drop-off the pointer or focus is in (as
     a list of one), so the ship view can fade the rest; null when none. */
  onPointRows: (ids: number[] | null) => void;
  onDelete: (id: number) => void;
  /* Sort this contract's rows. */
  onSort: (key: TextKey) => void;
  /* Skip a size in this contract, or hand it out again. */
  onSetHandsOut: (size: number, on: boolean) => void;
  onScuEnter: (id: number) => void;
  /* Take this contract's rows out of their grids (the Grids heading's Reset, once confirmed). */
  onResetGrids: () => void;
};
type RowActions = Pick<Props, "onUpdate" | "onToggleGrid" | "onHighlight" | "onPointRows" | "onDelete" | "onScuEnter">;

/* A grid's button: its short tag and what's in the grid. */
type GridButton = { tag: string; grid: HaulGrid };

/* One contract's editable cargo table: Cargo / Pick-up / Drop-off, SCU,
   Remaining (SCU not in a grid yet), a column per container size, whose
   heading turns the size on or off for this contract, Left over (only when
   some SCU can't be made of the sizes it hands out), Grids. */
export function CargoTable({
  table,
  grids: haulGrids,
  free,
  cargoByRow,
  onSort,
  onSetHandsOut,
  onResetGrids,
  ...rowActions
}: Props) {
  const { id, label, sort, sizes, deliveries, totals, showLeftover } = table;
  const tags = initials(haulGrids.map((g) => g.grid.name));
  const grids: GridButton[] = haulGrids.map((grid, i) => ({ tag: tags[i], grid }));
  /* Cargo, Pick-up and Drop-off; SCU; Remaining; the sizes; Left over; Grids. */
  const columnCount = TEXT_COLUMNS.length + 2 + sizes.length + 1 + 1;
  return (
    <table className="grid cargo" aria-label={label}>
      <thead>
        <tr>
          {TEXT_COLUMNS.map(({ key, label }) => (
            <SortHead key={key} id={`c${id}-sort-${key}`} sortKey={key} label={label} sort={sort} onSort={onSort} />
          ))}
          <th className="label num narrow">SCU</th>
          {/* Δ for Remaining, to keep the column narrow. */}
          <th className="label num narrow" aria-label="Remaining" title="Remaining: SCU not in a grid yet">
            Δ
          </th>
          {sizes.map(({ size, on }, i) => (
            <SizeHead key={size} size={size} first={i === 0} on={on} onToggle={onSetHandsOut} />
          ))}
          <th className="label num sep leftover" hidden={!showLeftover}>
            Left over
          </th>
          <th className="label sep">
            <div className="grids-head">
              Grids
              <ConfirmButton
                label="Reset"
                ariaLabel={`Reset the grids of every row in ${label}`}
                confirmAriaLabel={`Confirm resetting the grids of every row in ${label}`}
                className="reset-grids"
                disabled={!table.anyPlanned}
                onConfirm={onResetGrids}
              />
            </div>
          </th>
        </tr>
      </thead>
      <tbody>
        {deliveries.length === 0 ? (
          <tr className="empty-row">
            <td colSpan={columnCount}>
              No rows yet. Click <strong>Add cargo row</strong> to start.
            </td>
          </tr>
        ) : (
          deliveries.map((delivery) => (
            <CargoRow
              key={delivery.row.id}
              delivery={delivery}
              cargo={cargoByRow.get(delivery.row.id)}
              sizes={sizes}
              grids={grids}
              showLeftover={showLeftover}
              {...rowActions}
            />
          ))
        )}
      </tbody>
      <tfoot>
        <tr>
          <td className="label" colSpan={TEXT_COLUMNS.length}>
            Total · {plural(deliveries.length, "row")}
          </td>
          <td className="foot-scu">{fmt(totals.scu)}</td>
          <RemainingCell scu={totals.remaining} />
          <SizeCells cells={totals.cells} sizes={sizes} />
          <LeftoverCell scu={totals.leftover} shown={showLeftover} />
          <td className="sep foot-free" title={free ? `${fmt(free)} SCU of grid space not used yet` : undefined}>
            {free > 0 && `${fmt(free)} free`}
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

function SortHead({
  id,
  sortKey,
  label,
  sort,
  onSort,
}: {
  /* Unique on the page, as each contract has its own table. */
  id: string;
  sortKey: TextKey;
  label: string;
  sort: Sort;
  onSort: (key: TextKey) => void;
}) {
  const dir = sort?.key === sortKey ? sort.dir : 0;
  return (
    <th className="label sort-th" aria-sort={dir === 1 ? "ascending" : dir === -1 ? "descending" : "none"}>
      {/* The whole heading sorts: its arrow, first so it's seen before the label, and the label. */}
      <button
        type="button"
        className={`sortable${dir ? " is-active" : ""}`}
        id={id}
        title={`Sort by ${label}`}
        onClick={() => onSort(sortKey)}
      >
        <span className="sort-arrow" aria-hidden="true">
          {dir === 1 ? "↑" : dir === -1 ? "↓" : "↕"}
        </span>
        {label}
      </button>
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

/* A row's remaining SCU, and what to do about it. */
function remainingText({ remaining, remainingReason, parts }: Delivery): string | undefined {
  if (!remainingReason) return undefined;
  if (remainingReason === "noGrid") return `${fmt(remaining)} SCU not in a grid yet. Choose a grid for it.`;
  const where = parts.length === 1 ? "this grid" : "these grids";
  return `${fmt(remaining)} SCU doesn't fit in ${where}. Choose another grid to split it.`;
}

function CargoRow({
  delivery,
  cargo,
  sizes,
  grids,
  showLeftover,
  onUpdate,
  onToggleGrid,
  onHighlight,
  onPointRows,
  onDelete,
  onScuEnter,
}: RowActions & {
  delivery: Delivery;
  cargo: Cargo | undefined;
  sizes: SizeColumn[];
  /* In layout order, as the delivery's grid choices are. */
  grids: GridButton[];
  showLeftover: boolean;
}) {
  const { row, remaining } = delivery;
  const why = remainingText(delivery);
  const field = (key: RowField) => ({
    id: `r${row.id}-${key}`,
    value: row[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      /* Typing or pasting past the most SCU a row can have leaves the field as it was. */
      if (key === "scu" && isOverMaxScu(e.target.value)) return;
      onUpdate(row.id, key, e.target.value);
    },
  });
  return (
    <tr className={remaining ? "has-remaining" : undefined}>
      {TEXT_COLUMNS.map(({ key, label }, i) => {
        /* The placeholder, "Enter cargo" and so on, shows an empty cell can be typed in. */
        const input = (
          <input className="field" aria-label={label} placeholder={`Enter ${label.toLowerCase()}`} {...field(key)} />
        );
        return (
          /* Pointing at (or tabbing to) Cargo, Pick-up or Drop-off picks out
             this row in the ship view. */
          <td className="edit" key={key} {...pointHandlers((pointed) => onPointRows(pointed ? [row.id] : null))}>
            {i > 0 ? (
              input
            ) : (
              <div className="cargo-cell">
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
      {/* Amber while some of the row isn't in a grid; the tooltip says how much and why. */}
      <td className="edit scu-cell" data-remaining={remaining ? "" : undefined} title={why}>
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
      <RemainingCell scu={remaining} title={why} />
      <SizeCells cells={delivery.cells} sizes={sizes} />
      <LeftoverCell scu={delivery.leftover} shown={showLeftover} />
      <td className="edit sep">
        <GridButtons delivery={delivery} grids={grids} onToggleGrid={onToggleGrid} onHighlight={onHighlight} />
      </td>
    </tr>
  );
}

/* Why a grid button is disabled, for its tooltip. */
const BLOCK_TEXT: Record<GridBlock, string> = {
  full: "Full: no room for another container",
  allPlaced: "All of this row is in its grids",
  tooSmall: "Too little room for this row's containers",
};

/* The Grids cell: a toggle button per grid showing the SCU it has available,
   disabled when the row can't add it to its plan. Pointing at (or tabbing to) a button
   lights that grid up in the ship view. */
function GridButtons({
  delivery,
  grids,
  onToggleGrid,
  onHighlight,
}: Pick<RowActions, "onToggleGrid" | "onHighlight"> & {
  delivery: Delivery;
  grids: GridButton[];
}) {
  return (
    <div className="grid-cell">
      {/* At most four buttons a line, so a ship with many grids stays narrow. */}
      <div
        className="grid-buttons"
        role="group"
        aria-label="Grids for this row"
        style={{ gridTemplateColumns: `repeat(${Math.min(grids.length, 4)}, auto)` }}
      >
        {delivery.grids.map(({ name, inPlan, block }, i) => {
          const { tag, grid } = grids[i];
          const lines = [name, `${fmt(grid.free)} SCU available`, ...(block ? [BLOCK_TEXT[block]] : [])];
          return (
            <button
              key={name}
              type="button"
              className="grid-button"
              aria-pressed={inPlan}
              aria-label={lines.join(", ")}
              title={lines.join("\n")}
              disabled={block !== null}
              onClick={() => onToggleGrid(delivery.row.id, name)}
              {...pointHandlers((pointed) => onHighlight(pointed ? name : null))}
            >
              <span className="grid-tag">{tag}</span>
              <span className="grid-free">{fmt(grid.free)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* The SCU still to be put in a grid, amber while there is any. */
function RemainingCell({ scu, title }: { scu: number; title?: string }) {
  return (
    <td className="remaining" data-state={scu ? "warn" : "zero"} title={title}>
      {fmt(scu)}
    </td>
  );
}

/* The container counts for one row, or the total row; "–" under a size the contract skips. */
function SizeCells({ cells, sizes }: { cells: SizeCell[]; sizes: SizeColumn[] }) {
  return cells.map((cell, i) => (
    <td
      key={sizes[i].size}
      className={`count${i === 0 ? " sep" : ""}`}
      data-state={cell.kind === "off" ? "off" : cell.count ? "has" : "zero"}
    >
      {cell.kind === "off" ? "–" : fmt(cell.count)}
    </td>
  ));
}

/* SCU no size the contract hands out can make up; the column shows only when some row has any. */
function LeftoverCell({ scu, shown }: { scu: number; shown: boolean }) {
  return (
    <td className="leftover sep" data-state={scu ? "warn" : "zero"} hidden={!shown}>
      {fmt(scu)}
    </td>
  );
}
