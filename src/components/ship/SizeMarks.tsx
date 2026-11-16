import { useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { CanvasTexture, Matrix4, SRGBColorSpace, Vector3, type InstancedMesh } from "three";
import type { Placed } from "../../lib/packing";
import { GAP } from "./scene";

/* Each face of a container: the way it faces, and which way is up for the
   number on it (away from the floor on the sides, fore-ish on top and bottom).
   On a grid that hangs under the ship, away from the floor is toward the
   ground, so there the side numbers turn over to stay upright. */
const FACES: { normal: Vector3; up: Vector3 }[] = [
  { normal: new Vector3(0, 0, 1), up: new Vector3(0, 1, 0) },
  { normal: new Vector3(0, 0, -1), up: new Vector3(0, 1, 0) },
  { normal: new Vector3(1, 0, 0), up: new Vector3(0, 0, 1) },
  { normal: new Vector3(-1, 0, 0), up: new Vector3(0, 0, 1) },
  { normal: new Vector3(0, 1, 0), up: new Vector3(0, 0, 1) },
  { normal: new Vector3(0, -1, 0), up: new Vector3(0, 0, 1) },
];
const MARK_LIFT = 0.01; // off the face, so the number doesn't flicker into it

/* Each container's size in SCU, on all six of its faces so it reads from any
   side; one instanced mesh per size. */
export function SizeMarks({ placed, hangs }: { placed: Placed<number>[]; hangs: boolean }) {
  const bySize = useMemo(() => {
    const groups = new Map<number, Placed<number>[]>();
    for (const box of placed) groups.set(box.size, [...(groups.get(box.size) ?? []), box]);
    return groups;
  }, [placed]);
  return (
    <>
      {[...bySize].map(([size, boxes]) => (
        <SizeMark key={size} size={size} boxes={boxes} hangs={hangs} />
      ))}
    </>
  );
}

function SizeMark({ size, boxes, hangs }: { size: number; boxes: Placed<number>[]; hangs: boolean }) {
  const ref = useRef<InstancedMesh>(null);
  const invalidate = useThree((s) => s.invalidate);
  const texture = useMemo(() => numberTexture(String(size)), [size]);
  useEffect(() => () => texture.dispose(), [texture]);
  const count = boxes.length * FACES.length;
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const matrix = new Matrix4();
    const right = new Vector3();
    const at = new Vector3();
    const scale = new Vector3();
    const up = new Vector3();
    let i = 0;
    for (const b of boxes) {
      const half = new Vector3(b.w, b.d, b.h).subScalar(GAP).multiplyScalar(0.5);
      const center = new Vector3(b.x + b.w / 2, b.y + b.d / 2, b.z + b.h / 2);
      for (const face of FACES) {
        const { normal } = face;
        up.copy(face.up);
        if (hangs && normal.z === 0) up.negate();
        right.crossVectors(up, normal);
        /* The face's width and height, from the container's half-sizes along them. */
        const across = Math.abs(right.dot(half)) * 2;
        const tall = Math.abs(up.dot(half)) * 2;
        const side = Math.min(across, tall) * 0.7;
        at.copy(normal)
          .multiplyScalar(Math.abs(normal.dot(half)) + MARK_LIFT)
          .add(center);
        matrix
          .makeBasis(right, up, normal)
          .scale(scale.set(side, side, 1))
          .setPosition(at);
        mesh.setMatrixAt(i++, matrix);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    invalidate();
  }, [boxes, count, hangs, invalidate]);
  /* Keyed by count, as an instanced mesh can't grow; it never takes the pointer,
     so pointing at a container still says what it holds. */
  return (
    <instancedMesh key={count} ref={ref} args={[undefined, undefined, count]} raycast={() => null}>
      <planeGeometry />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </instancedMesh>
  );
}

/* A number in white with a dark edge, so it reads on every cargo color. */
function numberTexture(text: string): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  let px = 88;
  const font = () => `700 ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.font = font();
  while (ctx.measureText(text).width > 112 && px > 20) {
    px -= 4;
    ctx.font = font();
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = 10;
  ctx.strokeStyle = "rgba(8, 20, 30, 0.7)";
  ctx.strokeText(text, 64, 68);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, 64, 68);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
