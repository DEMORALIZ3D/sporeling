import * as THREE from 'three';

/**
 * Shell-textured fur. The same geometry is drawn N times, each shell pushed
 * further along the normal; a 3D hash discards fragments so only "strands"
 * survive in the outer shells. Cheap, procedural, and reads as plush felt.
 */

const vertexShader = /* glsl */ `
  uniform float uShell;
  uniform float uFurLen;
  uniform float uTime;
  uniform vec3 uWind;
  varying vec3 vN;
  varying vec3 vPosObj;
  varying vec3 vViewDir;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec3 n = normalize(normal);
    float s2 = uShell * uShell;
    vec3 p = position + n * uFurLen * uShell;
    // gravity droop + idle breeze + motion drag on the strand tips
    p.y -= s2 * uFurLen * 0.35;
    p += vec3(sin(uTime * 1.3 + position.y * 3.0), 0.0, cos(uTime * 1.1 + position.x * 3.0)) * 0.012 * s2;
    p += uWind * s2;
    vPosObj = position;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vN = normalize(normalMatrix * n);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uShell;
  uniform float uDensity;
  uniform vec3 uColor;
  uniform vec3 uTipColor;
  uniform vec3 uRim;
  uniform float uDesat;
  uniform float uGlow;
  varying vec3 vN;
  varying vec3 vPosObj;
  varying vec3 vViewDir;
  varying vec2 vUv;

  float hash2(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  void main() {
    if (uShell > 0.0) {
      vec2 q = vec2(vUv.x * uDensity * 9.4, vUv.y * uDensity * 4.7);
      q.x += hash2(vec2(floor(q.y), 3.1)) * 7.0; // stagger rows
      vec2 cell = floor(q);
      vec2 jitter = vec2(hash2(cell + 1.7), hash2(cell + 9.2)) - 0.5;
      vec2 f = fract(q) - 0.5 - jitter * 0.5;
      float h = hash2(cell);
      float thick = 1.0 - uShell;
      if (h < uShell * 0.9 || length(f) > thick * 0.55 + 0.1) discard;
    }

    vec3 N = normalize(vN);
    vec3 V = normalize(vViewDir);
    vec3 L = normalize(vec3(0.45, 0.75, 0.6));

    float wrap = clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0);
    float ao = mix(0.55, 1.0, pow(uShell, 0.6));
    vec3 base = mix(uColor, uTipColor, uShell * 0.5);
    float gray = dot(base, vec3(0.299, 0.587, 0.114));
    base = mix(base, vec3(gray) * 0.75, uDesat);

    float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
    vec3 col = base * (0.38 + 0.72 * wrap) * ao;
    col += rim * mix(base, uRim, 0.35) * (0.15 + 0.3 * uShell);   // fuzzy velvet sheen
    col += base * 0.1 * clamp(-N.y, 0.0, 1.0);                    // bounce light
    col += base * uGlow;

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export interface FurUniforms {
  uTime: { value: number };
  uFurLen: { value: number };
  uDensity: { value: number };
  uColor: { value: THREE.Color };
  uTipColor: { value: THREE.Color };
  uRim: { value: THREE.Color };
  uWind: { value: THREE.Vector3 };
  uDesat: { value: number };
  uGlow: { value: number };
}

export function createFurUniforms(
  color: number,
  tip: number,
  furLen: number,
): FurUniforms {
  return {
    uTime: { value: 0 },
    uFurLen: { value: furLen },
    uDensity: { value: 42 },
    uColor: { value: new THREE.Color(color) },
    uTipColor: { value: new THREE.Color(tip) },
    uRim: { value: new THREE.Color(0xcffafe) },
    uWind: { value: new THREE.Vector3() },
    uDesat: { value: 0 },
    uGlow: { value: 0 },
  };
}

/** Builds a group of N shell meshes that share geometry and uniforms. */
export function createFurMesh(
  geometry: THREE.BufferGeometry,
  uniforms: FurUniforms,
  shells = 20,
): { group: THREE.Group; materials: THREE.ShaderMaterial[] } {
  const group = new THREE.Group();
  const materials: THREE.ShaderMaterial[] = [];
  for (let i = 0; i <= shells; i++) {
    const mat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: { ...uniforms, uShell: { value: i / shells } },
    });
    materials.push(mat);
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.renderOrder = i;
    group.add(mesh);
  }
  return { group, materials };
}
