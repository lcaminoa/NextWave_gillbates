"use client";

import { ContactShadows, Html, PerspectiveCamera, RoundedBox } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import * as THREE from "three";
import { clamp, getSignalMetric, getSignalWaypoint, getTrajectoryTone } from "./landing-story";

export type LandingPointer = { x: number; y: number };

export type ApprovalSignalSceneProps = {
  progressRef: MutableRefObject<number>;
  pointerRef: MutableRefObject<LandingPointer>;
  onReady: () => void;
};

function smoothstep(start: number, end: number, value: number) {
  const point = clamp((value - start) / (end - start));
  return point * point * (3 - 2 * point);
}

function CameraRig({ pointerRef }: Pick<ApprovalSignalSceneProps, "pointerRef">) {
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);

  useFrame((_state, delta) => {
    const camera = cameraRef.current;
    if (!camera) return;
    camera.position.x = THREE.MathUtils.damp(camera.position.x, pointerRef.current.x * 0.09, 3.2, delta);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, pointerRef.current.y * 0.065, 3.2, delta);
    camera.lookAt(0, 0, 0);
  });

  return <PerspectiveCamera ref={cameraRef} makeDefault fov={41} position={[0, 0, 7.1]} />;
}

function EmbeddedMetric({ progressRef }: Pick<ApprovalSignalSceneProps, "progressRef">) {
  const [metric, setMetric] = useState(() => getSignalMetric(0));
  const lastMetric = useRef(`${metric.label}:${metric.metric}`);

  useFrame(() => {
    const next = getSignalMetric(progressRef.current);
    const key = `${next.label}:${next.metric}`;
    if (key !== lastMetric.current) {
      lastMetric.current = key;
      setMetric(next);
    }
  });

  return (
    <Html transform distanceFactor={4.8} position={[0, 0.43, 0.48]} center style={{ pointerEvents: "none" }}>
      <div className="landing-scene-display">
        <span>{metric.label}</span>
        <strong>{metric.metric}</strong>
      </div>
    </Html>
  );
}

function ApprovalSignal({ progressRef }: Pick<ApprovalSignalSceneProps, "progressRef">) {
  const signalRef = useRef<THREE.Group>(null);
  const bandMaterialRef = useRef<THREE.MeshStandardMaterial>(null);
  const glowMaterialRef = useRef<THREE.MeshStandardMaterial>(null);
  const shellMaterialRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const fragmentRefs = useRef<(THREE.Group | null)[]>([]);
  const color = useMemo(() => new THREE.Color(), []);
  const targetColor = useMemo(() => new THREE.Color(), []);
  const origin = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, delta) => {
    const progress = progressRef.current;
    const waypoint = getSignalWaypoint(progress);
    const viewport = state.viewport.getCurrentViewport(state.camera, origin.set(0, 0, waypoint.depth));
    const isNarrow = state.size.width <= 640;
    const mobileFactor = isNarrow ? 0.68 : 1;
    const mobileShift = isNarrow ? smoothstep(0.12, 0.2, progress) * viewport.height * 0.09 : 0;
    const horizontalPosition = isNarrow ? waypoint.x + 0.1 : waypoint.x;
    const targetX = (horizontalPosition - 0.5) * viewport.width;
    const targetY = (0.5 - waypoint.y) * viewport.height - mobileShift;
    const evidenceOpen = smoothstep(0.958, 0.997, progress);
    const drift = Math.sin(state.clock.elapsedTime * 0.32) * 0.022;

    if (signalRef.current) {
      signalRef.current.position.x = THREE.MathUtils.damp(signalRef.current.position.x, targetX + drift, 4.1, delta);
      signalRef.current.position.y = THREE.MathUtils.damp(signalRef.current.position.y, targetY, 4.1, delta);
      signalRef.current.position.z = THREE.MathUtils.damp(signalRef.current.position.z, waypoint.depth, 4.1, delta);
      const scale = THREE.MathUtils.damp(signalRef.current.scale.x, waypoint.scale * mobileFactor, 4.1, delta);
      signalRef.current.scale.setScalar(scale);
      signalRef.current.rotation.x = 0.18 + progress * 0.52 + Math.sin(state.clock.elapsedTime * 0.2) * 0.04;
      signalRef.current.rotation.y = -0.26 + progress * 0.43 + Math.cos(state.clock.elapsedTime * 0.17) * 0.035;
      signalRef.current.rotation.z = -0.1 + progress * 0.19;
    }

    const palette = {
      stable: "#b8c9ea",
      deviation: "#e4aa61",
      evidence: "#dd7a99",
    };
    targetColor.set(palette[getTrajectoryTone(progress)]);
    color.lerp(targetColor, 1 - Math.exp(-delta * 4.4));

    if (bandMaterialRef.current) {
      bandMaterialRef.current.color.copy(color);
      bandMaterialRef.current.emissive.copy(color);
      bandMaterialRef.current.emissiveIntensity = 0.92 + smoothstep(0.25, 0.45, progress) * 0.92;
    }

    if (glowMaterialRef.current) {
      glowMaterialRef.current.color.copy(color);
      glowMaterialRef.current.emissive.copy(color);
      glowMaterialRef.current.emissiveIntensity = 0.2 + evidenceOpen * 0.86;
      glowMaterialRef.current.opacity = 0.26 + evidenceOpen * 0.42;
    }

    if (shellMaterialRef.current) {
      shellMaterialRef.current.clearcoat = 0.8 + evidenceOpen * 0.13;
      shellMaterialRef.current.roughness = 0.27 - evidenceOpen * 0.06;
    }

    fragmentRefs.current.forEach((fragment, index) => {
      if (!fragment) return;
      const direction = index === 0 ? -1 : index === 1 ? 1 : 0;
      fragment.position.x = direction * evidenceOpen * (index === 2 ? 0.16 : 0.66);
      fragment.position.y = index === 2 ? evidenceOpen * 0.64 : (index === 0 ? 0.36 : -0.3) * evidenceOpen;
      fragment.position.z = 0.26 + evidenceOpen * 0.32;
      fragment.rotation.z = direction * evidenceOpen * 0.2;
      fragment.rotation.y = direction * evidenceOpen * 0.28;
      fragment.visible = evidenceOpen > 0.01;
    });
  });

  return (
    <group ref={signalRef}>
      <RoundedBox args={[2.2, 3.14, 0.72]} radius={0.78} smoothness={7}>
        <meshPhysicalMaterial
          ref={shellMaterialRef}
          color="#302a3c"
          metalness={0.85}
          roughness={0.27}
          clearcoat={0.8}
          clearcoatRoughness={0.13}
        />
      </RoundedBox>

      <RoundedBox args={[2.04, 2.98, 0.15]} radius={0.68} smoothness={6} position={[0, 0, 0.42]}>
        <meshPhysicalMaterial color="#40394d" metalness={0.66} roughness={0.29} clearcoat={0.94} clearcoatRoughness={0.1} />
      </RoundedBox>

      <RoundedBox args={[1.85, 2.76, 0.08]} radius={0.58} smoothness={6} position={[0, 0, 0.53]}>
        <meshStandardMaterial color="#15131f" metalness={0.48} roughness={0.4} />
      </RoundedBox>

      <RoundedBox args={[1.25, 0.58, 0.075]} radius={0.12} smoothness={5} position={[0, 0.43, 0.59]}>
        <meshStandardMaterial color="#171524" metalness={0.54} roughness={0.29} />
      </RoundedBox>

      <RoundedBox args={[1.43, 0.14, 0.055]} radius={0.045} smoothness={4} position={[0, -0.44, 0.6]}>
        <meshStandardMaterial ref={bandMaterialRef} color="#b8c9ea" emissive="#b8c9ea" emissiveIntensity={0.92} />
      </RoundedBox>

      <RoundedBox args={[0.52, 0.055, 0.06]} radius={0.02} smoothness={3} position={[0.02, -0.44, 0.64]}>
        <meshStandardMaterial color="#0b0a11" roughness={0.38} />
      </RoundedBox>

      <mesh position={[-0.66, -1.03, 0.6]}>
        <circleGeometry args={[0.058, 28]} />
        <meshStandardMaterial ref={glowMaterialRef} color="#b8c9ea" emissive="#b8c9ea" transparent opacity={0.26} />
      </mesh>
      {[-0.51, -0.4, -0.29].map((x) => (
        <mesh key={x} position={[x, -1.03, 0.6]}>
          <circleGeometry args={[0.025, 20]} />
          <meshBasicMaterial color="#867d90" />
        </mesh>
      ))}

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

      <EmbeddedMetric progressRef={progressRef} />
    </group>
  );
}

function SceneReady({ onReady }: Pick<ApprovalSignalSceneProps, "onReady">) {
  useEffect(() => {
    onReady();
  }, [onReady]);

  return null;
}

export const ApprovalSignalScene = memo(function ApprovalSignalScene({ progressRef, pointerRef, onReady }: ApprovalSignalSceneProps) {
  return (
    <Canvas
      aria-hidden="true"
      className="landing-signal-canvas"
      dpr={[1, 1.5]}
      gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
    >
      <fog attach="fog" args={["#09070d", 5.2, 15]} />
      <ambientLight intensity={0.74} color="#b5b4d3" />
      <directionalLight position={[4.2, 5.8, 5.5]} intensity={3.05} color="#eee4ff" />
      <pointLight position={[0, 1.8, 6]} intensity={10} distance={9} color="#ded4ef" />
      <pointLight position={[-4, 1.2, 2.2]} intensity={10.5} distance={8} color="#a9c2ee" />
      <pointLight position={[2.6, -1.2, 3.2]} intensity={8.5} distance={7} color="#bf748f" />
      <CameraRig pointerRef={pointerRef} />
      <ApprovalSignal progressRef={progressRef} />
      <ContactShadows position={[0, -3.45, -1.2]} opacity={0.36} scale={9.4} blur={2.6} far={6.5} color="#000000" />
      <SceneReady onReady={onReady} />
    </Canvas>
  );
});
