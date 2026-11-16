# Star Citizen Cargo Visualizer

A cargo planner for Star Citizen haulers. Enter each delivery's SCU and Cargo Visualizer works out which container
sizes to use, splits large deliveries across your ship's cargo grids, and shows how it all packs in a 3D view of
the ship.

**Use it at [jhurrell.github.io/star-citizen-cargo-visualizer](https://jhurrell.github.io/star-citizen-cargo-visualizer/).**

## Features

- **Toolbar.** Type in the ship field to find a ship, or pick one from its list, and choose a layout when the ship
  has more than one. **Add row** adds a row under the last one. The two copy icons copy the table for a spreadsheet
  (tab-separated) or as a Markdown table; point at either one to see which is which. **How to use**,
  at the top right, opens a short guide.
- **Container counts per delivery.** Each row is filled with the biggest container size that fits its grid, then
  the next size down, until every SCU is placed. A row takes up to 9,999 SCU. Click a size in the table header to
  turn it off and skip it.
- **Grids, in the order you pick them.** Click a grid button on a row to load it there. Each button shows the SCU
  the grid has left; once a grid has no room for another container, the other rows can't pick it. Pick several to
  split a big delivery: grids fill in the order you pick them, across all rows, so a later pick never takes room an
  earlier one already claimed, and no grid is ever overloaded.
- **Clearing, with a second click.** **Clear table** empties the table, leaving one blank row. **Clear**, in the
  Grids heading, keeps the rows but takes every one out of its grids; it's greyed out while no row is in a grid. Either turns to an amber
  **Confirm** for three seconds and acts only if you click it again, and keeps its width, so nothing moves.
- **Remaining SCU.** The Remaining column (headed Δ), beside SCU, shows how much of each row isn't in a grid yet, because it
  has no grid or its grids are out of room, with the table's total at the foot. While a row has some, its edge and
  SCU turn amber; point at the SCU to see why. The foot of the Grids column shows how much grid space is still free.
- **Ship view.** A 3D view of the ship's grids with every container placed:
  - The first delivery in a grid loads from the fore end; later ones load from the aft end, so each row's cargo
    stays apart.
  - Each row has its own color, and each container shows its size in SCU. The legend lists the rows in the
    table's order.
  - Click a row in the legend to make its containers see-through, so the rest stand out. Point at a row in the
    legend, or at its Cargo, Pick-up or Drop-off in the table, to make every other row see-through while you do.
  - Point at a container to see what it holds, or at a grid button in the table to light that grid up.
  - Camera presets: 3D, top, bottom, port, starboard, fore and aft.
- **Kept in your browser.** The table, ship and settings are saved in local storage.

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
code, builds it with the repository's name as its base path (Pages serves it at `/star-citizen-cargo-visualizer/`),
and publishes `dist/client` to GitHub Pages. To publish without a push, run the workflow from the Actions tab.

### Project layout

| Path                   | What's in it                                                                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `src/config/`          | `containers.json` and `ships.json` (see below)                                                                                      |
| `src/lib/`             | The logic, as pure functions: reading the config, splitting rows across grids, each grid's free room and the totals, packing, state |
| `src/components/`      | The page: the ship picker, cargo table, legend and 3D ship view (`ShipView.tsx`), plus the shared pieces below                      |
| `src/components/ship/` | The 3D ship view's parts, below                                                                                                     |
| `src/routes/`          | TanStack Start routes; the tool is the one page at `/`                                                                              |
| `test/`                | Unit tests for `src/lib` and the ship view's scene geometry                                                                         |

Three pieces in `src/components/` are shared by the page:

- [`ConfirmButton.tsx`](src/components/ConfirmButton.tsx): a button that asks for a second click within 3 seconds,
  showing Confirm in between. Clear table and the Grids Clear both use it.
- [`icons.tsx`](src/components/icons.tsx): the copy buttons' icons.
- [`pointing.ts`](src/components/pointing.ts): pointer and focus handlers for things that react while pointed at,
  such as the table's rows and grid buttons and the legend's buttons.

`ShipView.tsx` draws each grid with its containers and loads only when a grid has placements, as three.js is large.
The rest of the 3D view lives in `src/components/ship/`:

- [`scene.ts`](src/components/ship/scene.ts): the scene's layout in ship coordinates, as pure functions with no
  three.js: the camera views, the box around the cargo, the axes and the labels' positions. Tested in
  `test/scene.test.ts`.
- [`SizeMarks.tsx`](src/components/ship/SizeMarks.tsx): each container's SCU on all six of its faces, kept upright
  on a grid that hangs under the ship.
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

[`ships.json`](src/config/ships.json) lists the ships. A ship has one or more layouts (`grids`), and each layout has its cargo
grids (`positions`). Its `capacity` must equal each layout's total, which the tests check:

```json
{
  "id": "ship-misc-hull-b",
  "name": "MISC Hull B",
  "capacity": 512,
  "grids": [
    {
      "id": "relaxed",
      "name": "Relaxed",
      "positions": [
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

- `x`, `y`, `z`: the grid's size in SCU cells. Its floor is `x` × `y`, and containers stack up `z`.
- `at`: where the centre of the grid's floor sits on the ship, in SCU. The ship's axes run port (−) to starboard
  (+) for x, aft (−) to fore (+) for y, and bottom (−) to top (+) for z.
- `rotate` (optional): how the grid is turned, in degrees, applied in this order:
  - `roll`: about the fore–aft axis; positive tips its top toward starboard.
  - `pitch`: about the port–starboard axis; positive tips its fore end up.
  - `yaw`: about the up axis; positive turns its fore end toward starboard.

A grid without `at` still works for planning but doesn't appear in the ship view.
