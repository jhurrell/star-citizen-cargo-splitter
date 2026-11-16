import { drawOrder, type Placed, type Position } from "../lib/cargo";
import { fmt, hasUnfit, OTHER_COLOR, plural, unfitText, type Calc, type Cargo, type CargoColors } from "../lib/table";
import { WarnNote } from "./WarnNote";

const PLAN_PX = 16; // pixels per SCU cell edge, before shrinking to fit

type Point = [x: number, y: number, z: number];

/* An isometric drawing of each position of the selected grid, with its
   containers as packed for the Fit column. */
export function LoadPlan({ calc, positions, colors }: { calc: Calc; positions: Position[]; colors: CargoColors }) {
  return (
    <div className="plan-grid">
      {positions.length === 0 && <p className="hint">No ship loaded.</p>}
      {positions.map((position) => {
        const entry = calc.byPosition.get(position.name)!;
        return (
          <figure key={position.name} className={`plan-card${entry.scu ? "" : " is-empty"}`}>
            <figcaption>
              <span>{position.name}</span>
              <span className="plan-meta">
                {fmt(entry.scu)} / {fmt(position.capacity)} SCU
              </span>
            </figcaption>
            <PositionDrawing position={position} placed={entry.placed} cargoByRow={colors.byRow} />
            {hasUnfit(entry.unfit) && (
              <p className="plan-note">
                <WarnNote>{unfitText(entry.unfit)}</WarnNote>
              </p>
            )}
          </figure>
        );
      })}
    </div>
  );
}

/* A swatch and name per material with cargo; past the palette, one "Other materials". */
export function Legend({ materials }: { materials: Cargo[] }) {
  const named = materials.filter((m) => m.color !== OTHER_COLOR);
  return (
    <ul className="plan-legend" aria-label="Materials">
      {named.map((m) => (
        <li key={m.name}>
          <Swatch color={m.color} />
          {m.name}
        </li>
      ))}
      {named.length < materials.length && (
        <li>
          <Swatch color={OTHER_COLOR} />
          Other materials
        </li>
      )}
    </ul>
  );
}

function Swatch({ color }: { color: string }) {
  return (
    <svg className="swatch" viewBox="0 0 10 10" aria-hidden="true">
      <rect width="10" height="10" fill={color} />
    </svg>
  );
}

const ISO_X = Math.cos(Math.PI / 6);
/* Screen point for a grid point, seen from above the +x (starboard), +y (fore)
   corner: z is up, so screen y falls as z rises. */
const project = ([x, y, z]: Point): [number, number] => [(x - y) * ISO_X, (x + y) / 2 - z];
const pointsAttr = (corners: Point[]) =>
  corners
    .map((c) =>
      project(c)
        .map((n) => n.toFixed(3))
        .join(","),
    )
    .join(" ");

/* Lighten (amount > 0) or darken (amount < 0) a #rrggbb color by that fraction. */
function shade(hex: string, amount: number): string {
  const target = amount > 0 ? 255 : 0;
  const channels = [1, 3, 5].map((i) => {
    const channel = parseInt(hex.slice(i, i + 2), 16);
    return Math.round(channel + (target - channel) * Math.abs(amount))
      .toString(16)
      .padStart(2, "0");
  });
  return `#${channels.join("")}`;
}

/* The position's floor and far walls, its containers back to front, then its
   near edges dashed on top so the hold's size still shows. */
function PositionDrawing({
  position,
  placed,
  cargoByRow,
}: {
  position: Position;
  placed: Placed<number>[];
  cargoByRow: Map<number, Cargo>;
}) {
  const { x: X, y: Y, z: Z } = position;
  const corners = [0, X].flatMap((x) => [0, Y].flatMap((y) => [0, Z].map((z) => project([x, y, z]))));
  const pad = 0.5;
  const labelRoom = 1.4; // below the fore edge, for its label
  const minX = Math.min(...corners.map(([sx]) => sx)) - pad - labelRoom;
  const maxX = Math.max(...corners.map(([sx]) => sx)) + pad;
  const minY = Math.min(...corners.map(([, sy]) => sy)) - pad;
  const maxY = Math.max(...corners.map(([, sy]) => sy)) + pad + labelRoom;
  const [width, height] = [maxX - minX, maxY - minY];

  const hold: Point[][] = [
    [
      [0, 0, 0],
      [X, 0, 0],
      [X, Y, 0],
      [0, Y, 0],
    ], // floor
    [
      [0, 0, 0],
      [0, Y, 0],
      [0, Y, Z],
      [0, 0, Z],
    ], // port wall
    [
      [0, 0, 0],
      [X, 0, 0],
      [X, 0, Z],
      [0, 0, Z],
    ], // aft wall
  ];
  const nearEdges: Point[][] = [
    [
      [X, 0, 0],
      [X, 0, Z],
    ],
    [
      [X, Y, 0],
      [X, Y, Z],
    ],
    [
      [0, Y, 0],
      [0, Y, Z],
    ],
    [
      [0, 0, Z],
      [X, 0, Z],
      [X, Y, Z],
      [0, Y, Z],
      [0, 0, Z],
    ],
  ];
  const [labelX, labelY] = project([X / 2, Y, 0]);

  return (
    <svg
      className="plan-svg"
      viewBox={[minX, minY, width, height].map((n) => n.toFixed(3)).join(" ")}
      width={Math.round(width * PLAN_PX)}
      height={Math.round(height * PLAN_PX)}
      role="img"
      aria-label={`${position.name}: ${plural(placed.length, "container")}`}
    >
      {hold.map((face, i) => (
        <polygon key={i} className="hold" points={pointsAttr(face)} />
      ))}
      {drawOrder(placed).map((box) => (
        <ContainerBox key={`${box.x},${box.y},${box.z}`} box={box} cargo={cargoByRow.get(box.tag)!} />
      ))}
      {nearEdges.map((edge, i) => (
        <polyline key={i} className="hold-edge" points={pointsAttr(edge)} />
      ))}
      <text className="axis-label" x={(labelX - 0.4).toFixed(3)} y={(labelY + 1).toFixed(3)} textAnchor="end">
        Fore
      </text>
    </svg>
  );
}

/* One container: its top, starboard (+x) and fore (+y) faces, lit from above. */
function ContainerBox({ box, cargo }: { box: Placed<number>; cargo: Cargo }) {
  const { x, y, z, w, d, h, size } = box;
  const [x1, y1, z1] = [x + w, y + d, z + h];
  const top: Point[] = [
    [x, y, z1],
    [x1, y, z1],
    [x1, y1, z1],
    [x, y1, z1],
  ];
  const starboard: Point[] = [
    [x1, y, z],
    [x1, y1, z],
    [x1, y1, z1],
    [x1, y, z1],
  ];
  const fore: Point[] = [
    [x, y1, z],
    [x1, y1, z],
    [x1, y1, z1],
    [x, y1, z1],
  ];
  return (
    <g className="box">
      <title>{`${cargo.name} · ${size} SCU`}</title>
      <polygon points={pointsAttr(top)} fill={shade(cargo.color, 0.25)} />
      <polygon points={pointsAttr(starboard)} fill={cargo.color} />
      <polygon points={pointsAttr(fore)} fill={shade(cargo.color, -0.3)} />
    </g>
  );
}
