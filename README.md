# Star Citizen Cargo Visualizer

A cargo planner for Star Citizen haulers. Enter each delivery's SCU and Cargo Visualizer works out which container
sizes to use, splits large deliveries across your ship's cargo grids, and shows how it all packs in a 3D view of
the ship.

**Use it at [sc-cargovisualizer.space](https://sc-cargovisualizer.space/).**

## Features

- **Toolbar.** Type in the ship field to find a ship, or pick one from its list, and choose a layout when the ship
  has more than one. **Add contract** adds a contract with one blank row. The two copy icons copy the table, with each row's contract first, for a spreadsheet
  (tab-separated) or as a Markdown table; point at either one to see which is which. **How to use**, at the top
  right, opens a short guide.
- **A table per contract.** Each contract has a bar with an optional name (left blank, it's "Contract 1",
  "Contract 2", … in the copied table), its own **Add cargo row**, and **Delete contract** (with a second click), which removes it and its rows while
  there's more than one. Under the bar is its table. The arrow at the bar's left hides the table, leaving the bar
  with its row count, SCU and remaining SCU (amber while any remains), so the ship view needs less scrolling; it
  stays hidden after a reload, and Add cargo row shows it again. The size buttons in the table's heading turn a size off for
  that contract: the sizes above its max container size and any it skips. A new contract starts with every size on.
  Sorting and the Grids **Reset** act on that contract alone, and its foot totals that contract, so its SCU can be
  checked against the game's.
- **Container split per delivery.** Each row is split into the biggest container size its contract hands out
  first, then the next size down, as the game splits a contract delivery, whatever grids it goes in. A row takes up
  to 9,999 SCU. A size its contract doesn't hand out shows "–". A container that no grid's shape can take stays in
  Remaining rather than being split smaller (see
  [ADR 0001](docs/adr/0001-split-each-delivery-once.md)).
- **A loading plan, in the order you choose.** Click a grid button on a row to add that cargo grid to the row's
  plan. Each button shows the SCU the grid has left. A grid takes only the containers it can actually place, so a
  grid can have SCU free and still have no spot left for a container's shape. A row can't add a grid when no
  container any contract hands out can go in it, when all of the row is in its grids already, or when none of the row's
  containers still to place can go in; point at a greyed-out button to see which. Add several to split a big
  delivery: grids fill in the order you add them, across all rows, so a later step never takes room an earlier one
  already claimed. Containers a grid can't place move on, whole, to the row's next grid.
- **Resetting, with a second click.** **Reset all** empties the page, leaving one contract with one blank row. **Reset**, in a
  contract's Grids heading, keeps its rows but takes them out of this ship's grids; it's greyed out while no row is in a grid. Either turns to an amber
  **Confirm** for three seconds and acts only if you click it again, and keeps its width, so nothing moves.
- **Remaining SCU.** The Remaining column (headed REM), beside SCU, shows how much of each row isn't in a grid yet,
  because it has no grid or doesn't fit in its grids, with the contract's total at the foot. While a row has some, its
  edge and SCU turn amber; point at the SCU to see why. SCU that no size its contract hands out can make up shows under Left over
  instead, and takes no grid room. The foot of the Grids column shows how much grid space is still free.
- **Ship view.** A 3D view of the ship's grids with every container placed:
  - The first delivery in a grid loads from the fore end; later ones load from the aft end, so each row's cargo
    stays apart. A row's containers sit on the grid face or on its own containers while there's room, and on
    another row's only when there isn't.
  - **Drop-off**, **Pick-up** and **Cargo**, beside the heading, choose what the colors and the legend follow. It
    starts on Drop-off each visit:
    - Drop-off: a color per drop-off, across every contract, so a stop's cargo reads as one color. Drop-offs
      match whatever their case or spacing; rows without one share "No drop-off".
    - Pick-up: the same per pick-up.
    - Cargo: a color per row. Its button names its cargo and route by the places' initials, "Gold (PC to JS)"
      for Patch City to Jackson's Swap ("from PC" or "to JS" when it has only one), with its row number when
      another row's would read the same. Point at the button to see the row's SCU and its pick-up and drop-off in
      full.

    Each color stays with its drop-off, pick-up or row while it has SCU. Past eight, the rest share grey and one
    "Other …" button. The legend lists only what has containers in the view, in the table's order, and each
    container shows its size in SCU.

  - Click a legend button to pick it out: everything else turns see-through. Click more to pick them out too, and
    click again to stop. Point at a legend button, or at a row's Cargo, Pick-up or Drop-off in the table, to make
    everything else see-through while you do.
  - Point at a container to see what it holds, or at a grid button in the table to light that grid up.
  - Camera presets: 3D, top, bottom, port, starboard, fore and aft.
- **Kept in your browser.** The table, ship and settings are saved in local storage. Each ship keeps its own
  loading plan, so switching to another ship and back restores it.
- **Visit counts.** The built site loads [Cloudflare Web Analytics](https://www.cloudflare.com/web-analytics/),
  which counts visits without cookies; its token is in [`src/routes/__root.tsx`](src/routes/__root.tsx). The dev
  server leaves it out.

Ships included: 87, from the Aegis Avenger Titan to the Drake Ironclad. The MISC Hull B and C, RSI Hermes and Argo
RAFT are placed to match the ships; the rest have grid sizes and SCU from the ITG Cargo Grid Reference Guide, with
grids laid out roughly as its drawings show.

## Running it

Cargo Visualizer is a [TanStack Start](https://tanstack.com/start) app built with React, TypeScript and
[react-three-fiber](https://r3f.docs.pmnd.rs/), on the Vite+ toolchain (`vp`) with pnpm.

```bash
pnpm install
```

```bash
vp dev
```

| Command    | What it does                                                 |
| ---------- | ------------------------------------------------------------ |
| `vp dev`   | Starts the dev server                                        |
| `vp test`  | Runs the unit tests (Vitest)                                 |
| `vp check` | Formats, lints and type-checks                               |
| `vp build` | Builds a static site into `dist/client`, for any static host |

### Publishing

Every push to `main` runs [`.github/workflows/pages.yml`](.github/workflows/pages.yml): it checks and tests the
code, builds it with the base path Pages reports (`/` on the custom domain, sc-cargovisualizer.space, set in the
repository's Pages settings), and publishes `dist/client` to GitHub Pages. To publish without a push, run the
workflow from the Actions tab.

### Project layout

| Path                   | What's in it                                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/config/`          | `containers.json` and `ships.json` (see below)                                                                                                                           |
| `src/lib/`             | The logic, as pure functions: reading the config, state, packing, the copy formats, and `haul.ts`, whose `computeHaul` works out everything the table and ship view show |
| `src/components/`      | The page: the ship picker, cargo table, legend and 3D ship view (`ShipView.tsx`), plus the shared pieces below                                                           |
| `src/components/ship/` | The 3D ship view's parts, below                                                                                                                                          |
| `src/routes/`          | TanStack Start routes; the tool is the one page at `/`                                                                                                                   |
| `test/`                | Unit tests for `src/lib` and the ship view's scene geometry                                                                                                              |

Four pieces in `src/components/` are shared by the page:

- [`ConfirmButton.tsx`](src/components/ConfirmButton.tsx): a button that asks for a second click within 3 seconds,
  showing Confirm in between. Reset all, Delete contract and the Grids Reset use it.
- [`hooks.ts`](src/components/hooks.ts): the page's React state that isn't saved: the ship view's emphasis
  (its view, what's picked out or pointed at, and the colors handed out, worked out by `src/lib/emphasis.ts`) and
  the timed status message and confirm flag.
- [`icons.tsx`](src/components/icons.tsx): the copy buttons' icons and the contract bar's show/hide arrow.
- [`pointing.ts`](src/components/pointing.ts): pointer and focus handlers for things that react while pointed at,
  such as the table's rows and grid buttons and the legend's buttons.

`ShipView.tsx` draws each grid with its containers and loads only when a grid has placements, as three.js is large.
The rest of the 3D view lives in `src/components/ship/`:

- [`scene.ts`](src/components/ship/scene.ts): the scene's layout, as pure functions with no three.js: each
  container's box and size numbers, the camera views, the box around the cargo, the axes and the labels'
  positions. Size numbers read upright in the ship: on a face facing sideways their top points up, and on one
  facing up or down it points fore, however the grid is mounted. Tested in `test/scene.test.ts`.
- [`SizeMarks.tsx`](src/components/ship/SizeMarks.tsx): draws each container's SCU on all six of its faces.
- [`Surroundings.tsx`](src/components/ship/Surroundings.tsx): everything around the cargo: the axes and fore cone,
  the ground, the camera presets and the HTML labels that follow the camera.

## Configuring ships and containers

Containers and ships live in two JSON files, each a list, bundled into the app at build time. Edit either and the dev
server reloads.

### Containers

[`containers.json`](src/config/containers.json) lists the container sizes:

```json
{ "id": "scu-32", "name": "32", "capacity": 32, "lieFlat": true, "x": 2, "y": 8, "z": 2 }
```

`x`, `y` and `z` are the container's size in SCU cells (`z` is height). A `lieFlat` container keeps its long side
horizontal; any other may be turned any way to fit.

### Ships, layouts and grids

[`ships.json`](src/config/ships.json) lists the ships. A ship has one or more `layouts`, and each layout has its cargo
`grids`. Its `capacity` must equal each layout's total, which the tests check:

```json
{
  "id": "ship-misc-hull-b",
  "name": "MISC Hull B",
  "capacity": 512,
  "layouts": [
    {
      "id": "relaxed",
      "name": "Relaxed",
      "grids": [
        {
          "name": "Starboard - Upper",
          "x": 4,
          "y": 16,
          "z": 2,
          "at": { "x": 1.77, "y": 0, "z": 1.77 },
          "rotate": { "roll": 45 }
        }
      ]
    }
  ]
}
```

- `x`, `y`, `z`: the grid's size in SCU cells. Its grid face is `x` × `y`, and containers stack up `z`.
- `at`: where the centre of the grid face sits on the ship, in SCU. The ship's axes run port (−) to starboard
  (+) for x, aft (−) to fore (+) for y, and bottom (−) to top (+) for z.
- `rotate` (optional): how the grid is turned, in degrees, applied in this order:
  - `roll`: about the fore–aft axis; positive tips its top toward starboard.
  - `pitch`: about the port–starboard axis; positive tips its fore end up.
  - `yaw`: about the up axis; positive turns its fore end toward starboard.

A grid without `at` still works for planning but doesn't appear in the ship view.
