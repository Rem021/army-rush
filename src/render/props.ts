import * as THREE from 'three';
import type { BossKind, ZombieKind } from '../game/config';
import type { HeroKind } from '../game/level';
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
  materials: THREE.MeshStandardMaterial[];
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

function lambert(color: number, roughness = 0.62, metalness = 0.15) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
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

/** 军用战术补给箱：倒角箱体 + 八角防撞护角 + 加强筋 + 卡扣锁 + 侧提手 + 警示带 */
export function crateGeometry(): Part {
  const parts: Part[] = [
    // 主箱体与略微突出的顶盖
    paint(at(new THREE.BoxGeometry(1.66, 1.18, 1.66), 0, 0.61, 0), 0x4d5c33),
    paint(at(new THREE.BoxGeometry(1.74, 0.18, 1.74), 0, 1.24, 0), 0x3b4827),
    // 顶部凹陷加强肋条
    paint(at(new THREE.BoxGeometry(1.36, 0.05, 0.14), 0, 1.34, -0.45), 0x2d371e),
    paint(at(new THREE.BoxGeometry(1.36, 0.05, 0.14), 0, 1.34, 0), 0x2d371e),
    paint(at(new THREE.BoxGeometry(1.36, 0.05, 0.14), 0, 1.34, 0.45), 0x2d371e),
    // 底部托盘滑轨
    paint(at(new THREE.BoxGeometry(1.7, 0.1, 0.24), 0, 0.05, -0.62), 0x252b20),
    paint(at(new THREE.BoxGeometry(1.7, 0.1, 0.24), 0, 0.05, 0.62), 0x252b20),
    // 中腰战术警示涂装带
    paint(at(new THREE.BoxGeometry(1.7, 0.2, 1.7), 0, 0.66, 0), 0xd4a418),
    paint(at(new THREE.BoxGeometry(1.72, 0.05, 1.72), 0, 0.78, 0), 0x1e221b),
    paint(at(new THREE.BoxGeometry(1.72, 0.05, 1.72), 0, 0.54, 0), 0x1e221b),
  ];
  // 八角金属防撞护角与竖向加强立柱
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push(paint(at(new THREE.BoxGeometry(0.16, 1.28, 0.16), sx * 0.81, 0.66, sz * 0.81), 0x283024));
      for (const y of [0.14, 1.24]) {
        parts.push(paint(at(new THREE.BoxGeometry(0.22, 0.16, 0.22), sx * 0.81, y, sz * 0.81), 0x1c2026));
      }
    }
    // 两侧金属提手
    parts.push(paint(at(new THREE.BoxGeometry(0.08, 0.08, 0.44), sx * 0.88, 0.92, 0), 0x5c6470));
  }
  // 前后双金属搭扣锁
  for (const sz of [-1, 1]) {
    for (const sx of [-0.42, 0.42]) {
      parts.push(paint(at(new THREE.BoxGeometry(0.14, 0.28, 0.08), sx, 1.08, sz * 0.86), 0x737d8c));
    }
  }
  return merged(parts);
}

export function crateHeight(): number {
  return 1.36;
}

/** 精确制导空袭导弹（头朝 -y）：导引头 + 多段弹体 + 前鸭翼 + 后掠十字尾翼 + 喷口 */
export function missileGeometry(): Part {
  const parts: Part[] = [
    // 主弹体与黑灰热防护段
    paint(at(new THREE.CylinderGeometry(0.13, 0.14, 1.08, 12), 0, 0.04, 0), 0x525d50),
    paint(at(new THREE.CylinderGeometry(0.142, 0.142, 0.12, 12), 0, -0.22, 0), 0xd4a418),
    paint(at(new THREE.CylinderGeometry(0.142, 0.142, 0.08, 12), 0, 0.26, 0), 0x2a2f36),
    // 红色战斗部与导引光学头罩
    paint(at(new THREE.ConeGeometry(0.13, 0.36, 12), 0, -0.68, 0, Math.PI), 0xc93524),
    paint(at(new THREE.SphereGeometry(0.06, 8, 6), 0, -0.84, 0), 0x1e293b),
    // 尾部收敛喷口
    paint(at(new THREE.CylinderGeometry(0.1, 0.13, 0.16, 10), 0, 0.64, 0), 0x1e2228),
    // 前部十字鸭翼
    paint(at(new THREE.BoxGeometry(0.36, 0.16, 0.03), 0, -0.28, 0), 0x333c36),
    paint(at(new THREE.BoxGeometry(0.03, 0.16, 0.36), 0, -0.28, 0), 0x333c36),
    // 后部大展弦比十字稳定尾翼
    paint(at(new THREE.BoxGeometry(0.6, 0.28, 0.035), 0, 0.46, 0), 0x2c3530),
    paint(at(new THREE.BoxGeometry(0.035, 0.28, 0.6), 0, 0.46, 0), 0x2c3530),
  ];
  return merged(parts);
}

/** 无人机/机甲发射的细长追踪火箭弹（轴沿 +y，头朝 +y） */
export function rocketProjectileGeometry(scale = 1): Part {
  const s = scale;
  return merged([
    paint(at(new THREE.CylinderGeometry(0.075 * s, 0.085 * s, 0.62 * s, 10), 0, 0, 0), 0xcbd5e1),
    paint(at(new THREE.ConeGeometry(0.075 * s, 0.24 * s, 10), 0, 0.43 * s, 0), 0x38bdf8),
    paint(at(new THREE.CylinderGeometry(0.088 * s, 0.088 * s, 0.07 * s, 10), 0, 0.18 * s, 0), 0x0284c7),
    paint(at(new THREE.BoxGeometry(0.28 * s, 0.16 * s, 0.025 * s), 0, -0.24 * s, 0), 0x334155),
    paint(at(new THREE.BoxGeometry(0.025 * s, 0.16 * s, 0.28 * s), 0, -0.24 * s, 0), 0x334155),
    paint(at(new THREE.ConeGeometry(0.065 * s, 0.18 * s, 8), 0, -0.38 * s, 0, Math.PI), 0x67e8f9),
  ]);
}

/** 友军重坦主炮穿甲榴弹（轴沿 +y，头朝 +y） */
export function tankShellGeometry(scale = 1): Part {
  const s = scale;
  return merged([
    paint(at(new THREE.CylinderGeometry(0.11 * s, 0.13 * s, 0.56 * s, 10), 0, 0, 0), 0xd97706),
    paint(at(new THREE.ConeGeometry(0.11 * s, 0.34 * s, 10), 0, 0.45 * s, 0), 0xfef08a),
    paint(at(new THREE.CylinderGeometry(0.136 * s, 0.136 * s, 0.08 * s, 10), 0, -0.14 * s, 0), 0x475569),
    paint(at(new THREE.ConeGeometry(0.095 * s, 0.22 * s, 8), 0, -0.38 * s, 0, Math.PI), 0xf97316),
  ]);
}

/** 重装装甲推土路障：斜置装甲板 + 强化钢肋 + 黄黑警示梁 + 破障尖齿 + 双侧重型胎 */
export function armorGeometry(r: number): Part {
  const w = r * 2.2;
  const parts: Part[] = [
    // 主钢箱与上层斜甲
    paint(at(new THREE.BoxGeometry(w, 1.25, 1.05), 0, 0.72, 0.05), 0x454e5b),
    paint(at(new THREE.BoxGeometry(w * 0.96, 0.75, 0.24), 0, 0.62, -0.52, -0.32), 0x363e4a),
    paint(at(new THREE.BoxGeometry(w * 0.88, 0.52, 0.84), 0, 1.58, 0.08), 0x3b434f),
    // 顶部防滑格栅与吊耳
    paint(at(new THREE.BoxGeometry(w * 0.76, 0.08, 0.62), 0, 1.88, 0.08), 0x262c35),
  ];
  // 竖向焊缝加强肋
  for (const fx of [-0.36, 0, 0.36]) {
    parts.push(paint(at(new THREE.BoxGeometry(0.12, 1.32, 1.14), fx * w, 0.78, 0.05), 0x2c333d));
  }
  // 斜条纹警示横梁
  const n = 7;
  for (let i = 0; i < n; i++) {
    parts.push(paint(at(new THREE.BoxGeometry(w / n, 0.24, 0.07), -w / 2 + (i + 0.5) * (w / n), 1.22, -0.55, 0, 0, 0.45), i % 2 ? 0x1b1e23 : 0xd9a91a));
  }
  // 装甲螺栓铆钉
  for (let i = 0; i < 6; i++) {
    parts.push(paint(at(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 6), -w / 2 + 0.28 + i * ((w - 0.56) / 5), 0.44, -0.62, Math.PI / 2), 0x8f9aa8));
  }
  // 前部破障冲角尖刺 + 基座
  for (let i = 0; i < 5; i++) {
    const sx = -w / 2 + 0.42 + i * ((w - 0.84) / 4);
    parts.push(paint(at(new THREE.CylinderGeometry(0.14, 0.16, 0.14, 8), sx, 0.88, -0.58, Math.PI / 2), 0x2c333d));
    parts.push(paint(at(new THREE.ConeGeometry(0.11, 0.58, 6), sx, 0.88, -0.92, -Math.PI / 2), 0xbec6d0));
  }
  // 两侧轮毂与轮胎
  for (const s of [-1, 1]) {
    parts.push(paint(at(new THREE.CylinderGeometry(0.44, 0.44, 0.32, 14), s * (w / 2 - 0.08), 0.44, 0.05, 0, 0, Math.PI / 2), 0x1a1c20));
    parts.push(paint(at(new THREE.CylinderGeometry(0.22, 0.22, 0.35, 10), s * (w / 2 - 0.08), 0.44, 0.05, 0, 0, Math.PI / 2), 0x5c6573));
  }
  return merged(parts);
}

const TANK_PALETTES = [
  { hull: 0x455837, armor: 0x303e26, accent: 0x8aa85e, barrel: 0x252b25, trim: 0x5d734b }, // Tier 1 轻甲绿
  { hull: 0x7d6a47, armor: 0x594a30, accent: 0xd4ae52, barrel: 0x2b2824, trim: 0x99835b }, // Tier 2 沙漠重甲
  { hull: 0x7d2626, armor: 0x4f1818, accent: 0xe66235, barrel: 0x242020, trim: 0x9e3535 }, // Tier 3 赤焰双管
  { hull: 0xb08220, armor: 0x6b4b10, accent: 0xebd46c, barrel: 0x26231c, trim: 0xc99c34 }, // Tier 4 黄金天启
] as const;

const ALLY_TANK_PALETTES = [
  { hull: 0x1e40af, armor: 0x172554, accent: 0x38bdf8, barrel: 0x1e293b, trim: 0x3b82f6 }, // 友军 1 阶蓝钢
  { hull: 0x0369a1, armor: 0x0c4a6e, accent: 0x67e8f9, barrel: 0x1e293b, trim: 0x0ea5e9 }, // 友军 2 阶天青重坦
  { hull: 0x1d4ed8, armor: 0x1e3a8a, accent: 0xeab308, barrel: 0x1e293b, trim: 0x60a5fa }, // 友军 3 阶双管雷霆
  { hull: 0x0284c7, armor: 0x1e3a8a, accent: 0xfde047, barrel: 0x0f172a, trim: 0x38bdf8 }, // 友军 4 阶天启金蓝
] as const;

/** 现代主战坦克精细 3D 底盘（斜楔首上/首下复合装甲 + 分段 ERA 反应裙甲 + 6 对负重轮与主动轮 + 挡泥板 + 尾油桶/散热格栅 + 前大灯护笼） */
export function tankHullGeometry(tier: 1 | 2 | 3 | 4, r: number, ally = false): Part {
  const pals = ally ? ALLY_TANK_PALETTES : TANK_PALETTES;
  const pal = pals[Math.min(3, Math.max(0, tier - 1))];
  const sc = r / 1.5;
  const parts: Part[] = [];

  // 1. 楔形复合装甲车体（利用 ExtrudeGeometry 做出真实的现代主战坦克首上/首下倾斜轮廓）
  const hullProfile = new THREE.Shape();
  hullProfile.moveTo(-1.45 * sc, 0.34 * sc); // 车尾下沿
  hullProfile.lineTo(1.36 * sc, 0.34 * sc); // 首下底部
  hullProfile.lineTo(1.74 * sc, 0.64 * sc); // 首上鼻尖
  hullProfile.lineTo(1.12 * sc, 1.02 * sc); // 首上顶部折角
  hullProfile.lineTo(-1.26 * sc, 1.02 * sc); // 引擎盖顶部
  hullProfile.lineTo(-1.52 * sc, 0.78 * sc); // 车尾斜坡
  hullProfile.closePath();
  const hullCore = new THREE.ExtrudeGeometry(hullProfile, { depth: 1.84 * sc, bevelEnabled: true, bevelThickness: 0.05 * sc, bevelSize: 0.04 * sc, bevelSegments: 2 });
  hullCore.rotateY(-Math.PI / 2); // 让轮廓沿 Z 轴（车头朝 +Z）
  hullCore.translate(0.92 * sc, 0, 0);
  parts.push(paint(hullCore, pal.hull));

  // 首上附加反应装甲块（4 块斜置 ERA 装甲砖）
  for (let i = -1.5; i <= 1.5; i += 1) {
    parts.push(paint(at(new THREE.BoxGeometry(0.4 * sc, 0.11 * sc, 0.44 * sc), i * 0.44 * sc, 0.87 * sc, 1.42 * sc, 0.56), pal.armor));
  }
  // 首下防雷铲条 + 双拖车钩
  parts.push(paint(at(new THREE.BoxGeometry(1.72 * sc, 0.12 * sc, 0.16 * sc), 0, 0.48 * sc, 1.56 * sc, -0.58), pal.armor));
  for (const sx of [-0.62, 0.62]) {
    parts.push(paint(at(new THREE.TorusGeometry(0.09 * sc, 0.03 * sc, 6, 10), sx * sc, 0.62 * sc, 1.72 * sc, Math.PI / 2), 0x262930));
  }

  // 2. 左右重型履带总成（橡胶履带带体 + 前主动轮/后诱导轮 + 6 对负重轮与轮毂 + 挡泥板 + 分段 ERA 反应裙甲）
  for (const s of [-1, 1]) {
    // 履带包络轮廓
    const trackShape = new THREE.Shape();
    trackShape.moveTo(-1.42 * sc, 0.08 * sc);
    trackShape.lineTo(1.38 * sc, 0.08 * sc);
    trackShape.lineTo(1.66 * sc, 0.52 * sc);
    trackShape.lineTo(1.48 * sc, 0.72 * sc);
    trackShape.lineTo(-1.46 * sc, 0.72 * sc);
    trackShape.lineTo(-1.62 * sc, 0.48 * sc);
    trackShape.closePath();
    const trackGeo = new THREE.ExtrudeGeometry(trackShape, { depth: 0.56 * sc, bevelEnabled: false });
    trackGeo.rotateY(-Math.PI / 2);
    trackGeo.translate(s * 1.14 * sc + 0.28 * sc, 0, 0);
    parts.push(paint(trackGeo, 0x1a1d22));

    // 上部翼子板挡泥板 + 前后护板
    parts.push(paint(at(new THREE.BoxGeometry(0.68 * sc, 0.08 * sc, 3.16 * sc), s * 1.18 * sc, 0.78 * sc, 0.02 * sc), pal.trim));
    parts.push(paint(at(new THREE.BoxGeometry(0.66 * sc, 0.28 * sc, 0.12 * sc), s * 1.18 * sc, 0.65 * sc, 1.62 * sc, -0.3), pal.armor));

    // 5 块分段式侧裙反应装甲（带缝隙，避免一整块平板）
    for (let k = -2; k <= 2; k++) {
      parts.push(paint(at(new THREE.BoxGeometry(0.12 * sc, 0.36 * sc, 0.54 * sc), s * 1.52 * sc, 0.62 * sc, k * 0.6 * sc), k % 2 === 0 ? pal.armor : pal.hull));
      parts.push(paint(at(new THREE.BoxGeometry(0.05 * sc, 0.08 * sc, 0.48 * sc), s * 1.58 * sc, 0.74 * sc, k * 0.6 * sc), pal.accent));
    }

    // 6 对独立负重轮 + 轮毂中心盖
    for (let i = 0; i < 6; i++) {
      const wz = (-1.22 + i * 0.49) * sc;
      parts.push(paint(at(new THREE.CylinderGeometry(0.21 * sc, 0.21 * sc, 0.6 * sc, 10), s * 1.14 * sc, 0.24 * sc, wz, 0, 0, Math.PI / 2), 0x2d323a));
      parts.push(paint(at(new THREE.CylinderGeometry(0.11 * sc, 0.11 * sc, 0.64 * sc, 8), s * 1.14 * sc, 0.24 * sc, wz, 0, 0, Math.PI / 2), ally ? 0x60a5fa : 0x5c6470));
    }
    // 前主动齿轮 & 后诱导轮（高位）
    for (const ez of [-1.46 * sc, 1.48 * sc]) {
      parts.push(paint(at(new THREE.CylinderGeometry(0.22 * sc, 0.22 * sc, 0.62 * sc, 10), s * 1.14 * sc, 0.5 * sc, ez, 0, 0, Math.PI / 2), 0x3b424d));
    }
  }

  // 3. 驾驶员潜望观察窗 + 护笼大灯
  parts.push(paint(at(new THREE.BoxGeometry(0.46 * sc, 0.1 * sc, 0.14 * sc), 0, 1.05 * sc, 1.04 * sc), 0x161b22));
  parts.push(paint(at(new THREE.BoxGeometry(0.38 * sc, 0.05 * sc, 0.16 * sc), 0, 1.05 * sc, 1.05 * sc), ally ? 0x38bdf8 : 0x94a3b8));
  for (const sx of [-0.74, 0.74]) {
    parts.push(paint(at(new THREE.BoxGeometry(0.24 * sc, 0.18 * sc, 0.2 * sc), sx * sc, 0.88 * sc, 1.48 * sc), 0x23272e));
    parts.push(paint(at(new THREE.CylinderGeometry(0.065 * sc, 0.065 * sc, 0.08 * sc, 8), sx * sc, 0.88 * sc, 1.58 * sc, Math.PI / 2), ally ? 0x67e8f9 : 0xfde68a));
  }

  // 4. 车尾双散热百叶窗格栅 + 双排气管 + 外挂副油箱
  for (const sx of [-0.46, 0.46]) {
    parts.push(paint(at(new THREE.BoxGeometry(0.72 * sc, 0.09 * sc, 0.76 * sc), sx * sc, 1.05 * sc, -0.82 * sc), 0x1f242b));
    parts.push(paint(at(new THREE.CylinderGeometry(0.09 * sc, 0.09 * sc, 0.28 * sc, 8), sx * sc, 0.66 * sc, -1.52 * sc, Math.PI / 2), 0x282d35));
    parts.push(paint(at(new THREE.CylinderGeometry(0.18 * sc, 0.18 * sc, 0.62 * sc, 10), sx * sc, 0.94 * sc, -1.44 * sc, 0, 0, Math.PI / 2), pal.armor));
  }

  if (ally) {
    // 友军金色识别星徽与车尾蓝色动力导条
    parts.push(paint(at(new THREE.OctahedronGeometry(0.24 * sc, 0), 0, 1.09 * sc, 0.76 * sc, 0, Math.PI / 4, 0, 1.15, 0.3, 1.15), 0xeab308));
    parts.push(paint(at(new THREE.BoxGeometry(1.56 * sc, 0.1 * sc, 0.14 * sc), 0, 1.08 * sc, -1.24 * sc), 0x38bdf8));
  }
  return merged(parts);
}

/** 现代主战坦克精细 3D 旋转炮塔（低矮斜楔装甲炮塔 + 尾舱弹药架 + 炮盾 + 抽烟筒/制退器主炮 + 烟幕弹发射器 + 车长周视镜与遥控机枪 + 双天线） */
export function tankTurretGeometry(tier: 1 | 2 | 3 | 4, r: number, twin = false, ally = false): Part {
  const pals = ally ? ALLY_TANK_PALETTES : TANK_PALETTES;
  const pal = pals[Math.min(3, Math.max(0, tier - 1))];
  const sc = r / 1.5;
  const parts: Part[] = [];

  // 炮塔座圈
  parts.push(paint(at(new THREE.CylinderGeometry(0.86 * sc, 0.92 * sc, 0.14 * sc, 14), 0, 0.06 * sc, -0.04 * sc), 0x20252c));

  // 多边形斜楔主装甲炮塔轮廓（俯视六边形挤出 + 顶盖倒角）
  const turretPlan = new THREE.Shape();
  turretPlan.moveTo(-0.56 * sc, 0.86 * sc); // 前左脸
  turretPlan.lineTo(0.56 * sc, 0.86 * sc); // 前右脸
  turretPlan.lineTo(0.92 * sc, 0.24 * sc); // 右颊外扩
  turretPlan.lineTo(0.84 * sc, -0.82 * sc); // 右侧装甲
  turretPlan.lineTo(0.64 * sc, -1.22 * sc); // 尾舱右角
  turretPlan.lineTo(-0.64 * sc, -1.22 * sc); // 尾舱左角
  turretPlan.lineTo(-0.84 * sc, -0.82 * sc); // 左侧装甲
  turretPlan.lineTo(-0.92 * sc, 0.24 * sc); // 左颊外扩
  turretPlan.closePath();
  const turretBody = new THREE.ExtrudeGeometry(turretPlan, { depth: 0.46 * sc, bevelEnabled: true, bevelThickness: 0.08 * sc, bevelSize: 0.09 * sc, bevelSegments: 2 });
  turretBody.rotateX(Math.PI / 2); // Shape XY -> XZ 平面，+Y 映射为 +Z（炮口方向）
  turretBody.translate(0, 0.56 * sc, 0);
  parts.push(paint(turretBody, pal.hull));

  // 炮塔顶部装甲识别条与泄压板
  parts.push(paint(at(new THREE.BoxGeometry(1.1 * sc, 0.08 * sc, 0.72 * sc), 0, 0.66 * sc, -0.58 * sc), pal.armor));
  parts.push(paint(at(new THREE.BoxGeometry(0.94 * sc, 0.05 * sc, 0.22 * sc), 0, 0.67 * sc, 0.18 * sc), pal.accent));

  // 炮塔尾舱储物筐（金属栏杆框 + 弹药箱）
  parts.push(paint(at(new THREE.BoxGeometry(1.24 * sc, 0.28 * sc, 0.34 * sc), 0, 0.44 * sc, -1.36 * sc), 0x2a3038));
  parts.push(paint(at(new THREE.BoxGeometry(1.32 * sc, 0.05 * sc, 0.4 * sc), 0, 0.6 * sc, -1.36 * sc), pal.trim));

  // 两侧 3 联装烟幕弹发射器 + 侧挂工具箱
  for (const s of [-1, 1]) {
    parts.push(paint(at(new THREE.BoxGeometry(0.14 * sc, 0.26 * sc, 0.76 * sc), s * 0.92 * sc, 0.38 * sc, -0.35 * sc), pal.armor));
    for (let k = 0; k < 3; k++) {
      parts.push(
        paint(
          at(
            new THREE.CylinderGeometry(0.045 * sc, 0.045 * sc, 0.24 * sc, 6),
            s * (0.76 + k * 0.07) * sc,
            0.46 * sc,
            (0.46 - k * 0.14) * sc,
            0.65,
            s * 0.45,
            0,
          ),
          0x20242b,
        ),
      );
    }
  }

  // 重型防盾（炮耳与主炮基座）
  parts.push(paint(at(new THREE.BoxGeometry(twin ? 0.92 * sc : 0.62 * sc, 0.38 * sc, 0.38 * sc), 0, 0.36 * sc, 0.88 * sc), pal.armor));

  // 车长观察塔舱盖 + 炮长周视热成像仪（CITV） + 顶置遥控机枪
  parts.push(paint(at(new THREE.CylinderGeometry(0.28 * sc, 0.32 * sc, 0.16 * sc, 10), -0.36 * sc, 0.7 * sc, -0.22 * sc), pal.armor));
  parts.push(paint(at(new THREE.CylinderGeometry(0.14 * sc, 0.16 * sc, 0.22 * sc, 8), 0.36 * sc, 0.74 * sc, 0.04 * sc), 0x262c34));
  parts.push(paint(at(new THREE.BoxGeometry(0.16 * sc, 0.1 * sc, 0.12 * sc), 0.36 * sc, 0.78 * sc, 0.14 * sc), ally ? 0x38bdf8 : 0xf59e0b));
  // 车长顶置机枪
  parts.push(paint(at(new THREE.BoxGeometry(0.12 * sc, 0.14 * sc, 0.42 * sc), -0.36 * sc, 0.86 * sc, -0.14 * sc), 0x1e2228));
  parts.push(paint(at(new THREE.CylinderGeometry(0.03 * sc, 0.035 * sc, 0.68 * sc, 6), -0.36 * sc, 0.88 * sc, 0.32 * sc, Math.PI / 2), 0x14171c));

  // 双鞭状战术无线电天线
  for (const sx of [-0.56, 0.56]) {
    parts.push(paint(at(new THREE.CylinderGeometry(0.018 * sc, 0.03 * sc, 1.05 * sc, 5), sx * sc, 1.12 * sc, -0.96 * sc, -0.12), ally ? 0x38bdf8 : 0x1e2228));
  }

  // 主炮管（单管或天启双管）：加粗根部护套 + 中段抽烟筒 + 热护套 + 制退器
  const xs = twin ? [-0.26 * sc, 0.26 * sc] : [0];
  for (const bx of xs) {
    // 炮根护套
    parts.push(paint(at(new THREE.CylinderGeometry(0.16 * sc, 0.19 * sc, 0.62 * sc, 10), bx, 0.36 * sc, 1.12 * sc, Math.PI / 2), pal.armor));
    // 长身管主炮
    parts.push(paint(at(new THREE.CylinderGeometry(0.105 * sc, 0.135 * sc, 1.85 * sc, 12), bx, 0.36 * sc, 1.72 * sc, Math.PI / 2), pal.barrel));
    // 中段圆柱抽烟筒（Fume Extractor）
    parts.push(paint(at(new THREE.CylinderGeometry(0.165 * sc, 0.165 * sc, 0.44 * sc, 12), bx, 0.36 * sc, 1.66 * sc, Math.PI / 2), pal.trim));
    // 警示识别环 + 炮口制退器
    parts.push(paint(at(new THREE.CylinderGeometry(0.135 * sc, 0.135 * sc, 0.1 * sc, 10), bx, 0.36 * sc, 2.32 * sc, Math.PI / 2), pal.accent));
    parts.push(paint(at(new THREE.BoxGeometry(0.28 * sc, 0.22 * sc, 0.34 * sc), bx, 0.36 * sc, 2.66 * sc), 0x1c1f25));
  }
  return merged(parts);
}

/** 工业重型爆裂危化红油桶：压筋桶身 + 上下卷边 + 危险警示环 + 顶注口阀 + 脉冲引信灯 */
export function bombBarrelGeometry(r: number): Part {
  const h = r * 2.02;
  const parts: Part[] = [
    paint(at(new THREE.CylinderGeometry(r * 0.78, r * 0.8, h, 18), 0, h / 2, 0), 0xc82323),
    // 顶底加固卷边
    paint(at(new THREE.TorusGeometry(r * 0.79, r * 0.055, 8, 18), 0, h * 0.96, 0, Math.PI / 2), 0x262930),
    paint(at(new THREE.TorusGeometry(r * 0.81, r * 0.055, 8, 18), 0, h * 0.04, 0, Math.PI / 2), 0x262930),
    // 双压筋滚动加强环
    paint(at(new THREE.TorusGeometry(r * 0.82, r * 0.045, 8, 18), 0, h * 0.32, 0, Math.PI / 2), 0x22252b),
    paint(at(new THREE.TorusGeometry(r * 0.82, r * 0.045, 8, 18), 0, h * 0.68, 0, Math.PI / 2), 0x22252b),
    // 居中警示黄带
    paint(at(new THREE.CylinderGeometry(r * 0.81, r * 0.81, h * 0.2, 18), 0, h * 0.5, 0), 0xdfa919),
    // 顶盖暗凹面 + 注油塞 + 电子引信座与预警灯
    paint(at(new THREE.CylinderGeometry(r * 0.72, r * 0.72, r * 0.06, 16), 0, h * 0.98, 0), 0x3b1717),
    paint(at(new THREE.CylinderGeometry(r * 0.1, r * 0.1, r * 0.12, 8), r * 0.34, h + r * 0.04, r * 0.18), 0x737b86),
    paint(at(new THREE.CylinderGeometry(r * 0.24, r * 0.28, r * 0.14, 10), 0, h + r * 0.06, 0), 0x1e2228),
    paint(at(new THREE.SphereGeometry(r * 0.18, 10, 8), 0, h + r * 0.18, 0), 0xfbbf24),
  ];
  return merged(parts);
}

/** 战术四旋翼涵道攻击无人机（机身装甲 + 前置光电球头 + 4 碳纤维臂 + 涵道旋翼环 + 翼下双微型导弹挂架） */
export function droneGeometry(scale = 1): Part {
  const s = scale;
  const parts: Part[] = [
    // 流线型碳蓝装甲机身与顶部 GPS 导航盖
    paint(at(new THREE.OctahedronGeometry(0.28 * s, 1), 0, 0.02 * s, 0, 0, 0, 0, 1.32, 0.52, 1.55), 0x1e3a8a),
    paint(at(new THREE.BoxGeometry(0.42 * s, 0.12 * s, 0.56 * s), 0, 0.07 * s, 0.02 * s), 0x2563eb),
    paint(at(new THREE.CylinderGeometry(0.11 * s, 0.13 * s, 0.06 * s, 10), 0, 0.16 * s, 0.06 * s), 0x94a3b8),
    // 前置光电侦察云台球头 + 镜头
    paint(at(new THREE.SphereGeometry(0.11 * s, 10, 8), 0, -0.07 * s, -0.34 * s), 0x0f172a),
    paint(at(new THREE.CylinderGeometry(0.055 * s, 0.055 * s, 0.06 * s, 8), 0, -0.07 * s, -0.43 * s, Math.PI / 2), 0x38bdf8),
    // 机腹双微型追踪弹发射管
    paint(at(new THREE.CylinderGeometry(0.045 * s, 0.045 * s, 0.34 * s, 8), -0.15 * s, -0.11 * s, -0.02 * s, Math.PI / 2), 0x334155),
    paint(at(new THREE.CylinderGeometry(0.045 * s, 0.045 * s, 0.34 * s, 8), 0.15 * s, -0.11 * s, -0.02 * s, Math.PI / 2), 0x334155),
    paint(at(new THREE.ConeGeometry(0.045 * s, 0.1 * s, 8), -0.15 * s, -0.11 * s, -0.24 * s, -Math.PI / 2), 0xf97316),
    paint(at(new THREE.ConeGeometry(0.045 * s, 0.1 * s, 8), 0.15 * s, -0.11 * s, -0.24 * s, -Math.PI / 2), 0xf97316),
  ];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const rx = sx * 0.42 * s;
      const rz = sz * 0.38 * s;
      // 碳纤维斜撑臂
      parts.push(paint(at(new THREE.BoxGeometry(0.5 * s, 0.05 * s, 0.07 * s), sx * 0.24 * s, 0.04 * s, sz * 0.2 * s, 0, sx * sz * 0.72), 0x1e293b));
      // 涵道风筒外壳 + 高亮识别边 + 电机轴心 + 十字桨叶
      parts.push(paint(at(new THREE.CylinderGeometry(0.18 * s, 0.17 * s, 0.08 * s, 14, 1, true), rx, 0.08 * s, rz), 0x334155));
      parts.push(paint(at(new THREE.TorusGeometry(0.18 * s, 0.024 * s, 6, 14), rx, 0.12 * s, rz, Math.PI / 2), 0x38bdf8));
      parts.push(paint(at(new THREE.CylinderGeometry(0.045 * s, 0.045 * s, 0.1 * s, 8), rx, 0.08 * s, rz), 0x94a3b8));
      parts.push(paint(at(new THREE.BoxGeometry(0.28 * s, 0.015 * s, 0.04 * s), rx, 0.1 * s, rz, 0, 0.4), 0x64748b));
      parts.push(paint(at(new THREE.BoxGeometry(0.04 * s, 0.015 * s, 0.28 * s), rx, 0.1 * s, rz, 0, 0.4), 0x64748b));
    }
  }
  return merged(parts);
}

/** 多重弹道 3D 浮空图标：三联扇形光束炮管 + 紫金分束核心 */
export function multishotGeometry(): Part {
  const parts: Part[] = [
    paint(at(new THREE.OctahedronGeometry(0.28, 1), 0, 0, -0.1), 0x9333ea),
    paint(at(new THREE.TorusGeometry(0.38, 0.05, 8, 18), 0, 0, -0.05), 0xeab308),
  ];
  for (const ang of [-0.42, 0, 0.42]) {
    const bx = Math.sin(ang) * 0.34;
    const bz = Math.cos(ang) * 0.34;
    parts.push(paint(at(new THREE.CylinderGeometry(0.075, 0.095, 0.68, 10), bx, 0.04, bz, Math.PI / 2, ang), 0xc084fc));
    parts.push(paint(at(new THREE.ConeGeometry(0.11, 0.22, 10), bx * 1.85, 0.04, bz * 1.85, Math.PI / 2, ang), 0xfde047));
  }
  return merged(parts);
}

/** 超级弹药 3D 浮空核心（1 穿甲金矛 · 2 爆裂烈焰弹头 · 3 电磁雷暴球） */
export function ammoCoreGeometry(level: number): Part {
  const parts: Part[] = [];
  if (level >= 3) {
    parts.push(paint(at(new THREE.IcosahedronGeometry(0.32, 1), 0, 0.06, 0), 0x0284c7));
    parts.push(paint(at(new THREE.TorusGeometry(0.48, 0.048, 8, 18), 0, 0.06, 0, 0.65, 0.3), 0x9333ea));
    parts.push(paint(at(new THREE.TorusGeometry(0.48, 0.048, 8, 18), 0, 0.06, 0, -0.65, -0.3), 0x38bdf8));
  } else if (level === 2) {
    parts.push(paint(at(new THREE.CylinderGeometry(0.22, 0.24, 0.62, 12), 0, 0, 0, 0.3, 0, -0.3), 0xc2410c));
    parts.push(paint(at(new THREE.ConeGeometry(0.22, 0.38, 12), 0.14, 0.44, 0.14, 0.3, 0, -0.3), 0xfbbf24));
    parts.push(paint(at(new THREE.TorusGeometry(0.34, 0.05, 6, 14), 0, 0.05, 0, Math.PI / 2), 0xdc2626));
  } else {
    for (const sx of [-0.24, 0, 0.24]) {
      parts.push(paint(at(new THREE.CylinderGeometry(0.085, 0.1, 0.56, 10), sx, 0, 0), 0xd97706));
      parts.push(paint(at(new THREE.ConeGeometry(0.09, 0.28, 10), sx, 0.4, 0), 0xfef3c7));
    }
  }
  return merged(parts);
}

/** 火力倍增 3D 浮空图标：炽烈熔火水晶 + 双能量增幅环 */
export function damageCoreGeometry(): Part {
  const parts: Part[] = [
    paint(at(new THREE.OctahedronGeometry(0.36, 0), 0, 0.08, 0, 0, 0, 0, 0.9, 1.45, 0.9), 0xea580c),
    paint(at(new THREE.OctahedronGeometry(0.24, 0), 0, 0.08, 0, 0, Math.PI / 4, 0, 1.15, 0.9, 1.15), 0xeab308),
    paint(at(new THREE.TorusGeometry(0.46, 0.048, 6, 16), 0, 0.08, 0, 0.5, 0.4), 0xf97316),
  ];
  return merged(parts);
}

/** 小队护盾 3D 浮空图标：六角能量盾牌 + 发光晶核 */
export function shieldCoreGeometry(): Part {
  const parts: Part[] = [
    paint(at(new THREE.CylinderGeometry(0.46, 0.38, 0.16, 6), 0, 0.06, 0, Math.PI / 2), 0x0891b2),
    paint(at(new THREE.CylinderGeometry(0.32, 0.26, 0.22, 6), 0, 0.06, 0, Math.PI / 2), 0x38bdf8),
    paint(at(new THREE.OctahedronGeometry(0.18, 0), 0, 0.06, 0.14), 0xe0f2fe),
  ];
  return merged(parts);
}

/** 极速射速 3D 浮空图标：立体闪电增压核 */
export function rateBoltGeometry(): Part {
  const parts: Part[] = [
    paint(at(new THREE.BoxGeometry(0.22, 0.56, 0.16), 0.1, 0.26, 0, 0, 0, -0.45), 0xeab308),
    paint(at(new THREE.BoxGeometry(0.22, 0.56, 0.16), -0.08, -0.18, 0, 0, 0, -0.45), 0x0ea5e9),
    paint(at(new THREE.TorusGeometry(0.42, 0.042, 6, 14), 0, 0.05, 0), 0x38bdf8),
  ];
  return merged(parts);
}

/** 隐身超音速空袭战机 3D 模型（F-22/J-20 风格：菱形主翼 + 侧进气道 + 气泡座舱 + 外倾双垂尾 + 翼下挂弹 + 矢量双尾喷） */
export function jetGeometry(): Part {
  const parts: Part[] = [];

  // 扁平隐身机身中段 + 锐利雷达罩机头
  parts.push(paint(at(new THREE.BoxGeometry(0.74, 0.32, 2.9), 0, 0, 0.05), 0x334155));
  parts.push(paint(at(new THREE.ConeGeometry(0.34, 1.55, 6), 0, -0.01, -2.15, -Math.PI / 2, Math.PI / 6), 0x475569));
  // 两侧斜切 DSI 进气道
  for (const s of [-1, 1]) {
    parts.push(paint(at(new THREE.BoxGeometry(0.26, 0.24, 1.55), s * 0.44, -0.04, -0.2), 0x263140));
    parts.push(paint(at(new THREE.BoxGeometry(0.2, 0.18, 0.08), s * 0.44, -0.04, -1.0), 0x0f172a));
  }

  // 金色反光镀膜气泡驾驶舱 + 座舱框架
  parts.push(paint(at(new THREE.SphereGeometry(0.25, 12, 8), 0, 0.18, -0.82, 0, 0, 0, 0.85, 0.65, 2.45), 0x38bdf8));
  parts.push(paint(at(new THREE.TorusGeometry(0.22, 0.025, 6, 12, Math.PI), 0, 0.16, -0.68), 0x1e293b));

  // 后掠菱形隐身三角主翼（ExtrudeGeometry 真实翼型）
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, -0.85);
  wingShape.lineTo(2.45, 0.72);
  wingShape.lineTo(2.45, 1.1);
  wingShape.lineTo(0.45, 1.15);
  wingShape.lineTo(-0.45, 1.15);
  wingShape.lineTo(-2.45, 1.1);
  wingShape.lineTo(-2.45, 0.72);
  wingShape.closePath();
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1 });
  wingGeo.rotateX(Math.PI / 2);
  wingGeo.translate(0, 0.02, 0.12);
  parts.push(paint(wingGeo, 0x3f4c5e));

  // 后掠平尾
  const tailShape = new THREE.Shape();
  tailShape.moveTo(0, 0);
  tailShape.lineTo(1.22, 0.56);
  tailShape.lineTo(1.22, 0.88);
  tailShape.lineTo(0.28, 0.92);
  tailShape.lineTo(-0.28, 0.92);
  tailShape.lineTo(-1.22, 0.88);
  tailShape.lineTo(-1.22, 0.56);
  tailShape.closePath();
  const tailGeo = new THREE.ExtrudeGeometry(tailShape, { depth: 0.06, bevelEnabled: false });
  tailGeo.rotateX(Math.PI / 2);
  tailGeo.translate(0, 0.01, 1.05);
  parts.push(paint(tailGeo, 0x2d3848));

  // 外倾双垂尾（梯形后掠）
  for (const s of [-1, 1]) {
    const fin = new THREE.Shape();
    fin.moveTo(0, 0);
    fin.lineTo(0.78, 0);
    fin.lineTo(0.55, 0.82);
    fin.lineTo(0.18, 0.82);
    fin.closePath();
    const finGeo = new THREE.ExtrudeGeometry(fin, { depth: 0.05, bevelEnabled: false });
    finGeo.rotateY(Math.PI / 2);
    finGeo.rotateZ(-s * 0.34);
    finGeo.translate(s * 0.46, 0.12, 1.62);
    parts.push(paint(finGeo, 0x1e293b));

    // 机翼警示战术标识条 + 翼下双空地导弹挂架
    parts.push(paint(at(new THREE.BoxGeometry(0.7, 0.11, 0.14), s * 1.45, 0.02, 0.72, 0, -s * 0.55), 0xea580c));
    parts.push(paint(at(new THREE.CylinderGeometry(0.055, 0.055, 0.95, 8), s * 1.15, -0.14, 0.48, Math.PI / 2), 0x94a3b8));
    parts.push(paint(at(new THREE.ConeGeometry(0.055, 0.2, 8), s * 1.15, -0.14, -0.08, -Math.PI / 2), 0xdc2626));
  }

  // 双矩形矢量发动机尾喷口 + 加力火焰锥
  for (const sx of [-0.26, 0.26]) {
    parts.push(paint(at(new THREE.BoxGeometry(0.32, 0.24, 0.48), sx, -0.02, 1.72), 0x161d29));
    parts.push(paint(at(new THREE.ConeGeometry(0.12, 0.68, 8), sx, -0.02, 2.25, Math.PI / 2), 0xf59e0b));
  }
  return merged(parts);
}

/** 泰坦重装机甲精细躯干（多层斜切装甲驾驶舱 + 护眉目镜 + 双肩 6 联装导弹巢 + 液压腰转盘 + 双矢量推进背包，面朝 -z） */
export function mechTorsoGeometry(): Part {
  const parts: Part[] = [
    // 重型装甲骨盆与前后护裆甲 + 腰部液压转盘
    paint(at(new THREE.BoxGeometry(0.84, 0.32, 0.68), 0, 1.12, 0), 0x1e293b),
    paint(at(new THREE.BoxGeometry(0.34, 0.44, 0.3), 0, 1.04, -0.34, 0.18), 0x1e3a8a),
    paint(at(new THREE.CylinderGeometry(0.36, 0.42, 0.24, 12), 0, 1.32, 0), 0x334155),
    // 主胸装甲壳 + 斜置前胸复合装甲板
    paint(at(new THREE.BoxGeometry(1.18, 0.88, 0.9), 0, 1.8, -0.02), 0x1d4ed8),
    paint(at(new THREE.BoxGeometry(1.04, 0.62, 0.34), 0, 1.84, -0.46, 0.24), 0x1e3a8a),
    paint(at(new THREE.BoxGeometry(0.76, 0.44, 0.18), 0, 1.88, -0.62, 0.24), 0x0f172a),
    // 胸口金边战术徽记 + 能量核心
    paint(at(new THREE.OctahedronGeometry(0.18, 0), 0, 1.88, -0.71, 0, Math.PI / 4, 0, 1.1, 1.1, 0.35), 0xeab308),
    paint(at(new THREE.CylinderGeometry(0.08, 0.08, 0.08, 8), 0, 1.88, -0.74, Math.PI / 2), 0x38bdf8),
    // 胸侧进气格栅
    paint(at(new THREE.BoxGeometry(0.16, 0.32, 0.16), -0.44, 1.72, -0.52, 0.2), 0x1e293b),
    paint(at(new THREE.BoxGeometry(0.16, 0.32, 0.16), 0.44, 1.72, -0.52, 0.2), 0x1e293b),
    // 装甲颈环 + 倾斜重装头盔 + 发光战术目镜 + 额顶传感器
    paint(at(new THREE.CylinderGeometry(0.28, 0.34, 0.16, 10), 0, 2.26, -0.04), 0x1e293b),
    paint(at(new THREE.BoxGeometry(0.56, 0.36, 0.6), 0, 2.46, -0.06), 0x334155),
    paint(at(new THREE.BoxGeometry(0.62, 0.12, 0.64), 0, 2.6, -0.08, 0.1), 0x1d4ed8),
    paint(at(new THREE.BoxGeometry(0.46, 0.12, 0.12), 0, 2.46, -0.36), 0x38bdf8),
    // 头侧通讯天线与顶部雷达
    paint(at(new THREE.CylinderGeometry(0.02, 0.032, 0.72, 6), 0.3, 2.86, 0.08, -0.14), 0x94a3b8),
    paint(at(new THREE.CylinderGeometry(0.018, 0.025, 0.5, 6), -0.28, 2.76, 0.08, -0.1), 0x94a3b8),
    // 背部重型跳帮推进背包 + 散热鳍片 + 双矢量喷口
    paint(at(new THREE.BoxGeometry(0.92, 0.78, 0.46), 0, 1.86, 0.6), 0x1e293b),
    paint(at(new THREE.BoxGeometry(0.76, 0.12, 0.52), 0, 2.28, 0.62), 0x334155),
    paint(at(new THREE.CylinderGeometry(0.16, 0.22, 0.34, 10), -0.26, 1.38, 0.68, 0.18), 0x475569),
    paint(at(new THREE.CylinderGeometry(0.16, 0.22, 0.34, 10), 0.26, 1.38, 0.68, 0.18), 0x475569),
    paint(at(new THREE.CylinderGeometry(0.11, 0.14, 0.1, 8), -0.26, 1.22, 0.72, 0.18), 0x38bdf8),
    paint(at(new THREE.CylinderGeometry(0.11, 0.14, 0.1, 8), 0.26, 1.22, 0.72, 0.18), 0x38bdf8),
  ];

  // 双肩分层重型护肩甲 + 6 联装追踪导弹发射巢（带独立红橙弹头）
  for (const s of [-1, 1]) {
    parts.push(paint(at(new THREE.BoxGeometry(0.46, 0.48, 0.78), s * 0.8, 2.08, -0.02, 0, 0, -s * 0.22), 0x2563eb));
    parts.push(paint(at(new THREE.BoxGeometry(0.12, 0.44, 0.66), s * 1.02, 2.04, -0.02, 0, 0, -s * 0.22), 0xeab308));
    parts.push(paint(at(new THREE.BoxGeometry(0.42, 0.36, 0.58), s * 0.72, 2.48, 0.08), 0x283242));
    parts.push(paint(at(new THREE.BoxGeometry(0.46, 0.06, 0.62), s * 0.72, 2.67, 0.08), 0x475569));
    for (const mx of [-0.11, 0, 0.11]) {
      for (const my of [-0.08, 0.08]) {
        parts.push(paint(at(new THREE.CylinderGeometry(0.038, 0.038, 0.16, 6), s * 0.72 + mx, 2.48 + my, -0.2, Math.PI / 2), 0xea580c));
      }
    }
  }
  return merged(parts);
}

/** 泰坦机甲精细单腿（装甲大腿 + 外露液压缸 + 膝盖装甲盾 + 小腿护胫 + 三趾重型着陆脚爪，枢轴在 y=0 髋部） */
export function mechLegGeometry(): Part {
  return merged([
    // 髋关节球承与大腿装甲
    paint(at(new THREE.CylinderGeometry(0.16, 0.16, 0.34, 10), 0, -0.04, 0, 0, 0, Math.PI / 2), 0x1e293b),
    paint(at(new THREE.BoxGeometry(0.34, 0.52, 0.38), 0, -0.28, -0.05, 0.16), 0x334155),
    paint(at(new THREE.BoxGeometry(0.26, 0.42, 0.1), 0, -0.26, -0.25, 0.16), 0x1d4ed8),
    // 后部银色液压推杆
    paint(at(new THREE.CylinderGeometry(0.045, 0.045, 0.52, 8), 0, -0.34, 0.16, -0.15), 0x94a3b8),
    // 膝关节旋转鼓与前护膝盾
    paint(at(new THREE.CylinderGeometry(0.17, 0.17, 0.38, 10), 0, -0.56, -0.09, 0, 0, Math.PI / 2), 0xeab308),
    paint(at(new THREE.BoxGeometry(0.32, 0.26, 0.16), 0, -0.56, -0.26, -0.12), 0x0f172a),
    // 小腿反关节重型护胫
    paint(at(new THREE.BoxGeometry(0.3, 0.52, 0.34), 0, -0.84, 0.04, -0.12), 0x1d4ed8),
    paint(at(new THREE.BoxGeometry(0.34, 0.38, 0.16), 0, -0.86, -0.12, -0.12), 0x2563eb),
    // 踝关节与三趾重型稳定爪（前双趾 + 后踵刺）
    paint(at(new THREE.BoxGeometry(0.38, 0.14, 0.42), 0, -1.07, -0.02), 0x0f172a),
    paint(at(new THREE.BoxGeometry(0.16, 0.12, 0.34), -0.14, -1.1, -0.3, 0.08), 0x1e293b),
    paint(at(new THREE.BoxGeometry(0.16, 0.12, 0.34), 0.14, -1.1, -0.3, 0.08), 0x1e293b),
    paint(at(new THREE.BoxGeometry(0.22, 0.12, 0.28), 0, -1.1, 0.26, -0.08), 0x1e293b),
  ]);
}

/** 泰坦机甲重型 6 管旋转加特林机炮臂（装甲肩关节 + 供弹鼓 + 炮匣 + 6 联装炮管 + 双散热箍环，炮口朝 -z） */
export function mechArmGeometry(): Part {
  const parts: Part[] = [
    // 肩关节云台与上臂
    paint(at(new THREE.CylinderGeometry(0.15, 0.15, 0.28, 10), 0, 0, 0, 0, 0, Math.PI / 2), 0x1e293b),
    paint(at(new THREE.BoxGeometry(0.26, 0.42, 0.32), 0, -0.2, 0), 0x334155),
    // 机炮主匣 + 侧面供弹箱 + 蓝色装甲护罩
    paint(at(new THREE.BoxGeometry(0.34, 0.32, 0.78), 0, -0.44, -0.34), 0x1e293b),
    paint(at(new THREE.BoxGeometry(0.38, 0.18, 0.56), 0, -0.32, -0.36), 0x1d4ed8),
    paint(at(new THREE.CylinderGeometry(0.14, 0.14, 0.28, 10), 0, -0.62, -0.32, 0, 0, Math.PI / 2), 0x475569),
    // 旋转转盘与双炮管固定箍环
    paint(at(new THREE.CylinderGeometry(0.15, 0.15, 0.14, 12), 0, -0.44, -0.78, Math.PI / 2), 0xeab308),
    paint(at(new THREE.CylinderGeometry(0.135, 0.135, 0.08, 12), 0, -0.44, -1.24, Math.PI / 2), 0x334155),
    paint(at(new THREE.CylinderGeometry(0.145, 0.145, 0.1, 12), 0, -0.44, -1.62, Math.PI / 2), 0x1e293b),
  ];
  // 6 根高密度旋转机炮管
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    parts.push(paint(at(new THREE.CylinderGeometry(0.028, 0.028, 1.02, 6), Math.cos(a) * 0.082, -0.44 + Math.sin(a) * 0.082, -1.25, Math.PI / 2), 0x94a3b8));
  }
  return merged(parts);
}

/** 液氮急冻桶（冰蓝高压液氮罐 + 金属防撞箍环 + 顶部压力表阀 + 凝霜冰晶） */
export function cryoBarrelGeometry(r: number): Part {
  const rad = r * 0.78;
  const h = r * 1.95;
  const parts: Part[] = [
    paint(at(new THREE.CylinderGeometry(rad, rad * 1.02, h, 16), 0, h * 0.5, 0), 0x0284c7),
    paint(at(new THREE.CylinderGeometry(rad * 1.05, rad * 1.05, h * 0.16, 16), 0, h * 0.5, 0), 0xbae6fd),
    paint(at(new THREE.CylinderGeometry(rad * 1.08, rad * 1.08, 0.09, 16), 0, h * 0.16, 0), 0x334155),
    paint(at(new THREE.CylinderGeometry(rad * 1.08, rad * 1.08, 0.09, 16), 0, h * 0.84, 0), 0x334155),
    paint(at(new THREE.CylinderGeometry(rad * 0.94, rad * 1.04, 0.14, 16), 0, h + 0.05, 0), 0x475569),
    // 顶部液氮阀门与转轮
    paint(at(new THREE.CylinderGeometry(rad * 0.18, rad * 0.22, 0.22, 8), 0, h + 0.18, 0), 0x94a3b8),
    paint(at(new THREE.TorusGeometry(rad * 0.34, 0.045, 6, 12), 0, h + 0.3, 0, Math.PI / 2), 0x38bdf8),
  ];
  // 罐身周围六角霜晶装饰
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    parts.push(
      paint(
        at(new THREE.OctahedronGeometry(rad * 0.2, 0), Math.cos(a) * rad * 0.96, h * (0.34 + (i % 2) * 0.32), Math.sin(a) * rad * 0.96, 0.4, a),
        0x7dd3fc,
      ),
    );
  }
  return merged(parts);
}

/** 黄金神秘盲盒（紫金镶边宝箱 + 八角黄金防撞护角 + 顶部皇冠锁扣 + 紫水晶核心面板） */
export function mysteryBoxGeometry(r: number): Part {
  const s = r * 1.56;
  const parts: Part[] = [
    paint(at(new THREE.BoxGeometry(s, s * 0.96, s), 0, s * 0.5, 0), 0x581c87),
    paint(at(new THREE.BoxGeometry(s * 1.06, s * 0.16, s * 1.06), 0, s * 0.98, 0), 0x7e22ce),
    // 四面发光紫晶面板
    paint(at(new THREE.BoxGeometry(s * 0.66, s * 0.52, s * 1.04), 0, s * 0.5, 0), 0xa855f7),
    paint(at(new THREE.BoxGeometry(s * 1.04, s * 0.52, s * 0.66), 0, s * 0.5, 0), 0xa855f7),
    // 顶部黄金卡扣与钻晶徽记
    paint(at(new THREE.BoxGeometry(s * 0.38, s * 0.12, s * 0.38), 0, s * 1.09, 0), 0xeab308),
    paint(at(new THREE.OctahedronGeometry(s * 0.16, 0), 0, s * 1.24, 0), 0xfef08a),
  ];
  // 黄金包边与八角护角
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push(paint(at(new THREE.BoxGeometry(s * 0.15, s * 1.06, s * 0.15), sx * s * 0.48, s * 0.52, sz * s * 0.48), 0xd97706));
      for (const y of [s * 0.08, s * 0.96]) {
        parts.push(paint(at(new THREE.BoxGeometry(s * 0.2, s * 0.14, s * 0.2), sx * s * 0.48, y, sz * s * 0.48), 0xfacc15));
      }
    }
  }
  return merged(parts);
}

/** 传奇英雄营救舱（科幻重装防弹休眠舱 + 透明蓝光视窗 + 装甲肋条 + 顶灯） */
export function heroPodGeometry(r: number, accent: number): Part {
  const rad = r * 0.86;
  const h = r * 2.1;
  const parts: Part[] = [
    paint(at(new THREE.CylinderGeometry(rad * 1.08, rad * 1.15, 0.22, 8), 0, 0.11, 0), 0x1e293b),
    paint(at(new THREE.CylinderGeometry(rad * 0.9, rad * 0.96, h * 0.78, 8), 0, h * 0.48, 0), 0x334155),
    paint(at(new THREE.CylinderGeometry(rad * 0.96, rad * 0.72, 0.28, 8), 0, h * 0.94, 0), 0x1e293b),
    // 前部发光营救视窗
    paint(at(new THREE.BoxGeometry(rad * 0.92, h * 0.56, rad * 0.4), 0, h * 0.5, rad * 0.78), accent),
    // 顶部求救灯塔
    paint(at(new THREE.CylinderGeometry(rad * 0.26, rad * 0.34, 0.2, 8), 0, h + 0.1, 0), accent),
  ];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    parts.push(paint(at(new THREE.BoxGeometry(0.14, h * 0.82, 0.16), Math.cos(a) * rad * 0.96, h * 0.5, Math.sin(a) * rad * 0.96, 0, -a), 0xeab308));
  }
  return merged(parts);
}

/** 黄金武装军火补给车（斜置黄金装甲车头 + 防弹风挡 + 前防撞钢梁 + 6 轮重型越野胎 + 满载金条与宝石箱的货斗，车头朝 +z 向玩家疾驰） */
export function lootTruckGeometry(r: number): Part {
  const s = r * 0.72;
  const parts: Part[] = [
    // 重型装甲底盘
    paint(at(new THREE.BoxGeometry(1.78 * s, 0.34 * s, 3.35 * s), 0, 0.44 * s, 0), 0x1e293b),
    // 前防撞重型保险杠与双雾灯
    paint(at(new THREE.BoxGeometry(1.94 * s, 0.32 * s, 0.28 * s), 0, 0.48 * s, 1.72 * s), 0x334155),
    paint(at(new THREE.BoxGeometry(0.32 * s, 0.16 * s, 0.1 * s), -0.62 * s, 0.62 * s, 1.82 * s), 0xfef08a),
    paint(at(new THREE.BoxGeometry(0.32 * s, 0.16 * s, 0.1 * s), 0.62 * s, 0.62 * s, 1.82 * s), 0xfef08a),
    // 黄金装甲引擎盖 + 驾驶舱
    paint(at(new THREE.BoxGeometry(1.68 * s, 0.62 * s, 1.05 * s), 0, 0.86 * s, 1.12 * s), 0xd97706),
    paint(at(new THREE.BoxGeometry(1.62 * s, 0.92 * s, 0.96 * s), 0, 1.18 * s, 0.32 * s), 0xeab308),
    // 驾驶舱防弹斜风挡与顶灯
    paint(at(new THREE.BoxGeometry(1.36 * s, 0.44 * s, 0.16 * s), 0, 1.32 * s, 0.82 * s, -0.25), 0x38bdf8),
    paint(at(new THREE.BoxGeometry(0.92 * s, 0.14 * s, 0.2 * s), 0, 1.7 * s, 0.42 * s), 0xfef08a),
    // 后部高栏武装货斗
    paint(at(new THREE.BoxGeometry(1.74 * s, 0.56 * s, 1.66 * s), 0, 0.88 * s, -0.84 * s), 0x92400e),
    paint(at(new THREE.BoxGeometry(1.82 * s, 0.12 * s, 1.72 * s), 0, 1.18 * s, -0.84 * s), 0xfacc15),
    // 货斗内堆积的金条宝箱与钻石晶核
    paint(at(new THREE.BoxGeometry(1.32 * s, 0.52 * s, 1.26 * s), 0, 1.24 * s, -0.84 * s), 0xfacc15),
    paint(at(new THREE.OctahedronGeometry(0.34 * s, 0), 0, 1.68 * s, -0.84 * s), 0x38bdf8),
  ];
  // 6 只重型防爆越野轮 + 黄金轮毂
  for (const sx of [-1, 1]) {
    for (const sz of [-1.18, -0.15, 1.12]) {
      parts.push(paint(at(new THREE.CylinderGeometry(0.4 * s, 0.4 * s, 0.3 * s, 12), sx * 0.96 * s, 0.4 * s, sz * s, 0, 0, Math.PI / 2), 0x111827));
      parts.push(paint(at(new THREE.CylinderGeometry(0.2 * s, 0.2 * s, 0.33 * s, 8), sx * 0.96 * s, 0.4 * s, sz * s, 0, 0, Math.PI / 2), 0xfacc15));
    }
  }
  return merged(parts);
}

/** 桥面自动双管加特林炮台底座（三足重装滑橇 + 液压转台） */
export function turretBaseGeometry(): Part {
  const parts: Part[] = [
    paint(at(new THREE.CylinderGeometry(0.42, 0.54, 0.22, 8), 0, 0.16, 0), 0x1e293b),
    paint(at(new THREE.CylinderGeometry(0.28, 0.34, 0.36, 10), 0, 0.42, 0), 0x334155),
    paint(at(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 10), 0, 0.62, 0), 0x38bdf8),
  ];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    parts.push(paint(at(new THREE.BoxGeometry(0.18, 0.16, 0.68), Math.cos(a) * 0.42, 0.09, Math.sin(a) * 0.42, 0, -a + Math.PI / 2), 0x475569));
  }
  return merged(parts);
}

/** 炮台旋转机匣（光学瞄准镜 + 弹链鼓 + 蓝灰复合装甲壳，面朝 -z） */
export function turretHeadGeometry(): Part {
  return merged([
    paint(at(new THREE.BoxGeometry(0.62, 0.38, 0.72), 0, 0.84, 0.04), 0x2563eb),
    paint(at(new THREE.BoxGeometry(0.7, 0.16, 0.58), 0, 1.04, 0.06), 0x1e293b),
    paint(at(new THREE.BoxGeometry(0.24, 0.18, 0.3), 0, 1.18, -0.04), 0x0f172a),
    paint(at(new THREE.CylinderGeometry(0.065, 0.065, 0.08, 8), 0, 1.18, -0.2, Math.PI / 2), 0x38bdf8),
    paint(at(new THREE.CylinderGeometry(0.18, 0.18, 0.26, 10), 0.38, 0.8, 0.1, 0, 0, Math.PI / 2), 0xd97706),
    paint(at(new THREE.CylinderGeometry(0.18, 0.18, 0.26, 10), -0.38, 0.8, 0.1, 0, 0, Math.PI / 2), 0xd97706),
  ]);
}

/** 炮台旋转多管枪管束（枢轴在 (0, 0, 0)，朝 -z） */
export function turretBarrelGeometry(): Part {
  const parts: Part[] = [
    paint(at(new THREE.CylinderGeometry(0.13, 0.13, 0.08, 10), 0, 0, -0.36, Math.PI / 2), 0x334155),
    paint(at(new THREE.CylinderGeometry(0.13, 0.13, 0.08, 10), 0, 0, -0.78, Math.PI / 2), 0x1e293b),
  ];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    parts.push(paint(at(new THREE.CylinderGeometry(0.025, 0.025, 0.94, 6), Math.cos(a) * 0.075, Math.sin(a) * 0.075, -0.48, Math.PI / 2), 0xcbd5e1));
  }
  return merged(parts);
}

/** 传奇英雄 3D 模型（比普通士兵更高大精良，带重型护肩、战术披风/推进罐与专属超级武器，面朝 -z） */
export function heroGeometry(kind: HeroKind): Part {
  const armor = kind === 'pyro' ? 0xdc2626 : kind === 'railgun' ? 0x0284c7 : 0x1d4ed8;
  const trim = kind === 'pyro' ? 0xf97316 : kind === 'railgun' ? 0x38bdf8 : 0xfacc15;
  const dark = 0x1e293b;
  const parts: Part[] = [
    // 双腿重型战靴与护膝
    paint(at(new THREE.BoxGeometry(0.18, 0.48, 0.2), -0.13, 0.24, 0), dark),
    paint(at(new THREE.BoxGeometry(0.18, 0.48, 0.2), 0.13, 0.24, 0), dark),
    paint(at(new THREE.BoxGeometry(0.2, 0.14, 0.26), -0.13, 0.07, -0.04), armor),
    paint(at(new THREE.BoxGeometry(0.2, 0.14, 0.26), 0.13, 0.07, -0.04), armor),
    // 宽肩重装胸甲与腰带
    paint(at(new THREE.BoxGeometry(0.48, 0.56, 0.34), 0, 0.76, 0), armor),
    paint(at(new THREE.BoxGeometry(0.52, 0.1, 0.38), 0, 0.52, 0), dark),
    paint(at(new THREE.BoxGeometry(0.16, 0.12, 0.08), 0, 0.52, -0.2), trim),
    // 胸口核心徽记
    paint(at(new THREE.OctahedronGeometry(0.09, 0), 0, 0.84, -0.19), trim),
    // 霸气重装双护肩
    paint(at(new THREE.BoxGeometry(0.24, 0.26, 0.36), -0.34, 0.96, 0, 0, 0, 0.25), trim),
    paint(at(new THREE.BoxGeometry(0.24, 0.26, 0.36), 0.34, 0.96, 0, 0, 0, -0.25), trim),
    // 英雄头盔 + 发光目镜
    paint(at(new THREE.SphereGeometry(0.2, 12, 10), 0, 1.24, 0), armor),
    paint(at(new THREE.BoxGeometry(0.32, 0.1, 0.12), 0, 1.24, -0.16), trim),
    // 双臂
    paint(at(new THREE.BoxGeometry(0.14, 0.36, 0.16), -0.32, 0.72, -0.08, -0.65), dark),
    paint(at(new THREE.BoxGeometry(0.14, 0.36, 0.16), 0.32, 0.72, -0.12, -0.85), dark),
  ];

  if (kind === 'pyro') {
    // 烈焰先锋：背部双高压火焰燃料罐 + 重型喷火枪
    parts.push(paint(at(new THREE.CylinderGeometry(0.11, 0.11, 0.52, 10), -0.14, 0.82, 0.26), 0xea580c));
    parts.push(paint(at(new THREE.CylinderGeometry(0.11, 0.11, 0.52, 10), 0.14, 0.82, 0.26), 0xea580c));
    parts.push(paint(at(new THREE.BoxGeometry(0.16, 0.18, 0.95), 0.24, 0.72, -0.58), 0x334155));
    parts.push(paint(at(new THREE.CylinderGeometry(0.08, 0.11, 0.22, 8), 0.24, 0.72, -1.12, Math.PI / 2), 0xf97316));
  } else if (kind === 'railgun') {
    // 雷霆狙击：背部能量翼 + 超长电磁导轨炮
    parts.push(paint(at(new THREE.BoxGeometry(0.82, 0.08, 0.22), 0, 1.02, 0.26, 0.2), 0x38bdf8));
    parts.push(paint(at(new THREE.BoxGeometry(0.14, 0.18, 1.38), 0.24, 0.74, -0.78), 0x1e293b));
    parts.push(paint(at(new THREE.BoxGeometry(0.06, 0.06, 1.18), 0.24, 0.82, -0.9), 0x67e8f9));
  } else {
    // 战地指挥官：红金战袍披风 + 黄金官帽冠饰 + 战术指挥步枪
    parts.push(paint(at(new THREE.BoxGeometry(0.56, 0.78, 0.06), 0, 0.66, 0.24, 0.22), 0xb91c1c));
    parts.push(paint(at(new THREE.BoxGeometry(0.08, 0.18, 0.34), 0, 1.46, 0), 0xfacc15));
    parts.push(paint(at(new THREE.BoxGeometry(0.14, 0.16, 0.9), 0.24, 0.74, -0.56), 0x334155));
    parts.push(paint(at(new THREE.BoxGeometry(0.08, 0.08, 0.5), 0.24, 0.78, -0.82), 0xfacc15));
  }
  return merged(parts);
}

