import type { Counts, Position } from "../lib/cargo";
import { fmt, hasUnfit, loadOf, sum, unfitText, type Calc } from "../lib/table";
import { WarnNote } from "./WarnNote";

/* Read-only SCU-by-position table for the selected grid. Every position
   shows; Unassigned shows only when it holds cargo, which has no hold to fit. */
export function PositionsTable({ calc, positions }: { calc: Calc; positions: Position[] }) {
  const entry = (p: Position) => calc.byPosition.get(p.name)!;
  const unassigned = calc.byPosition.get("")!;
  const capacity = sum(positions, (p) => p.capacity);
  const positioned = sum(positions, (p) => entry(p).scu);
  return (
    <table className="grid" id="positions">
      <thead>
        <tr>
          <th className="label">Grid</th>
          <th className="label num">Rows</th>
          <th className="label num">SCU</th>
          <th className="label num">Capacity</th>
          <th className="label">Load</th>
          <th className="label num">Available</th>
          <th className="label">Fit</th>
        </tr>
      </thead>
      <tbody>
        {positions.length === 0 && (
          <tr className="empty-row">
            <td colSpan={7}>No ship loaded.</td>
          </tr>
        )}
        {positions.map((p) => {
          const e = entry(p);
          return (
            <tr key={p.name} className={e.scu ? undefined : "is-empty"}>
              <th scope="row">{p.name}</th>
              <td className="num">{fmt(e.rows)}</td>
              <td className="num scu-sum">{fmt(e.scu)}</td>
              <td className="num">{fmt(p.capacity)}</td>
              <LoadCells scu={e.scu} capacity={p.capacity} unfit={e.unfit} />
              <FitCell scu={e.scu} unfit={e.unfit} fitsText="Fits" />
            </tr>
          );
        })}
        {unassigned.scu > 0 && (
          <tr className="is-warn">
            <th scope="row">Unassigned</th>
            <td className="num">{fmt(unassigned.rows)}</td>
            <td className="num scu-sum">{fmt(unassigned.scu)}</td>
            <td />
            <td colSpan={3}>
              <WarnNote>Choose a grid for this cargo</WarnNote>
            </td>
          </tr>
        )}
      </tbody>
      <tfoot>
        <tr>
          <td className="label">Total</td>
          <td className="num">{fmt(calc.totals.rows)}</td>
          <td className="num scu-sum">{fmt(calc.totals.scu)}</td>
          <td className="num">{capacity ? fmt(capacity) : ""}</td>
          {capacity ? (
            <LoadCells scu={positioned} capacity={capacity} unfit={calc.totals.unfit} />
          ) : (
            <>
              <td />
              <td />
            </>
          )}
          <FitCell scu={positioned} unfit={calc.totals.unfit} fitsText="All fit" />
        </tr>
      </tfoot>
    </table>
  );
}

/* Bar and Available cells. The bar turns to a warning when containers don't fit. */
function LoadCells({ scu, capacity, unfit }: { scu: number; capacity: number; unfit: Counts }) {
  const load = loadOf(scu, capacity);
  return (
    <>
      <td>
        <div className="bar" data-state={hasUnfit(unfit) ? "over" : load.look} role="presentation">
          {/* React sets this width through the CSSOM, which a content security
              policy allows even where it ignores style="" attributes in markup. */}
          <span className="bar-fill" style={{ width: `${load.percent.toFixed(2)}%` }} />
        </div>
      </td>
      <td className="num avail" data-state={load.look}>
        {load.label}
      </td>
    </>
  );
}

/* Blank with no cargo, `fitsText` when everything fits, else which containers don't. */
function FitCell({ scu, unfit, fitsText }: { scu: number; unfit: Counts; fitsText: string }) {
  if (!scu) return <td />;
  if (!hasUnfit(unfit))
    return (
      <td className="fit" data-state="ok">
        {fitsText}
      </td>
    );
  return (
    <td className="fit" data-state="warn">
      <WarnNote>{unfitText(unfit)}</WarnNote>
    </td>
  );
}
