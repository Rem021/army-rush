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

const TANK_PALETTES = [
  { hull: 0x4f633e, armor: 0x3b4b2e, accent: 0x98b56c, barrel: 0x2c322c }, // Tier 1 轻甲绿
  { hull: 0x8f7a53, armor: 0x6b5a3c, accent: 0xe6c36a, barrel: 0x33302b }, // Tier 2 沙漠重甲
  { hull: 0x8d2b2b, armor: 0x5c1d1d, accent: 0xff7847, barrel: 0x2a2626 }, // Tier 3 赤焰双管
  { hull: 0xc99628, armor: 0x7a5713, accent: 0xfff08a, barrel: 0x2e2a22 }, // Tier 4 黄金天启
] as const;

const ALLY_TANK_PALETTES = [
  { hull: 0x1d4ed8, armor: 0x1e3a8a, accent: 0x38bdf8, barrel: 0x1e293b }, // 友军 1 阶蓝钢
  { hull: 0x0284c7, armor: 0x0c4a6e, accent: 0x67e8f9, barrel: 0x1e293b }, // 友军 2 阶天青重坦
  { hull: 0x2563eb, armor: 0x1e3a8a, accent: 0xfacc15, barrel: 0x1e293b }, // 友军 3 阶双管雷霆
  { hull: 0x0ea5e9, armor: 0x1d4ed8, accent: 0xfef08a, barrel: 0x0f172a }, // 友军 4 阶天启金蓝
] as const;

/** 3D 重装坦克底盘（车体 + 双侧履带 + 负重轮 + 反应装甲 + 前大灯；ally=true 时为收编友军蓝金涂装） */
export function tankHullGeometry(tier: 1 | 2 | 3 | 4, r: number, ally = false): Part {
  const pals = ally ? ALLY_TANK_PALETTES : TANK_PALETTES;
  const pal = pals[Math.min(3, Math.max(0, tier - 1))];
  const sc = r / 1.5;
  const parts: Part[] = [];
  // 左右重型履带与裙甲
  for (const s of [-1, 1]) {
    parts.push(paint(at(new THREE.BoxGeometry(0.62 * sc, 0.68 * sc, 3.1 * sc), s * 1.12 * sc, 0.38 * sc, 0), 0x1e2024));
    parts.push(paint(at(new THREE.BoxGeometry(0.14 * sc, 0.44 * sc, 2.9 * sc), s * 1.44 * sc, 0.56 * sc, 0), pal.armor));
    for (let i = -2; i <= 2; i++) {
      parts.push(
        paint(
          at(new THREE.CylinderGeometry(0.24 * sc, 0.24 * sc, 0.66 * sc, 10), s * 1.12 * sc, 0.25 * sc, i * 0.58 * sc, 0, 0, Math.PI / 2),
          ally ? 0x60a5fa : 0x484d55,
        ),
      );
    }
  }
  // 主装甲车体 + 前倾斜装甲
  parts.push(paint(at(new THREE.BoxGeometry(1.92 * sc, 0.72 * sc, 2.85 * sc), 0, 0.7 * sc, 0), pal.hull));
  parts.push(paint(at(new THREE.BoxGeometry(1.88 * sc, 0.46 * sc, 0.65 * sc), 0, 0.62 * sc, 1.5 * sc, 0.42), pal.armor));
  // 警示涂装条与前灯（敌方朝 +z，友方由外层 group 旋转 180° 朝 -z 面向敌阵）
  parts.push(paint(at(new THREE.BoxGeometry(1.75 * sc, 0.14 * sc, 0.12 * sc), 0, 0.88 * sc, 1.45 * sc), pal.accent));
  for (const s of [-0.65, 0.65]) {
    parts.push(paint(at(new THREE.SphereGeometry(0.11 * sc, 8, 6), s * sc, 0.82 * sc, 1.62 * sc), ally ? 0x67e8f9 : 0xfff3b0));
  }
  if (ally) {
    // 友军金色识别菱徽与尾翼发光能量条
    parts.push(paint(at(new THREE.OctahedronGeometry(0.26 * sc, 0), 0, 1.12 * sc, 0.78 * sc, 0, Math.PI / 4, 0, 1.2, 0.35, 1.2), 0xfacc15));
    parts.push(paint(at(new THREE.BoxGeometry(1.6 * sc, 0.14 * sc, 0.16 * sc), 0, 1.06 * sc, -1.25 * sc), 0x38bdf8));
  }
  // 车尾散热格栅
  parts.push(paint(at(new THREE.BoxGeometry(1.4 * sc, 0.14 * sc, 0.65 * sc), 0, 1.09 * sc, -0.95 * sc), 0x26292e));
  return merged(parts);
}

/** 3D 坦克旋转炮塔（炮塔本体 + 指挥塔 + 单管或天启双管主炮，炮口朝 +z） */
export function tankTurretGeometry(tier: 1 | 2 | 3 | 4, r: number, twin = false, ally = false): Part {
  const pals = ally ? ALLY_TANK_PALETTES : TANK_PALETTES;
  const pal = pals[Math.min(3, Math.max(0, tier - 1))];
  const sc = r / 1.5;
  const parts: Part[] = [];
  // 炮塔座圈与装甲外壳
  parts.push(paint(at(new THREE.CylinderGeometry(0.92 * sc, 1.05 * sc, 0.58 * sc, 8), 0, 0.29 * sc, -0.1 * sc), pal.hull));
  parts.push(paint(at(new THREE.BoxGeometry(1.48 * sc, 0.54 * sc, 1.55 * sc), 0, 0.3 * sc, -0.15 * sc), pal.hull));
  parts.push(paint(at(new THREE.BoxGeometry(1.56 * sc, 0.14 * sc, 1.25 * sc), 0, 0.58 * sc, -0.15 * sc), pal.accent));
  // 车长观察塔 + 天线
  parts.push(paint(at(new THREE.CylinderGeometry(0.32 * sc, 0.36 * sc, 0.24 * sc, 10), -0.35 * sc, 0.72 * sc, -0.35 * sc), pal.armor));
  parts.push(paint(at(new THREE.CylinderGeometry(0.03 * sc, 0.03 * sc, 0.9 * sc, 5), 0.52 * sc, 0.98 * sc, -0.65 * sc), ally ? 0x38bdf8 : 0x1e2024));
  // 主炮管（单管或双管）
  const xs = twin ? [-0.28 * sc, 0.28 * sc] : [0];
  for (const bx of xs) {
    parts.push(paint(at(new THREE.CylinderGeometry(0.14 * sc, 0.18 * sc, 2.15 * sc, 10), bx, 0.34 * sc, 1.42 * sc, Math.PI / 2), pal.barrel));
    // 炮口制退器 + 高亮环
    parts.push(paint(at(new THREE.CylinderGeometry(0.21 * sc, 0.19 * sc, 0.32 * sc, 10), bx, 0.34 * sc, 2.48 * sc, Math.PI / 2), 0x1c1e22));
    parts.push(paint(at(new THREE.CylinderGeometry(0.19 * sc, 0.19 * sc, 0.12 * sc, 10), bx, 0.34 * sc, 2.15 * sc, Math.PI / 2), pal.accent));
  }
  return merged(parts);
}

/** 广告奇袭中路爆裂红油桶：高亮红漆 + 黄黑警示环 + 顶部引信灯 */
export function bombBarrelGeometry(r: number): Part {
  const h = r * 2.05;
  const parts: Part[] = [
    paint(at(new THREE.CylinderGeometry(r * 0.78, r * 0.82, h, 14), 0, h / 2, 0), 0xe02828),
    paint(at(new THREE.CylinderGeometry(r * 0.85, r * 0.85, h * 0.16, 14), 0, h * 0.5, 0), 0xfacc15),
    paint(at(new THREE.CylinderGeometry(r * 0.86, r * 0.86, h * 0.06, 14), 0, h * 0.22, 0), 0x222226),
    paint(at(new THREE.CylinderGeometry(r * 0.86, r * 0.86, h * 0.06, 14), 0, h * 0.78, 0), 0x222226),
    paint(at(new THREE.SphereGeometry(r * 0.26, 10, 8), 0, h + r * 0.1, 0), 0xffdd33),
  ];
  return merged(parts);
}

/** 战斗支援无人机（既作奖励浮空图标，也作小队护航实体） */
export function droneGeometry(scale = 1): Part {
  const s = scale;
  const parts: Part[] = [
    paint(at(new THREE.OctahedronGeometry(0.28 * s, 1), 0, 0, 0, 0, 0, 0, 1.35, 0.55, 1.35), 0x2563eb),
    paint(at(new THREE.SphereGeometry(0.14 * s, 10, 8), 0, 0.05 * s, -0.18 * s), 0x67e8f9),
  ];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push(paint(at(new THREE.BoxGeometry(0.45 * s, 0.05 * s, 0.07 * s), sx * 0.22 * s, 0.04 * s, sz * 0.22 * s, 0, sx * sz * 0.78), 0x334155));
      parts.push(paint(at(new THREE.TorusGeometry(0.17 * s, 0.03 * s, 6, 12), sx * 0.36 * s, 0.08 * s, sz * 0.36 * s, Math.PI / 2), 0x38bdf8));
    }
  }
  return merged(parts);
}

/** 多重弹道 3D 浮空图标：三联扇形光束炮管 + 紫金分束核心 */
export function multishotGeometry(): Part {
  const parts: Part[] = [
    paint(at(new THREE.OctahedronGeometry(0.28, 1), 0, 0, -0.1), 0xa855f7),
    paint(at(new THREE.TorusGeometry(0.38, 0.055, 8, 16), 0, 0, -0.05), 0xfacc15),
  ];
  for (const ang of [-0.42, 0, 0.42]) {
    const bx = Math.sin(ang) * 0.34;
    const bz = Math.cos(ang) * 0.34;
    parts.push(paint(at(new THREE.CylinderGeometry(0.075, 0.095, 0.68, 8), bx, 0.04, bz, Math.PI / 2, ang), 0xe879f9));
    parts.push(paint(at(new THREE.ConeGeometry(0.11, 0.22, 8), bx * 1.85, 0.04, bz * 1.85, Math.PI / 2, ang), 0xfef08a));
  }
  return merged(parts);
}

/** 超级弹药 3D 浮空核心（1 穿甲金矛 · 2 爆裂烈焰弹头 · 3 电磁雷暴球） */
export function ammoCoreGeometry(level: number): Part {
  const parts: Part[] = [];
  if (level >= 3) {
    // 电磁弹：雷电能量球 + 双倾斜磁环
    parts.push(paint(at(new THREE.IcosahedronGeometry(0.32, 1), 0, 0.06, 0), 0x38bdf8));
    parts.push(paint(at(new THREE.TorusGeometry(0.48, 0.05, 8, 18), 0, 0.06, 0, 0.65, 0.3), 0xa855f7));
    parts.push(paint(at(new THREE.TorusGeometry(0.48, 0.05, 8, 18), 0, 0.06, 0, -0.65, -0.3), 0x67e8f9));
  } else if (level === 2) {
    // 爆裂弹：烈焰重型弹头 + 尾翼
    parts.push(paint(at(new THREE.CylinderGeometry(0.22, 0.24, 0.62, 12), 0, 0, 0, 0.3, 0, -0.3), 0xea580c));
    parts.push(paint(at(new THREE.ConeGeometry(0.22, 0.38, 12), 0.14, 0.44, 0.14, 0.3, 0, -0.3), 0xfef08a));
    parts.push(paint(at(new THREE.TorusGeometry(0.34, 0.055, 6, 14), 0, 0.05, 0, Math.PI / 2), 0xff4d4d));
  } else {
    // 穿甲弹：三枚并列黄金穿甲弹芯
    for (const sx of [-0.24, 0, 0.24]) {
      parts.push(paint(at(new THREE.CylinderGeometry(0.085, 0.1, 0.56, 10), sx, 0, 0), 0xf59e0b));
      parts.push(paint(at(new THREE.ConeGeometry(0.09, 0.28, 10), sx, 0.4, 0), 0xfffbeb));
    }
  }
  return merged(parts);
}

/** 火力倍增 3D 浮空图标：炽烈熔火水晶 + 双能量增幅环 */
export function damageCoreGeometry(): Part {
  const parts: Part[] = [
    paint(at(new THREE.OctahedronGeometry(0.36, 0), 0, 0.08, 0, 0, 0, 0, 0.9, 1.45, 0.9), 0xff4d1f),
    paint(at(new THREE.OctahedronGeometry(0.24, 0), 0, 0.08, 0, 0, Math.PI / 4, 0, 1.15, 0.9, 1.15), 0xfacc15),
    paint(at(new THREE.TorusGeometry(0.46, 0.05, 6, 16), 0, 0.08, 0, 0.5, 0.4), 0xfb923c),
  ];
  return merged(parts);
}

/** 小队护盾 3D 浮空图标：六角能量盾牌 + 发光晶核 */
export function shieldCoreGeometry(): Part {
  const parts: Part[] = [
    paint(at(new THREE.CylinderGeometry(0.46, 0.38, 0.16, 6), 0, 0.06, 0, Math.PI / 2), 0x06b6d4),
    paint(at(new THREE.CylinderGeometry(0.32, 0.26, 0.22, 6), 0, 0.06, 0, Math.PI / 2), 0x67e8f9),
    paint(at(new THREE.OctahedronGeometry(0.18, 0), 0, 0.06, 0.14), 0xecfeff),
  ];
  return merged(parts);
}

/** 极速射速 3D 浮空图标：立体闪电增压核 */
export function rateBoltGeometry(): Part {
  const parts: Part[] = [
    paint(at(new THREE.BoxGeometry(0.22, 0.56, 0.16), 0.1, 0.26, 0, 0, 0, -0.45), 0xfacc15),
    paint(at(new THREE.BoxGeometry(0.22, 0.56, 0.16), -0.08, -0.18, 0, 0, 0, -0.45), 0x38bdf8),
    paint(at(new THREE.TorusGeometry(0.42, 0.045, 6, 14), 0, 0.05, 0), 0x67e8f9),
  ];
  return merged(parts);
}

/** 空袭超音速战机 3D 模型（空袭触发时低空呼啸掠过战场，双尾喷拖曳烈焰！） */
export function jetGeometry(): Part {
  const parts: Part[] = [
    // 机身与机头锥
    paint(at(new THREE.CylinderGeometry(0.22, 0.34, 3.2, 10), 0, 0, 0, Math.PI / 2), 0x334155),
    paint(at(new THREE.ConeGeometry(0.22, 1.1, 10), 0, 0, -2.15, -Math.PI / 2), 0x94a3b8),
    // 驾驶舱玻璃罩
    paint(at(new THREE.SphereGeometry(0.26, 10, 8), 0, 0.22, -0.65, 0, 0, 0, 0.85, 0.65, 2.1), 0x38bdf8),
    // 后掠三角主翼 + 警示翼尖条
    paint(at(new THREE.BoxGeometry(4.4, 0.1, 1.25), 0, -0.02, 0.35), 0x475569),
    paint(at(new THREE.BoxGeometry(2.6, 0.12, 0.35), 0, 0.02, -0.2), 0xf97316),
    // 双垂尾
    forWing(-0.65),
    forWing(0.65),
    // 双发动机尾喷口 + 高亮加力燃烧室
    paint(at(new THREE.CylinderGeometry(0.16, 0.18, 0.45, 10), -0.28, -0.02, 1.72, Math.PI / 2), 0x1e293b),
    paint(at(new THREE.CylinderGeometry(0.16, 0.18, 0.45, 10), 0.28, -0.02, 1.72, Math.PI / 2), 0x1e293b),
    paint(at(new THREE.ConeGeometry(0.15, 0.72, 8), -0.28, -0.02, 2.25, Math.PI / 2), 0xffb347),
    paint(at(new THREE.ConeGeometry(0.15, 0.72, 8), 0.28, -0.02, 2.25, Math.PI / 2), 0xffb347),
  ];
  return merged(parts);
}

function forWing(x: number): Part {
  return paint(at(new THREE.BoxGeometry(0.1, 0.85, 0.75), x, 0.42, 1.15, 0, 0, x < 0 ? 0.22 : -0.22), 0x1e293b);
}
