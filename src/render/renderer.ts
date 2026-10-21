import * as THREE from 'three';
import { BOSSES, DEFENSE_VIEW_D, MAX_SOLDIERS_SIM, THROW_RADIUS, TRACK_HALF, WEAPONS, ZOMBIES, type SkinDef, type ZombieKind } from '../game/config';
import type { GameEvent, World, Zombie } from '../game/world';
import type { Models } from './assets';
import { ModelBossView, bakeSoldierBody, bossModel, buildSoldier, buildZombies, gunStatic, propGeometry, type SoldierKit } from './characters';
import { Crowd, type AgentPose } from './crowd';
import { BlobShadows, BulletMesh, Explosions, Flashes, FloatTexts, Particles, Pillar, Rings, Splats, Streaks, ZombieBars } from './effects';
import { BarrelView, BossView, GATE_COLORS, GateView, HazardView, ProjectileView, StrikeView, WallsView, stripeTexture } from './entities';
import { Environment } from './environment';
import { HpBar, formatNumber } from './label';
import { setGunProvider, soldierBody, soldierLeg } from './models';
import { zombieBody, zombieLeg } from './props';
import { VatCrowd } from './vat';

type Pose = AgentPose & { clip?: string; cycle?: number };

/** 一群人的画法：代码生成的 Crowd，或者烘焙动画的 VatCrowd */
interface Herd {
  begin(): void;
  push(p: Pose): void;
  end(): void;
}

/** 外部模型的士兵：身体和枪是两个实例网格，姿势完全一样 */
class SquadHerd implements Herd {
  constructor(
    readonly body: VatCrowd,
    readonly gun: VatCrowd,
  ) {}
  begin() {
    this.body.begin();
    this.gun.begin();
  }
  push(p: Pose) {
    this.body.push(p);
    this.gun.push(p);
  }
  end() {
    this.body.end();
    this.gun.end();
  }
}

interface Dying {
  x: number;
  y: number;
  d: number;
  vx: number;
  vy: number;
  vd: number;
  yaw: number;
  t: number;
  scale: number;
  tint?: readonly [number, number, number];
}

const ZOMBIE_CAPS: Record<ZombieKind, number> = { walker: 700, runner: 360, brute: 90, exploder: 90, giant: 8 };
const KINDS = Object.keys(ZOMBIE_CAPS) as ZombieKind[];
const VIEW_AHEAD = 120;
/** 每帧复用的临时向量（不在主循环里 new，少给垃圾回收添活） */
const _camPos = new THREE.Vector3();
const _camLook = new THREE.Vector3();
const _weaponLook = new THREE.Vector3();
const _weaponTarget = new THREE.Vector3();
const _heroPos = new THREE.Vector3();
const _heroLook = new THREE.Vector3();
const _badge = new THREE.Vector3();

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/** 不同丧尸的颜色变化 */
function zombieTint(look: number): [number, number, number] {
  return [0.82 + look * 0.32, 0.9 + ((look * 7) % 1) * 0.18, 1.08 - look * 0.3];
}

/** 门的主色（和 GateView 一致） */
function gateColorOf(g: World['gates'][number]): number {
  if (g.kind === 'weapon') return GATE_COLORS.weapon;
  if (g.kind === 'rate') return g.value >= 0 ? GATE_COLORS.rate : GATE_COLORS.bad;
  if (g.kind === 'mul') return GATE_COLORS.mul;
  return g.value >= 0 ? GATE_COLORS.good : GATE_COLORS.bad;
}

/** 外部模型的丧尸本身有颜色，只做轻微明暗变化 */
function zombieShade(look: number): [number, number, number] {
  const k = 0.88 + look * 0.24;
  return [k, k * (0.97 + ((look * 7) % 1) * 0.06), k];
}

function weightScale(z: Zombie): number {
  return z.weight > 1 ? 1 + Math.min(0.6, Math.log2(z.weight) * 0.14) : 1;
}

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1500);
  private readonly env: Environment;
  private readonly sun: THREE.DirectionalLight;
  private readonly hemi: THREE.HemisphereLight;
  private readonly players: Herd;
  private readonly zombies: Record<ZombieKind, Herd>;
  private readonly bullets: BulletMesh;
  private readonly sparks: Particles;
  private readonly debris: Particles;
  private readonly rings: Rings;
  private readonly pillar: Pillar;
  /** 换枪镜头行程使用真实时间，和卡片保持同一段连续动作 */
  private weaponCueAge = 0.9;
  private readonly weaponCueDuration = 0.9;
  private readonly streaks: Streaks;
  private readonly flashes: Flashes;
  /** 子弹打中东西时的白色冲击星 */
  private readonly impacts: Flashes;
  /** 换枪时全队闪白（1→0） */
  private tierFlash = 0;
  /** 每扇门上次放“数字涨了”特效的时间，免得刷屏 */
  private readonly gatePopAt = new Map<number, number>();
  private readonly splats: Splats;
  private readonly blobs: BlobShadows;
  /**
   * 画质档位 0 高 / 1 中 / 2 低：按真实帧率自动升降（手机人一多就降分辨率、少画几个兵、关阴影）。
   * 网址加 ?quality=0/1/2 可以固定。
   */
  private quality = 0;
  private qualityLocked = false;
  private frameEma = 1 / 60;
  private qualityTimer = 0;
  private qualityHold = 0;
  private basePixelRatio = 1;
  /** 枪口相对士兵脚下的位置（换成外部模型后按模型调） */
  private muzzle = { x: 0.07, y: 0.72, z: 0.55 };
  private readonly explosions: Explosions;
  private readonly texts: FloatTexts;
  private readonly walls: WallsView;
  private gates = new Map<number, GateView>();
  private barrels = new Map<number, BarrelView>();
  private hazards = new Map<number, HazardView>();
  private bosses: (BossView | ModelBossView)[] = [];
  private readonly models: Models;
  private soldierKit: SoldierKit | null = null;
  /** 道具几何体缓存：模型名 + 尺寸 */
  private readonly propCache = new Map<string, THREE.BufferGeometry | null>();
  private projectiles = new Map<number, ProjectileView>();
  private strikes = new Map<number, StrikeView>();
  private giantLabels: { bar: HpBar; sprite: THREE.Sprite }[] = [];
  private readonly zombieBars: ZombieBars;
  private readonly mobile: boolean;
  private dyingPlayers: Dying[] = [];
  private dyingZombies: Record<ZombieKind, Dying[]>;
  private tier = -1;
  private skin: SkinDef;
  private trauma = 0;
  private bossBlend = 0;
  /** 1 = 菜单机位：镜头压低看向队伍，让队伍出现在屏幕中间 */
  private menuBlend = 1;
  menu = true;
  private readonly camPos = new THREE.Vector3();
  private readonly camLook = new THREE.Vector3();
  private readonly squadPos = new THREE.Vector3();
  private readonly badge: HTMLDivElement;
  private time = 0;
  private width = 1;
  private height = 1;
  private world: World | null = null;
  private version = -1;
  /** 打 Boss/巨尸时累积伤害，隔一会儿飘一个数字 */
  private dmgAcc = new Map<number, { dmg: number; x: number; y: number; d: number; t: number }>();

  constructor(canvas: HTMLCanvasElement, fxLayer: HTMLElement, skin: SkinDef, models: Models = {}) {
    this.models = models;
    const mobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
    this.mobile = mobile;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.skin = skin;
    this.env = new Environment(this.scene);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x9fb3c8, 1.6);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.2);
    this.sun.castShadow = true;
    const size = mobile ? 1024 : 2048;
    this.sun.shadow.mapSize.set(size, size);
    const sc = this.sun.shadow.camera;
    sc.left = -16;
    sc.right = 16;
    sc.top = 24;
    sc.bottom = -14;
    sc.near = 1;
    sc.far = 70;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);

    // 有外部模型就用烘焙动画的实例网格，没有就退回代码生成的小人
    const cap = MAX_SOLDIERS_SIM + 120;
    if (models.soldier) {
      const soldier = models.soldier;
      this.soldierKit = buildSoldier(soldier, skin);
      const guns = new Map<string, THREE.BufferGeometry | null>();
      setGunProvider((tier, length) => {
        const key = `${tier}:${length.toFixed(2)}`;
        if (!guns.has(key)) guns.set(key, gunStatic(soldier, tier, length));
        return guns.get(key)!;
      });
      this.players = new SquadHerd(new VatCrowd(this.scene, cap, this.soldierKit.body), new VatCrowd(this.scene, cap, this.soldierKit.guns[0]));
      this.muzzle = this.soldierKit.muzzles[0];
    } else {
      this.players = new Crowd(this.scene, cap, soldierBody(skin, 0), soldierLeg(skin.team));
    }
    const baked = buildZombies(models);
    this.zombies = {} as Record<ZombieKind, Herd>;
    this.dyingZombies = {} as Record<ZombieKind, Dying[]>;
    for (const k of KINDS) {
      const model = baked[k];
      this.zombies[k] = model ? new VatCrowd(this.scene, ZOMBIE_CAPS[k], model) : new Crowd(this.scene, ZOMBIE_CAPS[k], zombieBody(k), zombieLeg(k));
      this.dyingZombies[k] = [];
    }
    this.bullets = new BulletMesh(this.scene);
    this.sparks = new Particles(
      this.scene,
      new THREE.OctahedronGeometry(1, 0),
      new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
      1000,
    );
    this.debris = new Particles(this.scene, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), 1100);
    this.rings = new Rings(this.scene);
    this.pillar = new Pillar(this.scene);
    this.streaks = new Streaks(this.scene);
    this.flashes = new Flashes(this.scene);
    this.impacts = new Flashes(this.scene, 48);
    this.impacts.setColor(0xfff4d0);
    this.splats = new Splats(this.scene);
    this.blobs = new BlobShadows(this.scene);
    const fixed = new URLSearchParams(location.search).get('quality');
    if (fixed !== null && /^[012]$/.test(fixed)) {
      this.qualityLocked = true;
      this.quality = Number(fixed);
    }
    this.explosions = new Explosions(this.scene);
    this.zombieBars = new ZombieBars(this.scene);
    this.texts = new FloatTexts(fxLayer);
    this.walls = new WallsView(this.scene);

    this.badge = document.createElement('div');
    this.badge.className = 'squad-badge';
    fxLayer.appendChild(this.badge);
  }

  resize(w: number, h: number) {
    this.width = w;
    this.height = h;
    // 大窗口下限制总像素数（约 260 万），避免桌面全屏时掉帧；再乘上当前画质档位的系数
    const budget = Math.sqrt(2.6e6 / Math.max(1, w * h));
    this.basePixelRatio = Math.max(1, Math.min(window.devicePixelRatio, this.mobile ? 2 : 1.5, budget));
    this.applyPixelRatio();
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.8 ? 56 : w / h < 1.2 ? 50 : 42;
    this.camera.updateProjectionMatrix();
  }

  private applyPixelRatio() {
    const k = [1, 0.8, 0.62][this.quality];
    this.renderer.setPixelRatio(Math.max(0.75, this.basePixelRatio * k));
  }

  /** 每帧报一次真实帧间隔（秒）：持续掉帧就降一档，稳住了再慢慢升回来 */
  trackFrame(realDt: number) {
    if (this.qualityLocked || realDt <= 0 || realDt > 0.25) return;
    this.frameEma += (realDt - this.frameEma) * 0.05;
    this.qualityTimer += realDt;
    this.qualityHold = Math.max(0, this.qualityHold - realDt);
    if (this.qualityTimer < 2) return;
    this.qualityTimer = 0;
    if (this.frameEma > 1 / 47 && this.quality < 2) {
      this.setQuality(this.quality + 1);
      this.qualityHold = 15;
    } else if (this.frameEma < 1 / 57 && this.quality > 0 && this.qualityHold <= 0) {
      this.setQuality(this.quality - 1);
      this.qualityHold = 10;
    }
  }

  private setQuality(q: number) {
    if (q === this.quality) return;
    this.quality = q;
    this.applyPixelRatio();
    this.renderer.setSize(this.width, this.height, false);
    // 低档关掉太阳阴影（第一次切换会重编译一下着色器）
    const shadows = q < 2;
    if (this.sun.castShadow !== shadows) {
      this.sun.castShadow = shadows;
      this.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (!m) return;
        for (const mat of Array.isArray(m) ? m : [m]) mat.needsUpdate = true;
      });
    }
  }

  /** 当前档位最多画几个士兵（模拟里还是全部算，只是少画几个） */
  private get soldierCap(): number {
    return [440, 300, 190][this.quality];
  }

  setSkin(skin: SkinDef) {
    if (this.skin.id === skin.id) return;
    const previousBody = this.soldierKit?.body;
    this.skin = skin;
    if (this.soldierKit && this.models.soldier && this.players instanceof SquadHerd) {
      this.soldierKit.body = bakeSoldierBody(this.models.soldier, skin);
      this.players.body.setModel(this.soldierKit.body);
      // 身体每换一次都会生成一张新的 VAT 浮点纹理；旧纹理已不再被网格使用。
      previousBody?.pos.dispose();
    } else if (this.players instanceof Crowd) {
      this.players.setGeometry(soldierBody(skin, Math.max(0, this.tier)), soldierLeg(skin.team));
    }
    this.badge.style.setProperty('--team', `#${skin.team.toString(16).padStart(6, '0')}`);
  }

  loadLevel(world: World) {
    this.world = world;
    for (const v of this.gates.values()) this.dropView(v.group, v);
    for (const v of this.barrels.values()) this.dropView(v.group, v);
    for (const v of this.hazards.values()) this.dropView(v.group, v);
    for (const v of this.projectiles.values()) v.dispose();
    for (const v of this.strikes.values()) v.dispose();
    for (const b of this.bosses) b.dispose();
    this.gates.clear();
    this.barrels.clear();
    this.hazards.clear();
    this.projectiles.clear();
    this.strikes.clear();
    this.bosses = world.bosses.map((b) => this.makeBossView(b, false));
    this.version = -1;
    this.syncViews();

    this.env.build(world.spec.theme, world.spec.length + 6);
    const th = this.env.theme;
    this.sun.color.set(th.sun);
    this.sun.intensity = th.sunIntensity;
    this.hemi.color.set(th.hemiSky);
    this.hemi.groundColor.set(th.hemiGround);
    this.hemi.intensity = th.hemiIntensity;
    this.dyingPlayers = [];
    for (const k of KINDS) this.dyingZombies[k] = [];
    this.dmgAcc.clear();
    this.sparks.clear();
    this.debris.clear();
    this.rings.clear();
    this.pillar.clear();
    this.weaponCueAge = this.weaponCueDuration;
    this.streaks.clear();
    this.flashes.clear();
    this.impacts.clear();
    this.gatePopAt.clear();
    this.splats.clear();
    this.explosions.clear();
    this.texts.clear();
    this.trauma = 0;
    this.bossBlend = 0;
    this.menuBlend = this.menu ? 1 : 0;
    this.tier = -1;
    this.syncTier(world.squad.tier);
    this.badge.style.setProperty('--team', `#${this.skin.team.toString(16).padStart(6, '0')}`);
    this.placeCamera(world, 1, 0);
  }

  private dropView(group: THREE.Object3D, v: { dispose(): void }) {
    this.scene.remove(group);
    v.dispose();
  }

  /** 世界里实体增删后，补建或回收对应的视图 */
  private syncViews() {
    const w = this.world!;
    if (w.version === this.version) return;
    this.version = w.version;
    // 防线中途刷出来的 Boss 从天而降
    for (const b of w.bosses) if (!this.bosses.some((v) => v.boss === b)) this.bosses.push(this.makeBossView(b, !!w.defense && w.time > 0.5));
    const seen = new Set<number>();
    for (const g of w.gates) {
      seen.add(g.id);
      if (!this.gates.has(g.id)) {
        const v = new GateView(g);
        this.gates.set(g.id, v);
        this.scene.add(v.group);
      }
    }
    for (const [id, v] of this.gates) if (!seen.has(id)) (this.dropView(v.group, v), this.gates.delete(id));
    seen.clear();
    for (const b of w.barrels) {
      seen.add(b.id);
      if (!this.barrels.has(b.id)) {
        const v = new BarrelView(b, this.skin, (name, fit) => this.prop(name, fit));
        this.barrels.set(b.id, v);
        this.scene.add(v.group);
      }
    }
    for (const [id, v] of this.barrels) if (!seen.has(id)) (this.dropView(v.group, v), this.barrels.delete(id));
    seen.clear();
    for (const h of w.hazards) {
      seen.add(h.id);
      if (!this.hazards.has(h.id)) {
        const v = new HazardView(h);
        this.hazards.set(h.id, v);
        this.scene.add(v.group);
      }
    }
    for (const [id, v] of this.hazards) if (!seen.has(id)) (this.dropView(v.group, v), this.hazards.delete(id));
  }

  private makeBossView(b: World['bosses'][number], dropIn: boolean): BossView | ModelBossView {
    const model = bossModel(this.models, b.kind);
    return model ? new ModelBossView(this.scene, b, model, dropIn) : new BossView(this.scene, b, dropIn);
  }

  /** 外部道具模型（缓存），没有就返回 null 让调用方用代码生成的 */
  private prop(name: string, fit: number): THREE.BufferGeometry | null {
    const key = `${name}:${fit.toFixed(2)}`;
    if (!this.propCache.has(key)) {
      const g = propGeometry(this.models, name, fit);
      if (g) g.userData.shared = true;
      this.propCache.set(key, g);
    }
    return this.propCache.get(key)!;
  }

  private syncTier(tier: number) {
    if (tier === this.tier) return;
    // 对局里换了更好的枪：全队闪一下，脚下冲起一道光柱、两圈冲击波，镜头往前推一下（开局建档时不算）
    if (this.tier >= 0 && tier > this.tier && this.world) {
      this.tierFlash = 1;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        this.weaponCueAge = this.weaponCueDuration;
      } else if (this.weaponCueAge >= this.weaponCueDuration) {
        this.weaponCueAge = 0;
      } else if (this.weaponCueAge > this.weaponCueDuration / 2) {
        // 连续换枪时沿当前镜头位置继续推近，不让镜头跳回基础机位。
        this.weaponCueAge = this.weaponCueDuration - this.weaponCueAge;
      }
      const sq = this.world.squad;
      const color = WEAPONS[tier].color;
      const width = Math.max(1.6, this.world.halfWidth + 0.6);
      this.pillar.spawn(sq.x, -sq.d, width, color);
      this.rings.spawn(sq.x, -sq.d, width * 2.4, color, 0.6);
      this.rings.spawn(sq.x, -sq.d, width * 4, 0xffffff, 0.9);
      this.sparks.burst(sq.x, 1.2, -sq.d, 60, 11, 0.9, 0.16, [color, 0xffffff], 4, 0.8);
      this.shake(0.12);
    }
    this.tier = tier;
    if (this.soldierKit && this.players instanceof SquadHerd) {
      this.players.gun.setModel(this.soldierKit.guns[tier]);
      this.muzzle = this.soldierKit.muzzles[tier];
    } else if (this.players instanceof Crowd) {
      this.players.setGeometry(soldierBody(this.skin, tier), soldierLeg(this.skin.team));
    }
    // 子弹颜色：有特殊弹种（穿甲、爆裂、电磁）就用弹种的颜色
    const ammoColor = this.world?.ammo.color ?? null;
    this.bullets.setColor(WEAPONS[tier].color, tier, ammoColor ?? WEAPONS[tier].color);
    this.flashes.setColor(WEAPONS[tier].color);
  }

  shake(amount: number) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  handleEvents(events: GameEvent[]) {
    const w = this.world;
    if (!w) return;
    let sparkBudget = 26;
    let impactBudget = 10;
    let splashBudget = 6;
    const sq = w.squad;
    for (const e of events) {
      switch (e.type) {
        case 'hit': {
          if (e.target === 'boss' || e.target === 'giant' || e.target === 'barrel') {
            // 打 Boss、巨尸、大障碍时累积伤害，隔一会儿飘一个数字
            const acc = this.dmgAcc.get(e.id) ?? { dmg: 0, x: e.x, y: e.y, d: e.d, t: 0 };
            acc.dmg += e.dmg;
            acc.x = e.x;
            acc.d = e.d;
            acc.y = e.target === 'boss' ? 4.5 : e.target === 'giant' ? 3 : 2.6;
            this.dmgAcc.set(e.id, acc);
          }
          if (impactBudget > 0 && e.target !== 'gate' && Math.random() < 0.5) {
            impactBudget--;
            const big = e.target === 'boss' || e.target === 'barrel' ? 0.75 : e.target === 'giant' ? 0.6 : 0.42;
            this.impacts.spawn(e.x + (Math.random() - 0.5) * 0.3, e.y + (Math.random() - 0.3) * 0.4, -e.d + 0.3, big);
          }
          if (sparkBudget <= 0 || Math.random() < 0.35) break;
          sparkBudget--;
          const col = e.target === 'gate' ? 0xffffff : e.target === 'barrel' ? 0xffa53d : e.color;
          this.sparks.burst(e.x, e.y, -e.d, 2, 4, 0.22, 0.08, [col, 0xffe08a], 6, 0.2);
          if (e.target === 'zombie' && Math.random() < 0.3) this.debris.burst(e.x, e.y, -e.d, 1, 3, 0.4, 0.08, [0x6fae4a], 20);
          if (e.target === 'barrel' && Math.random() < 0.25) this.debris.burst(e.x, e.y, -e.d, 1, 4, 0.6, 0.12, [0x8a5222], 20);
          break;
        }
        case 'gateUp': {
          const g = e.gate;
          // 数字往上涨：门板上冒一小撮同色亮片（每扇门 0.15 秒最多一次）
          const now = this.time;
          if (now - (this.gatePopAt.get(g.id) ?? -1) > 0.15) {
            this.gatePopAt.set(g.id, now);
            const col = gateColorOf(g);
            this.sparks.burst((g.x0 + g.x1) / 2, 1.3, -g.d + 0.2, 7, 3.5, 0.4, 0.1, [col, 0xffffff], 4, 0.7);
          }
          if (g.kind === 'weapon') {
            const x = (g.x0 + g.x1) / 2;
            this.texts.spawn(`Lv.${g.value}!`, x, 3.2, -g.d, 'gold', 0.9, 1.2);
            this.sparks.burst(x, 2.5, -g.d, 16, 5, 0.5, 0.12, [0xffd34d, 0xffffff], 6, 0.4);
          }
          break;
        }
        case 'gatePass': {
          const g = e.gate;
          let text: string;
          let good: boolean;
          let color: number;
          if (g.kind === 'weapon') {
            good = e.after > e.before;
            text = good ? `${WEAPONS[e.after].name}!` : '武器没变';
            color = GATE_COLORS.weapon;
          } else if (g.kind === 'rate') {
            good = e.after >= e.before;
            text = `射速 ${good ? '+' : ''}${e.after - e.before}%`;
            color = good ? GATE_COLORS.rate : GATE_COLORS.bad;
          } else {
            const delta = e.after - e.before;
            good = delta >= 0;
            text = g.kind === 'mul' ? `×${g.value}` : good ? `+${delta}` : String(delta);
            color = g.kind === 'mul' ? GATE_COLORS.mul : good ? GATE_COLORS.good : GATE_COLORS.bad;
          }
          this.texts.spawn(text, sq.x, 2.6, -sq.d, g.kind === 'weapon' && good ? 'big gold' : good ? 'big good' : 'big bad', 1.2, 2);
          // 门板碎成一片片飞出去
          this.debris.burst((g.x0 + g.x1) / 2, 1.2, -g.d, 16, 7, 0.7, 0.16, [color, 0xffffff], 18, 0.5);
          this.rings.spawn(sq.x, -sq.d, 3.2, color, 0.4);
          this.sparks.burst(sq.x, 1.2, -sq.d, 26, 9, 0.6, 0.14, [color, 0xffffff], 10, 0.4);
          if (!good) {
            this.shake(0.25);
            this.flash('bad');
          }
          break;
        }
        case 'zombieDie': {
          const def = ZOMBIES[e.kind];
          const big = e.kind === 'giant' ? 2 : e.kind === 'brute' ? 1.4 : 1;
          this.dyingZombies[e.kind].push({ x: e.x, y: 0, d: e.d, vx: (Math.random() - 0.5) * 3, vy: 3 + Math.random() * 3, vd: 2 + Math.random() * 3, yaw: Math.PI, t: 0, scale: def.scale, tint: this.zombies[e.kind] instanceof VatCrowd ? zombieShade(e.look) : zombieTint(e.look) });
          this.debris.burst(e.x, 0.7 * def.scale, -e.d, Math.round(3 * big), 4 * big, 0.5, 0.11 * big, [0x6fae4a, 0x4d7a35, 0x8fbf6a], 18);
          if (Math.random() < 0.7) this.splats.spawn(e.x, -e.d, def.scale * (e.kind === 'giant' ? 1.6 : 1.1), e.kind === 'exploder' ? 0xb8e04a : 0x5f8f3a);
          if (e.coins > 0 && Math.random() < 0.5) this.debris.burst(e.x, 1, -e.d, Math.min(6, e.coins), 4, 0.7, 0.14, [0xffcc33], 22, 0.8);
          if (e.kind === 'giant') {
            this.explosions.spawn(e.x, 1.5, -e.d, 2.2);
            this.shake(0.4);
          }
          break;
        }
        case 'soldierDie': {
          this.dyingPlayers.push({ x: e.x, y: 0, d: e.d, vx: (Math.random() - 0.5) * 3, vy: 3 + Math.random() * 2, vd: -2 - Math.random() * 2, yaw: 0, t: 0, scale: 1 });
          this.debris.burst(e.x, 0.7, -e.d, 2, 3, 0.5, 0.1, [this.skin.team, this.skin.shirt], 18);
          break;
        }
        case 'barrelBreak': {
          const b = e.barrel;
          const view = this.barrels.get(b.id);
          const colors =
            b.look === 'tires' ? [0x2a2a2e, 0x55555c, 0x8f8f96] : b.look === 'cage' ? [0x9aa1aa, 0x3b3f46] : b.look === 'crate' ? [0x5b6b3a, 0x3d4a26, 0xf2c21b] : [0xa8682f, 0x8a5222, 0x6b6f76];
          this.debris.burst(b.x, 1, -b.d, 26, 9, 1.1, 0.28, colors, 22, 0.5);
          if (b.look !== 'cage') this.explosions.spawn(b.x, 1, -b.d, 1.8);
          else this.sparks.burst(b.x, 1, -b.d, 24, 7, 0.6, 0.18, [0xffffff, 0x9be8a8], 4, 0.6);
          this.rings.spawn(b.x, -b.d, 5, 0xffb347, 0.45);
          this.shake(0.3);
          view?.startFly();
          if (b.block && w.defense) {
            // 放行：门道上一片速度线冲向镜头
            const x0 = w.defense.gateSide < 0 ? -TRACK_HALF : 0.3;
            this.streaks.burst(x0, x0 + TRACK_HALF - 0.3, -(b.d + 40), -b.d, 46, 34);
            this.texts.spawn('冲啊！', b.x, 2.2, -(b.d - 6), 'big good', 0.8, 1.4);
          }
          break;
        }
        case 'reward': {
          const r = e.reward;
          if (r.kind === 'weapon') {
            if (e.upgraded) {
              this.texts.spawn(`${WEAPONS[r.tier].name}!`, sq.x, 2.8, -sq.d, 'big gold', 1.4, 1.8);
              this.rings.spawn(sq.x, -sq.d, 3.6, 0xffd34d, 0.5);
              this.sparks.burst(sq.x, 1.0, -sq.d, 30, 8, 0.7, 0.14, [0xffd34d, 0xffffff], 8, 0.5);
            }
          } else if (r.kind === 'soldiers') {
            this.texts.spawn(`+${r.amount}`, sq.x, 2.6, -sq.d, 'big good', 1.2, 1.8);
          } else if (r.kind === 'coins') {
            this.texts.spawn(`+${r.amount} 金币`, e.x, 2.5, -e.d, 'gold', 1.2, 1.5);
          } else if (r.kind === 'rate') {
            this.texts.spawn(`射速 +${r.amount}%`, sq.x, 2.6, -sq.d, 'big good', 1.2, 1.8);
          } else {
            this.texts.spawn('空袭！', sq.x, 3, -sq.d, 'big gold', 1.2, 1.8);
          }
          break;
        }
        case 'explode': {
          const r = e.r;
          this.explosions.spawn(e.x, 0.8, -e.d, r * (e.source === 'exploder' ? 1 : 1.2));
          this.debris.burst(e.x, 0.6, -e.d, Math.round(8 + r * 4), 7 + r * 2, 0.9, 0.2, e.source === 'exploder' ? [0x8fbf6a, 0xd9ff4a, 0x4d7a35] : [0x8f8f8f, 0x5a5a5a, 0xc23a2e], 20, 0.6);
          this.rings.spawn(e.x, -e.d, r * 2.2, e.source === 'exploder' ? 0xd9ff4a : 0xff8a1f, 0.45);
          // 油桶炸到人：大大的伤亡数字，屏幕边缘闪红
          if (e.source === 'impact' && e.killed > 0) {
            this.texts.spawn(`-${formatNumber(e.killed)}`, e.x, 2.4, -e.d, 'big bad', 1.3, 1.6);
            this.flash('bad');
            this.shake(0.5);
          }
          this.shake(e.source === 'strike' ? 0.22 : 0.35);
          break;
        }
        case 'giantSmash': {
          this.rings.spawn(e.x, -e.d, 5, 0xff4d4d, 0.45);
          this.debris.burst(e.x, 0.3, -e.d, 12, 6, 0.7, 0.2, [0xb8b8b8, 0x8f8f8f], 20, 0.6);
          this.shake(0.3);
          if (e.killed > 0) this.texts.spawn(`-${e.killed}`, sq.x, 2.6, -sq.d, 'bad', 0.9, 1.4);
          break;
        }
        case 'gem': {
          this.texts.spawn(`+${e.amount} 钻石`, e.x, 2.2, -e.d, 'gem', 1.4, 1.6);
          this.sparks.burst(e.x, 1.5, -e.d, 16, 5, 0.6, 0.12, [0x8fe3ff, 0x47a8ff, 0xffffff], 6, 0.6);
          break;
        }
        case 'bossEnrage': {
          // 半血狂暴：红光一闪、震屏、冒一圈红色冲击波
          const b = e.boss;
          this.rings.spawn(b.x, -b.d, 8, 0xff2a2a, 0.6);
          this.sparks.burst(b.x, 3, -b.d, 30, 8, 0.7, 0.2, [0xff3b3b, 0xffb3a0], 6, 0.5);
          this.shake(0.4);
          this.flash('boss');
          break;
        }
        case 'bossStart': {
          this.shake(0.2);
          this.flash('boss');
          break;
        }
        case 'bossSmash': {
          this.rings.spawn(e.x, -e.d, 9, 0xff4d4d, 0.55);
          this.debris.burst(e.x, 0.3, -e.d, 18, 7, 0.8, 0.22, [0xb8b8b8, 0x8f8f8f], 20, 0.6);
          this.shake(0.55);
          if (e.killed > 0) this.texts.spawn(`-${e.killed}`, sq.x, 2.6, -sq.d, 'big bad', 1, 1.6);
          break;
        }
        case 'throw': {
          this.projectiles.set(e.proj.id, new ProjectileView(this.scene, e.proj, THROW_RADIUS));
          this.bosses.find((b) => b.boss === e.boss)?.thrown();
          break;
        }
        case 'hiveSpawn': {
          const b = e.boss;
          this.debris.burst(b.x, 1.5, -(b.d - b.r), 18, 6, 0.6, 0.16, [0x7a4f8f, 0xd9ff4a], 16, 0.5);
          break;
        }
        case 'bossDie': {
          const b = e.boss;
          const s = BOSSES[b.kind].scale;
          this.explosions.spawn(b.x, 2 * s * 0.5, -b.d, 3.5);
          this.debris.burst(b.x, 3, -b.d, 60, 12, 1.6, 0.3, [0xffcc33, 0xffe27a], 20, 0.6);
          this.sparks.burst(b.x, 3, -b.d, 40, 10, 0.9, 0.35, [0xffd34d, 0xff8a1f, 0xffffff], 4, 0.4);
          this.rings.spawn(b.x, -b.d, 12, 0xffd34d, 0.8);
          this.texts.spawn(`${BOSSES[b.kind].name} 倒下！`, b.x, 2.5, -(b.d - 5), 'big gold', 1.6, 1.2);
          if (e.bounty > 0) this.texts.spawn(`赏金 +${formatNumber(Math.round(e.bounty))}`, b.x, 0.4, -(b.d - 12), 'big gold', 1.8, 1.2);
          // 金币雨
          this.debris.burst(b.x, 3, -b.d, 40, 10, 1.4, 0.22, [0xffcc33, 0xffe27a, 0xffb000], 18, 0.7);
          this.shake(0.7);
          break;
        }
        case 'strike': {
          this.strikes.set(e.strike.id, new StrikeView(this.scene, e.strike));
          break;
        }
        case 'splash': {
          if (splashBudget-- <= 0) break;
          const col = w.ammo.color ?? 0xffa53d;
          this.impacts.spawn(e.x, 0.8, -e.d, e.r * 1.1);
          this.sparks.burst(e.x, 0.7, -e.d, 4, 4 + e.r * 3, 0.3, 0.09, [col, 0xffffff], 8, 0.4);
          break;
        }
        case 'blocked': {
          const b = e.barrel;
          this.texts.spawn('打掉它！', b.x, 0.6, -(b.d - b.r - 3), 'gold', 1.3, 0.7);
          this.rings.spawn(b.x, -b.d, 5, 0xffd34d, 0.5);
          // 重重砸在路上：扬尘 + 震屏
          this.debris.burst(b.x, 0.3, -(b.d - b.r * 0.6), 18, 6, 0.7, 0.2, [0xb8b8b8, 0x8f8f8f], 22, 0.5);
          this.shake(0.35);
          break;
        }
        case 'trap': {
          this.sparks.burst(e.x, 0.5, -e.d, 4, 4, 0.3, 0.1, [0xff3b3b, 0xffffff], 10, 0.5);
          break;
        }
        case 'won': {
          this.sparks.burst(sq.x, 2, -sq.d, 60, 10, 1.4, 0.18, [0xff5a5a, 0xffd34d, 0x5dff7a, 0x5cc2ff, 0xd59bff], 10, 0.8);
          break;
        }
        default:
          break;
      }
    }
  }

  private flash(kind: 'bad' | 'boss') {
    const el = document.getElementById('vignette');
    if (!el) return;
    el.className = '';
    void el.offsetWidth;
    el.className = kind;
  }

  /** 性能计数（平滑后的毫秒数），调试用：window.__game.renderer.perf */
  readonly perf = { render: 0, calls: 0, tris: 0 };

  /** 菜单待机或游戏中每帧调用 */
  update(dt: number, realDt = dt) {
    const w = this.world;
    if (!w) return;
    this.time += dt;
    this.syncViews();
    this.syncTier(w.squad.tier);
    const sq = w.squad;
    const t = this.time;

    // 自己人（外部模型的人群不投实时阴影，脚下画圆形影子）
    this.blobs.begin();
    this.players.begin();
    // 原地开火时也轻轻颠一颠，不然看起来像静止的
    const firing = !sq.moving && (w.state === 'run' || w.state === 'boss') && !this.menu;
    const stride = sq.moving ? 1 : firing ? 0.12 : 0;
    const kit = this.soldierKit;
    // 外部模型：跑着开枪 / 站着开枪 / 待机，各自错开节奏
    const clip = !kit ? undefined : this.menu || (!firing && !sq.moving) ? 'idle' : sq.moving ? 'run' : 'shoot';
    const clipLen = kit && clip ? kit.body.clips[clip].duration : 1;
    // 画质低时人太多就均匀少画几个（模拟里一个不少）
    const nSoldiers = w.soldiers.length;
    const cap = this.soldierCap;
    const keep = nSoldiers > cap ? cap / nSoldiers : 1;
    for (let i = 0; i < nSoldiers; i++) {
      if (keep < 1 && Math.floor(i * keep) === Math.floor((i - 1) * keep)) continue;
      const s = w.soldiers[i];
      const pop = s.spawn < 1 ? easeOutBack(s.spawn) : 1;
      if (kit) {
        const cycle = clip === 'run' ? s.phase / (Math.PI * 2) : t / clipLen + s.phase * 0.37;
        this.players.push({ x: sq.x + s.ox, y: 0, d: sq.d + s.oz, yaw: 0, phase: s.phase, scale: Math.max(0.01, pop) * (1 + this.tierFlash * 0.12), flash: this.tierFlash * 0.7, tilt: 0, stride, clip, cycle });
        this.blobs.push(sq.x + s.ox, -(sq.d + s.oz), 0.8 * pop);
        continue;
      }
      const phase = firing ? s.phase + t * 9 : s.phase;
      // 开火后坐：每个人错开节奏往后一顿
      const kick = firing ? Math.max(0, Math.sin(t * 24 + s.phase * 5)) * 0.07 : 0;
      this.players.push({ x: sq.x + s.ox, y: 0, d: sq.d + s.oz - kick, yaw: 0, phase, scale: Math.max(0.01, pop), flash: 0, tilt: kick * 1.6, stride });
    }
    this.pushDying(this.players, this.dyingPlayers, dt);
    this.players.end();

    // 丧尸：按种类分到不同的实例网格，只画镜头附近的
    for (const k of KINDS) this.zombies[k].begin();
    this.zombieBars.begin(this.camera);
    const lo = sq.d - 14;
    const hi = sq.d + VIEW_AHEAD;
    let giantIdx = 0;
    for (const z of w.zombies) {
      if (!z.alive || z.d < lo || z.d > hi) continue;
      const def = ZOMBIES[z.kind];
      let scale = def.scale * weightScale(z);
      let flash = z.flash;
      if (z.kind === 'exploder') {
        scale *= 1 + Math.sin(t * 8 + z.id) * 0.05;
        flash = Math.max(flash, 0.25 * (Math.sin(t * 6 + z.id) + 1));
      }
      // 挨打时往后一仰；贴着阵型的（巨尸碾人）播攻击动作
      const herd = this.zombies[z.kind];
      const anim = herd instanceof VatCrowd;
      const close = anim && z.active && z.d < sq.d + this.attackReach(w, z);
      this.zombies[z.kind].push({
        x: z.x,
        y: 0,
        d: z.d + z.flash * 0.08,
        yaw: Math.PI,
        phase: z.phase,
        scale,
        flash,
        tilt: -z.flash * (anim ? 0.18 : 0.28),
        stride: z.active ? 1 : 0.15,
        tint: anim ? zombieShade(z.look) : zombieTint(z.look),
        clip: close ? 'attack' : z.active ? 'run' : 'idle',
        cycle: close ? t * 1.3 + z.id * 0.17 : z.phase / (Math.PI * 2),
      });
      if (anim) this.blobs.push(z.x, -z.d, 0.9 * scale);
      if (z.kind === 'giant') this.giantLabel(giantIdx++, z);
      // 防线里尸潮一直显示血条（满血也显示），其他模式只显示挨过打的
      else if (z.hp < z.maxHp || (w.defense && z.d < w.defense.spawnD)) this.zombieBars.push(z.x, scale * (anim ? 1.55 : 1.32) + 0.18, -z.d, 0.78 * scale, Math.max(0, z.hp / z.maxHp));
    }
    for (let i = giantIdx; i < this.giantLabels.length; i++) this.giantLabels[i].sprite.visible = false;
    for (const k of KINDS) {
      this.pushDying(this.zombies[k], this.dyingZombies[k], dt);
      this.zombies[k].end();
    }
    this.zombieBars.end();
    this.blobs.end();

    this.bullets.update(w.bullets);
    // 好枪和电磁弹：随机几颗子弹身后拖一点闪粉/电火花
    const trail = sq.tier >= 5 ? (sq.tier === 6 ? 0xd59bff : 0xffe27a) : w.ammo.name === '电磁弹' ? 0xb98cff : 0;
    if (trail && w.bullets.length && dt > 0) {
      for (let i = 0; i < 6; i++) {
        const b = w.bullets[Math.floor(Math.random() * w.bullets.length)];
        this.sparks.spawn(b.x + (Math.random() - 0.5) * 0.2, 0.72 + (Math.random() - 0.5) * 0.2, -b.d + 0.4, (Math.random() - 0.5) * 1.5, Math.random() * 1.5, 0, 0.22, 0.07, Math.random() < 0.5 ? trail : 0xffffff, 0);
      }
    }
    // 换枪那一下：全队闪白
    this.tierFlash = Math.max(0, this.tierFlash - dt * 2.5);
    // 枪口火光：每帧随机一批士兵的枪口闪一下，枪越好火光越大
    if ((w.state === 'run' || w.state === 'boss') && w.soldiers.length > 0 && dt > 0 && !this.menu) {
      const flashes = Math.min(14, Math.ceil(w.soldiers.length / 6));
      const size = 0.32 + sq.tier * 0.05;
      const m = this.muzzle;
      for (let i = 0; i < flashes; i++) {
        const s = w.soldiers[Math.floor(Math.random() * w.soldiers.length)];
        this.flashes.spawn(sq.x + s.ox + m.x, m.y, -(sq.d + s.oz + m.z), size);
      }
    }

    this.squadPos.set(sq.x, 1, -sq.d);
    stripeTexture.offset.x -= dt * 0.6;
    // 防线：主页上不摆门道队列（会挡住标题）；排在刷新点后面的东西也先不画
    const queueFar = w.defense ? (this.menuBlend > 0.5 ? -1e9 : DEFENSE_VIEW_D) : Infinity;
    for (const v of this.gates.values()) {
      const near = v.gate.d > sq.d - 20 && v.gate.d < Math.min(sq.d + 260, queueFar);
      if (!near) {
        v.group.visible = false;
        continue;
      }
      if (!v.gate.consumed || v.group.visible || v.gate.d > sq.d - 1) v.group.visible = true;
      v.update(dt, t);
    }
    for (const v of this.barrels.values()) {
      v.group.visible = v.barrel.d > sq.d - 15 && v.barrel.d < Math.min(sq.d + VIEW_AHEAD + 30, queueFar);
      v.update(dt, t, this.squadPos);
      const b = v.barrel;
      if (!b.alive || !v.group.visible) continue;
      // 掉到 75% / 50% / 25%：崩下一大块
      const stage = v.consumeStage();
      if (stage) {
        this.debris.burst(b.x, v.topY * 0.6, -b.d + b.r * 0.5, 10 + stage * 4, 6, 0.8, 0.18 + stage * 0.03, [0x8a5222, 0x5a5f66, 0x3a3d45], 20, 0.6);
        this.sparks.burst(b.x, v.topY * 0.6, -b.d + b.r * 0.5, 10, 7, 0.4, 0.12, [0xffd34d, 0xffffff], 8, 0.5);
        this.shake(0.08 + stage * 0.03);
      }
      // 快被打爆时冒烟、冒火星
      const ratio = v.hpRatio;
      if (ratio < 0.5 && Math.random() < dt * (ratio < 0.25 ? 9 : 4)) this.explosions.spawn(b.x + (Math.random() - 0.5) * b.r, v.topY * 0.8, -b.d, 0.35 + Math.random() * 0.3, true);
      if (ratio < 0.25 && Math.random() < dt * 6) this.sparks.burst(b.x, v.topY * 0.7, -b.d + b.r * 0.4, 3, 4, 0.35, 0.08, [0xffb347, 0xffe08a], 10, 0.7);
    }
    for (const v of this.hazards.values()) {
      v.group.visible = v.hazard.d1 > sq.d - 15 && v.hazard.d0 < sq.d + VIEW_AHEAD + 30;
      if (v.group.visible) v.update(t);
    }
    this.walls.set(w.walls, sq.d);
    for (const b of this.bosses) {
      b.update(dt, t);
      if (b.consumeLanding()) {
        const { x, d } = b.boss;
        this.rings.spawn(x, -d, 9, 0xffd34d, 0.6);
        this.debris.burst(x, 0.4, -d, 30, 9, 0.9, 0.24, [0xb8b8b8, 0x8f8f8f, 0x6b6f76], 20, 0.7);
        this.explosions.spawn(x, 0.6, -d, 2.4, true);
        this.shake(0.5);
      }
    }

    const projIds = new Set(w.projectiles.map((p) => p.id));
    for (const [id, v] of this.projectiles) {
      if (projIds.has(id)) v.update();
      else {
        v.dispose();
        this.projectiles.delete(id);
      }
    }
    const strikeIds = new Set(w.strikes.map((s) => s.id));
    for (const [id, v] of this.strikes) {
      if (strikeIds.has(id)) {
        v.update();
        if (Math.random() < 0.6 && v.strike.t > 0) {
          const k = v.strike.t / v.strike.T;
          this.explosions.spawn(v.strike.x + (1 - k) * 4, 26 * (1 - k) + 1.2, -(v.strike.d - 1.5) + (1 - k) * 6, 0.35, true);
        }
      } else {
        v.dispose();
        this.strikes.delete(id);
      }
    }

    this.flushDamage(dt);
    this.sparks.update(dt);
    this.debris.update(dt);
    this.rings.update(dt);
    this.pillar.update(dt);
    this.streaks.update(dt);
    this.flashes.update(dt, this.camera);
    this.impacts.update(dt, this.camera);
    this.splats.update(dt);
    this.explosions.update(dt);

    this.placeCamera(w, Math.min(1, dt * 5), realDt);
    this.env.update(dt, sq.d);
    const look = this.camLook;
    this.sun.position.set(look.x - 7, 20, look.z + 9);
    this.sun.target.position.set(look.x, 0, look.z - 2);

    this.texts.update(dt, this.camera, this.width, this.height);
    this.updateBadge(w);
  }

  private giantLabel(i: number, z: Zombie) {
    let item = this.giantLabels[i];
    if (!item) {
      const bar = new HpBar(320, 80);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: bar.texture, depthTest: false, depthWrite: false, toneMapped: false }));
      sprite.scale.set(3.2, 0.8, 1);
      sprite.renderOrder = 20;
      this.scene.add(sprite);
      item = { bar, sprite };
      this.giantLabels.push(item);
    }
    item.sprite.visible = true;
    item.sprite.position.set(z.x, ZOMBIES.giant.scale * 1.35 + 0.7, -z.d);
    item.bar.set(z.hp / z.maxHp, formatNumber(Math.max(0, Math.ceil(z.hp))), '#ff8a1f', '巨尸');
  }

  /** 每 0.25 秒把累积的伤害飘一次，避免数字刷屏 */
  private flushDamage(dt: number) {
    for (const [id, acc] of this.dmgAcc) {
      acc.t += dt;
      if (acc.t < 0.25) continue;
      if (acc.dmg >= 1) this.texts.spawn(`-${formatNumber(acc.dmg)}`, acc.x + (Math.random() - 0.5) * 1.5, acc.y, -acc.d, 'dmg', 0.7, 1.2);
      this.dmgAcc.delete(id);
    }
  }

  /** 丧尸离阵型多近开始播攻击动作 */
  private attackReach(w: World, z: Zombie): number {
    return w.front + z.r + (z.kind === 'giant' ? 1.2 : 0.9);
  }

  private pushDying(crowd: Herd, list: Dying[], dt: number) {
    const anim = crowd instanceof VatCrowd || crowd instanceof SquadHerd;
    for (let i = list.length - 1; i >= 0; i--) {
      const a = list[i];
      a.t += dt;
      if (a.t > 0.7) {
        list[i] = list[list.length - 1];
        list.pop();
        continue;
      }
      a.vy -= 22 * dt;
      a.y = Math.max(0, a.y + a.vy * dt);
      a.x += a.vx * dt;
      a.d += a.vd * dt;
      const k = a.t < 0.45 ? 1 : 1 - (a.t - 0.45) / 0.25;
      // 外部模型播倒地动画，飞得低一点；代码小人靠整体往后倒
      if (anim) crowd.push({ x: a.x, y: a.y * 0.4, d: a.d, yaw: a.yaw, phase: 0, scale: Math.max(0.01, k * a.scale), flash: 0.4, tilt: 0, stride: 0, tint: a.tint, clip: 'death', cycle: Math.min(0.97, a.t / 0.6) });
      else crowd.push({ x: a.x, y: a.y, d: a.d, yaw: a.yaw, phase: 0, scale: Math.max(0.01, k * a.scale), flash: 0.6, tilt: Math.min(1.5, a.t * 6), stride: 0, tint: a.tint });
    }
    if (list.length > 160) list.splice(0, list.length - 160);
  }

  private placeCamera(w: World, k: number, realDt: number) {
    // 调试：window.__cam = [px, py, pz, lx, ly, lz] 时用固定镜头（截图看模型用）
    const debugCam = (window as unknown as { __cam?: number[] }).__cam;
    if (debugCam) {
      this.camera.position.set(debugCam[0], debugCam[1], debugCam[2]);
      this.camera.lookAt(debugCam[3], debugCam[4], debugCam[5]);
      return;
    }
    const sq = w.squad;
    const wide = this.camera.aspect > 1.2;
    // 战斗镜头
    const pos = _camPos.set(0, 0, 0);
    const look = _camLook.set(0, 0, 0);
    if (w.defense) {
      // 防线：镜头固定。按俯角反解高度和距离，让阵型尾巴落在屏幕下方，刷新点贴着顶栏
      const pitch = THREE.MathUtils.degToRad(wide ? 34 : 37);
      const t = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
      const rear = Math.min(9, Math.max(2, -w.back + 1));
      const far = -w.defense.spawnD;
      const aNear = pitch - Math.atan((wide ? -0.74 : -0.7) * t);
      const aFar = pitch - Math.atan(0.8 * t);
      const h = (rear - far) / (1 / Math.tan(aFar) - 1 / Math.tan(aNear));
      const cz = rear + h / Math.tan(aNear);
      pos.set(sq.x * 0.25, h, cz);
      look.set(sq.x * 0.2, 0, cz - h / Math.tan(pitch));
    } else {
      const bossFight = w.bosses.some((b) => b.active);
      this.bossBlend += ((bossFight ? 1 : 0) - this.bossBlend) * Math.min(1, k * 0.6);
      const crowd = Math.min(1, Math.sqrt(w.soldiers.length) / 18);
      const double = w.bosses.length > 1 ? 1 : 0;
      const height = (wide ? 6.4 : 7.6) + crowd * 2.2 + this.bossBlend * (2.2 + double * 1.5);
      const back = (wide ? 6.5 : 7.2) + crowd * 2.6 + this.bossBlend * (2.5 + double * 1.5);
      const ahead = 10 + this.bossBlend * 5;
      const fx = sq.x * (0.45 - this.bossBlend * 0.2);
      pos.set(fx, height, -sq.d + back);
      look.set(fx * 0.8, 0, -sq.d - ahead);
    }
    // 主页：从队伍正前方拍过来（看得到脸），镜头轻轻晃；开始战斗时一路甩到战斗镜头
    this.menuBlend += ((this.menu ? 1 : 0) - this.menuBlend) * Math.min(1, k * 0.45);
    const m = this.menuBlend * this.menuBlend * (3 - 2 * this.menuBlend);
    if (m > 0.001) {
      const sway = Math.sin(this.time * 0.35) * 0.9;
      // 横屏时界面在中间，把队伍放到画面左边
      const heroPos = _heroPos.set(sq.x + 1.6 + sway, wide ? 1.8 : 2.1, -sq.d - (wide ? 6.2 : 6.4));
      const heroLook = _heroLook.set(sq.x + sway * 0.3 - (wide ? 3.4 : 0), wide ? 1.05 : 0.55, -sq.d + 0.4);
      pos.lerp(heroPos, m);
      look.lerp(heroLook, m);
    }
    this.camPos.lerp(pos, k);
    this.camLook.lerp(look, k);
    if (k >= 1) {
      this.camPos.copy(pos);
      this.camLook.copy(look);
    }
    this.camera.position.copy(this.camPos);
    const cameraTarget = _weaponLook.copy(this.camLook);
    if (this.weaponCueAge < this.weaponCueDuration) {
      this.weaponCueAge = Math.min(this.weaponCueDuration, this.weaponCueAge + realDt);
      const progress = this.weaponCueAge / this.weaponCueDuration;
      // 从当前机位推近、看向队伍、再沿原路径退回；始终渲染同一场景，没有镜头切换。
      const focus = Math.sin(Math.PI * progress) ** 2;
      this.camera.position.lerp(this.camLook, 0.18 * focus);
      cameraTarget.lerp(_weaponTarget.set(w.squad.x, 1.25, -w.squad.d), 0.1 * focus);
    }
    this.trauma = Math.max(0, this.trauma - realDt * 1.8);
    const shake = this.trauma * this.trauma * 0.6;
    if (shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * shake;
      this.camera.position.y += (Math.random() - 0.5) * shake;
    }
    this.camera.lookAt(cameraTarget);
  }

  /** 世界坐标投到屏幕像素，镜头背后返回 null */
  toScreen(x: number, y: number, d: number): { x: number; y: number } | null {
    const v = new THREE.Vector3(x, y, -d).project(this.camera);
    if (v.z > 1) return null;
    return { x: (v.x * 0.5 + 0.5) * this.width, y: (-v.y * 0.5 + 0.5) * this.height };
  }

  private updateBadge(w: World) {
    const sq = w.squad;
    // 镜头从主页甩过来的路上不显示（锚点可能在镜头背后）
    if (sq.count <= 0 || w.soldiers.length === 0 || this.menuBlend > 0.04) {
      this.badge.style.opacity = '0';
      return;
    }
    // 锚在前几排头上：防线里人多时纵队很长，用 back 算会跑到镜头后面去
    const v = _badge.set(sq.x, 1.6 + Math.min(1.2, w.halfWidth * 0.12), -(sq.d + Math.max(w.back * 0.2, w.front - 2.5)));
    v.project(this.camera);
    // 人太多时锚点可能出画，夹在屏幕里（避开顶栏和底部升级栏）
    const x = Math.max(40, Math.min(this.width - 40, (v.x * 0.5 + 0.5) * this.width));
    const y = Math.max(90, Math.min(this.height - 130, (-v.y * 0.5 + 0.5) * this.height));
    this.badge.style.opacity = v.z > 1 ? '0' : '1';
    this.badge.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
    const text = formatNumber(sq.count);
    if (this.badge.textContent !== text) {
      this.badge.textContent = text;
      this.badge.classList.remove('pulse');
      void this.badge.offsetWidth;
      this.badge.classList.add('pulse');
    }
  }

  render() {
    const tRender = performance.now();
    this.renderer.render(this.scene, this.camera);
    this.perf.render = this.perf.render * 0.95 + (performance.now() - tRender) * 0.05;
    this.perf.calls = this.renderer.info.render.calls;
    this.perf.tris = this.renderer.info.render.triangles;
  }

  /** 给截图/测试用：把世界坐标投到屏幕 */
  project(x: number, y: number, d: number): { x: number; y: number } {
    const v = new THREE.Vector3(x, y, -d).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.width, y: (-v.y * 0.5 + 0.5) * this.height };
  }
}
