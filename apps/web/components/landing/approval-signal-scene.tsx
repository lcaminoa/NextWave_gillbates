"use client";

import { ContactShadows, PerspectiveCamera, RoundedBox } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef } from "react";
import type { MutableRefObject } from "react";
import * as THREE from "three";
import { clamp, getSignalWaypoint, getTrajectoryTone } from "./landing-story";

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

function createCardMarkingsTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 300;
  const context = canvas.getContext("2d");
  if (!context) return new THREE.CanvasTexture(canvas);

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(232, 235, 244, 0.94)";
  context.font = "600 92px Arial, sans-serif";
  context.fillText("PHAROS", 18, 106);
  context.fillStyle = "rgba(193, 199, 216, 0.82)";
  context.font = "700 27px Arial, sans-serif";
  context.fillText("CONTROL TOWER", 22, 159);
  context.fillStyle = "rgba(180, 186, 204, 0.66)";
  context.font = "600 22px Arial, sans-serif";
  context.fillText("PAYMENT SIGNAL", 22, 204);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 2;
  return texture;
}

function CardMarkings({ progressRef }: Pick<ApprovalSignalSceneProps, "progressRef">) {
  const texture = useMemo(() => createCardMarkingsTexture(), []);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const color = useMemo(() => new THREE.Color("#e8ebf4"), []);
  const targetColor = useMemo(() => new THREE.Color(), []);

  useEffect(() => () => texture.dispose(), [texture]);

  useFrame((_state, delta) => {
    const tone = getTrajectoryTone(progressRef.current);
    targetColor.set(tone === "evidence" ? "#f1c8d7" : "#e8ebf4");
    color.lerp(targetColor, 1 - Math.exp(-delta * 3.8));
    if (materialRef.current) materialRef.current.color.copy(color);
  });

  return (
    <mesh position={[0.56, 0.51, 0.127]} renderOrder={3}>
      <planeGeometry args={[1.53, 0.36]} />
      <meshBasicMaterial ref={materialRef} map={texture} transparent opacity={0.74} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

function ApprovalSignal({ progressRef }: Pick<ApprovalSignalSceneProps, "progressRef">) {
  const signalRef = useRef<THREE.Group>(null);
  const edgeMaterialRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const faceMaterialRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const chipMaterialRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const chipTraceMaterialRef = useRef<THREE.MeshStandardMaterial>(null);
  const chipCoreMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const evidenceLayerRefs = useRef<(THREE.Group | null)[]>([]);
  const evidenceLayerMaterialRefs = useRef<(THREE.MeshPhysicalMaterial | null)[]>([]);
  const color = useMemo(() => new THREE.Color(), []);
  const targetColor = useMemo(() => new THREE.Color(), []);
  const chipBaseColor = useMemo(() => new THREE.Color("#c1a56f"), []);
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
    const evidenceRise = smoothstep(0.84, 0.91, progress);
    const evidenceSettle = smoothstep(0.96, 0.995, progress);
    const evidenceOpen = evidenceRise * (1 - evidenceSettle * 0.68);
    const signalRise = smoothstep(0.25, 0.37, progress);
    const drift = Math.sin(state.clock.elapsedTime * 0.32) * 0.022;

    if (signalRef.current) {
      signalRef.current.position.x = THREE.MathUtils.damp(signalRef.current.position.x, targetX + drift, 4.1, delta);
      signalRef.current.position.y = THREE.MathUtils.damp(signalRef.current.position.y, targetY, 4.1, delta);
      signalRef.current.position.z = THREE.MathUtils.damp(signalRef.current.position.z, waypoint.depth, 4.1, delta);
      const scale = THREE.MathUtils.damp(signalRef.current.scale.x, waypoint.scale * mobileFactor, 4.1, delta);
      signalRef.current.scale.setScalar(scale);
      signalRef.current.rotation.x = 0.16 + progress * 0.58 + Math.sin(state.clock.elapsedTime * 0.2) * 0.035;
      signalRef.current.rotation.y = -0.28 + progress * 0.42 + Math.cos(state.clock.elapsedTime * 0.17) * 0.028;
      signalRef.current.rotation.z = -0.07 + progress * 0.15;
    }

    const palette = {
      stable: "#b8c9ea",
      deviation: "#e4aa61",
      evidence: "#dd7a99",
    };
    targetColor.set(palette[getTrajectoryTone(progress)]);
    color.lerp(targetColor, 1 - Math.exp(-delta * 4.4));

    if (edgeMaterialRef.current) {
      edgeMaterialRef.current.roughness = 0.17 - evidenceOpen * 0.03;
      edgeMaterialRef.current.clearcoat = 0.4 + evidenceOpen * 0.18;
    }

    if (faceMaterialRef.current) {
      faceMaterialRef.current.roughness = 0.32 - evidenceOpen * 0.04;
      faceMaterialRef.current.clearcoat = 0.2 + evidenceOpen * 0.12;
    }

    if (chipMaterialRef.current) {
      chipMaterialRef.current.color.copy(chipBaseColor).lerp(color, signalRise * 0.18 + evidenceOpen * 0.12);
      chipMaterialRef.current.emissive.copy(color);
      chipMaterialRef.current.emissiveIntensity = 0.035 + signalRise * 0.34 + evidenceOpen * 0.36;
    }

    if (chipTraceMaterialRef.current) {
      chipTraceMaterialRef.current.color.copy(color);
      chipTraceMaterialRef.current.emissive.copy(color);
      chipTraceMaterialRef.current.emissiveIntensity = 0.08 + signalRise * 0.72 + evidenceOpen * 0.3;
      chipTraceMaterialRef.current.opacity = 0.015 + signalRise * 0.42 + evidenceOpen * 0.16;
    }

    if (chipCoreMaterialRef.current) {
      chipCoreMaterialRef.current.color.copy(color);
      chipCoreMaterialRef.current.opacity = evidenceOpen * 0.26;
    }

    evidenceLayerRefs.current.forEach((layer, index) => {
      if (!layer) return;
      const direction = index === 0 ? -1 : 1;
      layer.position.x = direction * evidenceOpen * 0.14;
      layer.position.y = direction * evidenceOpen * 0.065;
      layer.position.z = evidenceOpen * (index === 0 ? 0.065 : 0.105);
      layer.rotation.z = direction * evidenceOpen * 0.034;
      layer.rotation.y = direction * evidenceOpen * 0.045;
      layer.visible = evidenceOpen > 0.01;

      const material = evidenceLayerMaterialRefs.current[index];
      if (!material) return;
      material.color.copy(color);
      material.emissive.copy(color);
      material.emissiveIntensity = evidenceOpen * 0.32;
      material.opacity = evidenceOpen * 0.24;
    });
  });

  return (
    <group ref={signalRef}>
      <group ref={(node) => { evidenceLayerRefs.current[0] = node; }} visible={false}>
        <RoundedBox args={[3.32, 2.08, 0.018]} radius={0.155} smoothness={7} position={[0, 0, -0.105]}>
          <meshPhysicalMaterial
            ref={(material) => { evidenceLayerMaterialRefs.current[0] = material; }}
            color="#b87791"
            emissive="#b87791"
            transparent
            opacity={0}
            depthWrite={false}
            metalness={0.6}
            roughness={0.2}
          />
        </RoundedBox>
      </group>
      <group ref={(node) => { evidenceLayerRefs.current[1] = node; }} visible={false}>
        <RoundedBox args={[3.27, 2.03, 0.016]} radius={0.145} smoothness={7} position={[0, 0, -0.13]}>
          <meshPhysicalMaterial
            ref={(material) => { evidenceLayerMaterialRefs.current[1] = material; }}
            color="#b87791"
            emissive="#b87791"
            transparent
            opacity={0}
            depthWrite={false}
            metalness={0.54}
            roughness={0.22}
          />
        </RoundedBox>
      </group>

      <RoundedBox args={[3.36, 2.12, 0.16]} radius={0.16} smoothness={8}>
        <meshPhysicalMaterial
          ref={edgeMaterialRef}
          color="#465063"
          metalness={0.96}
          roughness={0.17}
          clearcoat={0.4}
          clearcoatRoughness={0.12}
        />
      </RoundedBox>

      <RoundedBox args={[3.26, 2.02, 0.09]} radius={0.13} smoothness={8} position={[0, 0, 0.075]}>
        <meshPhysicalMaterial
          ref={faceMaterialRef}
          color="#20252e"
          metalness={0.9}
          roughness={0.32}
          clearcoat={0.2}
          clearcoatRoughness={0.2}
        />
      </RoundedBox>

      <CardMarkings progressRef={progressRef} />

      <RoundedBox args={[0.69, 0.57, 0.016]} radius={0.065} smoothness={5} position={[-0.72, 0.17, 0.13]}>
        <meshStandardMaterial color="#0d1016" metalness={0.7} roughness={0.42} />
      </RoundedBox>
      <RoundedBox args={[0.61, 0.49, 0.026]} radius={0.052} smoothness={5} position={[-0.72, 0.17, 0.148]}>
        <meshPhysicalMaterial
          ref={chipMaterialRef}
          color="#c1a56f"
          emissive="#4f3920"
          emissiveIntensity={0.035}
          metalness={0.86}
          roughness={0.28}
          clearcoat={0.28}
          clearcoatRoughness={0.16}
        />
      </RoundedBox>

      <group position={[-0.72, 0.17, 0.166]}>
        <RoundedBox args={[0.5, 0.018, 0.008]} radius={0.005} smoothness={3} position={[0, 0.01, 0]}>
          <meshStandardMaterial color="#7c633c" metalness={0.75} roughness={0.32} />
        </RoundedBox>
        <RoundedBox args={[0.014, 0.37, 0.008]} radius={0.004} smoothness={3} position={[-0.115, 0, 0]}>
          <meshStandardMaterial color="#7c633c" metalness={0.75} roughness={0.32} />
        </RoundedBox>
        <RoundedBox args={[0.014, 0.37, 0.008]} radius={0.004} smoothness={3} position={[0.13, 0, 0]}>
          <meshStandardMaterial color="#7c633c" metalness={0.75} roughness={0.32} />
        </RoundedBox>
        <RoundedBox args={[0.48, 0.014, 0.008]} radius={0.004} smoothness={3} position={[0, -0.145, 0]}>
          <meshStandardMaterial color="#7c633c" metalness={0.75} roughness={0.32} />
        </RoundedBox>
      </group>

      <RoundedBox args={[0.86, 0.68, 0.009]} radius={0.09} smoothness={5} position={[-0.72, 0.17, 0.117]}>
        <meshBasicMaterial ref={chipCoreMaterialRef} color="#dd7a99" transparent opacity={0} depthWrite={false} />
      </RoundedBox>
      <RoundedBox args={[1.86, 0.017, 0.008]} radius={0.006} smoothness={3} position={[0.52, 0.17, 0.164]}>
        <meshStandardMaterial
          ref={chipTraceMaterialRef}
          color="#b8c9ea"
          emissive="#b8c9ea"
          emissiveIntensity={0.08}
          transparent
          opacity={0.015}
          depthWrite={false}
        />
      </RoundedBox>
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
