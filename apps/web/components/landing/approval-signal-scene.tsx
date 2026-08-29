"use client";

import { ContactShadows, Html, Line, PerspectiveCamera, RoundedBox } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { MutableRefObject } from "react";
import * as THREE from "three";

export type LandingPointer = { x: number; y: number };

export type ApprovalSignalSceneProps = {
  progress: number;
  progressRef: MutableRefObject<number>;
  pointerRef: MutableRefObject<LandingPointer>;
  onReady: () => void;
};

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

function smoothstep(start: number, end: number, value: number) {
  const point = clamp((value - start) / (end - start));
  return point * point * (3 - 2 * point);
}

function lerp(start: number, end: number, value: number) {
  return start + (end - start) * value;
}

function CameraRig({ pointerRef }: Pick<ApprovalSignalSceneProps, "pointerRef">) {
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);

  useFrame((_state, delta) => {
    const camera = cameraRef.current;
    if (!camera) return;
    const targetX = pointerRef.current.x * 0.26;
    const targetY = pointerRef.current.y * 0.18;
    camera.position.x = THREE.MathUtils.damp(camera.position.x, targetX, 3.4, delta);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, targetY, 3.4, delta);
    camera.lookAt(0, 0, 0);
  });

  return <PerspectiveCamera ref={cameraRef} makeDefault fov={41} position={[0, 0, 7.1]} />;
}

function EmbeddedMetric({ progress }: Pick<ApprovalSignalSceneProps, "progress">) {
  const metric = progress < 0.32 ? "93.9%" : progress < 0.58 ? "62.4%" : progress < 0.82 ? "94.1%" : "71%";
  const label = progress < 0.32 ? "EXPECTED" : progress < 0.58 ? "OBSERVED" : progress < 0.82 ? "CONTROL" : "EVIDENCE";

  return (
    <Html transform distanceFactor={4.8} position={[0, 0.43, 0.48]} center style={{ pointerEvents: "none" }}>
      <div className="landing-scene-display">
        <span>{label}</span>
        <strong>{metric}</strong>
      </div>
    </Html>
  );
}

function ApprovalSignal({ progressRef, progress }: Pick<ApprovalSignalSceneProps, "progressRef" | "progress">) {
  const signalRef = useRef<THREE.Group>(null);
  const bandMaterialRef = useRef<THREE.MeshStandardMaterial>(null);
  const glowMaterialRef = useRef<THREE.MeshStandardMaterial>(null);
  const shellMaterialRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const fragmentRefs = useRef<(THREE.Group | null)[]>([]);
  const color = useMemo(() => new THREE.Color(), []);
  const targetColor = useMemo(() => new THREE.Color(), []);

  useFrame(({ clock }, delta) => {
    const progress = progressRef.current;
    const approach = smoothstep(0.04, 0.58, progress);
    const departure = smoothstep(0.58, 1, progress);
    const evidenceOpen = smoothstep(0.79, 0.96, progress);
    const drift = Math.sin(clock.elapsedTime * 0.38) * 0.055;

    if (signalRef.current) {
      signalRef.current.position.x = lerp(0.66, -0.18, approach) + lerp(0, 0.52, departure) + drift;
      signalRef.current.position.y = lerp(2.48, 0.1, approach) + lerp(0, -3.15, departure);
      signalRef.current.position.z = lerp(-3.75, 0.42, approach) + lerp(0, -3.35, departure);

      const scale = lerp(0.66, 1.03, approach) * lerp(1, 0.56, departure);
      signalRef.current.scale.setScalar(scale);
      signalRef.current.rotation.x = 0.2 + progress * 0.86 + Math.sin(clock.elapsedTime * 0.22) * 0.055;
      signalRef.current.rotation.y = -0.32 + progress * 0.94 + Math.cos(clock.elapsedTime * 0.18) * 0.05;
      signalRef.current.rotation.z = -0.12 + progress * 0.48;
    }

    const phase = progress < 0.31 ? 0 : progress < 0.75 ? 1 : 2;
    const palette = ["#aab9df", "#f0b560", "#e67596"];
    targetColor.set(palette[phase]);
    color.lerp(targetColor, 1 - Math.exp(-delta * 4.2));

    if (bandMaterialRef.current) {
      bandMaterialRef.current.color.copy(color);
      bandMaterialRef.current.emissive.copy(color);
      bandMaterialRef.current.emissiveIntensity = lerp(0.75, 1.8, smoothstep(0.28, 0.48, progress));
    }

    if (glowMaterialRef.current) {
      glowMaterialRef.current.color.copy(color);
      glowMaterialRef.current.emissive.copy(color);
      glowMaterialRef.current.emissiveIntensity = lerp(0.12, 0.84, evidenceOpen);
      glowMaterialRef.current.opacity = 0.22 + evidenceOpen * 0.42;
    }

    if (shellMaterialRef.current) {
      shellMaterialRef.current.clearcoat = 0.76 + evidenceOpen * 0.18;
      shellMaterialRef.current.roughness = 0.28 - evidenceOpen * 0.06;
    }

    fragmentRefs.current.forEach((fragment, index) => {
      if (!fragment) return;
      const direction = index === 0 ? -1 : index === 1 ? 1 : 0;
      fragment.position.x = direction * evidenceOpen * (index === 2 ? 0.16 : 0.72);
      fragment.position.y = index === 2 ? evidenceOpen * 0.74 : (index === 0 ? 0.4 : -0.34) * evidenceOpen;
      fragment.position.z = 0.28 + evidenceOpen * 0.36;
      fragment.rotation.z = direction * evidenceOpen * 0.22;
      fragment.rotation.y = direction * evidenceOpen * 0.31;
      fragment.visible = evidenceOpen > 0.01;
    });
  });

  return (
    <group ref={signalRef}>
      <RoundedBox args={[2.2, 3.14, 0.72]} radius={0.78} smoothness={7}>
        <meshPhysicalMaterial
          ref={shellMaterialRef}
          color="#302a3c"
          metalness={0.83}
          roughness={0.28}
          clearcoat={0.76}
          clearcoatRoughness={0.15}
        />
      </RoundedBox>

      <RoundedBox args={[2.04, 2.98, 0.15]} radius={0.68} smoothness={6} position={[0, 0, 0.42]}>
        <meshPhysicalMaterial color="#40394d" metalness={0.64} roughness={0.31} clearcoat={0.92} clearcoatRoughness={0.11} />
      </RoundedBox>

      <RoundedBox args={[1.85, 2.76, 0.08]} radius={0.58} smoothness={6} position={[0, 0, 0.53]}>
        <meshStandardMaterial color="#15131f" metalness={0.45} roughness={0.42} />
      </RoundedBox>

      <RoundedBox args={[1.25, 0.58, 0.075]} radius={0.12} smoothness={5} position={[0, 0.43, 0.59]}>
        <meshStandardMaterial color="#171524" metalness={0.52} roughness={0.31} />
      </RoundedBox>

      <RoundedBox args={[1.43, 0.14, 0.055]} radius={0.045} smoothness={4} position={[0, -0.44, 0.6]}>
        <meshStandardMaterial ref={bandMaterialRef} color="#aab9df" emissive="#aab9df" emissiveIntensity={0.75} />
      </RoundedBox>

      <RoundedBox args={[0.52, 0.055, 0.06]} radius={0.02} smoothness={3} position={[0.02, -0.44, 0.64]}>
        <meshStandardMaterial color="#0b0a11" roughness={0.38} />
      </RoundedBox>

      <mesh position={[-0.66, -1.03, 0.6]}>
        <circleGeometry args={[0.058, 28]} />
        <meshStandardMaterial ref={glowMaterialRef} color="#aab9df" emissive="#aab9df" transparent opacity={0.22} />
      </mesh>

      <mesh position={[-0.51, -1.03, 0.6]}>
        <circleGeometry args={[0.025, 20]} />
        <meshBasicMaterial color="#867d90" />
      </mesh>
      <mesh position={[-0.4, -1.03, 0.6]}>
        <circleGeometry args={[0.025, 20]} />
        <meshBasicMaterial color="#867d90" />
      </mesh>
      <mesh position={[-0.29, -1.03, 0.6]}>
        <circleGeometry args={[0.025, 20]} />
        <meshBasicMaterial color="#867d90" />
      </mesh>

      <group ref={(node) => { fragmentRefs.current[0] = node; }} visible={false}>
        <RoundedBox args={[0.66, 1.14, 0.07]} radius={0.16} smoothness={5} position={[-0.53, 0.4, 0]}>
          <meshPhysicalMaterial color="#d2c4dc" transparent opacity={0.22} metalness={0.26} roughness={0.16} transmission={0.17} />
        </RoundedBox>
      </group>
      <group ref={(node) => { fragmentRefs.current[1] = node; }} visible={false}>
        <RoundedBox args={[0.66, 1.14, 0.07]} radius={0.16} smoothness={5} position={[0.53, -0.34, 0]}>
          <meshPhysicalMaterial color="#e7a9be" transparent opacity={0.2} metalness={0.24} roughness={0.17} transmission={0.17} />
        </RoundedBox>
      </group>
      <group ref={(node) => { fragmentRefs.current[2] = node; }} visible={false}>
        <RoundedBox args={[0.82, 0.38, 0.065]} radius={0.12} smoothness={5} position={[0, -0.72, 0]}>
          <meshPhysicalMaterial color="#c7b4e6" transparent opacity={0.21} metalness={0.22} roughness={0.16} transmission={0.17} />
        </RoundedBox>
      </group>

      <EmbeddedMetric progress={progress} />
    </group>
  );
}

function SignalTrace() {
  return (
    <Line
      points={[
        [-1.5, 3.7, -3.6],
        [-1.13, 2.6, -2.1],
        [-0.56, 1.3, -0.65],
        [0.04, -0.2, 0],
        [0.6, -1.8, -0.75],
        [1.22, -3.75, -2.65],
      ]}
      color="#bcc9ea"
      transparent
      opacity={0.23}
      lineWidth={0.7}
    />
  );
}

function SceneReady({ onReady }: Pick<ApprovalSignalSceneProps, "onReady">) {
  useEffect(() => {
    onReady();
  }, [onReady]);

  return null;
}

export function ApprovalSignalScene({ progress, progressRef, pointerRef, onReady }: ApprovalSignalSceneProps) {
  return (
    <Canvas
      aria-hidden="true"
      className="landing-signal-canvas"
      dpr={[1, 1.5]}
      gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
    >
      <fog attach="fog" args={["#09070d", 5.2, 15]} />
      <ambientLight intensity={0.68} color="#b5b4d3" />
      <directionalLight position={[4.2, 5.8, 5.5]} intensity={2.6} color="#e9deff" />
      <pointLight position={[0, 1.8, 6]} intensity={9} distance={9} color="#ded4ef" />
      <pointLight position={[-4, 1.2, 2.2]} intensity={10} distance={8} color="#9fb7e8" />
      <pointLight position={[2.6, -1.2, 3.2]} intensity={8} distance={7} color="#bc748f" />
      <CameraRig pointerRef={pointerRef} />
      <SignalTrace />
      <ApprovalSignal progress={progress} progressRef={progressRef} />
      <ContactShadows position={[0, -3.45, -1.2]} opacity={0.38} scale={9.4} blur={2.6} far={6.5} color="#000000" />
      <SceneReady onReady={onReady} />
    </Canvas>
  );
}
