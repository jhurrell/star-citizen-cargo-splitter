import { Line } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Color, DoubleSide, InstancedBufferAttribute, Matrix4, type InstancedMesh } from "three";
import type { GridLoad } from "../lib/calc";
import type { Position } from "../lib/cargo";
import { OTHER_COLOR, type Cargo } from "../lib/colors";
import { mountMatrix, rotationOf, type Vec3 } from "../lib/mount";
import type { Placed } from "../lib/packing";
import {
  boundsOf,
  directionLabels,
  FOV,
  GAP,
  gridLabel,
  isMounted,
  sizeOf,
  VIEWS,
  type Mounted,
  type View,
} from "./ship/scene";
import { SizeMarks } from "./ship/SizeMarks";
import { CameraRig, Directions, LabelTracker } from "./ship/Surroundings";

const HOLD_EDGE = "#3d6a87";
const FLOOR = "#54adf7";
const LIT = "#ffffff"; // the grid pointed at in the cargo table
/* A row turned off in the legend: its containers turn mostly see-through,
   without their sizes (which would show through from every face). */
const DIM_OPACITY = 0.18;

/* Every mounted position of the selected layout in 3D, placed and turned as
   ships.json says, with its containers as packed. */
export default function ShipView({
  positions,
  loads,
  cargoByRow,
  dimmed,
  highlight = null,
}: {
  positions: Position[];
  /* Each position's packed containers, by name. */
  loads: Map<string, GridLoad>;
  cargoByRow: Map<number, Cargo>;
  /* Rows whose containers show dimmed. */
  dimmed: ReadonlySet<number>;
  /* A grid's name to light up, seen through the others; null for none. */
  highlight?: string | null;
}) {
  const mounted = useMemo(() => positions.filter(isMounted), [positions]);
  const bounds = useMemo(() => boundsOf(mounted), [mounted]);
  const [view, setView] = useState<View>("3d");
  const [hover, setHover] = useState("");
  const [showLabels, setShowLabels] = useState(false);
  const [showSizes, setShowSizes] = useState(true);
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
        <label className="ship-toggle">
          <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />
          Show labels
        </label>
        <label className="ship-toggle">
          <input type="checkbox" checked={showSizes} onChange={(e) => setShowSizes(e.target.checked)} />
          Show sizes
        </label>
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
              placed={loads.get(position.name)?.placed ?? []}
              cargoByRow={cargoByRow}
              dimmed={dimmed}
              lit={position.name === highlight}
              showSizes={showSizes}
              onHover={setHover}
            />
          ))}
          <Directions bounds={bounds} />
          <CameraRig view={view} bounds={bounds} />
          <LabelTracker labels={labels} elements={labelEls} />
        </Canvas>
        {/* What's under the pointer, over the canvas so it never moves the diagram. */}
        <p className="ship-hover" aria-live="polite" hidden={!hover}>
          {hover}
        </p>
        {/* With labels off, a lit grid's name still shows. */}
        <div className={`ship-labels${showLabels ? "" : " is-off"}`} aria-hidden="true">
          {labels.map((label) => (
            /* Hidden until the first frame puts it in place. */
            <span
              key={label.key}
              className={`${label.className}${label.key === `grid:${highlight}` ? " is-lit" : ""}`}
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

/* One position: its floor (pale blue, so you can tell which way it faces), the
   outline of its hold, its name and its containers, each with its size. */
function GridMesh({
  position,
  placed,
  cargoByRow,
  dimmed,
  lit,
  showSizes,
  onHover,
}: {
  position: Mounted;
  placed: Placed<number>[];
  cargoByRow: Map<number, Cargo>;
  dimmed: ReadonlySet<number>;
  lit: boolean;
  showSizes: boolean;
  onHover: (text: string) => void;
}) {
  const { x: X, y: Y, z: Z } = position;
  const [solid, faded] = useMemo(
    () => [placed.filter((b) => !dimmed.has(b.tag)), placed.filter((b) => dimmed.has(b.tag))],
    [placed, dimmed],
  );
  const describe = (box: string) => onHover(box ? `${box} · ${position.name}` : "");
  const matrix = useMemo(() => new Matrix4().fromArray(mountMatrix(position.mount, sizeOf(position))), [position]);
  /* A grid under the ship stacks its containers downward. */
  const hangs = rotationOf(position.mount)[2][2] < 0;
  return (
    <group matrix={matrix} matrixAutoUpdate={false}>
      <mesh position={[X / 2, Y / 2, 0]}>
        <planeGeometry args={[X, Y]} />
        <meshBasicMaterial
          color={lit ? LIT : FLOOR}
          transparent
          opacity={lit ? 0.55 : 0.28}
          side={DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <HoldOutline size={[X, Y, Z]} lit={lit} />
      <Containers capacity={position.capacity} placed={solid} cargoByRow={cargoByRow} onHover={describe} />
      <Containers capacity={position.capacity} placed={faded} cargoByRow={cargoByRow} dim onHover={describe} />
      {showSizes && <SizeMarks placed={solid} hangs={hangs} />}
    </group>
  );
}

/* The 12 edges of the position's hold; when lit, bright and drawn over everything. */
function HoldOutline({ size: [X, Y, Z], lit }: { size: Vec3; lit: boolean }) {
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
  return (
    <Line
      points={points}
      segments
      color={lit ? LIT : HOLD_EDGE}
      lineWidth={lit ? 2.5 : 1}
      depthTest={!lit}
      renderOrder={lit ? 10 : 0}
    />
  );
}

/* The containers, as one instanced mesh: Hull C can hold thousands. Dimmed
   rows' containers go in a second, see-through one. */
function Containers({
  capacity,
  placed,
  cargoByRow,
  dim = false,
  onHover,
}: {
  capacity: number;
  placed: Placed<number>[];
  cargoByRow: Map<number, Cargo>;
  dim?: boolean;
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
      <meshStandardMaterial
        roughness={0.7}
        metalness={0.1}
        transparent={dim}
        opacity={dim ? DIM_OPACITY : 1}
        depthWrite={!dim}
      />
    </instancedMesh>
  );
}
