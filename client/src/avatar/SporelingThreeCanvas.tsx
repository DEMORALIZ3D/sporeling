import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { PetState } from '../lib/types';
import { createPlush, type PlushCreature } from './plush/createPlush';
import type { SpeciesId } from './plush/species';

export type CreatureAction =
  | 'idle'
  | 'thinking'
  | 'searching'
  | 'surprised'
  | 'confident'
  | 'celebrating'
  | 'depleted'
  | 'dormant';

export type AvatarStyle = 'mochi' | 'orb';

interface SporelingThreeCanvasProps {
  petState: PetState | null;
  avatarStyle?: AvatarStyle;
  species?: SpeciesId;
  currentAction?: CreatureAction;
  isSpeaking: boolean;
  isFeeding: boolean;
  onPoke?: () => void;
}

const LEGACY_MOCHI = false;

// Generate a soft circular glowing dot texture for the OpenAI / Muse particle orb
function createDotTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.85)');
  gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.3)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

// Aurora Shader
const auroraVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const auroraFragmentShader = `
  uniform float uTime;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  varying vec2 vUv;

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float len = length(p);
    float wave1 = sin(p.x * 2.5 + uTime * 0.7 + sin(p.y * 2.0));
    float wave2 = cos(p.y * 3.0 - uTime * 0.5 + cos(p.x * 2.0));
    float aura = smoothstep(1.35, 0.05, len) * 0.6;
    float mixVal = clamp((wave1 + wave2) * 0.5 + 0.5, 0.0, 1.0);
    vec3 col = mix(uColorA, uColorB, mixVal);
    float alpha = aura * (0.35 + 0.2 * sin(uTime * 0.5 + p.y));
    gl_FragColor = vec4(col, alpha);
  }
`;

export const SporelingThreeCanvas: React.FC<SporelingThreeCanvasProps> = ({
  petState,
  avatarStyle = 'mochi',
  species = 'jolly',
  currentAction = 'idle',
  isSpeaking,
  isFeeding,
  onPoke
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ petState, avatarStyle, species, currentAction, isSpeaking, isFeeding });

  useEffect(() => {
    stateRef.current = { petState, avatarStyle, species, currentAction, isSpeaking, isFeeding };
  }, [petState, avatarStyle, species, currentAction, isSpeaking, isFeeding]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // --- Scene & Renderer Setup ---
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(0, 0, 7.8);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    container.appendChild(renderer.domElement);

    // --- Aurora Background Mesh ---
    const auroraGeo = new THREE.PlaneGeometry(16, 16);
    const auroraMat = new THREE.ShaderMaterial({
      vertexShader: auroraVertexShader,
      fragmentShader: auroraFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uColorA: { value: new THREE.Color(0x064e3b) },
        uColorB: { value: new THREE.Color(0x0284c7) }
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const auroraMesh = new THREE.Mesh(auroraGeo, auroraMat);
    auroraMesh.position.set(0, 0, -2.5);
    scene.add(auroraMesh);

    // --- Lighting ---
    const ambientLight = new THREE.AmbientLight(0x072718, 1.6);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xe0f2fe, 2.5);
    mainLight.position.set(4, 5, 6);
    scene.add(mainLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 2.2);
    rimLight.position.set(-5, -2, -3);
    scene.add(rimLight);

    const coreLight = new THREE.PointLight(0x10b981, 4.0, 10);
    scene.add(coreLight);

    // Root Group
    const rootGroup = new THREE.Group();
    scene.add(rootGroup);

    // ==========================================
    // 1. PLUSH FAMILIAR (procedural fur species)
    // ==========================================
    const plushRoot = new THREE.Group();
    plushRoot.position.y = -0.1;
    plushRoot.scale.setScalar(0.82);
    rootGroup.add(plushRoot);
    let plush: PlushCreature = createPlush(stateRef.current.species);
    plushRoot.add(plush.group);
    let pokeAt = -Infinity;
    let lastPointerMove = -Infinity;
    const pointerLook = { x: 0, y: 0 };
    const wind = new THREE.Vector3();
    let prevRotY = 0;

    // Legacy mochi (kept hidden; the plush replaces it)
    const mochiGroup = new THREE.Group();
    rootGroup.add(mochiGroup);

    // Chubby Pear/Dumpling Geometry
    const BASE_RADIUS = 1.65;
    const mochiGeo = new THREE.SphereGeometry(BASE_RADIUS, 80, 80);
    const posAttr = mochiGeo.attributes.position;
    const basePositions = new Float32Array(posAttr.array);

    // Morph base sphere into chubby pear-shaped dumpling
    for (let i = 0; i < basePositions.length; i += 3) {
      const y = basePositions[i + 1];
      const yn = y / BASE_RADIUS;
      // Wider bottom (chubby belly), cute tapered top
      const plump = 1.08 - 0.22 * yn + 0.12 * Math.max(0, -yn);
      basePositions[i] *= plump;
      basePositions[i + 2] *= plump;
      basePositions[i + 1] *= 0.94; // slightly squashed mochi height
    }
    (posAttr.array as Float32Array).set(basePositions);
    posAttr.needsUpdate = true;
    mochiGeo.computeVertexNormals();

    // Translucent Jade-Mint Velvet Jelly Material
    const mochiMat = new THREE.MeshPhysicalMaterial({
      color: 0x2dd4bf,
      roughness: 0.22,
      metalness: 0.04,
      clearcoat: 0.65,
      clearcoatRoughness: 0.15,
      transmission: 0.15,
      emissive: 0x065f46,
      emissiveIntensity: 0.5
    });

    const mochiMesh = new THREE.Mesh(mochiGeo, mochiMat);
    mochiGroup.add(mochiMesh);

    // --- Kawaii Anime Eyes (Huge, glossy, dual specular sparkles) ---
    function buildKawaiiEye() {
      const eyeRoot = new THREE.Group();

      // Sclera/Pupil base (Glossy deep espresso oval)
      const pupilGeo = new THREE.SphereGeometry(0.24, 32, 32);
      const pupilMat = new THREE.MeshStandardMaterial({
        color: 0x060f0b,
        roughness: 0.05,
        metalness: 0.1
      });
      const pupil = new THREE.Mesh(pupilGeo, pupilMat);
      pupil.scale.set(1.0, 1.25, 0.45);
      eyeRoot.add(pupil);

      // Gradient Iris Ring (emerald/cyan glow inside pupil)
      const irisGeo = new THREE.RingGeometry(0.1, 0.2, 32);
      const irisMat = new THREE.MeshBasicMaterial({
        color: 0x10b981,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide
      });
      const iris = new THREE.Mesh(irisGeo, irisMat);
      iris.position.set(0, -0.04, 0.11);
      eyeRoot.add(iris);

      // Large Primary Sparkle (upper right)
      const sparkle1Geo = new THREE.SphereGeometry(0.065, 16, 16);
      const sparkleMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const sparkle1 = new THREE.Mesh(sparkle1Geo, sparkleMat);
      sparkle1.position.set(0.06, 0.08, 0.13);
      eyeRoot.add(sparkle1);

      // Small Secondary Sparkle (lower left)
      const sparkle2Geo = new THREE.SphereGeometry(0.035, 16, 16);
      const sparkle2 = new THREE.Mesh(sparkle2Geo, sparkleMat);
      sparkle2.position.set(-0.06, -0.08, 0.12);
      eyeRoot.add(sparkle2);

      return { eyeRoot, pupil, iris, sparkle1, sparkle2 };
    }

    const leftEye = buildKawaiiEye();
    const rightEye = buildKawaiiEye();
    mochiGroup.add(leftEye.eyeRoot);
    mochiGroup.add(rightEye.eyeRoot);

    // --- Cute Blushing Cheeks (Glowing Pink Oval Pads) ---
    function buildBlush() {
      const blushGeo = new THREE.SphereGeometry(0.18, 24, 24);
      const blushMat = new THREE.MeshStandardMaterial({
        color: 0xf472b6,
        roughness: 0.4,
        emissive: 0xdb2777,
        emissiveIntensity: 0.7,
        transparent: true,
        opacity: 0.8
      });
      const blush = new THREE.Mesh(blushGeo, blushMat);
      blush.scale.set(1.3, 0.7, 0.3);
      return blush;
    }

    const leftBlush = buildBlush();
    const rightBlush = buildBlush();
    mochiGroup.add(leftBlush);
    mochiGroup.add(rightBlush);

    // --- Tiny Smiling Mouth ---
    const mouthCurve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-0.12, 0.02, 0),
      new THREE.Vector3(0, -0.06, 0.03),
      new THREE.Vector3(0.12, 0.02, 0)
    );
    const mouthGeo = new THREE.TubeGeometry(mouthCurve, 20, 0.025, 8, false);
    const mouthMat = new THREE.MeshStandardMaterial({ color: 0x064e3b, roughness: 0.3 });
    const mouthMesh = new THREE.Mesh(mouthGeo, mouthMat);
    mochiGroup.add(mouthMesh);

    // --- Bouncing Sprout on Head (Stem + 2 Little Leaves) ---
    const sproutGroup = new THREE.Group();
    sproutGroup.position.set(0, 1.55, 0);

    // Curved stem
    const stemCurve = new THREE.CubicBezierCurve3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0.25, 0),
      new THREE.Vector3(0.06, 0.4, 0),
      new THREE.Vector3(0.08, 0.55, 0)
    );
    const stemGeo = new THREE.TubeGeometry(stemCurve, 16, 0.03, 8, false);
    const plantMat = new THREE.MeshStandardMaterial({
      color: 0x4ade80,
      roughness: 0.3,
      emissive: 0x15803d,
      emissiveIntensity: 0.4
    });
    const stemMesh = new THREE.Mesh(stemGeo, plantMat);
    sproutGroup.add(stemMesh);

    // Left Leaf
    const leafGeo = new THREE.SphereGeometry(0.14, 16, 16);
    const leftLeaf = new THREE.Mesh(leafGeo, plantMat);
    leftLeaf.scale.set(1.6, 0.5, 0.8);
    leftLeaf.position.set(-0.16, 0.52, 0);
    leftLeaf.rotation.z = 0.4;
    sproutGroup.add(leftLeaf);

    // Right Leaf
    const rightLeaf = new THREE.Mesh(leafGeo, plantMat);
    rightLeaf.scale.set(1.5, 0.5, 0.8);
    rightLeaf.position.set(0.24, 0.54, 0);
    rightLeaf.rotation.z = -0.4;
    sproutGroup.add(rightLeaf);

    mochiGroup.add(sproutGroup);

    // ==========================================
    // 2. OPENAI / META MUSE DOTS ORB SUB-GROUP
    // ==========================================
    const orbGroup = new THREE.Group();
    rootGroup.add(orbGroup);

    // Inner Glass Core Sphere
    const innerCoreGeo = new THREE.SphereGeometry(1.25, 48, 48);
    const innerCoreMat = new THREE.MeshPhysicalMaterial({
      color: 0x064e3b,
      emissive: 0x0f766e,
      emissiveIntensity: 0.9,
      roughness: 0.15,
      metalness: 0.1,
      transmission: 0.7,
      transparent: true,
      opacity: 0.85
    });
    const innerCore = new THREE.Mesh(innerCoreGeo, innerCoreMat);
    orbGroup.add(innerCore);

    // Concentric Fibonacci Dot Lattice (650 glowing points)
    const dotCount = 650;
    const dotGeo = new THREE.BufferGeometry();
    const dotPositions = new Float32Array(dotCount * 3);
    const dotBasePos = new Float32Array(dotCount * 3);
    const dotColors = new Float32Array(dotCount * 3);

    const dotTex = createDotTexture();
    const colorCyan = new THREE.Color(0x38bdf8);
    const colorEmerald = new THREE.Color(0x34d399);
    const colorPurple = new THREE.Color(0xc084fc);

    for (let i = 0; i < dotCount; i++) {
      // Fibonacci sphere distribution
      const phi = Math.acos(1 - (2 * (i + 0.5)) / dotCount);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const r = 1.85;

      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.cos(phi);
      const z = r * Math.sin(phi) * Math.sin(theta);

      dotPositions[i * 3] = x;
      dotPositions[i * 3 + 1] = y;
      dotPositions[i * 3 + 2] = z;

      dotBasePos[i * 3] = x;
      dotBasePos[i * 3 + 1] = y;
      dotBasePos[i * 3 + 2] = z;

      // Color gradient from top to bottom
      const mixRatio = (y + r) / (2 * r);
      const dotColor = mixRatio > 0.5
        ? colorEmerald.clone().lerp(colorCyan, (mixRatio - 0.5) * 2)
        : colorPurple.clone().lerp(colorEmerald, mixRatio * 2);

      dotColors[i * 3] = dotColor.r;
      dotColors[i * 3 + 1] = dotColor.g;
      dotColors[i * 3 + 2] = dotColor.b;
    }

    dotGeo.setAttribute('position', new THREE.BufferAttribute(dotPositions, 3));
    dotGeo.setAttribute('color', new THREE.BufferAttribute(dotColors, 3));

    const dotMat = new THREE.PointsMaterial({
      size: 0.18,
      map: dotTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const dotPoints = new THREE.Points(dotGeo, dotMat);
    orbGroup.add(dotPoints);

    // Glowing Magnetic Wave Rings
    const ringGeo = new THREE.TorusGeometry(2.15, 0.02, 16, 100);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending
    });
    const orbitalRing = new THREE.Mesh(ringGeo, ringMat);
    orbitalRing.rotation.x = Math.PI / 3;
    orbGroup.add(orbitalRing);

    // --- Ambient Floating Spore Cloud (150 particles) ---
    const sporeCount = 150;
    const sporeGeo = new THREE.BufferGeometry();
    const sporePos = new Float32Array(sporeCount * 3);
    const sporeVel = new Float32Array(sporeCount * 3);

    for (let i = 0; i < sporeCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const rad = 2.2 + Math.random() * 2.0;

      sporePos[i * 3] = rad * Math.sin(phi) * Math.cos(theta);
      sporePos[i * 3 + 1] = rad * Math.sin(phi) * Math.sin(theta);
      sporePos[i * 3 + 2] = rad * Math.cos(phi);

      sporeVel[i * 3] = (Math.random() - 0.5) * 0.006;
      sporeVel[i * 3 + 1] = (Math.random() - 0.5) * 0.005 + 0.004;
      sporeVel[i * 3 + 2] = (Math.random() - 0.5) * 0.006;
    }

    sporeGeo.setAttribute('position', new THREE.BufferAttribute(sporePos, 3));
    const sporeMat = new THREE.PointsMaterial({
      color: 0x34d399,
      size: 0.12,
      map: dotTex,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending
    });
    const sporePoints = new THREE.Points(sporeGeo, sporeMat);
    scene.add(sporePoints);

    // --- Normal Vectors for Facial Feature Anchoring ---
    const leftEyeDir = new THREE.Vector3(-0.35, 0.16, 0.91).normalize();
    const rightEyeDir = new THREE.Vector3(0.35, 0.16, 0.91).normalize();
    const leftBlushDir = new THREE.Vector3(-0.52, -0.06, 0.85).normalize();
    const rightBlushDir = new THREE.Vector3(0.52, -0.06, 0.85).normalize();
    const mouthDir = new THREE.Vector3(0.0, -0.16, 0.98).normalize();

    // --- Physics & Interaction State ---
    let isDragging = false;
    let prevPointerX = 0;
    let prevPointerY = 0;
    let targetRotationX = 0;
    let targetRotationY = 0;
    let squishScaleY = 1.0;
    let squishVelocityY = 0.0;
    let targetSquishScale = 1.0;
    let blinkTimer = 0;
    let isBlinking = false;
    let sproutWiggleZ = 0;
    let sproutWiggleVel = 0;

    const handlePointerDown = (e: PointerEvent) => {
      isDragging = true;
      prevPointerX = e.clientX;
      prevPointerY = e.clientY;
      targetSquishScale = 0.72; // Cute bouncy squish!
      sproutWiggleVel += (Math.random() - 0.5) * 1.5;
      if (onPoke) onPoke();
      pokeAt = clock.getElapsedTime();
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (isDragging) {
        const deltaX = e.clientX - prevPointerX;
        const deltaY = e.clientY - prevPointerY;
        targetRotationY += deltaX * 0.007;
        targetRotationX += deltaY * 0.007;
        targetRotationX = Math.max(-0.45, Math.min(0.45, targetRotationX));
        sproutWiggleVel += -deltaX * 0.01;
        prevPointerX = e.clientX;
        prevPointerY = e.clientY;
      }

      const rect = container.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      pointerLook.x = THREE.MathUtils.clamp(nx * 1.4, -1, 1);
      pointerLook.y = THREE.MathUtils.clamp(ny * 1.4, -1, 1);
      lastPointerMove = clock.getElapsedTime();

      // Pupil tracking with cute bounds
      leftEye.pupil.position.x = THREE.MathUtils.clamp(nx * 0.035, -0.035, 0.035);
      leftEye.pupil.position.y = THREE.MathUtils.clamp(ny * 0.035, -0.035, 0.035);
      rightEye.pupil.position.x = THREE.MathUtils.clamp(nx * 0.035, -0.035, 0.035);
      rightEye.pupil.position.y = THREE.MathUtils.clamp(ny * 0.035, -0.035, 0.035);
    };

    const handlePointerUp = () => {
      isDragging = false;
      targetSquishScale = 1.0;
    };

    container.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // --- Main Animation Loop ---
    let clock = new THREE.Clock();
    let animationFrameId: number;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const time = clock.getElapsedTime();

      const currentStyle = stateRef.current.avatarStyle || 'mochi';
      const currentAction = stateRef.current.currentAction || 'idle';
      const isSpeakingNow = stateRef.current.isSpeaking;
      const isFeedingNow = stateRef.current.isFeeding;
      const petStateNow = stateRef.current.petState;

      const mood = petStateNow?.mood || 'content';
      const hunger = petStateNow?.hunger ?? 80;
      const hydration = petStateNow?.hydration ?? 80;

      // Visibility toggle between Mochi Creature & Dots Orb
      mochiGroup.visible = false;
      plushRoot.visible = currentStyle === 'mochi';
      orbGroup.visible = currentStyle === 'orb';

      // Update Aurora Shader
      auroraMat.uniforms.uTime.value = time;

      // Squish spring physics
      const springK = 22.0;
      const dampingC = 4.2;
      const displacement = squishScaleY - targetSquishScale;
      const springForce = -springK * displacement - dampingC * squishVelocityY;
      squishVelocityY += springForce * delta;
      squishScaleY += squishVelocityY * delta;

      // Secondary Sprout Inertia Physics
      const sproutK = 18.0;
      const sproutDamp = 3.5;
      const sproutForce = -sproutK * sproutWiggleZ - sproutDamp * sproutWiggleVel;
      sproutWiggleVel += sproutForce * delta;
      sproutWiggleZ += sproutWiggleVel * delta;
      sproutGroup.rotation.z = sproutWiggleZ;

      // Action / Mood modifiers
      let actionRotZ = 0;
      let actionYOffset = 0;
      let actionScaleMod = 1.0;

      if (currentAction === 'thinking') {
        actionRotZ = Math.sin(time * 3) * 0.12 + 0.15; // Curious tilt
        leftEye.pupil.position.y = 0.035;
        rightEye.pupil.position.y = 0.035;
      } else if (currentAction === 'surprised') {
        actionScaleMod = 1.22;
        leftEye.eyeRoot.scale.set(1.35, 1.35, 1.35);
        rightEye.eyeRoot.scale.set(1.35, 1.35, 1.35);
        mouthMesh.scale.set(1.4, 2.2, 1.4);
      } else if (currentAction === 'celebrating') {
        actionYOffset = Math.abs(Math.sin(time * 8)) * 0.35;
        rootGroup.rotation.y += delta * 3.5;
      } else if (currentAction === 'confident') {
        actionScaleMod = 1.1;
        actionRotZ = Math.sin(time * 1.5) * 0.07;
      } else if (currentAction === 'dormant' || mood === 'dormant') {
        actionYOffset = -0.3;
        leftEye.eyeRoot.scale.y = 0.1;
        rightEye.eyeRoot.scale.y = 0.1;
      }

      // Smooth damped rotation towards target
      rootGroup.rotation.y += (targetRotationY - rootGroup.rotation.y) * 0.08;
      rootGroup.rotation.x += (targetRotationX - rootGroup.rotation.x) * 0.08;
      rootGroup.rotation.z += (actionRotZ - rootGroup.rotation.z) * 0.08;
      rootGroup.position.y += (actionYOffset - rootGroup.position.y) * 0.08;

      const feedBounce = isFeedingNow ? Math.sin(time * 14) * 0.1 : 0;
      const speakBounce = isSpeakingNow ? Math.sin(time * 18) * 0.04 : 0;
      const naturalBreath = Math.sin(time * 2.2) * 0.01;

      const scaleY = Math.max(0.4, (squishScaleY + feedBounce + speakBounce + naturalBreath) * actionScaleMod);
      const scaleXZ = (1.0 + (1.0 - scaleY) * 0.55) * actionScaleMod;
      rootGroup.scale.set(scaleXZ, scaleY, scaleXZ);

      // ==========================================
      // ANIMATE PLUSH FAMILIAR
      // ==========================================
      if (currentStyle === 'mochi') {
        const wantSpecies = stateRef.current.species;
        if (plush.species.id !== wantSpecies) {
          plushRoot.remove(plush.group);
          plush.dispose();
          plush = createPlush(wantSpecies);
          plushRoot.add(plush.group);
          pokeAt = time; // little hello wave
        }
        const rotVel = (rootGroup.rotation.y - prevRotY) / Math.max(delta, 1e-3);
        wind.set(THREE.MathUtils.clamp(-rotVel * 0.02, -0.08, 0.08), 0, 0);
        plush.update({
          t: time,
          dt: Math.min(delta, 0.05),
          action: currentAction,
          mood,
          vitalityIndex: petStateNow?.vitalityIndex ?? 80,
          speaking: isSpeakingNow,
          feeding: isFeedingNow,
          sincePoke: time - pokeAt,
          pointerLook: time - lastPointerMove < 2.5 ? pointerLook : null,
          wind
        });
      }
      prevRotY = rootGroup.rotation.y;

      // Legacy mochi animation (disabled)
      if (LEGACY_MOCHI && currentStyle === 'mochi') {
        // Color shifts based on state
        if (mood === 'thriving') {
          mochiMat.color.setHex(0x2dd4bf);
          mochiMat.emissive.setHex(0x047857);
          coreLight.color.setHex(0x34d399);
        } else if (hydration < 40) {
          mochiMat.color.setHex(0xf59e0b);
          mochiMat.emissive.setHex(0x78350f);
          coreLight.color.setHex(0xf59e0b);
        } else if (hunger < 30) {
          mochiMat.color.setHex(0x94a3b8);
          mochiMat.emissive.setHex(0x334155);
          coreLight.color.setHex(0x94a3b8);
        }

        // Deform chubby mochi body with gentle soft breath
        const positions = mochiGeo.attributes.position.array as Float32Array;
        const breathAmp = 0.04;
        for (let i = 0; i < positions.length; i += 3) {
          const bx = basePositions[i];
          const by = basePositions[i + 1];
          const bz = basePositions[i + 2];
          const wave = Math.sin(by * 1.8 + time * 2.5) * breathAmp;
          positions[i] = bx * (1 + wave);
          positions[i + 1] = by * (1 + wave * 0.5);
          positions[i + 2] = bz * (1 + wave);
        }
        mochiGeo.attributes.position.needsUpdate = true;
        mochiGeo.computeVertexNormals();

        // Mathematical Surface Pinning for Eyes, Blush, and Mouth
        const surfaceR = BASE_RADIUS * 1.05;

        leftEye.eyeRoot.position.copy(leftEyeDir).multiplyScalar(surfaceR);
        leftEye.eyeRoot.lookAt(leftEye.eyeRoot.position.clone().add(leftEyeDir));

        rightEye.eyeRoot.position.copy(rightEyeDir).multiplyScalar(surfaceR);
        rightEye.eyeRoot.lookAt(rightEye.eyeRoot.position.clone().add(rightEyeDir));

        leftBlush.position.copy(leftBlushDir).multiplyScalar(surfaceR - 0.02);
        leftBlush.lookAt(leftBlush.position.clone().add(leftBlushDir));

        rightBlush.position.copy(rightBlushDir).multiplyScalar(surfaceR - 0.02);
        rightBlush.lookAt(rightBlush.position.clone().add(rightBlushDir));

        mouthMesh.position.copy(mouthDir).multiplyScalar(surfaceR + 0.01);
        mouthMesh.lookAt(mouthMesh.position.clone().add(mouthDir));

        // Anime Eye Blinking
        if (currentAction !== 'dormant' && mood !== 'dormant' && currentAction !== 'surprised') {
          blinkTimer += delta;
          if (!isBlinking && blinkTimer > 3.8 + Math.sin(time) * 1.5) {
            isBlinking = true;
            blinkTimer = 0;
          }
          if (isBlinking) {
            const blinkPhase = blinkTimer / 0.15;
            if (blinkPhase >= 1) {
              isBlinking = false;
              leftEye.eyeRoot.scale.y = 1;
              rightEye.eyeRoot.scale.y = 1;
            } else {
              const eyeScale = Math.abs(Math.cos(blinkPhase * Math.PI));
              leftEye.eyeRoot.scale.y = Math.max(0.08, eyeScale);
              rightEye.eyeRoot.scale.y = Math.max(0.08, eyeScale);
            }
          }
        }

        // Talking mouth shape
        if (isSpeakingNow) {
          mouthMesh.scale.set(1.2, 1.0 + Math.abs(Math.sin(time * 14)) * 1.8, 1);
        } else if (currentAction !== 'surprised') {
          mouthMesh.scale.set(1, 1, 1);
        }
      }

      // ==========================================
      // ANIMATE OPENAI / META MUSE DOTS ORB
      // ==========================================
      if (currentStyle === 'orb') {
        const dPos = dotGeo.attributes.position.array as Float32Array;
        const audioWaveAmp = isSpeakingNow ? 0.35 : 0.08;
        const waveSpeed = isSpeakingNow ? 6.0 : 2.5;

        for (let i = 0; i < dotCount; i++) {
          const bx = dotBasePos[i * 3];
          const by = dotBasePos[i * 3 + 1];
          const bz = dotBasePos[i * 3 + 2];

          // Concentric spherical harmonic waves (OpenAI voice mode wave ripples)
          const angle = Math.atan2(bz, bx);
          const elevation = Math.asin(by / 1.85);
          const ripple = Math.sin(angle * 3.0 + elevation * 4.0 - time * waveSpeed) * audioWaveAmp;

          dPos[i * 3] = bx * (1 + ripple);
          dPos[i * 3 + 1] = by * (1 + ripple);
          dPos[i * 3 + 2] = bz * (1 + ripple);
        }
        dotGeo.attributes.position.needsUpdate = true;
        dotPoints.rotation.y = time * 0.2;
        orbitalRing.rotation.z = time * 0.4;
        orbitalRing.rotation.x = Math.PI / 3 + Math.sin(time * 0.8) * 0.15;
      }

      // Update Ambient Spore Cloud
      const sPos = sporeGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < sporeCount; i++) {
        sPos[i * 3] += sporeVel[i * 3];
        sPos[i * 3 + 1] += sporeVel[i * 3 + 1];
        sPos[i * 3 + 2] += sporeVel[i * 3 + 2];

        const dist = Math.hypot(sPos[i * 3], sPos[i * 3 + 1], sPos[i * 3 + 2]);
        if (dist > 4.6 || dist < 1.8) {
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos(Math.random() * 2 - 1);
          const rad = 2.1 + Math.random() * 1.8;
          sPos[i * 3] = rad * Math.sin(phi) * Math.cos(theta);
          sPos[i * 3 + 1] = rad * Math.sin(phi) * Math.sin(theta);
          sPos[i * 3 + 2] = rad * Math.cos(phi);
        }
      }
      sporeGeo.attributes.position.needsUpdate = true;
      sporePoints.rotation.y = time * 0.12;

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      container.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);

      renderer.dispose();
      plush.dispose();
      mochiGeo.dispose();
      mochiMat.dispose();
      dotGeo.dispose();
      dotMat.dispose();
      innerCoreGeo.dispose();
      innerCoreMat.dispose();
      auroraGeo.dispose();
      auroraMat.dispose();
      sporeGeo.dispose();
      sporeMat.dispose();
      dotTex.dispose();

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className="w-full h-full cursor-grab active:cursor-grabbing relative overflow-hidden"
    />
  );
};
