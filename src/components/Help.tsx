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

        <h3>Contracts Tables</h3>
        <ul>
          <li>
            Click <strong>Add contract</strong> for each contract you accept, and give it a row per delivery. This
            allows you to stack and visualize multiple contracts. Give the contract name if you want or just leave it.
          </li>
          <li>
            Click <strong>Delete contract</strong> if you want to remove a contract and its rows. Click it again to
            confirm. Clicked <strong>Delete contract</strong> by mistake, just wait a few seconds and the{" "}
            <strong>Confirm</strong> mode goes away.
          </li>
          <li>
            Click <strong>Add cargo row</strong> to add a new cargo row to a contract. Fill in the cargo name, pick-up,
            drop-off and SCU. Each row is split into the biggest container size its contract hands out first, then the
            next size down, as the game hands a contract over. We've capped it at 9,999 SCU for now until we get bigger
            ships.
          </li>
          <li>
            Press <kbd>Enter</kbd> in the SCU column to jump to the next row, or add one if you're on the contract's
            last row.
          </li>
          <li>
            Toggle the SCU size buttons to disable or enable a container size for the entire contract. The tool will
            automatically recalculate the distribution of containers based on the total SCU and the max container sizes
            described for that contract. Just like in <strong>Star Citizen</strong>, the{" "}
            <strong>Cargo Visualizer</strong> splits cargo into the largest SCU containers first until all cargo is
            accounted for.
          </li>
          <li>
            Click the Cargo, Pick-up or Drop-off heading to sort that contract's rows by that column, and again to
            reverse it.
          </li>
          <li>
            The arrow at the left of a contract's bar hides its table, so the ship view comes up the page; the bar then
            shows how many rows and SCU it holds, and how much SCU remains to be locked onto a grid.
          </li>
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
            REM (Remaining) shows the SCU not in a grid yet. While a row has some, its edge and SCU turn amber, and
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
            lists: each drop-off, from every contract; each pick-up; or each row. It starts on Drop-off. In Cargo, each
            button names its row's cargo and route by initials, &ldquo;Gold (PC to JS)&rdquo;; point at it to see the
            SCU and the pick-up and drop-off in full.
          </li>
          <li>
            Click an entry in the legend to pick it out, dimming everything else; click more to pick those out too, and
            again to stop. Point at an entry, or at a row's Cargo, Pick-up or Drop-off in the table, to dim the rest
            while you do.
          </li>
        </ul>

        <h3>Privacy</h3>
        <ul>
          <li>Your data is kept in this browser.</li>
          <li>The site counts visits anonymously with Cloudflare Web Analytics, which uses no cookies.</li>
        </ul>
      </div>
    </>
  );
}
