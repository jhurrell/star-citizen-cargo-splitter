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
            Enter the SCU on each row. Each row is split into the biggest container size that's turned on first, then
            the next size down, as the game hands a contract over. A row takes up to 9,999 SCU.
          </li>
          <li>Click a size in the table header to turn it off and skip it.</li>
          <li>Click the arrow beside Cargo, Pick-up or Drop-off to sort by that column, and again to reverse it.</li>
          <li>
            Press <kbd>Enter</kbd> in the SCU column to jump to the next row, or add one if you're on the last row.
          </li>
          <li>Your table is kept in this browser.</li>
        </ul>

        <h3>Grids</h3>
        <ul>
          <li>
            Click a grid button to put a row in that grid. Each button shows the SCU the grid has available, and a full
            grid can't be picked.
          </li>
          <li>
            To split a big delivery, turn on several grids: grids fill in the order you pick them, and a later pick only
            takes the room an earlier one left. Containers a grid's shape can't fit move on to the row's next grid.
          </li>
          <li>Clear, in the Grids heading, takes every row out of its grids. Click it again to confirm.</li>
          <li>
            Δ (Remaining) shows the SCU not in a grid yet. While a row has some, its edge and SCU turn amber, and
            pointing at the SCU says why.
          </li>
        </ul>

        <h3>Ship view</h3>
        <ul>
          <li>Drag to turn, scroll to zoom, right-drag to pan.</li>
          <li>The pale blue face of each grid is its floor; containers stack away from it.</li>
          <li>Point at a container to see what it holds, or at a grid button in the table to light that grid up.</li>
          <li>
            Click a row in the legend to dim its containers. Point at a row in the legend, or at its Cargo, Pick-up or
            Drop-off in the table, to dim all the others.
          </li>
        </ul>
      </div>
    </>
  );
}
