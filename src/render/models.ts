import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WEAPONS } from '../game/config';

// 所有模型都用代码拼出来，不依赖外部资源。士兵约 1.15 高，面朝 -z。

export const SKIN = 0xf2c6a0;
export const HIP_Y = 0.44;
export const LEG_X = 0.1;

export type Part = THREE.BufferGeometry;

/** 给几何体整体刷一个顶点色，合并后用 vertexColors 材质 */
export function paint(geom: Part, color: number): Part {
  const g = geom.index ? geom.toNonIndexed() : geom;
  const c = new THREE.Color(color);
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  // 统一属性，避免合并失败
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'color') g.deleteAttribute(name);
  }
  return g;
}

export function merged(parts: Part[]): Part {
  const g = mergeGeometries(parts, false);
  if (!g) throw new Error('mergeGeometries failed');
  g.computeBoundingSphere();
  return g;
}

export function at(g: Part, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): Part {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );
  g.applyMatrix4(m);
  return g;
}

/** 枪：沿 -z 方向，原点在握把附近 */
/** 外部模型的枪（有就优先用）：门上、桶上展示的那把 */
let gunProvider: ((tier: number, length: number) => Part | null) | null = null;
export function setGunProvider(fn: (tier: number, length: number) => Part | null) {
  gunProvider = fn;
}

export function gunGeometry(tier: number, scale = 1): Part {
  const external = scale > 1 && gunProvider ? gunProvider(tier, WEAPONS[tier].length * scale * 1.5) : null;
  if (external) return external.clone();
  const w = WEAPONS[tier];
  const L = w.length;
  const dark = tier === 5 ? 0xd8a826 : tier === 6 ? 0x6b3fb8 : 0x2c2f36;
  const accent = tier === 5 ? 0xffe27a : tier === 6 ? 0xc7a2ff : tier >= 3 ? 0x4b5563 : 0x3a3d45;
  const wood = tier === 2 ? 0x9b5a2a : accent;
  const parts: Part[] = [];
  // 机匣
  parts.push(paint(at(new THREE.BoxGeometry(0.07, 0.09, L * 0.55), 0, 0.02, -L * 0.2), dark));
  // 枪管
  if (tier === 4) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      parts.push(paint(at(new THREE.CylinderGeometry(0.016, 0.016, L * 0.6, 5), Math.cos(a) * 0.03, 0.03 + Math.sin(a) * 0.03, -L * 0.65, Math.PI / 2), accent));
    }
    parts.push(paint(at(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 8), 0, 0.03, -L * 0.25, Math.PI / 2), dark));
  } else {
    parts.push(paint(at(new THREE.CylinderGeometry(0.018, 0.018, L * 0.5, 6), 0, 0.04, -L * 0.62, Math.PI / 2), accent));
  }
  // 握把
  parts.push(paint(at(new THREE.BoxGeometry(0.05, 0.11, 0.05), 0, -0.06, 0.0, -0.25), dark));
  if (tier >= 1) {
    // 弹匣
    parts.push(paint(at(new THREE.BoxGeometry(0.045, 0.13, 0.06), 0, -0.07, -L * 0.25, 0.15), accent));
  }
  if (tier >= 2) {
    // 枪托
    parts.push(paint(at(new THREE.BoxGeometry(0.06, 0.09, 0.16), 0, -0.01, 0.1), wood));
  }
  if (tier === 3 || tier === 5) {
    // 瞄准镜
    parts.push(paint(at(new THREE.CylinderGeometry(0.025, 0.025, 0.16, 8), 0, 0.1, -L * 0.2, Math.PI / 2), 0x111111));
  }
  if (tier === 6) {
    // 能量线圈
    for (let i = 0; i < 3; i++) {
      parts.push(paint(at(new THREE.TorusGeometry(0.05, 0.012, 5, 10), 0, 0.03, -L * (0.35 + i * 0.12)), 0x59f0ff));
    }
  }
  const g = merged(parts);
  if (scale !== 1) g.scale(scale, scale, scale);
  return g;
}

export interface SoldierColors {
  team: number;
  shirt: number;
}

/** 士兵身体（不含腿）：躯干、手臂、头、头盔、枪 */
export function soldierBody(colors: SoldierColors, tier: number | null): Part {
  const parts: Part[] = [];
  // 躯干
  parts.push(paint(at(new THREE.CapsuleGeometry(0.17, 0.2, 3, 10), 0, 0.68, 0, 0, 0, 0, 1.15, 1, 0.85), colors.shirt));
  // 腰带
  parts.push(paint(at(new THREE.CylinderGeometry(0.185, 0.18, 0.06, 10), 0, 0.5, 0, 0, 0, 0, 1.1, 1, 0.85), 0x4a3a5a));
  if (tier === null) {
    // 敌人：双手向前冲
    parts.push(paint(at(new THREE.CapsuleGeometry(0.055, 0.24, 2, 6), 0.2, 0.74, -0.16, -1.25, 0, 0.1), colors.shirt));
    parts.push(paint(at(new THREE.CapsuleGeometry(0.055, 0.24, 2, 6), -0.2, 0.74, -0.16, -1.25, 0, -0.1), colors.shirt));
    parts.push(paint(at(new THREE.SphereGeometry(0.065, 6, 5), 0.21, 0.76, -0.34), SKIN));
    parts.push(paint(at(new THREE.SphereGeometry(0.065, 6, 5), -0.21, 0.76, -0.34), SKIN));
  } else {
    // 持枪：右手握把，左手托护木
    parts.push(paint(at(new THREE.CapsuleGeometry(0.055, 0.2, 2, 6), 0.17, 0.66, -0.1, -1.0, 0, 0.35), colors.shirt));
    parts.push(paint(at(new THREE.CapsuleGeometry(0.055, 0.24, 2, 6), -0.1, 0.68, -0.16, -1.15, 0, -0.7), colors.shirt));
    parts.push(paint(at(new THREE.SphereGeometry(0.06, 6, 5), 0.08, 0.62, -0.24), SKIN));
    parts.push(paint(at(new THREE.SphereGeometry(0.06, 6, 5), 0.06, 0.66, -0.4), SKIN));
    parts.push(at(gunGeometry(tier), 0.07, 0.68, -0.26));
  }
  // 头
  parts.push(paint(at(new THREE.SphereGeometry(0.16, 12, 10), 0, 0.99, 0), SKIN));
  // 头盔 + 帽檐
  parts.push(paint(at(new THREE.SphereGeometry(0.205, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.52), 0, 1.02, 0, 0, 0, 0, 1, 0.92, 1), colors.team));
  parts.push(paint(at(new THREE.CylinderGeometry(0.228, 0.228, 0.035, 16), 0, 1.015, 0), colors.team));
  return merged(parts);
}

/** 腿：原点在髋部，向下 */
export function soldierLeg(color: number): Part {
  const leg = paint(at(new THREE.CylinderGeometry(0.075, 0.065, HIP_Y, 7), 0, -HIP_Y / 2, 0), color);
  const boot = paint(at(new THREE.BoxGeometry(0.12, 0.07, 0.18), 0, -HIP_Y + 0.03, -0.03), 0x2b2b2b);
  return merged([leg, boot]);
}

/** 横放的木桶，轴沿 x */
export function barrelGeometry(r: number): Part {
  const pts: THREE.Vector2[] = [];
  const h = r * 1.7;
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const y = (t - 0.5) * h;
    const bulge = 1 - Math.pow((t - 0.5) * 2, 2) * 0.16;
    pts.push(new THREE.Vector2(r * 0.86 * bulge, y));
  }
  const body = new THREE.LatheGeometry(pts, 18);
  const cap1 = at(new THREE.CircleGeometry(r * 0.72, 18), 0, h / 2, 0, -Math.PI / 2);
  const cap2 = at(new THREE.CircleGeometry(r * 0.72, 18), 0, -h / 2, 0, Math.PI / 2);
  const parts: Part[] = [paint(body, 0xa8682f), paint(cap1, 0x8a5222), paint(cap2, 0x8a5222)];
  for (const y of [-0.32, 0.32]) {
    parts.push(paint(at(new THREE.CylinderGeometry(r * 0.87, r * 0.87, 0.12 * r, 18, 1, true), 0, y * h, 0), 0x6b6f76));
  }
  for (const y of [-0.47, 0.47]) {
    parts.push(paint(at(new THREE.CylinderGeometry(r * 0.75, r * 0.75, 0.1 * r, 18, 1, true), 0, y * h, 0), 0x6b6f76));
  }
  const g = merged(parts);
  g.rotateZ(Math.PI / 2);
  g.translate(0, r * 0.86, 0);
  return g;
}

/** 叠起来的轮胎 */
export function tiresGeometry(r: number): Part {
  const parts: Part[] = [];
  const tube = r * 0.3;
  for (let i = 0; i < 3; i++) {
    const t = at(new THREE.TorusGeometry(r * 0.7, tube, 8, 20), 0, tube + i * tube * 1.85, 0, Math.PI / 2, 0, i * 0.4);
    parts.push(paint(t, i % 2 ? 0x2a2a2e : 0x34343a));
    parts.push(paint(at(new THREE.CylinderGeometry(r * 0.45, r * 0.45, tube * 1.2, 14), 0, tube + i * tube * 1.85, 0), 0x8f8f96));
  }
  return merged(parts);
}

export function tiresHeight(r: number): number {
  const tube = r * 0.3;
  return tube * 2 + 2 * tube * 1.85;
}

/** 金币 */
export function coinGeometry(): Part {
  const g = new THREE.CylinderGeometry(0.4, 0.4, 0.1, 18);
  g.rotateX(Math.PI / 2);
  return paint(g, 0xffcc33);
}
