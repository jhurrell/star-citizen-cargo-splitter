/* The "How to use" button and its panel, which opens over the page (a
   popover: Escape or a click outside closes it), so the help takes no room
   until it's wanted. */
export function Help() {
  return (
    <>
      <button type="button" className="btn help-btn" popoverTarget="help">
        How to use
      </button>
      <div id="help" popover="auto" role="dialog" className="help-panel" aria-labelledby="help-title">
        <div className="help-head">
          <h2 id="help-title">How to use</h2>
          <button
            type="button"
            className="icon-btn help-close"
            popoverTarget="help"
            popoverTargetAction="hide"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <h3>The table</h3>
        <ul>
          <li>
            Click <strong>Add contract</strong> for each contract you accept, and give it a row per delivery. Its{" "}
            <strong>Add cargo row</strong> adds another.
          </li>
          <li>
            The arrow at the left of a contract's bar hides its table, so the ship view comes up the page; the bar then
            shows how many rows and SCU it holds, and how much SCU remains to put in a grid. Click it again, or{" "}
            <strong>Add cargo row</strong>, to show the table.
          </li>
          <li>
            In each contract's table heading, click a size the contract doesn't hand out to turn it off: every size
            above the max container size the game shows for it, and any it skips.
          </li>
          <li>
            Enter the SCU on each row. Each row is split into the biggest container size its contract hands out first,
            then the next size down, as the game hands a contract over. A row takes up to 9,999 SCU.
          </li>
          <li>
            Click the Cargo, Pick-up or Drop-off heading to sort that contract's rows by that column, and again to
            reverse it.
          </li>
          <li>
            Press <kbd>Enter</kbd> in the SCU column to jump to the next row, or add one if you're on the contract's
            last row.
          </li>
          <li>
            <strong>Delete contract</strong> removes a contract and its rows. Click it again to confirm.
          </li>
          <li>Your table is kept in this browser.</li>
        </ul>

        <h3>Grids</h3>
        <ul>
          <li>
            Click a grid button to put a row in that grid. Each button shows the SCU the grid has available, and a full
            grid can't be added.
          </li>
          <li>
            To split a big delivery, turn on several grids: grids fill in the order you add them, and a later one only
            takes the room an earlier one left. Containers a grid's shape can't fit move on to the row's next grid.
          </li>
          <li>
            Reset, in a contract's Grids heading, takes that contract's rows out of their grids. Click it again to
            confirm.
          </li>
          <li>
            Δ (Remaining) shows the SCU not in a grid yet. While a row has some, its edge and SCU turn amber, and
            pointing at the SCU says why.
          </li>
        </ul>

        <h3>Ship view</h3>
        <ul>
          <li>Drag to turn, scroll to zoom, right-drag to pan.</li>
          <li>Each grid's grid face, where containers lock, is pale blue; containers stack away from it.</li>
          <li>Point at a container to see what it holds, or at a grid button in the table to light that grid up.</li>
          <li>
            Drop-off, Pick-up and Cargo, beside the heading, choose how containers are colored and what the legend
            lists: each drop-off, from every contract; each pick-up; or each row. It starts on Drop-off.
          </li>
          <li>
            Click an entry in the legend to pick it out, dimming everything else; click more to pick those out too, and
            again to stop. Point at an entry, or at a row's Cargo, Pick-up or Drop-off in the table, to dim the rest
            while you do.
          </li>
        </ul>
      </div>
    </>
  );
}
