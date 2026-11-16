import { Line, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Color, DoubleSide, InstancedBufferAttribute, Matrix4, Vector3, type InstancedMesh } from "three";
import type { Placed, Position } from "../lib/cargo";
import { mountMatrix, toShip, type Mount, type Vec3 } from "../lib/mount";
import { OTHER_COLOR, type Calc, type Cargo } from "../lib/table";

type Mounted = Position & { mount: Mount };
/* A text label pinned to a ship point; drawn as HTML over the canvas. */
type Label = { key: string; text: string; at: Vec3; className: string };
type View = "3d" | "top" | "port" | "fore";

/* Where the camera looks from, as a direction from the ship's centre. The top
   view leans a hair aft so "up" on screen is fore. */
const VIEWS: Record<View, { label: string; from: Vec3 }> = {
  "3d": { label: "3D", from: [-0.9, -0.7, 0.8] }, // from port, aft and above
  top: { label: "Top", from: [0, -0.001, 1] },
  port: { label: "Port side", from: [-1, 0, 0] },
  fore: { label: "From fore", from: [0, 1, 0] },
};
const FOV = 40;
const GAP = 0.08; // between neighbouring containers, so each one shows
const HOLD_EDGE = "#3d6a87";
const FLOOR = "#54adf7";
const GROUND = "#16384d";
const GROUND_LINE = "#24506b";

const sizeOf = (p: Position): Vec3 => [p.x, p.y, p.z];
const isMounted = (p: Position): p is Mounted => p.mount !== null;

/* Every mounted position of the selected grid in 3D, placed and turned as
   config.json says, with its containers as packed for the Fit column. */
export default function ShipView({
  positions,
  calc,
  cargoByRow,
}: {
  positions: Position[];
  calc: Calc;
  cargoByRow: Map<number, Cargo>;
}) {
  const mounted = useMemo(() => positions.filter(isMounted), [positions]);
  const bounds = useMemo(() => boundsOf(mounted), [mounted]);
  const [view, setView] = useState<View>("3d");
  const [hover, setHover] = useState("");
  const labels = useMemo(() => [...mounted.map(gridLabel), ...directionLabels(bounds)], [mounted, bounds]);
  const labelEls = useRef(new Map<string, HTMLElement>());

  return (
    <div className="ship-view">
      <div className="ship-toolbar" role="group" aria-label="Camera">
        {(Object.keys(VIEWS) as View[]).map((v) => (
          <button
            key={v}
            type="button"
            className={`btn${v === view ? " primary" : ""}`}
            aria-pressed={v === view}
            onClick={() => setView(v)}
          >
            {VIEWS[v].label}
          </button>
        ))}
        <span className="status">{hover}</span>
      </div>
      <div className="ship-canvas">
        <Canvas frameloop="demand" camera={{ fov: FOV, up: [0, 0, 1], near: 0.1, far: 2000 }} dpr={[1, 2]}>
          <ambientLight intensity={1.1} />
          <directionalLight position={[30, 40, 80]} intensity={1.6} />
          <directionalLight position={[-40, -30, -20]} intensity={0.5} />
          {mounted.map((position) => (
            <GridMesh
              key={position.name}
              position={position}
              placed={calc.byPosition.get(position.name)?.placed ?? []}
              cargoByRow={cargoByRow}
              onHover={setHover}
            />
          ))}
          <Directions bounds={bounds} />
          <CameraRig view={view} bounds={bounds} />
          <LabelTracker labels={labels} elements={labelEls} />
        </Canvas>
        <div className="ship-labels" aria-hidden="true">
          {labels.map((label) => (
            /* Hidden until the first frame puts it in place. */
            <span
              key={label.key}
              className={label.className}
              hidden
              ref={(el) => {
                if (el) labelEls.current.set(label.key, el);
                else labelEls.current.delete(label.key);
              }}
            >
              {label.text}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

type Bounds = { min: Vec3; max: Vec3; center: Vec3; radius: number };

/* The box around every mounted position, in ship coordinates. */
function boundsOf(positions: Mounted[]): Bounds {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of positions)
    for (const x of [0, p.x])
      for (const y of [0, p.y])
        for (const z of [0, p.z])
          toShip(p.mount, sizeOf(p), [x, y, z]).forEach((n, i) => {
            min[i] = Math.min(min[i], n);
            max[i] = Math.max(max[i], n);
          });
  if (!positions.length) return { min: [0, 0, 0], max: [0, 0, 0], center: [0, 0, 0], radius: 10 };
  const center = min.map((n, i) => (n + max[i]) / 2) as Vec3;
  const radius = Math.max(4, Math.hypot(...max.map((n, i) => n - min[i])) / 2);
  return { min, max, center, radius };
}

/* A position's name, over the middle of the far side of its hold. */
const gridLabel = (p: Mounted): Label => ({
  key: `grid:${p.name}`,
  text: p.name,
  at: toShip(p.mount, sizeOf(p), [p.x / 2, p.y / 2, p.z]),
  className: "ship-label",
});

/* The ship's three axes run through the middle of the cargo, past its edges. */
/* Room around the cargo for the axes and the fore cone. */
const padOf = (bounds: Bounds) => Math.max(3, bounds.radius * 0.25);
/* The ground's height: below the bottom of the lowest grid's hold (so below
   even a full grid), with a gap. */
const groundOf = (bounds: Bounds) => bounds.min[2] - Math.max(1.5, padOf(bounds) * 0.5);
const coneOf = (bounds: Bounds) => ({ length: padOf(bounds) * 0.7, radius: padOf(bounds) * 0.25 });

/* The ship's three axes through the middle of the cargo; top–bottom stops at the ground. */
function axesOf(bounds: Bounds) {
  const { min, max } = bounds;
  const [cx, cy, cz] = bounds.center;
  const pad = padOf(bounds);
  return [
    { plus: "Fore", minus: "Aft", from: [cx, min[1] - pad, cz], to: [cx, max[1] + pad, cz] },
    { plus: "Starboard", minus: "Port", from: [min[0] - pad, cy, cz], to: [max[0] + pad, cy, cz] },
    { plus: "Top", minus: "Bottom", from: [cx, cy, groundOf(bounds)], to: [cx, cy, max[2] + pad] },
  ] as { plus: string; minus: string; from: Vec3; to: Vec3 }[];
}

/* Each axis end's name. Fore sits past the cone's tip, Bottom just under the ground. */
function directionLabels(bounds: Bounds): Label[] {
  const beyond = (point: Vec3, axis: number, by: number): Vec3 =>
    point.map((n, i) => (i === axis ? n + by : n)) as Vec3;
  return axesOf(bounds).flatMap(({ plus, minus, from, to }) => [
    {
      key: plus,
      text: plus,
      at: plus === "Fore" ? beyond(to, 1, coneOf(bounds).length + 1.5) : to,
      className: "ship-dir is-positive",
    },
    { key: minus, text: minus, at: minus === "Bottom" ? beyond(from, 2, -1) : from, className: "ship-dir" },
  ]);
}

/* Each frame, move every label to its point's place on screen (hidden when behind the camera). */
function LabelTracker({ labels, elements }: { labels: Label[]; elements: React.RefObject<Map<string, HTMLElement>> }) {
  const point = useMemo(() => new Vector3(), []);
  useFrame(({ camera, size }) => {
    for (const label of labels) {
      const el = elements.current.get(label.key);
      if (!el) continue;
      point.set(...label.at).project(camera);
      el.hidden = point.z > 1;
      el.style.transform = `translate(${((point.x + 1) / 2) * size.width}px, ${((1 - point.y) / 2) * size.height}px) translate(-50%, -50%)`;
    }
  });
  return null;
}

/* One position: its floor (pale blue, so you can tell which way it faces), the
   outline of its hold, its name and its containers. */
function GridMesh({
  position,
  placed,
  cargoByRow,
  onHover,
}: {
  position: Mounted;
  placed: Placed<number>[];
  cargoByRow: Map<number, Cargo>;
  onHover: (text: string) => void;
}) {
  const { x: X, y: Y, z: Z } = position;
  const matrix = useMemo(() => new Matrix4().fromArray(mountMatrix(position.mount, sizeOf(position))), [position]);
  return (
    <group matrix={matrix} matrixAutoUpdate={false}>
      <mesh position={[X / 2, Y / 2, 0]}>
        <planeGeometry args={[X, Y]} />
        <meshBasicMaterial color={FLOOR} transparent opacity={0.28} side={DoubleSide} depthWrite={false} />
      </mesh>
      <HoldOutline size={[X, Y, Z]} />
      <Containers
        capacity={position.capacity}
        placed={placed}
        cargoByRow={cargoByRow}
        onHover={(box) => onHover(box ? `${box} · ${position.name}` : "")}
      />
    </group>
  );
}

/* The 12 edges of the position's hold. */
function HoldOutline({ size: [X, Y, Z] }: { size: Vec3 }) {
  const points = useMemo(() => {
    const c = (x: number, y: number, z: number): Vec3 => [x * X, y * Y, z * Z];
    const edges: [Vec3, Vec3][] = [];
    for (const [a, b] of [
      [0, 1],
      [1, 3],
      [3, 2],
      [2, 0],
    ] as const) {
      const corner = (i: number): [number, number] => [i & 1, i >> 1];
      const [ax, ay] = corner(a);
      const [bx, by] = corner(b);
      edges.push([c(ax, ay, 0), c(bx, by, 0)], [c(ax, ay, 1), c(bx, by, 1)], [c(ax, ay, 0), c(ax, ay, 1)]);
    }
    return edges.flat();
  }, [X, Y, Z]);
  return <Line points={points} segments color={HOLD_EDGE} lineWidth={1} />;
}

/* The containers, as one instanced mesh: Hull C can hold thousands. */
function Containers({
  capacity,
  placed,
  cargoByRow,
  onHover,
}: {
  capacity: number;
  placed: Placed<number>[];
  cargoByRow: Map<number, Cargo>;
  onHover: (text: string) => void;
}) {
  const ref = useRef<InstancedMesh>(null);
  const invalidate = useThree((s) => s.invalidate);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    if (!mesh.instanceColor) {
      mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    }
    const matrix = new Matrix4();
    const color = new Color();
    placed.forEach((b, i) => {
      matrix.makeScale(b.w - GAP, b.d - GAP, b.h - GAP).setPosition(b.x + b.w / 2, b.y + b.d / 2, b.z + b.h / 2);
      mesh.setMatrixAt(i, matrix);
      mesh.setColorAt(i, color.set(cargoByRow.get(b.tag)?.color ?? OTHER_COLOR));
    });
    mesh.count = placed.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    invalidate();
  }, [capacity, placed, cargoByRow, invalidate]);

  const describe = (i: number | undefined) => {
    const box = i === undefined ? undefined : placed[i];
    return box ? `${cargoByRow.get(box.tag)?.name ?? "Cargo"} · ${box.size} SCU` : "";
  };
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, capacity]}
      onPointerMove={(e) => {
        e.stopPropagation();
        onHover(describe(e.instanceId));
      }}
      onPointerOut={() => onHover("")}
    >
      <boxGeometry />
      <meshStandardMaterial roughness={0.7} metalness={0.1} />
    </instancedMesh>
  );
}

/* The ship's three axes, with fore–aft drawn solid like a spine and a cone
   at its fore end for the front of the ship; and the ground below. */
function Directions({ bounds }: { bounds: Bounds }) {
  const axes = axesOf(bounds);
  const fore = axes[0].to;
  const cone = coneOf(bounds);
  return (
    <>
      {/* Three's cone points along +y, which is fore here. */}
      <mesh position={[fore[0], fore[1] + cone.length / 2, fore[2]]}>
        <coneGeometry args={[cone.radius, cone.length, 24]} />
        <meshStandardMaterial color="#add3eb" roughness={0.6} />
      </mesh>
      <Ground bounds={bounds} />
      {axes.map(({ plus, from, to }) => {
        const spine = plus === "Fore";
        return (
          <Line
            key={plus}
            points={[from, to]}
            color={spine ? "#add3eb" : "#4a6779"}
            lineWidth={spine ? 2 : 1}
            dashed={!spine}
            dashSize={0.6}
            gapSize={0.4}
          />
        );
      })}
    </>
  );
}

/* A square of ground under the cargo, with a 2 SCU grid on it. */
function Ground({ bounds }: { bounds: Bounds }) {
  const pad = padOf(bounds);
  const [cx, cy] = bounds.center;
  const side = Math.ceil((Math.max(bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1]) + pad * 2) / 2) * 2;
  return (
    <group position={[cx, cy, groundOf(bounds)]}>
      <mesh>
        <planeGeometry args={[side, side]} />
        <meshBasicMaterial color={GROUND} transparent opacity={0.55} side={DoubleSide} depthWrite={false} />
      </mesh>
      {/* Grid helpers lie flat in x–z; turn this one into the x–y ground. */}
      <gridHelper args={[side, side / 2, GROUND_LINE, GROUND_LINE]} rotation={[Math.PI / 2, 0, 0]} />
    </group>
  );
}

/* Moves the camera when the view changes, keeping orbit controls on the ship's centre. */
function CameraRig({ view, bounds }: { view: View; bounds: Bounds }) {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const controls = useRef<React.ComponentRef<typeof OrbitControls>>(null);
  useEffect(() => {
    const [dx, dy, dz] = VIEWS[view].from;
    const length = Math.hypot(dx, dy, dz);
    /* Frame the cargo plus the axes, cone and labels around it. */
    const distance = ((bounds.radius + padOf(bounds)) * 0.85) / Math.sin(((FOV / 2) * Math.PI) / 180);
    const [cx, cy, cz] = bounds.center;
    camera.position.set(cx + (dx / length) * distance, cy + (dy / length) * distance, cz + (dz / length) * distance);
    controls.current?.target.set(cx, cy, cz);
    controls.current?.update();
    invalidate();
  }, [view, bounds, camera, invalidate]);
  return <OrbitControls ref={controls} makeDefault enableDamping={false} />;
}
