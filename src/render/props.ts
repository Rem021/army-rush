import * as THREE from 'three';
import type { BossKind, ZombieKind } from '../game/config';
import { HIP_Y, at, merged, paint, soldierBody, soldierLeg, type Part, type SoldierColors } from './models';

// 丧尸、Boss、大巴、陷阱等道具模型。全部面朝 -z，丧尸渲染时再转 180°。

const ZOMBIE_SKIN = 0x8fbf6a;

interface ZombieLook {
  skin: number;
  shirt: number;
  pants: number;
}

const ZOMBIE_LOOKS: Record<ZombieKind, ZombieLook> = {
  walker: { skin: ZOMBIE_SKIN, shirt: 0x5f7f99, pants: 0x34465e },
  runner: { skin: 0x9cc874, shirt: 0xb0463a, pants: 0x3b3b44 },
  brute: { skin: 0x7fae5c, shirt: 0xd8d2bf, pants: 0x4d3b2c },
  exploder: { skin: 0xa3cf6b, shirt: 0x7a8b4a, pants: 0x4a4a32 },
  giant: { skin: 0x6f9a52, shirt: 0x3a3f4a, pants: 0x2d2a26 },
};

function zombieHead(skin: number, y: number, r: number, parts: Part[], eye = 0xff3b2f) {
  parts.push(paint(at(new THREE.SphereGeometry(r, 12, 10), 0.02, y, -0.02, 0, 0, 0.18), skin));
  // 乱发
  parts.push(paint(at(new THREE.SphereGeometry(r * 0.92, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.45), 0.02, y + r * 0.12, 0.01, 0.1, 0, 0.18), 0x3b2f2a));
  for (const x of [-0.36, 0.36]) {
    parts.push(paint(at(new THREE.SphereGeometry(r * 0.2, 6, 5), x * r + 0.02, y + r * 0.1, -r * 0.88), eye));
  }
  parts.push(paint(at(new THREE.BoxGeometry(r * 0.7, r * 0.18, r * 0.1), 0.02, y - r * 0.42, -r * 0.9), 0x3a1a1a));
}

/** 丧尸身体（不含腿） */
export function zombieBody(kind: ZombieKind): Part {
  const c = ZOMBIE_LOOKS[kind];
  const parts: Part[] = [];
  switch (kind) {
    case 'runner': {
      // 前倾冲刺，双臂向后
      parts.push(paint(at(new THREE.CapsuleGeometry(0.15, 0.2, 3, 8), 0, 0.66, -0.05, -0.35, 0, 0, 1.05, 1, 0.8), c.shirt));
      for (const s of [-1, 1]) {
        parts.push(paint(at(new THREE.CapsuleGeometry(0.05, 0.26, 2, 6), s * 0.19, 0.66, 0.12, 0.7 * s, 0, s * 0.1), c.skin));
      }
      zombieHead(c.skin, 0.93, 0.15, parts);
      break;
    }
    case 'brute':
    case 'giant': {
      // 大肚子 + 粗胳膊
      parts.push(paint(at(new THREE.SphereGeometry(0.32, 14, 10), 0, 0.72, 0, 0, 0, 0, 1.15, 1.05, 0.95), c.shirt));
      parts.push(paint(at(new THREE.SphereGeometry(0.12, 8, 6), 0.1, 0.62, -0.28), 0x8a5a3a));
      parts.push(paint(at(new THREE.SphereGeometry(0.09, 8, 6), -0.12, 0.8, -0.27), 0x6f4a32));
      for (const s of [-1, 1]) {
        parts.push(paint(at(new THREE.CapsuleGeometry(0.09, 0.3, 3, 8), s * 0.36, 0.78, -0.18, -1.1, 0, s * 0.2), c.skin));
        parts.push(paint(at(new THREE.SphereGeometry(0.11, 8, 6), s * 0.4, 0.84, -0.42), c.skin));
      }
      zombieHead(c.skin, 1.1, 0.15, parts);
      if (kind === 'giant') {
        // 肩上的骨刺
        for (const s of [-1, 1]) {
          for (let i = 0; i < 3; i++) {
            parts.push(paint(at(new THREE.ConeGeometry(0.05, 0.22, 6), s * (0.22 + i * 0.07), 1.0 + i * 0.02, 0.05, 0, 0, -s * (0.4 + i * 0.15)), 0xeee6d2));
          }
        }
      }
      break;
    }
    case 'exploder': {
      // 鼓胀的身体，满是发光的脓包
      parts.push(paint(at(new THREE.SphereGeometry(0.34, 14, 10), 0, 0.74, 0, 0, 0, 0, 1, 1.05, 0.95), c.skin));
      const rng = mulberryish(7);
      for (let i = 0; i < 11; i++) {
        const a = rng() * Math.PI * 2;
        const y = 0.5 + rng() * 0.5;
        const r = 0.33 * Math.sqrt(1 - Math.pow((y - 0.74) / 0.36, 2));
        parts.push(paint(at(new THREE.SphereGeometry(0.055 + rng() * 0.04, 6, 5), Math.cos(a) * r, y, Math.sin(a) * r), i % 3 ? 0xd9ff4a : 0xffe14a));
      }
      for (const s of [-1, 1]) {
        parts.push(paint(at(new THREE.CapsuleGeometry(0.05, 0.18, 2, 6), s * 0.33, 0.8, -0.14, -1.2, 0, s * 0.2), c.skin));
      }
      zombieHead(c.skin, 1.1, 0.13, parts, 0xffe14a);
      break;
    }
    default: {
      // 普通丧尸：双臂前伸
      parts.push(paint(at(new THREE.CapsuleGeometry(0.17, 0.2, 3, 10), 0, 0.66, 0, 0.08, 0, 0, 1.12, 1, 0.85), c.shirt));
      parts.push(paint(at(new THREE.SphereGeometry(0.08, 6, 5), 0.07, 0.6, -0.15), 0x3e5568));
      parts.push(paint(at(new THREE.CylinderGeometry(0.185, 0.18, 0.06, 10), 0, 0.5, 0, 0, 0, 0, 1.1, 1, 0.85), 0x2d2a26));
      for (const s of [-1, 1]) {
        parts.push(paint(at(new THREE.CapsuleGeometry(0.055, 0.26, 2, 6), s * 0.2, 0.76, -0.18, -1.35, 0, s * 0.08), c.skin));
        parts.push(paint(at(new THREE.SphereGeometry(0.065, 6, 5), s * 0.21, 0.78, -0.37), c.skin));
      }
      zombieHead(c.skin, 0.98, 0.16, parts);
    }
  }
  return merged(parts);
}

export function zombieLeg(kind: ZombieKind): Part {
  const c = ZOMBIE_LOOKS[kind];
  const thick = kind === 'brute' || kind === 'giant' ? 1.35 : kind === 'exploder' ? 1.15 : 1;
  const leg = paint(at(new THREE.CylinderGeometry(0.075 * thick, 0.065 * thick, HIP_Y, 7), 0, -HIP_Y / 2, 0), c.pants);
  const foot = paint(at(new THREE.BoxGeometry(0.12 * thick, 0.07, 0.18), 0, -HIP_Y + 0.03, -0.03), kind === 'runner' ? 0xdddddd : 0x2b2b2b);
  return merged([leg, foot]);
}

function mulberryish(seed: number) {
  let a = seed;
  return () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

// ---------- Boss ----------

export interface BossRig {
  root: THREE.Group;
  body: THREE.Group;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  materials: THREE.MeshLambertMaterial[];
  hpAnchor: THREE.Object3D;
  /** 投弹屠夫手里的油桶 */
  drum?: THREE.Object3D;
  /** 尸巢身上一跳一跳的脓包 */
  pustules?: THREE.Object3D[];
}

export function buildBossRig(kind: BossKind): BossRig {
  if (kind === 'thrower') return buildThrower();
  if (kind === 'hive') return buildHive();
  return buildBrute();
}

function lambert(color: number) {
  return new THREE.MeshLambertMaterial({ color });
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material, cast = true) {
  const o = new THREE.Mesh(g, m);
  o.castShadow = cast;
  return o;
}

function glowEyes(parent: THREE.Object3D, y: number, z: number, spread: number, r: number, color = 0xff2a1a) {
  const mat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
  for (const x of [-spread, spread]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), mat);
    eye.position.set(x, y, z);
    parent.add(eye);
  }
}

function buildBrute(): BossRig {
  const skin = lambert(0x86a86a);
  const pants = lambert(0x8a2b2b);
  const dark = lambert(0x2f2a28);
  const gold = lambert(0xe2b23a);
  const bone = lambert(0xeee6d2);
  const materials = [skin, pants, dark, gold, bone];
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const mkLeg = (x: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.62, 0);
    const leg = mesh(new THREE.CapsuleGeometry(0.18, 0.42, 4, 10), pants);
    leg.position.y = -0.3;
    const foot = mesh(new THREE.BoxGeometry(0.3, 0.14, 0.42), dark);
    foot.position.set(0, -0.62, -0.06);
    pivot.add(leg, foot);
    body.add(pivot);
    return pivot;
  };
  const legL = mkLeg(-0.22);
  const legR = mkLeg(0.22);

  const shorts = mesh(new THREE.CylinderGeometry(0.42, 0.37, 0.34, 14), pants);
  shorts.position.y = 0.74;
  shorts.scale.set(1, 1, 0.8);
  const torso = mesh(new THREE.SphereGeometry(0.52, 16, 12), skin);
  torso.position.y = 1.2;
  torso.scale.set(1.18, 0.98, 0.78);
  const chest = mesh(new THREE.SphereGeometry(0.3, 12, 10), skin);
  chest.position.set(0, 1.34, -0.26);
  chest.scale.set(1.65, 0.8, 0.6);
  body.add(shorts, torso, chest);
  // 露出的肋骨
  for (let i = 0; i < 3; i++) {
    const rib = mesh(new THREE.BoxGeometry(0.28, 0.04, 0.05), bone, false);
    rib.position.set(0.22, 1.12 - i * 0.09, -0.36);
    rib.rotation.z = -0.15;
    body.add(rib);
  }

  const mkArm = (side: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.6, 1.47, 0);
    const shoulder = mesh(new THREE.SphereGeometry(0.21, 10, 8), skin);
    const spike = mesh(new THREE.ConeGeometry(0.07, 0.3, 6), bone);
    spike.position.set(side * 0.08, 0.2, 0);
    spike.rotation.z = -side * 0.4;
    const upper = mesh(new THREE.CapsuleGeometry(0.16, 0.38, 4, 10), skin);
    upper.position.set(side * 0.08, -0.33, 0);
    const fist = mesh(new THREE.SphereGeometry(0.21, 10, 8), skin);
    fist.position.set(side * 0.1, -0.75, 0);
    pivot.add(shoulder, spike, upper, fist);
    pivot.rotation.z = side * 0.25;
    body.add(pivot);
    return pivot;
  };
  const armL = mkArm(-1);
  const armR = mkArm(1);

  const head = mesh(new THREE.SphereGeometry(0.27, 14, 12), skin);
  head.position.y = 1.88;
  const jaw = mesh(new THREE.BoxGeometry(0.3, 0.1, 0.12), dark, false);
  jaw.position.set(0, 1.76, -0.22);
  body.add(head, jaw);
  glowEyes(body, 1.9, -0.24, 0.09, 0.045);
  // 歪戴的王冠
  const crown = new THREE.Group();
  crown.add(mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.12, 10, 1, true), gold));
  for (let i = 0; i < 5; i++) {
    const tip = mesh(new THREE.ConeGeometry(0.05, 0.14, 5), gold);
    const a = (i / 5) * Math.PI * 2;
    tip.position.set(Math.cos(a) * 0.2, 0.12, Math.sin(a) * 0.2);
    crown.add(tip);
  }
  crown.position.set(0.04, 2.12, 0);
  crown.rotation.z = -0.25;
  body.add(crown);

  const hpAnchor = new THREE.Object3D();
  hpAnchor.position.y = 2.65;
  root.add(hpAnchor);
  return { root, body, legL, legR, armL, armR, materials, hpAnchor };
}

function buildThrower(): BossRig {
  const skin = lambert(0x93b073);
  const apron = lambert(0xe9e4d8);
  const stain = lambert(0xa3332b);
  const dark = lambert(0x3a3330);
  const red = lambert(0xc23a2e);
  const materials = [skin, apron, stain, dark, red];
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const mkLeg = (x: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.55, 0);
    const leg = mesh(new THREE.CapsuleGeometry(0.17, 0.3, 4, 10), dark);
    leg.position.y = -0.26;
    const foot = mesh(new THREE.BoxGeometry(0.3, 0.13, 0.4), dark);
    foot.position.set(0, -0.53, -0.05);
    pivot.add(leg, foot);
    body.add(pivot);
    return pivot;
  };
  const legL = mkLeg(-0.24);
  const legR = mkLeg(0.24);

  // 大肚子 + 围裙
  const belly = mesh(new THREE.SphereGeometry(0.66, 18, 14), skin);
  belly.position.y = 1.08;
  belly.scale.set(1, 0.95, 0.9);
  const apronMesh = mesh(new THREE.SphereGeometry(0.67, 18, 14, Math.PI * 0.6, Math.PI * 0.8, Math.PI * 0.25, Math.PI * 0.6), apron);
  apronMesh.position.y = 1.06;
  apronMesh.scale.set(1.01, 0.96, 0.92);
  body.add(belly, apronMesh);
  for (const [x, y, r] of [
    [0.15, 1.0, 0.1],
    [-0.2, 1.2, 0.08],
    [0.05, 0.8, 0.07],
  ] as const) {
    const s = mesh(new THREE.SphereGeometry(r, 8, 6), stain, false);
    s.position.set(x, y, -0.6);
    s.scale.set(1, 1, 0.3);
    body.add(s);
  }

  const mkArm = (side: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.62, 1.4, 0);
    const shoulder = mesh(new THREE.SphereGeometry(0.18, 10, 8), skin);
    const upper = mesh(new THREE.CapsuleGeometry(0.14, 0.34, 4, 10), skin);
    upper.position.set(0, -0.3, 0);
    const hand = mesh(new THREE.SphereGeometry(0.16, 10, 8), skin);
    hand.position.set(0, -0.66, 0);
    pivot.add(shoulder, upper, hand);
    pivot.rotation.z = side * 0.2;
    body.add(pivot);
    return pivot;
  };
  const armL = mkArm(-1);
  const armR = mkArm(1);
  // 右手里的油桶
  const drum = buildDrum(red, dark);
  drum.position.set(0, -0.82, 0);
  armR.add(drum);

  const head = mesh(new THREE.SphereGeometry(0.24, 14, 12), skin);
  head.position.y = 1.86;
  const bandana = mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.1, 14), red);
  bandana.position.y = 1.96;
  body.add(head, bandana);
  glowEyes(body, 1.88, -0.21, 0.08, 0.04);

  const hpAnchor = new THREE.Object3D();
  hpAnchor.position.y = 2.5;
  root.add(hpAnchor);
  return { root, body, legL, legR, armL, armR, materials, hpAnchor, drum };
}

function buildHive(): BossRig {
  const flesh = lambert(0x7a4f8f);
  const flesh2 = lambert(0x5d3b70);
  const dark = lambert(0x2a1f30);
  const materials = [flesh, flesh2, dark];
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const mkLeg = (x: number, z: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.55, z);
    const leg = mesh(new THREE.CapsuleGeometry(0.14, 0.3, 4, 8), flesh2);
    leg.position.y = -0.25;
    pivot.add(leg);
    body.add(pivot);
    return pivot;
  };
  const legL = mkLeg(-0.45, -0.1);
  const legR = mkLeg(0.45, -0.1);
  mkLeg(-0.35, 0.35);
  mkLeg(0.35, 0.35);

  const blob = mesh(new THREE.SphereGeometry(0.95, 20, 16), flesh);
  blob.position.y = 1.3;
  blob.scale.set(1, 0.9, 0.95);
  body.add(blob);
  const rng = mulberryish(3);
  for (let i = 0; i < 7; i++) {
    const lump = mesh(new THREE.SphereGeometry(0.28 + rng() * 0.18, 12, 10), i % 2 ? flesh2 : flesh);
    const a = rng() * Math.PI * 2;
    lump.position.set(Math.cos(a) * 0.75, 1.0 + rng() * 0.9, Math.sin(a) * 0.65);
    body.add(lump);
  }
  const pusMat = new THREE.MeshBasicMaterial({ color: 0xd9ff4a, toneMapped: false });
  const pustules: THREE.Object3D[] = [];
  for (let i = 0; i < 12; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.1 + rng() * 0.08, 8, 6), pusMat);
    const a = rng() * Math.PI * 2;
    const y = 0.8 + rng() * 1.1;
    const r = 0.92 * Math.sqrt(Math.max(0.1, 1 - Math.pow((y - 1.3) / 0.95, 2)));
    p.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
    body.add(p);
    pustules.push(p);
  }
  // 一排眼睛
  const white = new THREE.MeshBasicMaterial({ color: 0xfff6d8 });
  const pupil = new THREE.MeshBasicMaterial({ color: 0x1a0a0a });
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * 0.2;
    const y = 1.65 + Math.abs(i - 2) * -0.06;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), white);
    eye.position.set(x, y, -0.8 + Math.abs(i - 2) * 0.05);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), pupil);
    p.position.set(x, y, -0.88 + Math.abs(i - 2) * 0.05);
    body.add(eye, p);
  }
  // 两条触手当胳膊
  const mkArm = (side: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.85, 1.4, -0.2);
    for (let i = 0; i < 4; i++) {
      const seg = mesh(new THREE.SphereGeometry(0.16 - i * 0.025, 8, 6), flesh2);
      seg.position.set(side * i * 0.12, -i * 0.2, -i * 0.05);
      pivot.add(seg);
    }
    body.add(pivot);
    return pivot;
  };
  const armL = mkArm(-1);
  const armR = mkArm(1);

  const hpAnchor = new THREE.Object3D();
  hpAnchor.position.y = 2.6;
  root.add(hpAnchor);
  return { root, body, legL, legR, armL, armR, materials, hpAnchor, pustules };
}

function buildDrum(red: THREE.Material, dark: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const can = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.8, 14), red);
  g.add(can);
  for (const y of [-0.22, 0.22]) {
    const band = mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.05, 14), dark, false);
    band.position.y = y;
    g.add(band);
  }
  return g;
}

/** 扔出去的油桶（单独的网格，飞行中旋转） */
export function drumMesh(): THREE.Group {
  return buildDrum(lambert(0xc23a2e), lambert(0x3a3330));
}

// ---------- 其他道具 ----------

/** 地刺：铁板 + 一排排尖锥 */
export function spikesGeometry(width: number, depth: number): Part {
  const parts: Part[] = [paint(at(new THREE.BoxGeometry(width, 0.1, depth), 0, 0.05, 0), 0x4a4f57)];
  const cols = Math.max(2, Math.round(width / 0.45));
  const rows = Math.max(2, Math.round(depth / 0.45));
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const x = -width / 2 + (i + 0.5) * (width / cols);
      const z = -depth / 2 + (j + 0.5) * (depth / rows);
      parts.push(paint(at(new THREE.ConeGeometry(0.1, 0.42, 5), x, 0.3, z), 0xc9ced6));
    }
  }
  // 黄黑警示边
  for (const z of [-depth / 2 - 0.08, depth / 2 + 0.08]) {
    parts.push(paint(at(new THREE.BoxGeometry(width, 0.04, 0.16), 0, 0.02, z), 0xf2c21b));
  }
  return merged(parts);
}

/** 锯片：在 XY 平面里，绕 z 轴转 */
export function sawBladeGeometry(r: number): Part {
  const parts: Part[] = [paint(at(new THREE.CylinderGeometry(r, r, 0.06, 28), 0, 0, 0, Math.PI / 2), 0xd0d4da)];
  parts.push(paint(at(new THREE.CylinderGeometry(r * 0.28, r * 0.28, 0.12, 14), 0, 0, 0, Math.PI / 2), 0x3a3d45));
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    parts.push(paint(at(new THREE.BoxGeometry(0.14, 0.2, 0.05), Math.cos(a) * r, Math.sin(a) * r, 0, 0, 0, a + 0.5), 0xe8ebef));
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    parts.push(paint(at(new THREE.BoxGeometry(r * 0.9, 0.05, 0.07), Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45, 0, 0, 0, a), 0xb02a2a));
  }
  return merged(parts);
}

export function sawRailGeometry(width: number): Part {
  return merged([
    paint(at(new THREE.BoxGeometry(width + 1.2, 0.03, 0.3), 0, 0.015, 0), 0x16181b),
    paint(at(new THREE.BoxGeometry(width + 1.4, 0.035, 0.08), 0, 0.02, -0.2), 0xf2c21b),
    paint(at(new THREE.BoxGeometry(width + 1.4, 0.035, 0.08), 0, 0.02, 0.2), 0xf2c21b),
  ]);
}

/** 水泥隔离墩，长 2，沿 z */
export function barrierGeometry(top: number): Part {
  const shape = new THREE.Shape();
  shape.moveTo(-0.32, 0);
  shape.lineTo(0.32, 0);
  shape.lineTo(0.2, 0.25);
  shape.lineTo(0.12, 0.85);
  shape.lineTo(-0.12, 0.85);
  shape.lineTo(-0.2, 0.25);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: 1.9, bevelEnabled: false });
  g.translate(0, 0, -0.95);
  const parts: Part[] = [paint(g, 0xd5d7da)];
  parts.push(paint(at(new THREE.BoxGeometry(0.26, 0.1, 1.9), 0, 0.88, 0), top));
  return merged(parts);
}

/** 人质笼：底板、顶板、栏杆，里面关着三个小兵 */
export function cageGeometry(colors: SoldierColors): Part {
  const parts: Part[] = [];
  const w = 1.7;
  parts.push(paint(at(new THREE.BoxGeometry(w, 0.16, w), 0, 0.08, 0), 0x3b3f46));
  parts.push(paint(at(new THREE.BoxGeometry(w, 0.12, w), 0, 1.66, 0), 0x3b3f46));
  const n = 6;
  for (let i = 0; i <= n; i++) {
    const t = -w / 2 + (i / n) * w;
    for (const [x, z] of [
      [t, -w / 2],
      [t, w / 2],
      [-w / 2, t],
      [w / 2, t],
    ] as const) {
      parts.push(paint(at(new THREE.CylinderGeometry(0.035, 0.035, 1.5, 5), x, 0.88, z), 0x9aa1aa));
    }
  }
  const body = soldierBody(colors, 0);
  const leg = soldierLeg(colors.team);
  for (const [x, z, ry] of [
    [-0.35, -0.2, 0.3],
    [0.38, -0.1, -0.4],
    [0, 0.4, 0],
  ] as const) {
    parts.push(at(body.clone(), x, 0.16, z, 0, ry, 0, 0.9, 0.9, 0.9));
    for (const s of [-0.09, 0.09]) parts.push(at(leg.clone(), x + s, 0.16 + 0.4, z, 0, ry, 0, 0.9, 0.9, 0.9));
  }
  return merged(parts);
}

/** 军用补给箱 */
export function crateGeometry(): Part {
  const parts: Part[] = [paint(at(new THREE.BoxGeometry(1.7, 1.3, 1.7), 0, 0.65, 0), 0x5b6b3a)];
  for (const y of [0.05, 1.25]) {
    for (const [x, z, w, d] of [
      [0, -0.86, 1.74, 0.1],
      [0, 0.86, 1.74, 0.1],
      [-0.86, 0, 0.1, 1.74],
      [0.86, 0, 0.1, 1.74],
    ] as const) {
      parts.push(paint(at(new THREE.BoxGeometry(w, 0.1, d), x, y, z), 0x3d4a26));
    }
  }
  parts.push(paint(at(new THREE.BoxGeometry(1.72, 0.22, 1.72), 0, 0.65, 0), 0xf2c21b));
  return merged(parts);
}

export function crateHeight(): number {
  return 1.3;
}

/** 空袭导弹，头朝 -y */
export function missileGeometry(): Part {
  return merged([
    paint(at(new THREE.CylinderGeometry(0.13, 0.13, 1.1, 10), 0, 0, 0), 0x6b7a5a),
    paint(at(new THREE.ConeGeometry(0.13, 0.35, 10), 0, -0.72, 0, Math.PI), 0xd9361f),
    paint(at(new THREE.BoxGeometry(0.5, 0.25, 0.04), 0, 0.45, 0), 0x3d4a26),
    paint(at(new THREE.BoxGeometry(0.04, 0.25, 0.5), 0, 0.45, 0), 0x3d4a26),
  ]);
}

/** 装甲路障：钢板 + 黄黑警示条 + 尖刺，很耐打，撞进阵型压死一片 */
export function armorGeometry(r: number): Part {
  const w = r * 2.2;
  const parts: Part[] = [];
  parts.push(paint(at(new THREE.BoxGeometry(w, 1.5, 1.1), 0, 0.75, 0), 0x5a6270));
  parts.push(paint(at(new THREE.BoxGeometry(w * 0.86, 0.6, 0.9), 0, 1.75, 0.05), 0x4a515c));
  // 警示条
  const n = 7;
  for (let i = 0; i < n; i++) {
    parts.push(paint(at(new THREE.BoxGeometry(w / n, 0.28, 0.06), -w / 2 + (i + 0.5) * (w / n), 1.25, -0.58, 0, 0, 0.5), i % 2 ? 0x1c1c1f : 0xf2c21b));
  }
  // 铆钉
  for (let i = 0; i < 6; i++) {
    parts.push(paint(at(new THREE.SphereGeometry(0.07, 6, 5), -w / 2 + 0.3 + i * ((w - 0.6) / 5), 0.45, -0.57), 0xb8bec6));
  }
  // 正面的尖刺
  for (let i = 0; i < 5; i++) {
    parts.push(paint(at(new THREE.ConeGeometry(0.12, 0.6, 6), -w / 2 + 0.45 + i * ((w - 0.9) / 4), 0.9, -0.85, -Math.PI / 2), 0xd6dbe1));
  }
  // 两侧轮子
  for (const s of [-1, 1]) {
    parts.push(paint(at(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 14), s * (w / 2 - 0.1), 0.42, 0, 0, 0, Math.PI / 2), 0x1c1c1f));
  }
  return merged(parts);
}
