import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Boss, GameEvent, World } from '../game/world';
import type { Models } from './assets';
import { configureCarnageCamera } from './carnageCamera';
import { bakeSoldierBody, buildSoldier, propGeometry, type SoldierKit } from './characters';
import { Crowd, type AgentPose } from './crowd';
import { commitInstances } from './dispose';
import { BlobShadows, BulletMesh, Explosions, Flashes, FloatTexts, Particles, Rings } from './effects';
import { BossStrikeView } from './entities';
import { HpBar, Label } from './label';
import { soldierBody, soldierLeg } from './models';
import { VatCrowd } from './vat';

const BLUE = { id: 'carnage-blue', name: '蓝军', team: 0x1657f2, shirt: 0x155aff, price: 0 };
const RED = { id: 'carnage-red', name: '红军', team: 0xd53537, shirt: 0xe54441, price: 0 };
const CARNAGE_HIT_COLS = [0xffdf68, 0xffffff, 0xff9f1c] as const;
const CARNAGE_DIE_COLS = [0xc73032, 0xec7662, 0xffcf40] as const;
const CARNAGE_LOSS_COLS = [0x1657f2, 0x7ea9ff] as const;
const CARNAGE_BARREL_COLS = [0xbda265, 0x565047, 0xffd55e] as const;
const CARNAGE_SMASH_COLS = [0xaaa7a2, 0x6c6570] as const;
const CARNAGE_BLAST_COLS = [0xffcc33, 0xfff1a6, 0xffffff] as const;
const POD_OFFSETS: readonly [number, number][] = [
  [-0.53, 0],
  [0.53, 0],
  [0, 1.0],
];

const m = new THREE.Matrix4();
const q = new THREE.Quaternion();
const p = new THREE.Vector3();
const size = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);
const dir = new THREE.Vector3();
const _pose: AgentPose & { clip?: string; cycle?: number } = {
  x: 0,
  y: 0,
  d: 0,
  yaw: 0,
  phase: 0,
  scale: 1,
  flash: 0,
  tilt: 0,
  stride: 0,
  clip: 'idle',
  cycle: 0,
};

interface Herd {
  begin(): void;
  push(pose: AgentPose & { clip?: string; cycle?: number }): void;
  end(): void;
}

/** 合并同类炮管和护甲，整排发射架只有一次绘制。 */
function rocketPod(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const add = (geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number) => {
    const g = geo.toNonIndexed();
    geo.dispose();
    g.translate(x, y, z);
    const c = new THREE.Color(color);
    const rgb = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < rgb.length; i += 3) {
      rgb[i] = c.r;
      rgb[i + 1] = c.g;
      rgb[i + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
    g.deleteAttribute('uv');
    parts.push(g);
  };
  add(new THREE.BoxGeometry(1.55, 0.28, 1.65), 0x514b40, 0, 0.2, 0);
  const casing = new THREE.CylinderGeometry(0.86, 0.86, 0.9, 6);
  casing.rotateX(Math.PI / 2);
  add(casing, 0x9f702e, 0, 1, 0);
  const plate = new THREE.CylinderGeometry(0.75, 0.75, 0.06, 6);
  plate.rotateX(Math.PI / 2);
  add(plate, 0xd5a751, 0, 1, 0.49);
  for (let i = 0; i < 7; i++) {
    const a = (i - 1) * (Math.PI / 3);
    const x = i === 0 ? 0 : Math.cos(a) * 0.44;
    const y = 1 + (i === 0 ? 0 : Math.sin(a) * 0.44);
    const tube = new THREE.CylinderGeometry(0.205, 0.205, 1.25, 12);
    tube.rotateX(Math.PI / 2);
    add(tube, 0x4a4642, x, y, 0.17);
    add(new THREE.TorusGeometry(0.176, 0.038, 5, 12), 0xc2b593, x, y, 0.81);
    add(new THREE.CircleGeometry(0.143, 12), 0x0b0c10, x, y, 0.815);
  }
  for (const x of [-0.74, 0.74]) add(new THREE.BoxGeometry(0.22, 0.4, 1.35), 0x302f30, x, 0.26, 0);
  const result = mergeGeometries(parts)!;
  parts.forEach((g) => g.dispose());
  return result;
}

function instances(scene: THREE.Scene, geometry: THREE.BufferGeometry, material: THREE.Material, cap: number) {
  const mesh = new THREE.InstancedMesh(geometry, material, cap);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);
  return mesh;
}
function place(mesh: THREE.InstancedMesh, index: number, x: number, y: number, z: number, sx = 1, sy = sx, sz = sx) {
  p.set(x, y, z);
  size.set(sx, sy, sz);
  q.identity();
  m.compose(p, q, size);
  mesh.setMatrixAt(index, m);
}
function numberSprite(label: { texture: THREE.Texture }, width: number, height: number) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: label.texture, depthTest: false, depthWrite: false, toneMapped: false }));
  sprite.scale.set(width, height, 1);
  sprite.renderOrder = 8;
  return sprite;
}

/** 红甲、黑发、肩甲和长剑：参考图中的人形巨人，优先挂载 Quaternius CC0 骑士长剑模型。 */
class RedChampion {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private swordArm = new THREE.Group();
  private leftLeg = new THREE.Group();
  private rightLeg = new THREE.Group();
  private death = 0;
  private readonly strike: BossStrikeView;
  private readonly hp = new HpBar(256, 80);
  private readonly hpSprite = numberSprite(this.hp, 3.1, 0.85);
  constructor(scene: THREE.Scene, readonly boss: Boss, swordGeom?: THREE.BufferGeometry | null) {
    this.strike = new BossStrikeView(scene, boss);
    scene.add(this.hpSprite);
    const red = new THREE.MeshLambertMaterial({ color: 0xc9342c });
    const darkRed = new THREE.MeshLambertMaterial({ color: 0x7c221f });
    const skin = new THREE.MeshLambertMaterial({ color: 0xd9a17a });
    const hair = new THREE.MeshLambertMaterial({ color: 0x24232c });
    const steel = new THREE.MeshLambertMaterial({ color: 0xc6c6c3 });
    const gold = new THREE.MeshLambertMaterial({ color: 0xb88b42 });
    const make = (parent: THREE.Group, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx = 1, sy = sx, sz = sx) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };
    scene.add(this.root);
    this.root.add(this.body);
    this.root.scale.setScalar(1.55);
    make(this.body, new THREE.SphereGeometry(1, 16, 12), red, 0, 1.85, 0, 0.77, 0.91, 0.5);
    make(this.body, new THREE.SphereGeometry(1, 16, 12), darkRed, 0, 1.2, 0.03, 0.8, 0.38, 0.52);
    make(this.body, new THREE.BoxGeometry(1.5, 0.16, 1.02), hair, 0, 1.23, 0.02);
    make(this.body, new THREE.BoxGeometry(0.31, 0.22, 0.07), steel, 0, 1.23, 0.58);
    make(this.body, new THREE.SphereGeometry(0.43, 16, 12), skin, 0, 2.94, 0.09, 1, 1.1, 1);
    make(this.body, new THREE.SphereGeometry(0.48, 16, 12), hair, 0, 3.13, -0.03, 1, 0.85, 1);
    make(this.body, new THREE.BoxGeometry(0.78, 0.12, 0.24), red, 0, 3.01, 0.4);
    for (const x of [-0.15, 0.15]) make(this.body, new THREE.BoxGeometry(0.13, 0.045, 0.035), hair, x, 2.9, 0.48);
    make(this.body, new THREE.SphereGeometry(0.13, 10, 8), skin, 0, 2.8, 0.5, 1, 0.65, 0.7);
    make(this.body, new THREE.BoxGeometry(0.27, 0.04, 0.03), darkRed, 0, 2.64, 0.47);
    make(this.body, new THREE.ConeGeometry(0.25, 0.8, 8), hair, 0.07, 3.55, -0.25).rotation.z = -0.3;
    make(this.body, new THREE.SphereGeometry(0.43, 12, 10), steel, 0.84, 2.45, 0);
    make(this.body, new THREE.SphereGeometry(0.3, 10, 8), steel, 0.9, 2.5, 0.27, 1, 0.8, 0.7);
    for (const x of [0.8, 0.99]) make(this.body, new THREE.SphereGeometry(0.07, 8, 6), hair, x, 2.52, 0.47);
    make(this.body, new THREE.CylinderGeometry(0.25, 0.2, 0.95, 12), skin, 0.95, 1.88, 0.05).rotation.z = 0.25;
    make(this.body, new THREE.SphereGeometry(0.25, 12, 8), skin, 0.88, 1.38, 0.27);
    this.body.add(this.swordArm);
    this.swordArm.position.set(-0.8, 2.35, 0);
    make(this.swordArm, new THREE.CylinderGeometry(0.26, 0.21, 0.9, 12), skin, -0.17, -0.4, 0.1).rotation.z = -0.3;
    make(this.swordArm, new THREE.SphereGeometry(0.24, 12, 8), skin, -0.29, -0.87, 0.3);
    if (swordGeom) {
      const swordMat = new THREE.MeshLambertMaterial({ vertexColors: true });
      const swordMesh = make(this.swordArm, swordGeom, swordMat, -0.29, -0.95, 0.38);
      swordMesh.rotation.z = -0.06;
    } else {
      make(this.swordArm, new THREE.CylinderGeometry(0.08, 0.08, 0.6, 8), hair, -0.29, -0.65, 0.38);
      make(this.swordArm, new THREE.BoxGeometry(0.55, 0.1, 0.25), gold, -0.29, -0.35, 0.38);
      make(this.swordArm, new THREE.BoxGeometry(0.2, 2.1, 0.09), gold, -0.29, 0.73, 0.38).rotation.z = -0.06;
    }
    for (const [leg, x] of [
      [this.leftLeg, -0.39],
      [this.rightLeg, 0.39],
    ] as const) {
      this.body.add(leg);
      leg.position.set(x, 1.05, 0);
      make(leg, new THREE.CylinderGeometry(0.24, 0.22, 0.7, 10), darkRed, 0, -0.34, 0);
      make(leg, new THREE.BoxGeometry(0.5, 0.3, 0.7), hair, 0, -0.85, 0.12);
    }
  }
  get isDeadDone(): boolean {
    return !this.boss.alive && this.death >= 1.45;
  }
  dispose() {
    this.strike.dispose();
    this.hp.dispose();
    this.hpSprite.material.dispose();
    this.hpSprite.removeFromParent();
    const materials = new Set<THREE.Material>();
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        if (!o.geometry.userData?.shared) o.geometry.dispose();
        materials.add(o.material as THREE.Material);
      }
    });
    for (const material of materials) material.dispose();
    this.root.removeFromParent();
  }
  update(dt: number, t: number, menu = false) {
    const b = this.boss;
    this.strike.update();
    this.hpSprite.visible = !menu && b.alive && b.active;
    if (this.hpSprite.visible) {
      this.hp.set(b.hp / b.maxHp, `${Math.ceil((b.hp / b.maxHp) * 100)}%`, '#e23d32', '红甲巨人');
      this.hpSprite.position.set(b.x, 5.85, -b.d);
    }
    const hitPulse = b.alive ? b.flash * (0.55 + 0.45 * Math.max(0, Math.sin(t * 54))) : 0;
    this.root.position.set(b.x + Math.sin(t * 63) * b.flash * 0.05, 0.07 + Math.abs(Math.sin(t * 2)) * 0.05, -b.d - hitPulse * 0.12);
    this.root.scale.set(1.55 * (1 + hitPulse * 0.04), 1.55 * (1 - hitPulse * 0.03), 1.55 * (1 + hitPulse * 0.04));
    this.body.rotation.y = Math.sin(t * 0.7) * 0.08;
    this.body.rotation.x = -hitPulse * 0.09;
    this.swordArm.rotation.x = b.attacking ? -b.windup * 2.6 + b.slam * 2.3 : -0.3;
    this.leftLeg.rotation.x = Math.sin(b.phase) * 0.1;
    this.rightLeg.rotation.x = -Math.sin(b.phase) * 0.1;
    if (!b.alive) {
      this.root.scale.setScalar(1.55);
      this.death += dt;
      this.root.rotation.x = -Math.min(Math.PI / 2, this.death * 2);
      this.root.visible = this.death < 1.4;
    }
  }
}

/** 与主线分开的完整场景，按参考图设置四列构图，不复用绿门/公路桥主题。 */
export class ReferenceCarnageView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(43, 1, 0.1, 220);
  private world!: World;
  private blue: Herd;
  private guns: VatCrowd | null = null;
  private red: Herd;
  private dyingRed: { x: number; y: number; d: number; vx: number; vy: number; vd: number; yaw: number; t: number }[] = [];
  private blueBoards: THREE.InstancedMesh;
  private blueText: THREE.InstancedMesh;
  private yellowBoards: THREE.InstancedMesh;
  private yellowText: THREE.InstancedMesh;
  private pods: THREE.InstancedMesh;
  private missiles: THREE.InstancedMesh;
  private prevBlue = 0;
  private prevGold = 0;
  private prevPods = 0;
  private prevMissiles = 0;
  private counter = new Label(256, 128);
  private podCounter = new Label(128, 96);
  private counterSprite: THREE.Sprite;
  private podSprite: THREE.Sprite;
  private squadLabel = new Label(256, 96);
  private squadSprite: THREE.Sprite;
  private lastBatteryHp = -1;
  private lastPodHp = -1;
  private lastSquadCount = -1;
  private champions = new Map<number, RedChampion>();
  private readonly deadChampionIds = new Set<number>();
  private readonly swordGeom: THREE.BufferGeometry | null;
  private bullets: BulletMesh;
  private sparks: Particles;
  private debris: Particles;
  private flashes: Flashes;
  private impacts: Flashes;
  private explosions: Explosions;
  private rings: Rings;
  private shadows: BlobShadows;
  private texts: FloatTexts;
  private time = 0;
  private width = 390;
  private height = 844;
  private trauma = 0;

  constructor(models: Models, fxLayer: HTMLElement, sharedKit?: SoldierKit | null) {
    this.swordGeom = propGeometry(models, 'Sword', 2.8);
    if (this.swordGeom) this.swordGeom.userData.shared = true;
    const scene = this.scene;
    scene.background = new THREE.Color(0x0c1120);
    scene.fog = new THREE.Fog(0x0c1120, 100, 200);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x65697d, 2));
    const sun = new THREE.DirectionalLight(0xfff2dc, 2.1);
    sun.position.set(-8, 22, 12);
    scene.add(sun);

    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#b9b9c2';
    ctx.fillRect(0, 0, 512, 512);
    for (let row = 0; row < 8; row++) {
      for (let col = -1; col < 8; col++) {
        const x = col * 76 + (row % 2) * 38;
        const y = row * 64;
        const shade = 182 + ((row * 11 + col * 17 + 127) % 18);
        ctx.fillStyle = `rgb(${shade},${shade},${shade + 6})`;
        ctx.fillRect(x + 1, y + 1, 74, 62);
        ctx.strokeStyle = '#a7a7b1';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(x + 1, y + 1, 74, 62);
        ctx.fillStyle = '#d2d2d7';
        ctx.fillRect(x + 2, y + 2, 72, 1);
      }
    }
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 35);
    texture.anisotropy = 8;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(12, 200), new THREE.MeshLambertMaterial({ map: texture }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.02, -60);
    scene.add(ground);

    const concrete = new THREE.MeshLambertMaterial({ color: 0x646773 });
    const rail = instances(scene, new THREE.BoxGeometry(0.28, 0.65, 2.1), concrete, 200);
    let ri = 0;
    for (let i = 0; i < 100; i++) for (const x of [-5.85, 5.85]) place(rail, ri++, x, 0.3, 12 - i * 2.2);
    commitInstances(rail, ri, 0);
    const divider = instances(scene, new THREE.BoxGeometry(0.13, 0.35, 2.4), concrete, 100);
    let di = 0;
    for (let i = 0; i < 30; i++) for (const x of [-4.0, 0.05, 2.95]) place(divider, di++, x, 0.16, -16 - i * 2.5);
    commitInstances(divider, di, 0);

    const labelMaterial = (text: string) => {
      const label = new Label(256, 160);
      label.set(text, { fill: '#ffffff', stroke: '#18202d', size: 120 });
      return new THREE.MeshBasicMaterial({ map: label.texture, transparent: true, depthWrite: false, toneMapped: false });
    };
    this.blueBoards = instances(scene, new THREE.BoxGeometry(1.24, 1.05, 0.22), new THREE.MeshLambertMaterial({ color: 0x1682f7 }), 180);
    this.blueText = instances(scene, new THREE.PlaneGeometry(1.12, 0.83), labelMaterial('+1'), 180);
    this.yellowBoards = instances(scene, new THREE.BoxGeometry(2.55, 1.85, 0.22), new THREE.MeshLambertMaterial({ color: 0xffd32d }), 90);
    this.yellowText = instances(scene, new THREE.PlaneGeometry(2.4, 1.65), labelMaterial('+99'), 90);
    this.pods = instances(scene, rocketPod(), new THREE.MeshLambertMaterial({ vertexColors: true }), 100);
    this.missiles = instances(scene, new THREE.ConeGeometry(0.12, 0.85, 8), new THREE.MeshBasicMaterial({ color: 0xffdf66 }), 64);

    if (models.soldier) {
      if (sharedKit) {
        const blueBody = bakeSoldierBody(models.soldier, BLUE);
        this.blue = new VatCrowd(scene, 320, blueBody, { shadow: false });
        this.guns = new VatCrowd(scene, 320, sharedKit.guns[4], { shadow: false });
      } else {
        const kit = buildSoldier(models.soldier, BLUE);
        this.blue = new VatCrowd(scene, 320, kit.body, { shadow: false });
        this.guns = new VatCrowd(scene, 320, kit.guns[4], { shadow: false });
      }
      this.red = new VatCrowd(scene, 750, bakeSoldierBody(models.soldier, RED), { shadow: false });
    } else {
      this.blue = new Crowd(scene, 320, soldierBody(BLUE, 4), soldierLeg(BLUE.team));
      this.red = new Crowd(scene, 750, soldierBody(RED, 0), soldierLeg(RED.team));
    }
    this.counterSprite = numberSprite(this.counter, 3.3, 1.5);
    scene.add(this.counterSprite);
    this.podSprite = numberSprite(this.podCounter, 1.5, 1);
    scene.add(this.podSprite);
    this.squadSprite = numberSprite(this.squadLabel, 1.5, 0.6);
    scene.add(this.squadSprite);
    this.bullets = new BulletMesh(scene);
    this.bullets.setColor(0xffc72a, 4, 0xffcb22);
    (this.bullets.mesh.material as THREE.MeshBasicMaterial).color.set(0xffe066);
    (this.bullets.glow.material as THREE.MeshBasicMaterial).opacity = 0.58;
    this.sparks = new Particles(scene, new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }), 900);
    this.debris = new Particles(scene, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), 700);
    this.flashes = new Flashes(scene, 64);
    this.flashes.setColor(0xffd24c);
    this.impacts = new Flashes(scene, 48);
    this.impacts.setColor(0xfff4d0);
    this.explosions = new Explosions(scene, 180);
    this.rings = new Rings(scene);
    this.shadows = new BlobShadows(scene);
    this.texts = new FloatTexts(fxLayer);
  }

  load(world: World) {
    this.world = world;
    this.time = 0;
    this.trauma = 0;
    this.dyingRed.length = 0;
    this.lastBatteryHp = -1;
    this.lastPodHp = -1;
    this.lastSquadCount = -1;
    for (const v of this.champions.values()) v.dispose();
    this.champions.clear();
    this.deadChampionIds.clear();
    this.clearEffects();
  }

  clearEffects() {
    this.sparks.clear();
    this.debris.clear();
    this.flashes.clear();
    this.impacts.clear();
    this.explosions.clear();
    this.rings.clear();
    this.texts.clear();
  }

  resize(width: number, height: number) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
  }

  handle(events: GameEvent[], reduced: boolean) {
    let hitBudget = 24;
    let deathBudget = 22;
    let lossBudget = 6;
    for (const e of events) {
      if (e.type === 'hit' && hitBudget-- > 0) {
        this.impacts.spawn(e.x + (Math.random() - 0.5) * 0.22, 0.85, -e.d + 0.25, e.target === 'boss' || e.target === 'barrel' ? 0.85 : 0.52);
        this.sparks.burst(e.x, 0.9, -e.d + 0.15, 4, 4.5, 0.24, 0.08, CARNAGE_HIT_COLS, 10, 0.4);
      } else if (e.type === 'zombieDie' && deathBudget-- > 0) {
        this.impacts.spawn(e.x, 0.65, -e.d + 0.2, 0.55);
        this.debris.burst(e.x, 0.55, -e.d, 6, 4.6, 0.45, 0.11, CARNAGE_DIE_COLS, 14, 0.45);
        if (this.dyingRed.length < 90) {
          this.dyingRed.push({
            x: e.x,
            y: 0.03,
            d: e.d,
            vx: (Math.random() - 0.5) * 1.4,
            vy: 1.2 + Math.random() * 1.0,
            vd: 1.6 + Math.random() * 1.4,
            yaw: Math.PI + (Math.random() - 0.5) * 0.35,
            t: 0,
          });
        }
      } else if (e.type === 'soldierDie' && lossBudget-- > 0) {
        this.debris.burst(e.x, 0.4, -e.d, 5, 3, 0.4, 0.1, CARNAGE_LOSS_COLS, 12, 0.4);
      } else if (e.type === 'gatePass') {
        const ammo = e.gate.carnage === 'ammo';
        this.texts.spawn(ammo ? '+99 发' : '+1 人', this.world.squad.x, 1.8, 0, ammo ? 'gold' : 'good', 0.7, 1);
        this.rings.spawn(this.world.squad.x, 0, 2.5, ammo ? 0xffcf40 : 0x57adff, 0.38);
      } else if (e.type === 'barrelBreak') {
        this.explosions.spawn(e.barrel.x, 1, -e.barrel.d, 2.3, true);
        this.debris.burst(e.barrel.x, 1, -e.barrel.d, 22, 7.5, 0.85, 0.19, CARNAGE_BARREL_COLS, 18, 0.5);
        this.texts.spawn(`+${e.barrel.carnage === 'battery' ? 99 : 20} 发`, e.barrel.x, 2, -e.barrel.d, 'gold', 0.8, 1);
        if (!reduced) this.trauma = Math.max(this.trauma, 0.12);
      } else if (e.type === 'bossSmash') {
        this.rings.spawn(e.x, -e.d, 3.4, 0xff5b32, 0.42);
        this.debris.burst(e.x, 0.1, -e.d, 18, 5, 0.55, 0.16, CARNAGE_SMASH_COLS, 14, 0.35);
        this.texts.spawn(e.killed ? `-${e.killed} 人` : '闪避', this.world.squad.x, 2, 0, e.killed ? 'bad' : 'good', 0.8, 1);
        if (!reduced && e.killed) this.trauma = 0.22;
      } else if (e.type === 'bossDie') {
        this.texts.spawn('巨人击破', e.boss.x, 4, -e.boss.d, 'gold', 1, 1);
        this.rings.spawn(e.boss.x, -e.boss.d, 6.5, 0xffcf40, 0.65);
        if (!reduced) this.trauma = 0.32;
      } else if (e.type === 'carnageBlast') {
        this.explosions.spawn(e.x, 0.7, -e.d, e.nova ? 5.2 : 2.6, !reduced);
        this.rings.spawn(e.x, -e.d, e.nova ? 26 : 6.5, 0xffcf40, 0.52);
        this.sparks.burst(e.x, 1, -e.d, reduced ? 8 : e.nova ? 110 : 28, 11, 0.62, 0.13, CARNAGE_BLAST_COLS, 12, 0.7);
        this.impacts.spawn(e.x, 1, -e.d, e.nova ? 7 : 2.8);
        if (!reduced) this.trauma = Math.max(this.trauma, e.nova ? 0.28 : 0.06);
      }
    }
  }

  update(dt: number, reduced: boolean, menu: boolean) {
    const w = this.world;
    const t = (this.time += dt);
    this.shadows.begin();
    this.blue.begin();
    this.guns?.begin();
    this.red.begin();
    const firing = !menu && (w.state === 'run' || w.state === 'boss') && w.soldiers.length > 0;
    const blueClip = menu ? 'idle' : 'shoot';
    _pose.tint = undefined;
    for (let i = 0; i < w.soldiers.length; i++) {
      const s = w.soldiers[i];
      const kick = firing ? Math.max(0, Math.sin(t * 28 + s.phase * 5.3)) * 0.028 : 0;
      _pose.x = w.squad.x + s.ox;
      _pose.y = 0;
      _pose.d = s.oz - kick;
      _pose.yaw = 0;
      _pose.phase = s.phase;
      _pose.scale = 0.55;
      _pose.flash = 0;
      _pose.tilt = kick * 0.4;
      _pose.stride = 0.1;
      _pose.clip = blueClip;
      _pose.cycle = t + s.phase * 0.2;
      this.blue.push(_pose);
      this.guns?.push(_pose);
      this.shadows.push(_pose.x, -_pose.d, 0.46);
    }
    this.blue.end();
    this.guns?.end();

    if (firing && dt > 0) {
      const nFlash = Math.min(18, Math.ceil(w.soldiers.length / 5));
      for (let i = 0; i < nFlash; i++) {
        const s = w.soldiers[Math.floor(Math.random() * w.soldiers.length)];
        this.flashes.spawn(w.squad.x + s.ox + 0.06, 0.62, -(s.oz + 0.45), 0.46);
      }
    }

    for (let i = 0; i < w.zombies.length; i++) {
      const z = w.zombies[i];
      if (!z.alive || z.d >= 80) continue;
      _pose.x = z.x + Math.sin(t * 55 + z.id) * z.flash * 0.03;
      _pose.y = 0;
      _pose.d = z.d + z.flash * 0.16;
      _pose.yaw = Math.PI;
      _pose.phase = z.phase;
      _pose.scale = 0.52 * (1 + z.flash * 0.1);
      _pose.flash = Math.min(0.95, z.flash * 0.9);
      _pose.tilt = -z.flash * 0.26;
      _pose.stride = 0.65;
      _pose.clip = 'run';
      _pose.cycle = z.phase / 6.283185307179586;
      this.red.push(_pose);
      this.shadows.push(z.x, -(z.d + z.flash * 0.16), 0.4);
    }

    for (let i = this.dyingRed.length - 1; i >= 0; i--) {
      const a = this.dyingRed[i];
      a.t += dt;
      if (a.t > 0.52) {
        this.dyingRed[i] = this.dyingRed[this.dyingRed.length - 1];
        this.dyingRed.pop();
        continue;
      }
      a.vy -= 18 * dt;
      a.y = Math.max(0, a.y + a.vy * dt);
      a.x += a.vx * dt;
      a.d += a.vd * dt;
      const k = a.t < 0.34 ? 1 : 1 - (a.t - 0.34) / 0.18;
      _pose.x = a.x;
      _pose.y = a.y * 0.15;
      _pose.d = a.d;
      _pose.yaw = a.yaw;
      _pose.phase = 0;
      _pose.scale = Math.max(0.01, 0.52 * k);
      _pose.flash = Math.max(0, 0.75 - a.t * 2.2);
      _pose.tilt = -Math.min(0.32, a.t * 1.2);
      _pose.stride = 0;
      _pose.clip = 'death';
      _pose.cycle = Math.min(0.97, a.t / 0.48);
      this.red.push(_pose);
    }
    this.red.end();
    this.shadows.end();

    let blue = 0;
    let gold = 0;
    for (let k = 0; k < w.gates.length; k++) {
      const g = w.gates[k];
      if (g.consumed || g.d < -3 || g.d > 100) continue;
      const isBlue = g.carnage === 'recruit';
      const x = (g.x0 + g.x1) / 2;
      const y = isBlue ? 0.55 : 0.95;
      const a = isBlue ? this.blueBoards : this.yellowBoards;
      const b = isBlue ? this.blueText : this.yellowText;
      const idx = isBlue ? blue++ : gold++;
      place(a, idx, x, y, -g.d);
      place(b, idx, x, y + 0.01, -g.d + 0.125);
    }
    commitInstances(this.blueText, blue, this.prevBlue);
    this.prevBlue = commitInstances(this.blueBoards, blue, this.prevBlue);
    commitInstances(this.yellowText, gold, this.prevGold);
    this.prevGold = commitInstances(this.yellowBoards, gold, this.prevGold);

    let pods = 0;
    let battery: (typeof w.barrels)[number] | undefined;
    let pod: (typeof w.barrels)[number] | undefined;
    for (let k = 0; k < w.barrels.length; k++) {
      const b = w.barrels[k];
      if (!b.alive) continue;
      if (!battery && b.carnage === 'battery') battery = b;
      if (!pod && b.carnage === 'pod') pod = b;
      if (b.d < 100) {
        if (b.carnage === 'battery') {
          for (let j = 0; j < POD_OFFSETS.length; j++) {
            place(this.pods, pods++, b.x + POD_OFFSETS[j][0], POD_OFFSETS[j][1], -b.d, 0.82);
          }
        } else {
          place(this.pods, pods++, b.x, 0, -b.d, 0.95);
        }
      }
    }
    this.prevPods = commitInstances(this.pods, pods, this.prevPods);

    this.counterSprite.visible = !menu && !!battery;
    if (battery) {
      const bhp = Math.ceil(battery.hp);
      if (bhp !== this.lastBatteryHp) {
        this.lastBatteryHp = bhp;
        this.counter.set(String(bhp), { fill: '#ffffff', stroke: '#211b17', size: 116 });
      }
      this.counterSprite.position.set(battery.x, 0.8, -battery.d + 1.9);
    }
    this.podSprite.visible = !menu && !!pod;
    if (pod) {
      const php = Math.ceil(pod.hp);
      if (php !== this.lastPodHp) {
        this.lastPodHp = php;
        this.podCounter.set(String(php), { fill: '#ffffff', stroke: '#211b17', size: 82 });
      }
      this.podSprite.position.set(pod.x, 0.6, -pod.d + 1.1);
    }

    for (let i = 0; i < w.bosses.length; i++) {
      const b = w.bosses[i];
      if (this.deadChampionIds.has(b.id)) continue;
      let v = this.champions.get(b.id);
      if (!v) {
        v = new RedChampion(this.scene, b, this.swordGeom);
        this.champions.set(b.id, v);
      }
      v.update(dt, t, menu);
      if (v.isDeadDone) {
        v.dispose();
        this.champions.delete(b.id);
        this.deadChampionIds.add(b.id);
      }
    }

    this.bullets.update(w.bullets);
    let mi = 0;
    for (let i = 0; i < w.rockets.length; i++) {
      const r = w.rockets[i];
      const k = Math.min(1, r.t / r.T);
      const y = 0.8 + Math.sin(k * Math.PI) * 5;
      const x = THREE.MathUtils.lerp(r.x0, r.x, k);
      const d = THREE.MathUtils.lerp(r.d0, r.d, k);
      dir.set(r.x - r.x0, Math.cos(k * Math.PI) * 9, -(r.d - r.d0)).normalize();
      q.setFromUnitVectors(up, dir);
      p.set(x, y, -d);
      size.set(1, 1, 1);
      m.compose(p, q, size);
      this.missiles.setMatrixAt(mi++, m);
      if (dt > 0) this.sparks.spawn(x, y, -d, 0.1, -0.5, 2, 0.22, 0.11, 0xffc630, 0);
    }
    this.prevMissiles = commitInstances(this.missiles, mi, this.prevMissiles);

    this.sparks.update(dt);
    this.debris.update(dt);
    this.explosions.update(dt);
    this.rings.update(dt);

    this.squadSprite.visible = !menu;
    if (w.squad.count !== this.lastSquadCount) {
      this.lastSquadCount = w.squad.count;
      this.squadLabel.set(String(w.squad.count), { fill: '#ffffff', stroke: '#153581', pill: '#1d5fe2', size: 72 });
    }
    this.squadSprite.position.set(w.squad.x, 1.25, -Math.max(-2, w.back * 0.2));

    configureCarnageCamera(this.camera, this.width, this.height, w.back);
    if (!reduced && this.trauma > 0) {
      const s = this.trauma * this.trauma * 0.65;
      this.camera.position.x += Math.sin(t * 67) * s;
      this.camera.position.y += Math.cos(t * 53) * s * 0.6;
      this.trauma = Math.max(0, this.trauma - dt * 2.4);
    }
    this.camera.updateMatrixWorld();
    this.flashes.update(dt, this.camera);
    this.impacts.update(dt, this.camera);
    this.texts.update(dt, this.camera, this.width, this.height);
  }

  render(renderer: THREE.WebGLRenderer) {
    renderer.render(this.scene, this.camera);
  }
}
