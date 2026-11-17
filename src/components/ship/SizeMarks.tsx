import { useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { CanvasTexture, Matrix4, SRGBColorSpace, Vector3, type InstancedMesh } from "three";
import type { Placed } from "../../lib/packing";
import type { Mount } from "../../lib/mount";
import { sizeMarksOf } from "./scene";

/* Each container's size in SCU, on all six of its faces so it reads from any
   side (see sizeMarksOf); one instanced mesh per size. */
export function SizeMarks({ placed, mount }: { placed: Placed<number>[]; mount: Mount }) {
  const bySize = useMemo(() => {
    const groups = new Map<number, Placed<number>[]>();
    for (const box of placed) groups.set(box.size, [...(groups.get(box.size) ?? []), box]);
    return groups;
  }, [placed]);
  return (
    <>
      {[...bySize].map(([size, boxes]) => (
        <SizeMark key={size} size={size} boxes={boxes} mount={mount} />
      ))}
    </>
  );
}

function SizeMark({ size, boxes, mount }: { size: number; boxes: Placed<number>[]; mount: Mount }) {
  const ref = useRef<InstancedMesh>(null);
  const invalidate = useThree((s) => s.invalidate);
  const texture = useMemo(() => numberTexture(String(size)), [size]);
  useEffect(() => () => texture.dispose(), [texture]);
  const count = boxes.length * 6;
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const matrix = new Matrix4();
    const [right, up, normal] = [new Vector3(), new Vector3(), new Vector3()];
    let i = 0;
    for (const box of boxes)
      for (const mark of sizeMarksOf(box, mount)) {
        matrix
          .makeBasis(right.set(...mark.right), up.set(...mark.up), normal.set(...mark.normal))
          .scale(new Vector3(mark.side, mark.side, 1))
          .setPosition(...mark.at);
        mesh.setMatrixAt(i++, matrix);
      }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    invalidate();
  }, [boxes, count, mount, invalidate]);
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
