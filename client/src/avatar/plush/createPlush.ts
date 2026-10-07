import * as THREE from 'three';
import { createFurMesh, createFurUniforms } from './fur';
import { getSpecies, type SpeciesDef, type SpeciesId } from './species';

export type PlushAction =
  | 'idle' | 'thinking' | 'searching' | 'surprised'
  | 'confident' | 'celebrating' | 'depleted' | 'dormant';

export interface PlushFrame {
  t: number;
  dt: number;
  action: PlushAction;
  mood: string;
  vitalityIndex: number;
  speaking: boolean;
  feeding: boolean;
  /** Seconds since last poke (Infinity if never). */
  sincePoke: number;
  /** Pointer look target in [-1, 1], or null if pointer idle. */
  pointerLook: { x: number; y: number } | null;
  /** Motion drag applied to fur tips. */
  wind: THREE.Vector3;
}

export interface PlushCreature {
  group: THREE.Group;
  species: SpeciesDef;
  update: (f: PlushFrame) => void;
  dispose: () => void;
}

interface Pin {
  obj: THREE.Object3D;
  dir: THREE.Vector3;
  /** Distance pushed out along the surface normal. */
  lift: number;
  /** Orient the object to face along the surface normal. */
  orient: boolean;
}

const UP = new THREE.Vector3(0, 1, 0);
const R = 1.5; // matches body radius in species.ts

export function createPlush(speciesId: SpeciesId): PlushCreature {
  const sp = getSpecies(speciesId);
  const group = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(d: T) => (disposables.push(d), d);

  // --- Soft studio light so felt accessories read well on the dark aurora ---
  const hemi = new THREE.HemisphereLight(0xfff7ed, 0x1e3a3a, 1.4);
  group.add(hemi);

  // ---------- Body surface (shared by mesh + feature pinning) ----------
  let breath = 0;
  const tmp = new THREE.Vector3();
  const surfacePoint = (dir: THREE.Vector3, out: THREE.Vector3) => {
    sp.deform(dir.x, dir.y, dir.z, out);
    out.x *= 1 + breath;
    out.z *= 1 + breath;
    out.y *= 1 - breath * 0.5;
    return out;
  };
  const t1 = new THREE.Vector3(), t2 = new THREE.Vector3();
  const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), p2 = new THREE.Vector3();
  const d1 = new THREE.Vector3(), d2 = new THREE.Vector3();
  const surfaceNormal = (dir: THREE.Vector3, out: THREE.Vector3) => {
    t1.crossVectors(dir, Math.abs(dir.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : UP).normalize();
    t2.crossVectors(dir, t1).normalize();
    surfacePoint(dir, p0);
    surfacePoint(d1.copy(dir).addScaledVector(t1, 0.02).normalize(), p1);
    surfacePoint(d2.copy(dir).addScaledVector(t2, 0.02).normalize(), p2);
    out.crossVectors(p1.sub(p0), p2.sub(p0)).normalize();
    if (out.dot(dir) < 0) out.negate();
    return out;
  };

  const bodyGeo = track(new THREE.SphereGeometry(1, 96, 72));
  const dirs = new Float32Array(bodyGeo.attributes.position.array as Float32Array);
  const bodyPos = bodyGeo.attributes.position.array as Float32Array;
  const rebuildBody = () => {
    const d = new THREE.Vector3();
    for (let i = 0; i < dirs.length; i += 3) {
      d.set(dirs[i], dirs[i + 1], dirs[i + 2]);
      surfacePoint(d, tmp);
      bodyPos[i] = tmp.x; bodyPos[i + 1] = tmp.y; bodyPos[i + 2] = tmp.z;
    }
    bodyGeo.attributes.position.needsUpdate = true;
    bodyGeo.computeVertexNormals();
  };
  rebuildBody();

  const furU = createFurUniforms(sp.color, sp.tipColor, sp.furLength);
  const body = createFurMesh(bodyGeo, furU, 22);
  body.materials.forEach(track);
  group.add(body.group);

  const pins: Pin[] = [];
  const pin = (obj: THREE.Object3D, dir: THREE.Vector3, lift: number, orient = true) => {
    pins.push({ obj, dir: dir.clone().normalize(), lift, orient });
    group.add(obj);
    return obj;
  };

  // ---------- Eyes: small glossy beads (OpenDots / Jolly style) ----------
  const beadMat = track(new THREE.MeshPhysicalMaterial({
    color: 0x120d0b, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05
  }));
  const hiMat = track(new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const lineMat = track(new THREE.MeshBasicMaterial({ color: 0x1a1210 }));
  const beadGeo = track(new THREE.SphereGeometry(0.12, 32, 24));
  const hiGeo = track(new THREE.SphereGeometry(0.034, 12, 12));
  const hi2Geo = track(new THREE.SphereGeometry(0.016, 8, 8));
  const happyGeo = track(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-0.09, -0.03, 0), new THREE.Vector3(0, 0.09, 0), new THREE.Vector3(0.09, -0.03, 0)
  ), 16, 0.022, 8, false));
  const sleepGeo = track(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-0.09, 0.02, 0), new THREE.Vector3(0, -0.06, 0), new THREE.Vector3(0.09, 0.02, 0)
  ), 16, 0.02, 8, false));

  const buildEye = (side: number) => {
    const root = new THREE.Group();
    const look = new THREE.Group();
    const bead = new THREE.Mesh(beadGeo, beadMat);
    bead.scale.set(0.9, 1.08, 0.5);
    const hi = new THREE.Mesh(hiGeo, hiMat);
    hi.position.set(0.035 * side, 0.05, 0.06);
    const hi2 = new THREE.Mesh(hi2Geo, hiMat);
    hi2.position.set(-0.03 * side, -0.04, 0.058);
    look.add(bead, hi, hi2);
    const happy = new THREE.Mesh(happyGeo, lineMat);
    const sleep = new THREE.Mesh(sleepGeo, lineMat);
    root.add(look, happy, sleep);
    root.scale.setScalar(sp.eyeScale);
    return { root, look, happy, sleep };
  };
  const fy = sp.faceY;
  const eyeL = buildEye(-1), eyeR = buildEye(1);
  pin(eyeL.root, new THREE.Vector3(-0.3, fy + 0.12, 0.95), sp.furLength * 0.55);
  pin(eyeR.root, new THREE.Vector3(0.3, fy + 0.12, 0.95), sp.furLength * 0.55);

  // ---------- Blush ----------
  const blushMat = track(new THREE.MeshBasicMaterial({
    color: sp.blush, transparent: true, opacity: 0.5, depthWrite: false
  }));
  const blushGeo = track(new THREE.CircleGeometry(0.11, 32));
  const blushL = new THREE.Mesh(blushGeo, blushMat); blushL.scale.set(1.35, 0.85, 1);
  const blushR = new THREE.Mesh(blushGeo, blushMat); blushR.scale.set(1.35, 0.85, 1);
  pin(blushL, new THREE.Vector3(-0.5, fy - 0.06, 0.86), sp.furLength * 0.95);
  pin(blushR, new THREE.Vector3(0.5, fy - 0.06, 0.86), sp.furLength * 0.95);

  // ---------- Mouth: tiny smile + open "o" ----------
  const mouth = new THREE.Group();
  const smile = new THREE.Mesh(track(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-0.065, 0.015, 0), new THREE.Vector3(0, -0.045, 0), new THREE.Vector3(0.065, 0.015, 0)
  ), 16, 0.017, 8, false)), lineMat);
  const open = new THREE.Group();
  const openHole = new THREE.Mesh(track(new THREE.SphereGeometry(0.08, 24, 16)),
    track(new THREE.MeshBasicMaterial({ color: 0x3a1418 })));
  openHole.scale.set(1, 0.85, 0.3);
  const tongue = new THREE.Mesh(track(new THREE.SphereGeometry(0.045, 16, 12)),
    track(new THREE.MeshBasicMaterial({ color: 0xff7a8a })));
  tongue.position.set(0, -0.03, 0.012);
  tongue.scale.set(1.1, 0.6, 0.3);
  open.add(openHole, tongue);
  mouth.add(smile, open);
  pin(mouth, new THREE.Vector3(0, fy - 0.05, 1), sp.furLength * 0.6);

  // ---------- Arms: fuzzy nubs on shoulder pivots ----------
  const armGeo = track(new THREE.SphereGeometry(0.26, 32, 20));
  const armFur = createFurUniforms(sp.color, sp.tipColor, sp.furLength * 0.8);
  const buildArm = (side: number) => {
    const pivot = new THREE.Group();
    const fur = createFurMesh(armGeo, armFur, 14);
    fur.materials.forEach(track);
    fur.group.scale.set(1.25, 0.85, 0.85);
    fur.group.position.x = 0.12 * side;
    pivot.add(fur.group);
    return pivot;
  };
  const armL = buildArm(-1), armR = buildArm(1);
  const armY = -0.3;
  pin(armL, new THREE.Vector3(-0.96, armY, 0.18), -0.1, false);
  pin(armR, new THREE.Vector3(0.96, armY, 0.18), -0.1, false);

  // ---------- Accessories ----------
  const accColor = new THREE.Color(sp.accessoryColor);
  const felt = (color: THREE.ColorRepresentation) => track(new THREE.MeshPhysicalMaterial({
    color, roughness: 0.85, sheen: 1, sheenRoughness: 0.45, sheenColor: new THREE.Color(0xffffff)
  }));
  let sprout: THREE.Group | null = null;

  if (sp.accessory === 'sprout') {
    sprout = new THREE.Group();
    const leafMat = felt(accColor);
    const stem = new THREE.Mesh(track(new THREE.TubeGeometry(new THREE.CubicBezierCurve3(
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.15, 0),
      new THREE.Vector3(0.02, 0.25, 0), new THREE.Vector3(0.03, 0.32, 0)
    ), 12, 0.035, 8, false)), leafMat);
    const leafGeo = track(new THREE.SphereGeometry(0.16, 24, 16));
    const l1 = new THREE.Mesh(leafGeo, leafMat);
    l1.scale.set(1.5, 0.45, 0.85); l1.position.set(-0.17, 0.36, 0); l1.rotation.z = 0.55;
    const l2 = new THREE.Mesh(leafGeo, leafMat);
    l2.scale.set(1.5, 0.45, 0.85); l2.position.set(0.2, 0.38, 0); l2.rotation.z = -0.5;
    sprout.add(stem, l1, l2);
    pin(sprout, new THREE.Vector3(0, 1, 0), sp.furLength * 0.3, false);
  }

  if (sp.accessory === 'cap') {
    const cap = new THREE.Group();
    const dome = new THREE.Mesh(track(new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2)), felt(accColor));
    dome.scale.set(R * 1.12, R * 0.62, R * 1.12);
    const under = new THREE.Mesh(track(new THREE.CircleGeometry(R * 1.12, 48)), track(new THREE.MeshBasicMaterial({ color: 0xd9c3a3 })));
    under.rotation.x = Math.PI / 2;
    cap.add(dome, under);
    const spotMat = felt(0xfffaf0);
    const spotGeo = track(new THREE.SphereGeometry(0.16, 16, 12));
    const spotDirs = [[0, 1, 0.1], [0.6, 0.55, 0.55], [-0.6, 0.55, 0.55], [0.75, 0.4, -0.4], [-0.7, 0.45, -0.45], [0.05, 0.5, 0.86], [0, 0.55, -0.8]];
    for (const [x, y, z] of spotDirs) {
      const d = new THREE.Vector3(x, y, z).normalize();
      const s = new THREE.Mesh(spotGeo, spotMat);
      s.position.set(d.x * R * 1.12, d.y * R * 0.62, d.z * R * 1.12);
      s.lookAt(s.position.clone().add(d));
      s.scale.set(1, 1, 0.3);
      cap.add(s);
    }
    cap.rotation.z = -0.08;
    pin(cap, new THREE.Vector3(0, 1, 0), -0.62, false);
  }

  if (sp.accessory === 'headphones') {
    const hp = new THREE.Group();
    const plastic = track(new THREE.MeshPhysicalMaterial({ color: accColor, roughness: 0.35, clearcoat: 0.6 }));
    const band = new THREE.Mesh(track(new THREE.TorusGeometry(R * 1.1, 0.075, 16, 64, Math.PI)), plastic);
    hp.add(band);
    const cupGeo = track(new THREE.CylinderGeometry(0.36, 0.36, 0.22, 32));
    const padMat = felt(0xe7d8bf);
    for (const side of [-1, 1]) {
      const cup = new THREE.Mesh(cupGeo, plastic);
      cup.rotation.z = Math.PI / 2;
      cup.position.set(side * R * 1.1, 0, 0);
      const pad = new THREE.Mesh(track(new THREE.TorusGeometry(0.27, 0.08, 12, 32)), padMat);
      pad.rotation.y = Math.PI / 2;
      pad.position.set(side * (R * 1.1 - 0.12), 0, 0);
      hp.add(cup, pad);
    }
    hp.rotation.x = -0.12;
    pins.push({ obj: hp, dir: new THREE.Vector3(0, 0.0001, 0), lift: 0, orient: false });
    group.add(hp);
    hp.userData.fixed = new THREE.Vector3(0, 0.12, 0);
  }

  if (sp.accessory === 'scarf') {
    const scarf = new THREE.Group();
    const knit = felt(accColor);
    const scarfY = -R * 0.3;
    // measure the body's cross-section at the scarf height
    let rx = 0.3, rz = 0.3;
    const probe = new THREE.Vector3(), out = new THREE.Vector3();
    for (let i = 0; i < 4000; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 2 - 1);
      probe.set(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th));
      sp.deform(probe.x, probe.y, probe.z, out);
      if (Math.abs(out.y - scarfY) < 0.08) { rx = Math.max(rx, Math.abs(out.x)); rz = Math.max(rz, Math.abs(out.z)); }
    }
    const ring = new THREE.Mesh(track(new THREE.TorusGeometry(1, 0.17, 16, 64)), knit);
    ring.rotation.x = Math.PI / 2;
    ring.scale.set(rx * 0.55 + sp.furLength, rz + sp.furLength + 0.05, 1);
    const tail = new THREE.Mesh(track(new THREE.CapsuleGeometry(0.13, 0.55, 8, 16)), knit);
    tail.position.set(0.4, -0.38, rz + sp.furLength + 0.12);
    tail.rotation.z = 0.25;
    tail.scale.set(1.3, 1, 0.5);
    scarf.add(ring, tail);
    group.add(scarf);
    scarf.position.y = scarfY;
  }

  if (sp.accessory === 'pocket') {
    const pocket = new THREE.Mesh(track(new THREE.SphereGeometry(0.3, 32, 16)), felt(accColor));
    pocket.scale.set(1.15, 0.9, 0.12);
    const stitchMat = track(new THREE.MeshBasicMaterial({ color: 0xe9e1ff }));
    const stitch = new THREE.Mesh(track(new THREE.TorusGeometry(0.3, 0.008, 6, 48)), stitchMat);
    stitch.scale.set(0.95, 0.95, 1);
    stitch.position.z = 0.02;
    pocket.add(stitch);
    pin(pocket, new THREE.Vector3(0.08, -0.5, 0.86), sp.furLength * 0.7);
  }

  // ---------- Pin update ----------
  const nrm = new THREE.Vector3();
  const updatePins = () => {
    for (const p of pins) {
      if (p.obj.userData.fixed) { p.obj.position.copy(p.obj.userData.fixed).multiplyScalar(1 + breath); continue; }
      surfacePoint(p.dir, p.obj.position);
      surfaceNormal(p.dir, nrm);
      p.obj.position.addScaledVector(nrm, p.lift);
      if (p.orient) p.obj.lookAt(tmp.copy(p.obj.position).add(nrm));
    }
  };

  // ---------- Expression state (smoothly blended) ----------
  const cur = { eyeOpen: 1, eyeScale: 1, happy: 0, sleep: 0, mouth: 0, armL: -0.35, armR: -0.35, lookX: 0, lookY: 0, desat: 0, glow: 0 };
  let blinkT = 0, nextBlink = 2.5, blinking = -1;
  let sacT = 0, sac = { x: 0, y: 0 };
  let sproutAng = 0, sproutVel = 0;

  const update = (f: PlushFrame) => {
    const { t, dt } = f;
    breath = Math.sin(t * 2.2) * (f.action === 'dormant' ? 0.035 : 0.02);
    rebuildBody();
    updatePins();

    // idle saccades
    sacT += dt;
    if (sacT > 1.2 + Math.random() * 2.5) {
      sacT = 0;
      sac = { x: (Math.random() - 0.5) * 1.2, y: (Math.random() - 0.5) * 0.8 };
    }

    const action: PlushAction =
      f.mood === 'dormant' && f.action === 'idle' ? 'dormant'
      : f.mood === 'depleted' && f.action === 'idle' ? 'depleted'
      : f.action;

    const tg = { eyeOpen: 1, eyeScale: 1, happy: 0, sleep: 0, mouth: 0, armL: -0.35 + Math.sin(t * 1.4) * 0.05, armR: -0.35 - Math.sin(t * 1.4) * 0.05, lookX: sac.x, lookY: sac.y, desat: 0, glow: 0 };
    if (f.pointerLook) { tg.lookX = f.pointerLook.x; tg.lookY = f.pointerLook.y; }

    switch (action) {
      case 'thinking':
        tg.lookX = 0.7; tg.lookY = 0.9; tg.armR = 0.35; tg.mouth = 0.12; break;
      case 'searching':
        tg.lookX = Math.sin(t * 2.4); tg.lookY = -0.1; tg.armL = -0.15; tg.armR = -0.15; break;
      case 'surprised':
        tg.eyeScale = 1.35; tg.mouth = 0.75; tg.armL = 0.9; tg.armR = 0.9; break;
      case 'confident':
        tg.happy = 1; tg.armL = -0.75; tg.armR = -0.75; tg.glow = 0.05; break;
      case 'celebrating':
        tg.happy = 1; tg.mouth = 0.55;
        tg.armL = 1.0 + Math.sin(t * 12) * 0.35; tg.armR = 1.0 - Math.sin(t * 12) * 0.35; tg.glow = 0.1; break;
      case 'depleted':
        tg.eyeOpen = 0.45; tg.lookY = -0.6; tg.armL = -0.75; tg.armR = -0.75; tg.desat = 0.45; break;
      case 'dormant':
        tg.sleep = 1; tg.armL = -0.85; tg.armR = -0.85; tg.desat = 0.65; break;
    }

    tg.desat = Math.max(tg.desat, THREE.MathUtils.clamp((45 - f.vitalityIndex) / 45, 0, 1) * 0.6);
    if (f.feeding) { tg.happy = 1; tg.mouth = Math.abs(Math.sin(t * 10)) * 0.8; tg.armL = 0.4; tg.armR = 0.4; }
    if (f.sincePoke < 0.7) { tg.happy = 1; tg.armR = 0.9 + Math.sin(t * 16) * 0.3; }
    if (f.speaking && tg.sleep < 0.5) tg.mouth = 0.2 + Math.abs(Math.sin(t * 13) * Math.sin(t * 7.3)) * 0.65;

    const k = 1 - Math.exp(-dt * 10);
    const kFast = 1 - Math.exp(-dt * 22);
    (Object.keys(cur) as (keyof typeof cur)[]).forEach((key) => {
      cur[key] += (tg[key] - cur[key]) * (key === 'mouth' ? kFast : k);
    });

    // blink
    blinkT += dt;
    if (blinking < 0 && blinkT > nextBlink) { blinking = 0; blinkT = 0; nextBlink = 2 + Math.random() * 3.5; }
    let blinkMul = 1;
    if (blinking >= 0) {
      blinking += dt;
      const ph = blinking / 0.16;
      blinkMul = ph >= 1 ? 1 : Math.max(0.08, Math.abs(Math.cos(ph * Math.PI)));
      if (ph >= 1) blinking = -1;
    }

    // apply eyes
    const showBead = cur.happy < 0.5 && cur.sleep < 0.5;
    for (const [e, side] of [[eyeL, -1], [eyeR, 1]] as const) {
      e.look.visible = showBead;
      e.happy.visible = !showBead && cur.sleep < 0.5;
      e.sleep.visible = cur.sleep >= 0.5;
      e.look.scale.set(cur.eyeScale, cur.eyeScale * cur.eyeOpen * blinkMul, cur.eyeScale);
      e.look.position.set(cur.lookX * 0.035 + side * 0.0, cur.lookY * 0.03, 0);
    }

    // mouth
    smile.visible = cur.mouth < 0.08;
    open.visible = !smile.visible;
    open.scale.set(0.7 + cur.mouth * 0.4, 0.25 + cur.mouth * 0.9, 1);

    // arms
    armL.rotation.z = -cur.armL * 1.15;
    armR.rotation.z = cur.armR * 1.15;

    // blush pulses when happy
    blushMat.opacity = 0.42 + cur.happy * 0.25;

    // fur uniforms
    for (const u of [furU, armFur]) {
      u.uTime.value = t;
      u.uDesat.value = cur.desat;
      u.uGlow.value = cur.glow;
      u.uWind.value.lerp(f.wind, 0.2);
    }

    // sprout spring
    if (sprout) {
      const force = -18 * sproutAng - 3.5 * sproutVel - f.wind.x * 40;
      sproutVel += force * dt;
      sproutAng += sproutVel * dt;
      if (f.sincePoke < 0.05) sproutVel += (Math.random() - 0.5) * 3;
      sprout.rotation.z = sproutAng + Math.sin(t * 1.7) * 0.05;
    }
  };

  const dispose = () => {
    disposables.forEach((d) => d.dispose());
  };

  return { group, species: sp, update, dispose };
}
