import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { BOSSES, type BossKind, type SkinDef, type ZombieKind } from '../game/config';
import type { Boss } from '../game/world';
import type { LoadedModel, Models } from './assets';
import { HpBar, formatNumber } from './label';
import { bakeModel, staticGeometry, type BakedModel } from './vat';

/** 每档武器用士兵模型手里的哪把枪（和 WEAPONS 一一对应） */
const GUN_NODES = ['Pistol', 'SMG', 'AK', 'Sniper_2', 'GrenadeLauncher', 'Sniper', 'RocketLauncher'];
const ALL_GUNS = new Set(GUN_NODES);

/** 金枪、等离子炮重新上色：深色金属部分换成金色/紫色 */
const GUN_PAINT: Record<number, { dark: number; light: number }> = {
  5: { dark: 0xc9921a, light: 0xffd76a },
  6: { dark: 0x5b2bb5, light: 0xc39bff },
};

const SOLDIER_CLIPS = { run: ['Run_Shoot'], shoot: ['Idle_Shoot'], idle: ['Idle'], death: ['Death'] };
const ZOMBIE_CLIPS = { run: ['Run'], idle: ['Idle'], attack: ['Punch', 'Run_Attack'], death: ['Death'] };

/** 士兵的身高（米），和原来代码生成的小人差不多 */
export const SOLDIER_HEIGHT = 1.3;
const ZOMBIE_HEIGHT = 1.42;

function under(o: THREE.Object3D, names: Set<string>): string | null {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (names.has(p.name)) return p.name;
  return null;
}

export interface SoldierKit {
  body: BakedModel;
  guns: BakedModel[];
  /** 每把枪的枪口位置（相对脚下，z 是往前的距离） */
  muzzles: { x: number; y: number; z: number }[];
}

/** 士兵身体（按皮肤换衣服颜色）；换皮肤时只重烘这个 */
/** 衣服和裤子颜色：深色皮肤（黑金）裤子用点缀色，不然全身一片黑 */
function skinColors(skin: SkinDef): { team: THREE.Color; pants: THREE.Color } {
  const team = new THREE.Color(skin.team);
  const dark = team.getHSL({ h: 0, s: 0, l: 0 }).l < 0.2;
  return { team, pants: dark ? new THREE.Color(skin.shirt).multiplyScalar(0.8) : team.clone().multiplyScalar(0.55) };
}

export function bakeSoldierBody(model: LoadedModel, skin: SkinDef): BakedModel {
  const { team, pants } = skinColors(skin);
  return bakeModel(model.scene, model.animations, {
    clips: SOLDIER_CLIPS,
    fps: 20,
    height: SOLDIER_HEIGHT,
    yaw: Math.PI,
    include: (m) => !under(m, ALL_GUNS),
    recolor: (name) => (name === 'Character_Main' ? team : name === 'Pants' ? pants : null),
  });
}

/** 士兵：身体烘一次，每把枪单独烘，用身体同一个变换，所以正好握在手里 */
export function buildSoldier(model: LoadedModel, skin: SkinDef): SoldierKit {
  const body = bakeSoldierBody(model, skin);
  const guns: BakedModel[] = [];
  const muzzles: SoldierKit['muzzles'] = [];
  GUN_NODES.forEach((node, tier) => {
    const gun = bakeModel(model.scene, model.animations, {
      clips: SOLDIER_CLIPS,
      fps: 20,
      height: SOLDIER_HEIGHT,
      fix: body.fix,
      include: (m) => under(m, ALL_GUNS) === node,
      recolor: gunPaint(tier),
    });
    guns.push(gun);
    // 枪口：开枪那一帧里最靠前的顶点
    const pos = gun.geometry.attributes.position;
    let best = 0;
    for (let i = 1; i < pos.count; i++) if (pos.getZ(i) < pos.getZ(best)) best = i;
    muzzles.push({ x: pos.getX(best), y: pos.getY(best), z: -pos.getZ(best) });
  });
  return { body, guns, muzzles };
}

function gunPaint(tier: number): ((name: string, c: THREE.Color) => THREE.Color | null) | undefined {
  const paint = GUN_PAINT[tier];
  if (!paint) return undefined;
  return (name, c) => (c.getHSL({ h: 0, s: 0, l: 0 }).l < 0.25 || name.includes('Black') || name.includes('Grey') ? new THREE.Color(name.includes('Light') ? paint.light : paint.dark) : null);
}

/** 单独一把枪的静态几何体：最长边对齐 Z 轴、居中，总长 length 米（门上、补给上展示用） */
export function gunStatic(model: LoadedModel, tier: number, length: number): THREE.BufferGeometry | null {
  const node = model.scene.getObjectByName(GUN_NODES[tier]);
  if (!node) return null;
  const g = staticGeometry(node, length, { recolor: gunPaint(tier) });
  const size = g.boundingBox!.getSize(new THREE.Vector3());
  if (size.x >= size.y && size.x >= size.z) g.rotateY(Math.PI / 2);
  else if (size.y >= size.x && size.y >= size.z) g.rotateX(Math.PI / 2);
  g.computeBoundingBox();
  g.center();
  return g;
}

/**
 * 皮肤选择页用的头像：用真模型按皮肤上色，摆待机姿势，正面拍一张。
 * 单独开一个小画布渲染，拍完就释放。
 */
export function renderPortraits(model: LoadedModel, skins: SkinDef[], size = { w: 180, h: 220 }): Record<string, string> {
  const out: Record<string, string> = {};
  const canvas = document.createElement('canvas');
  canvas.width = size.w;
  canvas.height = size.h;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  } catch {
    return out;
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8090a0, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(2, 4, 5);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(30, size.w / size.h, 0.1, 50);
  for (const skin of skins) {
    const body = SkeletonUtils.clone(model.scene);
    const { team, pants } = skinColors(skin);
    body.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const gun = under(mesh, ALL_GUNS);
      if (gun && gun !== 'AK') {
        mesh.visible = false;
        return;
      }
      const old = mesh.material as THREE.MeshStandardMaterial;
      const color = old.name === 'Character_Main' ? team : old.name === 'Pants' ? pants : old.color;
      mesh.material = new THREE.MeshLambertMaterial({ color });
    });
    const mixer = new THREE.AnimationMixer(body);
    const idle = model.animations.find((a) => a.name === 'Idle');
    if (idle) {
      mixer.clipAction(idle).play();
      mixer.setTime(0.4);
    }
    body.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(body);
    const h = box.max.y - box.min.y;
    const c = box.getCenter(new THREE.Vector3());
    scene.add(body);
    camera.position.set(c.x + h * 0.55, c.y + h * 0.12, c.z + h * 2.1);
    camera.lookAt(c.x, c.y, c.z);
    renderer.render(scene, camera);
    out[skin.id] = canvas.toDataURL('image/png');
    scene.remove(body);
    mixer.stopAllAction();
  }
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}

/**
 * 每档武器的侧面图（HUD 武器牌、武器升级卡、军械库用）：真模型斜侧面拍一张，透明底。
 * 枪口统一朝右。
 */
export function renderGunIcons(model: LoadedModel, size = { w: 240, h: 112 }): string[] {
  const out: string[] = [];
  const canvas = document.createElement('canvas');
  canvas.width = size.w;
  canvas.height = size.h;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  } catch {
    return out;
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6a7890, 2.4));
  const sun = new THREE.DirectionalLight(0xffffff, 2.6);
  sun.position.set(3, 5, 2);
  scene.add(sun);
  const aspect = size.w / size.h;
  const camera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.1, 30);
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  for (let tier = 0; tier < GUN_NODES.length; tier++) {
    const g = gunStatic(model, tier, 2);
    if (!g) {
      out.push('');
      continue;
    }
    // 各把枪模型朝向不一：枪口那头细（没有握把、弹匣），比较两头的高度，粗的那头放到 +z（画面左边）
    const pos = g.attributes.position;
    const z0 = g.boundingBox!.min.z;
    const z1 = g.boundingBox!.max.z;
    const end = (z1 - z0) * 0.2;
    const lo = [Infinity, -Infinity];
    const hi = [Infinity, -Infinity];
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i);
      const y = pos.getY(i);
      const span = z < z0 + end ? lo : z > z1 - end ? hi : null;
      if (!span) continue;
      span[0] = Math.min(span[0], y);
      span[1] = Math.max(span[1], y);
    }
    if (lo[1] - lo[0] > hi[1] - hi[0]) {
      g.rotateY(Math.PI);
      g.computeBoundingBox();
    }
    const mesh = new THREE.Mesh(g, material);
    scene.add(mesh);
    // 从 +x 侧面稍微俯视：画面右边是 -z（枪口方向）
    const box = g.boundingBox!;
    const c = box.getCenter(new THREE.Vector3());
    const len = box.max.z - box.min.z;
    const h = box.max.y - box.min.y;
    const zoom = Math.min((aspect * 2 * 0.86) / len, (2 * 0.8) / Math.max(h, 0.01));
    camera.left = -aspect / zoom;
    camera.right = aspect / zoom;
    camera.top = 1 / zoom;
    camera.bottom = -1 / zoom;
    camera.updateProjectionMatrix();
    camera.position.set(c.x + 6, c.y + 1.4, c.z - 0.6);
    camera.lookAt(c);
    renderer.render(scene, camera);
    out.push(canvas.toDataURL('image/png'));
    scene.remove(mesh);
    g.dispose();
  }
  material.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}

/** 各种丧尸用哪个模型、怎么上色 */
const ZOMBIE_SOURCE: Record<ZombieKind, { model: keyof Models; tint?: [number, number, number] }> = {
  walker: { model: 'zombie' },
  runner: { model: 'zombieRunner' },
  brute: { model: 'zombieFat' },
  exploder: { model: 'zombieFat', tint: [0.75, 1.35, 0.4] },
  giant: { model: 'zombieArm' },
};

export function buildZombies(models: Models): Partial<Record<ZombieKind, BakedModel>> {
  const out: Partial<Record<ZombieKind, BakedModel>> = {};
  const cache = new Map<string, BakedModel>();
  for (const [kind, src] of Object.entries(ZOMBIE_SOURCE) as [ZombieKind, (typeof ZOMBIE_SOURCE)[ZombieKind]][]) {
    const m = models[src.model];
    if (!m) continue;
    const key = `${src.model}-${src.tint?.join(',') ?? ''}`;
    let baked = cache.get(key);
    if (!baked) {
      const tint = src.tint;
      baked = bakeModel(m.scene, m.animations, {
        clips: ZOMBIE_CLIPS,
        fps: 16,
        height: ZOMBIE_HEIGHT,
        yaw: Math.PI,
        recolor: tint ? (_n, c) => c.multiply(new THREE.Color(tint[0], tint[1], tint[2])) : undefined,
      });
      cache.set(key, baked);
    }
    out[kind] = baked;
  }
  return out;
}

/** 道具几何体（按最大边缩放到 fit 米）；没有这个模型时返回 null */
export function propGeometry(models: Models, name: string, fit: number): THREE.BufferGeometry | null {
  const props = models.props?.scene;
  if (!props) return null;
  const node = props.getObjectByName(name);
  return node ? staticGeometry(node, fit) : null;
}

// ---------- Boss ----------

const BOSS_SOURCE: Record<BossKind, { model: keyof Models; height: number; tint?: number; attack: string[] }> = {
  brute: { model: 'zombieArm', height: 5.6, tint: 0xffb0a0, attack: ['Punch'] },
  thrower: { model: 'orc', height: 5.4, attack: ['Weapon', 'Punch'] },
  hive: { model: 'blob', height: 4.6, tint: 0xd0a0ff, attack: ['Bite_Front'] },
};

const DROP_TIME = 0.55;
/** 攻击动作里出手（拳头砸下、棒子挥出、咬下去）大约在整段的哪个位置 */
const IMPACT = 0.5;

/** 用外部模型的 Boss：骨骼动画（只有一两个，直接用 AnimationMixer） */
export class ModelBossView {
  readonly root = new THREE.Group();
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions: Record<'walk' | 'idle' | 'attack' | 'death' | 'hit', THREE.AnimationAction | null>;
  private current: THREE.AnimationAction | null = null;
  private readonly materials: THREE.MeshLambertMaterial[] = [];
  private readonly bar = new HpBar(360, 96);
  private readonly hpSprite: THREE.Sprite;
  private dropT = -1;
  private landed = false;
  private deathT = 0;
  readonly scale: number;

  constructor(
    scene: THREE.Scene,
    readonly boss: Boss,
    model: LoadedModel,
    dropIn = false,
  ) {
    const src = BOSS_SOURCE[boss.kind];
    const body = SkeletonUtils.clone(model.scene);
    // 换成和场景一致的漫反射材质，每个 Boss 一份（被打时单独发红）
    body.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      const old = mesh.material as THREE.MeshStandardMaterial;
      const mat = new THREE.MeshLambertMaterial({ map: old.map ?? null, color: old.color?.clone() ?? new THREE.Color(1, 1, 1) });
      if (src.tint) mat.color.multiply(new THREE.Color(src.tint));
      this.materials.push(mat);
      mesh.material = mat;
    });
    const box = new THREE.Box3().setFromObject(body);
    this.scale = src.height / Math.max(0.01, box.max.y - box.min.y);
    body.scale.setScalar(this.scale);
    body.position.y = -box.min.y * this.scale;
    // 模型默认面朝 +Z，Boss 要面朝队伍（+Z 方向就是朝镜头），不用转
    this.root.add(body);

    this.mixer = new THREE.AnimationMixer(body);
    const find = (names: string[]) => {
      for (const n of names) {
        const clip = model.animations.find((a) => a.name === n) ?? model.animations.find((a) => a.name.toLowerCase().includes(n.toLowerCase()));
        if (clip) return this.mixer.clipAction(clip);
      }
      return null;
    };
    this.actions = {
      walk: find(['Walk', 'Run']),
      idle: find(['Idle']),
      attack: find(src.attack),
      death: find(['Death']),
      hit: find(['HitReact', 'HitRecieve']),
    };
    for (const k of ['attack', 'death', 'hit'] as const) {
      const a = this.actions[k];
      if (a) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
    }
    this.play(this.actions.idle);

    const mat = new THREE.SpriteMaterial({ map: this.bar.texture, depthTest: false, depthWrite: false, toneMapped: false });
    this.hpSprite = new THREE.Sprite(mat);
    this.hpSprite.scale.set(1.7 * 1.9, 0.42 * 1.9, 1);
    this.hpSprite.renderOrder = 20;
    this.hpSprite.position.y = src.height + 0.9;
    this.root.add(this.hpSprite);
    this.root.position.set(boss.x, 0, -boss.d);
    if (dropIn) this.dropT = 0;
    scene.add(this.root);
  }

  private play(action: THREE.AnimationAction | null, fade = 0.15) {
    if (!action || action === this.current) return;
    action.reset().play();
    if (this.current) action.crossFadeFrom(this.current, fade, false);
    this.current = action;
  }

  consumeLanding(): boolean {
    if (!this.landed) return false;
    this.landed = false;
    return true;
  }

  /** 投弹屠夫扔出油桶（动作在 update 里按蓄力进度驱动，这里不用管） */
  thrown() {}

  update(dt: number, time: number) {
    const b = this.boss;
    // 狂暴后动作也快一点
    this.mixer.timeScale = b.enraged ? 1.3 : 1;
    let drop = 0;
    if (this.dropT >= 0) {
      const k = this.dropT / DROP_TIME;
      this.dropT += dt;
      if (this.dropT >= DROP_TIME) {
        this.dropT = -1;
        this.landed = true;
      } else drop = 16 * (1 - k * k);
    }
    this.root.position.set(b.x, drop, -b.d);
    // 挨打只是微微泛红（一直被打时 flash 一直是满的，太亮会整只变色）；狂暴后整只发红光、呼吸闪
    const rage = b.enraged ? 0.18 + 0.1 * Math.sin(time * 8) : 0;
    for (const m of this.materials) m.emissive.setRGB(b.flash * 0.1 + rage, b.flash * 0.025 + rage * 0.1, b.flash * 0.02);

    if (!b.alive) {
      this.deathT += dt;
      this.play(this.actions.death, 0.1);
      this.hpSprite.visible = false;
      this.root.position.y = -Math.max(0, this.deathT - 1.4) * 0.8;
      if (this.deathT > 3) this.root.visible = false;
      this.mixer.update(dt);
      return;
    }

    this.bar.set(b.hp / b.maxHp, formatNumber(Math.max(0, Math.ceil(b.hp))), '#e3262f', BOSSES[b.kind].name);
    // 贴脸攻击（三种 Boss 都会）和投弹屠夫扔油桶：攻击动画按蓄力进度直接“拖”到对应的帧——
    // 蓄力时播到出手前，砸下去/扔出去那一刻正好出手，然后把收势播完。以前靠捕捉“砸地那一下”触发，经常漏掉
    const throwing = b.kind === 'thrower' && !b.attacking && b.fightTime < 22 && (b.windup > 0.05 || b.slam > 0.05);
    const attack = this.actions.attack;
    if ((b.attacking || throwing) && attack) {
      if (this.current !== attack) {
        attack.reset().play();
        if (this.current) attack.crossFadeFrom(this.current, 0.12, false);
        this.current = attack;
      }
      attack.paused = true;
      const k = b.slam > 0.05 ? IMPACT + (1 - b.slam) * (1 - IMPACT) : Math.min(IMPACT, b.windup * IMPACT);
      attack.time = k * attack.getClip().duration;
    } else {
      if (attack) attack.paused = false;
      const moving = b.active && !b.attacking && (b.kind !== 'thrower' || b.windup < 0.05);
      this.play(moving ? this.actions.walk : this.actions.idle);
    }
    this.mixer.update(dt);
  }

  dispose() {
    this.mixer.stopAllAction();
    this.root.removeFromParent();
    this.bar.dispose();
    for (const m of this.materials) m.dispose();
  }
}

export function bossModel(models: Models, kind: BossKind): LoadedModel | null {
  return models[BOSS_SOURCE[kind].model] ?? null;
}
