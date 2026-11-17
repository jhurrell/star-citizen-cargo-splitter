import { isOverMaxScu } from "../lib/cargo";
import type { Cargo } from "../lib/emphasis";
import { fmt, initials, plural } from "../lib/format";
import type { Delivery, Haul, HaulGrid, PickBlock, SizeCell, SizeColumn } from "../lib/haul";
import { TEXT_COLUMNS, type RowField, type Sort, type TextKey } from "../lib/state";
import { ConfirmButton } from "./ConfirmButton";
import { Swatch } from "./Legend";
import { pointHandlers } from "./pointing";

type Props = {
  haul: Haul;
  sort: Sort;
  /* Each row's color in the ship view, for its swatch. */
  cargoByRow: Map<number, Cargo>;
  onUpdate: (id: number, field: RowField, value: string) => void;
  /* Pick a grid for a row (after every earlier pick), or unpick it. */
  onTogglePick: (id: number, name: string) => void;
  /* The grid the pointer or focus is on, for the ship view; null when none. */
  onHighlight: (name: string | null) => void;
  /* The row whose Cargo, Pick-up or Drop-off the pointer or focus is in (as
     a list of one), so the ship view can fade the rest; null when none. */
  onPointRows: (ids: number[] | null) => void;
  onDelete: (id: number) => void;
  onSort: (key: TextKey) => void;
  onToggleSize: (size: number, on: boolean) => void;
  onScuEnter: (id: number) => void;
  /* Take every row out of its grids (the Grids heading's Clear, once confirmed). */
  onClearGrids: () => void;
};
type RowActions = Pick<Props, "onUpdate" | "onTogglePick" | "onHighlight" | "onPointRows" | "onDelete" | "onScuEnter">;

/* A grid's button: its short tag and what's in the grid. */
type GridButton = { tag: string; grid: HaulGrid };

/* The editable cargo table: Cargo / Pick-up / Drop-off, SCU, Remaining (SCU
   not in a grid yet), a column per container size, Left over (only when some
   SCU can't be made of the sizes turned on), Grids. */
export function CargoTable({ haul, sort, cargoByRow, onSort, onToggleSize, onClearGrids, ...rowActions }: Props) {
  const { sizes, deliveries, totals, showLeftover } = haul;
  const tags = initials(haul.grids.map((g) => g.position.name));
  const grids: GridButton[] = haul.grids.map((grid, i) => ({ tag: tags[i], grid }));
  /* Cargo, Pick-up and Drop-off; SCU; Remaining; the sizes; Left over; Grids. */
  const columnCount = TEXT_COLUMNS.length + 2 + sizes.length + 1 + 1;
  return (
    <table className="grid" id="cargo">
      <thead>
        <tr>
          {TEXT_COLUMNS.map(({ key, label }) => (
            <SortHead key={key} sortKey={key} label={label} sort={sort} onSort={onSort} />
          ))}
          <th className="label num narrow">SCU</th>
          {/* Δ for Remaining, to keep the column narrow. */}
          <th className="label num narrow" aria-label="Remaining" title="Remaining: SCU not in a grid yet">
            Δ
          </th>
          {sizes.map(({ size, on }, i) => (
            <SizeHead key={size} size={size} first={i === 0} on={on} onToggle={onToggleSize} />
          ))}
          <th className="label num sep leftover" hidden={!showLeftover}>
            Left over
          </th>
          <th className="label sep">
            <div className="grids-head">
              Grids
              <ConfirmButton
                label="Clear"
                ariaLabel="Clear every row's grids"
                confirmAriaLabel="Confirm clearing every row's grids"
                className="clear-grids"
                disabled={!haul.anyAssigned}
                onConfirm={onClearGrids}
              />
            </div>
          </th>
        </tr>
      </thead>
      <tbody>
        {deliveries.length === 0 ? (
          <tr className="empty-row">
            <td colSpan={columnCount}>
              No rows yet. Click <strong>Add row</strong> to start.
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
          <RemainingCell scu={totals.unassigned} />
          <SizeCells cells={totals.cells} sizes={sizes} />
          <LeftoverCell scu={totals.leftover} shown={showLeftover} />
          <td
            className="sep foot-free"
            title={totals.free ? `${fmt(totals.free)} SCU of grid space not used yet` : undefined}
          >
            {totals.free > 0 && `${fmt(totals.free)} free`}
          </td>
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
      {/* The arrow comes first, so it's seen before the label. */}
      <div className="sortable">
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
        {label}
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

/* What of a row isn't in a grid yet, and what to do about it. */
function unassignedText({ unassigned, unassignedReason, parts }: Delivery): string | undefined {
  if (!unassignedReason) return undefined;
  if (unassignedReason === "noGrid") return `${fmt(unassigned)} SCU not in a grid yet. Choose a grid for it.`;
  const where = parts.length === 1 ? "this grid" : "these grids";
  return `${fmt(unassigned)} SCU doesn't fit in ${where}. Choose another grid to split it.`;
}

function CargoRow({
  delivery,
  cargo,
  sizes,
  grids,
  showLeftover,
  onUpdate,
  onTogglePick,
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
  const { row, unassigned } = delivery;
  const why = unassignedText(delivery);
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
    <tr className={unassigned ? "has-unassigned" : undefined}>
      {TEXT_COLUMNS.map(({ key, label }, i) => {
        const input = <input className="field" aria-label={label} {...field(key)} />;
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
      <td className="edit scu-cell" data-unassigned={unassigned ? "" : undefined} title={why}>
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
      <RemainingCell scu={unassigned} title={why} />
      <SizeCells cells={delivery.cells} sizes={sizes} />
      <LeftoverCell scu={delivery.leftover} shown={showLeftover} />
      <td className="edit sep">
        <GridPicks delivery={delivery} grids={grids} onTogglePick={onTogglePick} onHighlight={onHighlight} />
      </td>
    </tr>
  );
}

/* Why a grid button is disabled, for its tooltip. */
const BLOCK_TEXT: Record<PickBlock, string> = {
  full: "Full: no room for another container",
  allAssigned: "All of this row is in its grids",
  tooSmall: "Too little room for this row's containers",
};

/* The Grids cell: a toggle button per grid showing the SCU it has available,
   disabled when the row can't pick it. Pointing at (or tabbing to) a button
   lights that grid up in the ship view. */
function GridPicks({
  delivery,
  grids,
  onTogglePick,
  onHighlight,
}: Pick<RowActions, "onTogglePick" | "onHighlight"> & {
  delivery: Delivery;
  grids: GridButton[];
}) {
  return (
    <div className="grid-cell">
      {/* At most four buttons a line, so a ship with many grids stays narrow. */}
      <div
        className="grid-picks"
        role="group"
        aria-label="Grids for this row"
        style={{ gridTemplateColumns: `repeat(${Math.min(grids.length, 4)}, auto)` }}
      >
        {delivery.grids.map(({ name, picked, block }, i) => {
          const { tag, grid } = grids[i];
          const lines = [name, `${fmt(grid.free)} SCU available`, ...(block ? [BLOCK_TEXT[block]] : [])];
          return (
            <button
              key={name}
              type="button"
              className="grid-pick"
              aria-pressed={picked}
              aria-label={lines.join(", ")}
              title={lines.join("\n")}
              disabled={block !== null}
              onClick={() => onTogglePick(delivery.row.id, name)}
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

/* The container counts for one row, or the total row; "–" under a size turned off. */
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

/* SCU no turned-on size can make up; the column shows only when some row has any. */
function LeftoverCell({ scu, shown }: { scu: number; shown: boolean }) {
  return (
    <td className="leftover sep" data-state={scu ? "warn" : "zero"} hidden={!shown}>
      {fmt(scu)}
    </td>
  );
}
