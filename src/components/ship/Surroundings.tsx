import { Line, OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { DoubleSide, Vector3 } from "three";
import { axesOf, cameraPosition, coneOf, groundOf, padOf, type Bounds, type Label, type View } from "./scene";

/* Everything in the ship view around the cargo itself: the axes, the ground,
   the camera and the HTML labels that follow it. */

const SPINE = "#add3eb";
const AXIS = "#4a6779";
const GROUND = "#16384d";
const GROUND_LINE = "#24506b";

/* The ship's three axes, with fore–aft drawn solid like a spine and a cone
   at its fore end for the front of the ship; and the ground below. */
export function Directions({ bounds }: { bounds: Bounds }) {
  const axes = axesOf(bounds);
  const fore = axes[0].to;
  const cone = coneOf(bounds);
  return (
    <>
      {/* Three's cone points along +y, which is fore here. */}
      <mesh position={[fore[0], fore[1] + cone.length / 2, fore[2]]}>
        <coneGeometry args={[cone.radius, cone.length, 24]} />
        <meshStandardMaterial color={SPINE} roughness={0.6} />
      </mesh>
      <Ground bounds={bounds} />
      {axes.map(({ plus, from, to }) => {
        const spine = plus === "Fore";
        return (
          <Line
            key={plus}
            points={[from, to]}
            color={spine ? SPINE : AXIS}
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
export function CameraRig({ view, bounds }: { view: View; bounds: Bounds }) {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const controls = useRef<React.ComponentRef<typeof OrbitControls>>(null);
  useEffect(() => {
    camera.position.set(...cameraPosition(view, bounds));
    controls.current?.target.set(...bounds.center);
    controls.current?.update();
    invalidate();
  }, [view, bounds, camera, invalidate]);
  return <OrbitControls ref={controls} makeDefault enableDamping={false} />;
}

/* Each frame, move every label to its point's place on screen (hidden when behind the camera). */
export function LabelTracker({
  labels,
  elements,
}: {
  labels: Label[];
  elements: React.RefObject<Map<string, HTMLElement>>;
}) {
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
