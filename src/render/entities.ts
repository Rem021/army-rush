import * as THREE from 'three';
import { AMMO, BOSSES, BOSS_STRIKE_HALF, THROWER_MELEE_TIME, WEAPONS, WALL_HALF, type SkinDef } from '../game/config';
import type { AllyTank, Barrel, Boss, Gate, Hazard, Projectile, Strike, Wall } from '../game/world';
import { bossMotion, bossPose } from './bossMotion';
import { commitInstances, disposeObject } from './dispose';
import { HpBar, Label, formatNumber, labelPlane, labelSprite } from './label';
import { barrelGeometry, coinGeometry, gunGeometry, tiresGeometry, tiresHeight } from './models';
import {
  ammoCoreGeometry,
  armorGeometry,
  barrierGeometry,
  bombBarrelGeometry,
  buildBossRig,
  cageGeometry,
  crateGeometry,
  crateHeight,
  damageCoreGeometry,
  droneGeometry,
  drumMesh,
  missileGeometry,
  multishotGeometry,
  rateBoltGeometry,
  sawBladeGeometry,
  sawRailGeometry,
  shieldCoreGeometry,
  spikesGeometry,
  tankHullGeometry,
  tankTurretGeometry,
  type BossRig,
} from './props';

export const GATE_COLORS = {
  good: 0x22c55e,
  bad: 0xef4444,
  mul: 0x1e9bff,
  weapon: 0xff9f1c,
  rate: 0x14c8e0,
};

const vertexMat = new THREE.MeshLambertMaterial({ vertexColors: true });
vertexMat.userData.shared = true;
const _white = new THREE.Color(0xffffff);
const _wallMat = new THREE.Matrix4();

/** 0..1 衰减的弹跳曲线：先冲高再回落 */
function easePop(k: number): number {
  return k <= 0 ? 0 : Math.sin(k * Math.PI) * (0.6 + 0.4 * k);
}

/** 门面板上流动的斜条纹，所有门共用一张，每帧挪一下 */
export const stripeTexture = (() => {
  if (typeof document === 'undefined') {
    const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(2, 1);
    return t;
  }
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.75;
  ctx.fillRect(0, 0, 64, 64);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ffffff';
  for (let i = -64; i < 128; i += 22) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 9, 0);
    ctx.lineTo(i + 9 + 64, 64);
    ctx.lineTo(i + 64, 64);
    ctx.closePath();
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 1);
  return t;
})();

/** 门的主色（0 视为不扣兵/不降速的正向色，与特效颜色严格一致） */
export function gateColor(g: Gate): number {
  if (g.kind === 'mul') return GATE_COLORS.mul;
  if (g.kind === 'weapon') return GATE_COLORS.weapon;
  if (g.kind === 'rate') return g.value >= 0 ? GATE_COLORS.rate : GATE_COLORS.bad;
  return g.value >= 0 ? GATE_COLORS.good : GATE_COLORS.bad;
}

export class GateView {
  readonly group = new THREE.Group();
  private readonly panelMat: THREE.MeshBasicMaterial;
  private readonly floorMat: THREE.MeshBasicMaterial;
  private readonly postMat: THREE.MeshLambertMaterial;
  private readonly label = new Label(256, 160);
  private readonly labelMesh: THREE.Mesh;
  private readonly inner = new THREE.Group();
  private readonly gun?: THREE.Mesh;
  private gunTier = -1;
  private color = -1;
  private renderedKind: Gate['kind'] | '' = '';
  private renderedValue = NaN;
  private fade = 0;
  /** 数字刚往上涨时弹一下 */
  private pop = 0;
  private lastValue: number;
  private readonly base = new THREE.Color();

  constructor(readonly gate: Gate) {
    this.lastValue = gate.value;
    const w = gate.x1 - gate.x0;
    this.group.position.set((gate.x0 + gate.x1) / 2, 0, -gate.d);
    this.group.add(this.inner);
    this.panelMat = new THREE.MeshBasicMaterial({ map: stripeTexture, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
    this.floorMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.32, depthWrite: false });
    this.postMat = new THREE.MeshLambertMaterial({ color: 0xffffff });

    const panel = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.3, 1.75), this.panelMat);
    panel.position.y = 0.97;
    panel.renderOrder = 2;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.1, 2.2), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0.03, 0.9);
    const topBar = new THREE.Mesh(new THREE.BoxGeometry(w - 0.3, 0.16, 0.16), this.postMat);
    topBar.position.y = 1.86;
    this.inner.add(panel, floor, topBar);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 2.0, 10), this.postMat);
      post.position.set(side * (w / 2 - 0.17), 1.0, 0);
      post.castShadow = true;
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), this.postMat);
      cap.position.set(side * (w / 2 - 0.17), 2.02, 0);
      this.inner.add(post, cap);
    }
    this.labelMesh = labelPlane(this.label, Math.min(3.3, w - 0.5), 2.06);
    this.labelMesh.position.set(0, 0.98, 0.05);
    this.inner.add(this.labelMesh);
    if (gate.kind === 'weapon') {
      this.gun = new THREE.Mesh(gunGeometry(Math.max(0, gate.value), 3.6), vertexMat);
      this.gun.position.set(0, 2.55, 0);
      this.gun.castShadow = true;
      this.inner.add(this.gun);
    }
    this.refresh();
  }

  private refresh() {
    const g = this.gate;
    if (g.kind === this.renderedKind && g.value === this.renderedValue) return;
    this.renderedKind = g.kind;
    this.renderedValue = g.value;
    const color = gateColor(g);
    if (color !== this.color) {
      this.color = color;
      this.base.set(color);
      this.panelMat.color.set(color);
      this.floorMat.color.set(color);
      this.postMat.color.set(color).multiplyScalar(1.1);
    }
    const stroke = 'rgba(20,30,40,0.85)';
    if (g.kind === 'mul') this.label.set(`×${g.value}`, { fill: '#ffffff', stroke, size: 100 });
    else if (g.kind === 'add') this.label.set(g.value > 0 ? `+${g.value}` : String(g.value), { fill: '#ffffff', stroke, size: 100 });
    else if (g.kind === 'rate') this.label.set(`${g.value > 0 ? '+' : ''}${g.value}%`, { fill: '#ffffff', stroke, size: 80, icon: 'bolt', sub: '射速' });
    else {
      const tier = Math.max(0, Math.min(WEAPONS.length - 1, g.value));
      this.label.set(`Lv.${tier}`, { fill: '#ffffff', stroke, size: 80, sub: WEAPONS[tier].name });
      if (this.gun && tier !== this.gunTier) {
        this.gunTier = tier;
        if (!this.gun.geometry.userData?.shared) this.gun.geometry.dispose();
        this.gun.geometry = gunGeometry(tier, 3.6);
      }
    }
  }

  update(dt: number, time: number) {
    const g = this.gate;
    this.group.position.z = -g.d;
    this.refresh();
    if (g.value !== this.lastValue) {
      this.pop = g.value > this.lastValue ? 1 : 0.6;
      this.lastValue = g.value;
    }
    this.pop = Math.max(0, this.pop - dt * 4);
    this.panelMat.color.copy(this.base).lerp(_white, g.bump * 0.45);
    if (!g.consumed) this.panelMat.opacity = 0.5 + g.bump * 0.25;
    this.inner.rotation.z = Math.sin(time * 47) * g.bump * 0.025;
    this.labelMesh.scale.setScalar(1 + g.bump * 0.08 + easePop(this.pop) * 0.35);
    if (this.gun) {
      this.gun.rotation.y = time * 1.6;
      this.gun.position.y = 2.55 + Math.sin(time * 3) * 0.1;
      this.gun.scale.setScalar(1 + g.bump * 0.15);
    }
    if (!g.consumed) {
      const pop = 1 + g.bump * 0.06;
      this.inner.scale.set(pop, pop, 1);
      return;
    }
    this.fade = Math.min(1, this.fade + dt * (g.taken ? 5 : 2.5));
    const k = this.fade;
    if (g.taken) {
      this.panelMat.opacity = 0.5 + (1 - k) * 0.35 - k * 0.5;
      this.inner.position.y = -k * k * 2.4;
    } else {
      this.inner.position.y = -k * 2.4;
      this.panelMat.opacity = 0.5 * (1 - k);
    }
    this.floorMat.opacity = 0.32 * (1 - k);
    (this.labelMesh.material as THREE.MeshBasicMaterial).opacity = 1 - k;
    if (k >= 1) this.group.visible = false;
  }

  dispose() {
    this.label.dispose();
    disposeObject(this.group);
  }
}

/** 道具外形 → 外部模型名和尺寸（按最大边） */
function externalProp(b: Barrel, prop: (name: string, fit: number) => THREE.BufferGeometry | null): THREE.BufferGeometry | null {
  switch (b.look) {
    case 'tires':
      return prop('Tires', b.r * 2.1);
    case 'crate':
      return prop('Crate', 1.5);
    case 'armor':
      return prop('Chest', b.r * 2.1);
    case 'barrel':
      return prop('Barrel', b.r * 2);
    default:
      return null;
  }
}

export class BarrelView {
  readonly group = new THREE.Group();
  readonly reward = new THREE.Group();
  private readonly body: THREE.Mesh;
  private readonly turret?: THREE.Mesh;
  private readonly turretY: number;
  private readonly tankBar?: HpBar;
  private readonly tankBarSprite?: THREE.Sprite;
  private readonly label = new Label(256, 128);
  private readonly labelSprite: THREE.Sprite;
  private readonly rewardLabel?: Label;
  private readonly isPickupPod: boolean;
  private readonly podBeam?: THREE.Mesh;
  private readonly bombHalo?: THREE.Mesh;
  private flyT = -1;
  private readonly flyFrom = new THREE.Vector3();
  /** 每个桶自己一份材质，被打时单独闪白 */
  private readonly mat: THREE.MeshLambertMaterial;
  /** 掉血到 75% / 50% / 25% 时各崩一次，渲染器据此放碎块 */
  private stage = 0;
  private stageHit = false;
  private lastCeilHp = -1;
  private lastLow = false;
  topY: number;

  constructor(
    readonly barrel: Barrel,
    skin: SkinDef,
    prop?: (name: string, fit: number) => THREE.BufferGeometry | null,
  ) {
    this.group.position.set(barrel.x, 0, -barrel.d);
    this.isPickupPod = barrel.blitzLane === 'right' && !barrel.tank;
    let geom: THREE.BufferGeometry;
    const external = prop && !barrel.tank && barrel.look !== 'bomb' ? externalProp(barrel, prop) : null;
    if (barrel.tank) {
      geom = tankHullGeometry(barrel.tank.tier, barrel.r);
      this.topY = (barrel.r / 1.5) * 2.05;
    } else if (barrel.look === 'bomb') {
      geom = bombBarrelGeometry(barrel.r);
      this.topY = barrel.r * 2.15;
    } else if (external) {
      geom = external;
      this.topY = external.boundingBox!.max.y;
    } else if (barrel.look === 'tires') {
      geom = tiresGeometry(barrel.r);
      this.topY = tiresHeight(barrel.r);
    } else if (barrel.look === 'cage') {
      geom = cageGeometry(skin);
      this.topY = 1.72;
    } else if (barrel.look === 'crate') {
      geom = crateGeometry();
      this.topY = crateHeight();
    } else if (barrel.look === 'armor') {
      geom = armorGeometry(barrel.r);
      this.topY = 2.1;
    } else {
      geom = barrelGeometry(barrel.r);
      this.topY = barrel.r * 1.72;
    }
    this.mat = vertexMat.clone();
    this.mat.userData.shared = false;
    this.body = new THREE.Mesh(geom, this.mat);
    this.body.castShadow = true;
    if (barrel.block && (barrel.look === 'crate' || barrel.look === 'cage')) {
      this.body.scale.setScalar(barrel.r / 1.2);
      this.topY *= barrel.r / 1.2;
    }
    this.group.add(this.body);

    this.turretY = (barrel.r / 1.5) * 1.06;
    if (barrel.tank) {
      this.turret = new THREE.Mesh(tankTurretGeometry(barrel.tank.tier, barrel.r, barrel.tank.twin), this.mat);
      this.turret.position.set(0, this.turretY, 0);
      this.turret.castShadow = true;
      this.group.add(this.turret);

      this.tankBar = new HpBar(360, 96);
      const barMat = new THREE.SpriteMaterial({ map: this.tankBar.texture, depthTest: false, depthWrite: false, toneMapped: false });
      this.tankBarSprite = new THREE.Sprite(barMat);
      this.tankBarSprite.scale.set(3.4, 0.9, 1);
      this.tankBarSprite.position.set(0, this.topY + 1.15, 0);
      this.tankBarSprite.renderOrder = 20;
      this.group.add(this.tankBarSprite);
    }

    const big = barrel.r >= 1.5 ? 1.12 : 1;
    this.labelSprite = labelSprite(this.label, 2.6 * big, 1.3 * big);
    this.labelSprite.position.set(0, this.topY * 0.5 + 0.2, barrel.r + 0.4);
    if (barrel.tank || this.isPickupPod) this.labelSprite.visible = false;
    this.group.add(this.labelSprite);

    const r = barrel.reward;
    let beamColor = 0;
    if (barrel.tank) {
      // 坦克本身已带顶部血条与名牌，无需重复悬空金币图标遮挡炮塔
      this.reward.visible = false;
    } else if (r.kind === 'weapon') {
      beamColor = 0xffd34d;
      const gun = new THREE.Mesh(gunGeometry(r.tier, 4.8), vertexMat);
      gun.rotation.y = Math.PI / 2;
      gun.castShadow = true;
      this.reward.add(gun);
      this.reward.add(glowRing(0xffd34d));
      if (this.isPickupPod) {
        this.rewardLabel = new Label(256, 96);
        this.rewardLabel.set(WEAPONS[r.tier].name, { fill: '#ffffff', stroke: '#7c2d12', pill: '#f59e0b', size: 46 });
        const s = labelSprite(this.rewardLabel, 2.2, 0.82, false);
        s.position.y = 0.92;
        this.reward.add(s);
      }
    } else if (r.kind === 'airstrike') {
      beamColor = 0xff5a3a;
      const m = new THREE.Mesh(missileGeometry(), vertexMat);
      m.rotation.z = Math.PI / 2;
      m.scale.setScalar(1.45);
      m.castShadow = true;
      this.reward.add(m);
      this.reward.add(glowRing(0xff5a3a));
      this.rewardLabel = new Label(256, 96);
      this.rewardLabel.set('战机空袭', { fill: '#ffffff', stroke: '#7a1a0a', pill: '#e3462f', size: 50 });
      const s = labelSprite(this.rewardLabel, 2.1, 0.78, false);
      s.position.y = 0.96;
      this.reward.add(s);
    } else if (r.kind === 'drone') {
      beamColor = 0x38bdf8;
      const d = new THREE.Mesh(droneGeometry(1.3), vertexMat);
      d.castShadow = true;
      this.reward.add(d);
      this.reward.add(glowRing(0x38bdf8));
      this.rewardLabel = new Label(256, 96);
      this.rewardLabel.set(`+${r.amount} 无人机`, { fill: '#ffffff', stroke: '#0c4a6e', pill: '#0284c7', size: 46 });
      const s = labelSprite(this.rewardLabel, 2.2, 0.8, false);
      s.position.y = 0.94;
      this.reward.add(s);
    } else if (r.kind === 'multishot') {
      beamColor = 0xa855f7;
      const ms = new THREE.Mesh(multishotGeometry(), vertexMat);
      ms.scale.setScalar(1.2);
      ms.castShadow = true;
      this.reward.add(ms);
      this.reward.add(glowRing(0xa855f7));
      this.rewardLabel = new Label(256, 112);
      this.rewardLabel.set(`+${r.amount} 扇形弹道`, { fill: '#ffffff', stroke: '#4c1d95', pill: '#9333ea', size: 44 });
      const s = labelSprite(this.rewardLabel, 2.35, 0.92, false);
      s.position.y = 0.95;
      this.reward.add(s);
    } else if (r.kind === 'ammo') {
      const ammoDef = AMMO[Math.min(AMMO.length - 1, Math.max(0, r.level))];
      beamColor = ammoDef.color ?? 0x38bdf8;
      const core = new THREE.Mesh(ammoCoreGeometry(r.level), vertexMat);
      core.scale.setScalar(1.18);
      core.castShadow = true;
      this.reward.add(core);
      this.reward.add(glowRing(beamColor));
      this.rewardLabel = new Label(256, 112);
      this.rewardLabel.set(ammoDef.name, { fill: '#ffffff', stroke: '#1e1b4b', pill: '#4f46e5', size: 48 });
      const s = labelSprite(this.rewardLabel, 2.2, 0.92, false);
      s.position.y = 0.96;
      this.reward.add(s);
    } else if (r.kind === 'damage') {
      beamColor = 0xf97316;
      const dmgMesh = new THREE.Mesh(damageCoreGeometry(), vertexMat);
      dmgMesh.scale.setScalar(1.22);
      dmgMesh.castShadow = true;
      this.reward.add(dmgMesh);
      this.reward.add(glowRing(0xf97316));
      this.rewardLabel = new Label(256, 112);
      this.rewardLabel.set(`火力 +${r.amount}%`, { fill: '#ffffff', stroke: '#7c2d12', pill: '#ea580c', size: 46 });
      const s = labelSprite(this.rewardLabel, 2.25, 0.92, false);
      s.position.y = 0.98;
      this.reward.add(s);
    } else if (r.kind === 'shield') {
      beamColor = 0x22d3ee;
      const shMesh = new THREE.Mesh(shieldCoreGeometry(), vertexMat);
      shMesh.scale.setScalar(1.25);
      shMesh.castShadow = true;
      this.reward.add(shMesh);
      this.reward.add(glowRing(0x22d3ee));
      this.rewardLabel = new Label(256, 112);
      this.rewardLabel.set(`护盾 +${r.amount}`, { fill: '#ffffff', stroke: '#155e75', pill: '#0891b2', size: 50 });
      const s = labelSprite(this.rewardLabel, 2.2, 0.9, false);
      s.position.y = 0.96;
      this.reward.add(s);
    } else if (r.kind === 'boom') {
      this.reward.add(glowRing(0xef4444));
      this.rewardLabel = new Label(256, 96);
      this.rewardLabel.set('引爆清场', { fill: '#fff7ed', stroke: '#7f1d1d', pill: '#dc2626', size: 48 });
      const s = labelSprite(this.rewardLabel, 1.9, 0.72, false);
      s.position.y = 0.42;
      this.reward.add(s);
      // 地面警示爆破圈
      this.bombHalo = new THREE.Mesh(
        new THREE.RingGeometry(1.15, 1.48, 28),
        new THREE.MeshBasicMaterial({
          color: 0xff3b30,
          transparent: true,
          opacity: 0.6,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
          toneMapped: false,
        }),
      );
      this.bombHalo.rotation.x = -Math.PI / 2;
      this.bombHalo.position.y = 0.06;
      this.group.add(this.bombHalo);
    } else {
      if (r.kind === 'rate') {
        beamColor = 0x14c8e0;
        const bolt = new THREE.Mesh(rateBoltGeometry(), vertexMat);
        bolt.scale.setScalar(1.18);
        bolt.castShadow = true;
        this.reward.add(bolt);
        this.reward.add(glowRing(0x14c8e0));
      }
      this.rewardLabel = new Label(256, 128);
      if (r.kind === 'soldiers') this.rewardLabel.set(`+${r.amount}`, { fill: '#ffffff', stroke: '#1d7a33', pill: '#2fd14a', size: 70 });
      else if (r.kind === 'coins') this.rewardLabel.set(`+${r.amount}`, { fill: '#ffffff', stroke: '#9a6a00', pill: '#ffbf1f', size: 70 });
      else this.rewardLabel.set(`射速 +${r.amount}%`, { fill: '#ffffff', stroke: '#0a5a6a', pill: '#14c8e0', size: 48, icon: 'bolt' });
      const s = labelSprite(this.rewardLabel, 2.2, 0.92, false);
      s.position.y = r.kind === 'rate' ? 0.96 : 0.3;
      this.reward.add(s);
      if (r.kind === 'coins') {
        const coin = new THREE.Mesh(coinGeometry(), vertexMat);
        coin.position.set(0, 1.0, 0);
        this.reward.add(coin);
      }
    }
    if (this.isPickupPod && beamColor) {
      this.podBeam = holoBeam(beamColor);
      this.group.add(this.podBeam);
    }
    this.reward.position.set(0, this.topY + (this.isPickupPod ? 0.85 : 1.0), 0);
    this.group.add(this.reward);
  }

  /** 刚掉到下一个血量档位时返回档位（1–3），否则 0 */
  consumeStage(): number {
    if (!this.stageHit) return 0;
    this.stageHit = false;
    return this.stage;
  }

  /** 当前血量比例（渲染器放烟用） */
  get hpRatio(): number {
    return this.barrel.maxHp > 0 ? this.barrel.hp / this.barrel.maxHp : 1;
  }

  /** 桶被打爆后奖励飞向队伍 */
  startFly() {
    this.body.visible = false;
    if (this.turret) this.turret.visible = false;
    if (this.tankBarSprite) this.tankBarSprite.visible = false;
    if (this.podBeam) this.podBeam.visible = false;
    if (this.bombHalo) this.bombHalo.visible = false;
    this.labelSprite.visible = false;
    if (this.barrel.tank || this.barrel.reward.kind === 'boom') {
      this.reward.visible = false;
      return;
    }
    this.flyT = 0;
    this.reward.getWorldPosition(this.flyFrom);
    this.group.remove(this.reward);
    this.group.parent?.add(this.reward);
    this.reward.position.copy(this.flyFrom);
  }

  update(dt: number, time: number, squadPos: THREE.Vector3) {
    const b = this.barrel;
    if (b.alive) {
      this.group.position.z = -b.d;
      const base = b.block && (b.look === 'crate' || b.look === 'cage') ? b.r / 1.2 : 1;
      const pulse = b.bump * (0.65 + 0.35 * Math.max(0, Math.sin(time * 58)));
      const s = (1 + pulse * (b.tank ? 0.045 : 0.11)) * base;
      this.body.scale.set(s, (1 - pulse * (b.tank ? 0.03 : 0.08)) * base, s);
      const ratio = b.maxHp > 0 ? b.hp / b.maxHp : 1;
      this.mat.emissive.setRGB(pulse * 0.52, pulse * 0.42, pulse * 0.28);
      const shake = b.bump * (b.tank ? 0.045 : 0.075 + (1 - ratio) * 0.085);
      this.body.position.x = Math.sin(time * 59) * shake;
      this.body.position.z = -pulse * (b.tank ? 0.05 : 0.09);
      this.body.rotation.z = Math.sin(time * 47) * shake * 0.55;
      if (this.turret && b.tank) {
        // 炮塔平滑瞄准玩家小队 + 开炮后坐力回弹
        const aimYaw = Math.max(-0.65, Math.min(0.65, Math.atan2(squadPos.x - b.x, Math.max(4, b.d))));
        this.turret.rotation.y += (aimYaw - this.turret.rotation.y) * Math.min(1, dt * 6);
        this.turret.position.set(this.body.position.x, this.turretY, -b.recoil * 0.42 + this.body.position.z);
      }
      const stage = ratio < 0.25 ? 3 : ratio < 0.5 ? 2 : ratio < 0.75 ? 1 : 0;
      if (stage > this.stage) {
        this.stage = stage;
        this.stageHit = true;
      }
      const ceilHp = Math.max(0, Math.ceil(b.hp));
      const low = ratio < 0.25;
      if (b.tank && this.tankBar) {
        if (ceilHp !== this.lastCeilHp || low !== this.lastLow) {
          this.lastCeilHp = ceilHp;
          this.lastLow = low;
          const barColor = b.tank.tier === 4 ? '#f59e0b' : b.tank.tier === 3 ? '#ef4444' : '#f97316';
          this.tankBar.set(ratio, formatNumber(ceilHp), barColor, b.tank.name);
        }
      } else if (!this.isPickupPod) {
        if (ceilHp !== this.lastCeilHp || low !== this.lastLow) {
          this.lastCeilHp = ceilHp;
          this.lastLow = low;
          this.label.set(formatNumber(ceilHp), { fill: low ? '#ffe066' : '#ffffff', stroke: '#d9480f', size: 88 });
        }
        const big = b.r >= 1.5 ? 1.12 : 1;
        this.labelSprite.scale.set(2.6 * big * (1 + b.bump * 0.1), 1.3 * big * (1 + b.bump * 0.1), 1);
      }
      this.reward.rotation.y = time * (this.isPickupPod ? 2.4 : 1.8);
      this.reward.position.y = this.topY + (this.isPickupPod ? 0.85 : 1.0) + Math.sin(time * (this.isPickupPod ? 4.2 : 3)) * 0.16;
      if (this.isPickupPod) {
        const beat = 1 + Math.sin(time * 5.2 + b.id) * 0.08;
        this.reward.scale.setScalar(beat);
        if (this.podBeam) {
          (this.podBeam.material as THREE.MeshBasicMaterial).opacity = 0.22 + Math.sin(time * 4.5 + b.id) * 0.08;
          this.podBeam.scale.set(0.95 + Math.sin(time * 6 + b.id) * 0.1, 1, 0.95 + Math.sin(time * 6 + b.id) * 0.1);
        }
      }
      if (this.bombHalo) {
        const sc = 0.9 + Math.sin(time * 7 + b.id) * 0.18;
        this.bombHalo.scale.setScalar(sc);
        (this.bombHalo.material as THREE.MeshBasicMaterial).opacity = 0.35 + Math.max(0, Math.sin(time * 7 + b.id)) * 0.4;
      }
      return;
    }
    if (this.flyT < 0) return;
    this.flyT += dt;
    const k = Math.min(1, this.flyT / 0.42);
    this.reward.position.lerpVectors(this.flyFrom, squadPos, k * k);
    this.reward.position.y += Math.sin(k * Math.PI) * 2.8;
    this.reward.rotation.y += dt * 15;
    this.reward.scale.setScalar(1 + Math.sin(k * Math.PI) * 0.35 - k * 0.55);
    if (k >= 1) {
      this.reward.visible = false;
      this.flyT = -1;
    }
  }

  dispose() {
    this.label.dispose();
    this.tankBar?.dispose();
    this.rewardLabel?.dispose();
    this.reward.removeFromParent();
    disposeObject(this.group);
    disposeObject(this.reward);
  }
}

function holoBeam(color: number): THREE.Mesh {
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.68, 0.96, 3.6, 16, 1, true),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.24,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  );
  beam.position.y = 1.85;
  return beam;
}

function glowRing(color: number): THREE.Mesh {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 0.95, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.45;
  return ring;
}

const DROP_TIME = 0.55;

/** 锁定后留在地面上的砸击预警，长度覆盖当时整队的前后排。 */
export class BossStrikeView {
  readonly group = new THREE.Group();
  private readonly fillMat = new THREE.MeshBasicMaterial({ color: 0xff2424, transparent: true, opacity: 0.25, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
  private readonly edgeMat = new THREE.MeshBasicMaterial({ color: 0xffb047, transparent: true, opacity: 0.9, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
  private readonly fill = new THREE.Mesh(new THREE.PlaneGeometry(BOSS_STRIKE_HALF * 2, 1), this.fillMat);
  private readonly edges = [-1, 1].map((side) => {
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 1), this.edgeMat);
    edge.position.x = side * BOSS_STRIKE_HALF;
    return edge;
  });

  constructor(scene: THREE.Scene, readonly boss: Boss) {
    this.group.visible = false;
    this.fill.position.y = 0.04;
    this.fill.rotation.x = -Math.PI / 2;
    this.fill.renderOrder = 15;
    for (const edge of this.edges) {
      edge.position.y = 0.05;
      edge.rotation.x = -Math.PI / 2;
      edge.renderOrder = 16;
    }
    this.group.add(this.fill, ...this.edges);
    scene.add(this.group);
  }

  update() {
    const b = this.boss;
    this.group.visible = b.alive && b.active && b.attacking;
    if (!this.group.visible) return;
    this.group.position.set(b.attackX, 0, -b.attackD);
    this.fill.scale.y = b.attackLength;
    for (const edge of this.edges) edge.scale.y = b.attackLength;
    this.fillMat.opacity = 0.16 + b.windup * 0.25;
    this.edgeMat.opacity = 0.55 + b.windup * 0.4;
  }

  dispose() {
    this.group.removeFromParent();
    disposeObject(this.group);
  }
}

export class BossView {
  readonly rig: BossRig;
  private readonly bar = new HpBar(360, 96);
  private readonly hpSprite: THREE.Sprite;
  private deathT = 0;
  private throwT = 9;
  /** 从天而降：-1 表示不播 */
  private dropT = -1;
  private landed = false;
  private lastX: number;
  private lastD: number;
  private walkBlend = 0;
  readonly scale: number;

  constructor(
    scene: THREE.Scene,
    readonly boss: Boss,
    dropIn = false,
  ) {
    if (dropIn) this.dropT = 0;
    const def = BOSSES[boss.kind];
    this.scale = def.scale;
    this.rig = buildBossRig(boss.kind);
    this.rig.root.scale.setScalar(this.scale);
    this.rig.root.rotation.y = Math.PI;
    const mat = new THREE.SpriteMaterial({ map: this.bar.texture, depthTest: false, depthWrite: false, toneMapped: false });
    this.hpSprite = new THREE.Sprite(mat);
    this.hpSprite.scale.set(1.7, 0.42, 1);
    this.hpSprite.renderOrder = 20;
    this.rig.hpAnchor.add(this.hpSprite);
    this.rig.root.position.set(boss.x, 0, -boss.d);
    this.lastX = boss.x;
    this.lastD = boss.d;
    scene.add(this.rig.root);
  }

  get isDeadDone(): boolean {
    return !this.boss.alive && this.deathT > 3.2;
  }

  /** 刚落地的那一帧返回 true，渲染器据此放落地特效 */
  consumeLanding(): boolean {
    if (!this.landed) return false;
    this.landed = false;
    return true;
  }

  /** 投弹屠夫刚扔出去，手里的油桶藏一会儿 */
  thrown() {
    this.throwT = 0;
  }

  update(dt: number, time: number) {
    const { rig, boss } = this;
    const moving = dt > 0 && Math.hypot(boss.x - this.lastX, boss.d - this.lastD) / dt > 0.12;
    this.lastX = boss.x;
    this.lastD = boss.d;
    const motion = bossMotion(boss);
    let drop = 0;
    if (this.dropT >= 0) {
      const k = this.dropT / DROP_TIME;
      this.dropT += dt;
      if (this.dropT >= DROP_TIME) {
        this.dropT = -1;
        this.landed = true;
      } else {
        drop = 16 * (1 - k * k);
      }
    }
    const hitPulse = boss.alive ? boss.flash * (0.55 + 0.45 * Math.max(0, Math.sin(time * 52))) : 0;
    rig.root.position.set(boss.x + Math.sin(time * 61) * boss.flash * 0.045, drop, -boss.d - hitPulse * 0.08);
    for (const m of rig.materials) m.emissive.setRGB(hitPulse * 0.32, hitPulse * 0.12, hitPulse * 0.06);
    this.throwT += dt;

    if (!boss.alive) {
      this.deathT += dt;
      const k = Math.min(1, this.deathT / 0.9);
      if (boss.kind === 'hive') {
        rig.body.scale.setScalar(Math.max(0.01, 1 - k * 0.9));
      } else {
        rig.body.rotation.x = k * k * (Math.PI / 2) * 0.95;
      }
      rig.body.position.y = -Math.max(0, this.deathT - 1.4) * 0.8;
      this.hpSprite.visible = false;
      if (this.deathT > 3) rig.root.visible = false;
      return;
    }

    this.bar.set(boss.hp / boss.maxHp, formatNumber(Math.max(0, Math.ceil(boss.hp))), '#e3262f', BOSSES[boss.kind].name);
    const walking = motion.kind === 'none' && moving ? (boss.kind === 'thrower' ? 0.4 : 1) : 0;
    this.walkBlend += (walking - this.walkBlend) * Math.min(1, dt * 9);
    const walk = Math.sin(boss.phase) * this.walkBlend;
    rig.legL.rotation.x = walk * 0.55;
    rig.legR.rotation.x = -walk * 0.55;
    rig.body.position.y = Math.abs(walk) * 0.06;

    if (boss.kind === 'hive') {
      const pulse = 1 + Math.sin(time * 3) * 0.04 + boss.slam * 0.12;
      rig.body.scale.set(pulse, 1 / pulse, pulse);
      rig.pustules?.forEach((p, i) => p.scale.setScalar(1 + Math.sin(time * 5 + i) * 0.25 + boss.slam * 0.5));
      rig.armL.rotation.z = Math.sin(time * 2) * 0.4;
      rig.armR.rotation.z = -Math.sin(time * 2 + 1) * 0.4;
    }

    if (boss.kind === 'thrower' && !boss.attacking && boss.fightTime < THROWER_MELEE_TIME) {
      const pose = bossPose(motion.phase);
      rig.armR.rotation.x = motion.kind === 'none' ? walk * 0.5 : pose.arm;
      rig.armL.rotation.x = Math.sin(time * 2) * 0.2;
      if (rig.drum) rig.drum.visible = this.throwT > 0.5;
      rig.body.rotation.x = motion.kind === 'none' ? 0 : pose.body;
      rig.body.position.y += pose.lift;
      return;
    }

    if (motion.kind !== 'none') {
      const pose = bossPose(motion.phase);
      rig.armL.rotation.x = pose.arm;
      rig.armR.rotation.x = pose.arm;
      rig.body.rotation.x = pose.body;
      rig.body.position.y += pose.lift;
    } else {
      rig.armL.rotation.x = -walk * 0.5;
      rig.armR.rotation.x = walk * 0.5;
      rig.body.rotation.x = 0;
    }
  }

  dispose() {
    this.rig.root.removeFromParent();
    this.bar.dispose();
    disposeObject(this.rig.root);
  }
}

export class HazardView {
  readonly group = new THREE.Group();
  private readonly blade?: THREE.Mesh;

  constructor(readonly hazard: Hazard) {
    const w = hazard.x1 - hazard.x0;
    if (hazard.kind === 'spikes') {
      const depth = hazard.d1 - hazard.d0;
      const m = new THREE.Mesh(spikesGeometry(w, depth), vertexMat);
      m.position.set((hazard.x0 + hazard.x1) / 2, 0, -(hazard.d0 + hazard.d1) / 2);
      m.castShadow = true;
      this.group.add(m);
    } else {
      const rail = new THREE.Mesh(sawRailGeometry(w), vertexMat);
      rail.position.set((hazard.x0 + hazard.x1) / 2, 0.01, -hazard.d0);
      this.blade = new THREE.Mesh(sawBladeGeometry(0.85), vertexMat);
      this.blade.castShadow = true;
      this.group.add(rail, this.blade);
    }
  }

  update(time: number) {
    const h = this.hazard;
    if (this.blade) {
      this.blade.position.set(h.x, 0.62, -h.d0);
      this.blade.rotation.z = -time * 14;
    } else {
      const m = this.group.children[0];
      m.position.y = Math.sin(time * 6 + h.id) * 0.04;
    }
  }

  dispose() {
    disposeObject(this.group);
  }
}

/** 所有隔离墙的水泥墩，红白相间（脏检查 + 零分配） */
export class WallsView {
  private readonly red: THREE.InstancedMesh;
  private readonly white: THREE.InstancedMesh;
  private prevRed = 0;
  private prevWhite = 0;
  private lastKey = '';

  constructor(scene: THREE.Scene) {
    this.red = new THREE.InstancedMesh(barrierGeometry(0xd9361f), vertexMat, 200);
    this.white = new THREE.InstancedMesh(barrierGeometry(0xf4f4f4), vertexMat, 200);
    for (const m of [this.red, this.white]) {
      m.castShadow = true;
      m.count = 0;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
    }
  }

  set(walls: readonly Wall[], nearD: number) {
    const bucket = Math.floor(nearD * 0.5);
    const key = `${walls.length}:${walls[0]?.id ?? 0}:${walls[walls.length - 1]?.id ?? 0}:${bucket}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    let r = 0;
    let w = 0;
    for (let k = 0; k < walls.length; k++) {
      const wall = walls[k];
      if (wall.d1 < nearD - 30 || wall.d0 > nearD + 260) continue;
      for (let d = wall.d0 + 1; d < wall.d1; d += 2) {
        _wallMat.makeTranslation(0, 0, -d);
        const i = Math.round((d - wall.d0) / 2);
        if (i % 2 === 0 && r < 200) this.red.setMatrixAt(r++, _wallMat);
        else if (w < 200) this.white.setMatrixAt(w++, _wallMat);
      }
    }
    this.prevRed = commitInstances(this.red, r, this.prevRed);
    this.prevWhite = commitInstances(this.white, w, this.prevWhite);
  }
}

export const WALL_WIDTH = WALL_HALF * 2;

/** 红圈正中的骷髅：红圈里的兵会全部炸死 */
let skullTexture: THREE.CanvasTexture | null = null;
function skullMark(): THREE.CanvasTexture {
  if (skullTexture) return skullTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(64, 54, 38, 0, Math.PI * 2);
  g.fill();
  g.fillRect(40, 70, 48, 30);
  g.fillStyle = '#7a0a10';
  g.beginPath();
  g.arc(48, 56, 11, 0, Math.PI * 2);
  g.arc(80, 56, 11, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(64, 70);
  g.lineTo(57, 82);
  g.lineTo(71, 82);
  g.fill();
  for (let i = 0; i < 3; i++) g.fillRect(48 + i * 12, 92, 6, 10);
  skullTexture = new THREE.CanvasTexture(c);
  skullTexture.colorSpace = THREE.SRGBColorSpace;
  return skullTexture;
}

export class ProjectileView {
  readonly group = new THREE.Group();
  private readonly drum: THREE.Object3D;
  private readonly fill: THREE.Mesh;
  private readonly ring: THREE.Mesh;
  private readonly skull: THREE.Mesh;

  constructor(
    scene: THREE.Scene,
    readonly proj: Projectile,
    radius: number,
    barrelGeom?: THREE.BufferGeometry | null,
  ) {
    if (barrelGeom) {
      const mesh = new THREE.Mesh(barrelGeom, vertexMat);
      mesh.castShadow = true;
      this.drum = mesh;
    } else {
      this.drum = drumMesh();
      this.drum.scale.setScalar(1.4);
    }
    const mat = new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.3, depthWrite: false, depthTest: false });
    this.fill = new THREE.Mesh(new THREE.CircleGeometry(radius, 40), mat);
    this.fill.rotation.x = -Math.PI / 2;
    this.fill.renderOrder = 15;
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(radius - 0.16, radius, 48),
      new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.9, depthWrite: false, depthTest: false }),
    );
    this.ring.renderOrder = 16;
    this.ring.rotation.x = -Math.PI / 2;
    this.fill.position.set(proj.tx, 0.05, -proj.td);
    this.ring.position.set(proj.tx, 0.06, -proj.td);
    this.skull = new THREE.Mesh(
      new THREE.PlaneGeometry(radius * 0.8, radius * 0.8),
      new THREE.MeshBasicMaterial({ map: skullMark(), transparent: true, opacity: 0.9, depthWrite: false, depthTest: false }),
    );
    this.skull.rotation.x = -Math.PI / 2;
    this.skull.renderOrder = 17;
    this.skull.position.set(proj.tx, 0.07, -proj.td);
    this.group.add(this.drum, this.fill, this.ring, this.skull);
    scene.add(this.group);
  }

  update() {
    const p = this.proj;
    const k = Math.min(1, p.t / p.T);
    const x = p.x0 + (p.tx - p.x0) * k;
    const d = p.d0 + (p.td - p.d0) * k;
    const y = 5 + Math.sin(k * Math.PI) * 9 - k * 4.5;
    this.drum.position.set(x, Math.max(0.4, y), -d);
    this.drum.rotation.set(k * 9, 0, k * 6);
    this.fill.scale.setScalar(Math.max(0.05, k));
    const fillMat = this.fill.material as THREE.MeshBasicMaterial;
    fillMat.opacity = 0.25 + k * 0.3;
    const blink = Math.abs(Math.sin(k * k * 28));
    (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.45 * blink;
    this.ring.scale.setScalar(1 + (1 - blink) * 0.04);
    (this.skull.material as THREE.MeshBasicMaterial).opacity = 0.5 + 0.5 * blink;
  }

  dispose() {
    this.group.removeFromParent();
    disposeObject(this.group);
  }
}

/** 空袭导弹：从天上落下来 */
export class StrikeView {
  readonly group = new THREE.Group();
  private readonly missile: THREE.Mesh;
  private readonly mark: THREE.Mesh;

  constructor(
    scene: THREE.Scene,
    readonly strike: Strike,
  ) {
    this.missile = new THREE.Mesh(missileGeometry(), vertexMat);
    this.missile.scale.setScalar(1.6);
    this.mark = new THREE.Mesh(
      new THREE.RingGeometry(1.2, 1.45, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    this.mark.rotation.x = -Math.PI / 2;
    this.group.add(this.missile, this.mark);
    scene.add(this.group);
  }

  update() {
    const s = this.strike;
    const k = Math.max(0, s.t / s.T);
    this.group.visible = s.t >= -0.05;
    this.missile.position.set(s.x + (1 - k) * 4, 26 * (1 - k) + 0.5, -(s.d - 1.5) + (1 - k) * 6);
    this.missile.rotation.z = 0.15;
    this.mark.position.set(s.x, 0.06, -(s.d - 1.5));
  }

  dispose() {
    this.group.removeFromParent();
    disposeObject(this.group);
  }
}

/** 被玩家收编的友军重装坦克：蓝金涂装 + 底部能量光环 + 掉头入队动画 + 炮塔自动索敌轰炸 */
export class AllyTankView {
  readonly group = new THREE.Group();
  private readonly rig = new THREE.Group();
  private readonly hull: THREE.Mesh;
  private readonly turret: THREE.Mesh;
  private readonly turretY: number;
  private readonly mat: THREE.MeshLambertMaterial;
  private readonly halo: THREE.Mesh;
  private readonly haloMat: THREE.MeshBasicMaterial;
  private readonly badge = new Label(256, 72);
  private readonly badgeSprite: THREE.Sprite;

  constructor(
    scene: THREE.Scene,
    readonly tank: AllyTank,
  ) {
    this.group.position.set(tank.x, 0, -tank.d);
    this.mat = vertexMat.clone();
    this.mat.userData.shared = false;

    this.hull = new THREE.Mesh(tankHullGeometry(tank.tier, tank.r, true), this.mat);
    this.hull.castShadow = true;
    this.rig.add(this.hull);

    this.turretY = (tank.r / 1.5) * 1.06;
    this.turret = new THREE.Mesh(tankTurretGeometry(tank.tier, tank.r, tank.twin, true), this.mat);
    this.turret.position.set(0, this.turretY, 0);
    this.turret.castShadow = true;
    this.rig.add(this.turret);
    this.group.add(this.rig);

    this.haloMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.halo = new THREE.Mesh(new THREE.RingGeometry(tank.r * 1.05, tank.r * 1.38, 32), this.haloMat);
    this.halo.rotation.x = -Math.PI / 2;
    this.halo.position.y = 0.06;
    this.group.add(this.halo);

    this.badge.set(tank.twin ? '友军双管坦' : '友军重坦', {
      fill: '#ffffff',
      stroke: '#0c4a6e',
      pill: '#0284c7',
      size: 38,
    });
    this.badgeSprite = labelSprite(this.badge, 1.9, 0.56, false);
    this.badgeSprite.position.set(0, (tank.r / 1.5) * 2.55, 0);
    this.group.add(this.badgeSprite);

    scene.add(this.group);
  }

  update(time: number) {
    const t = this.tank;
    this.group.position.set(t.x, 0, -t.d);
    // 车体朝向：hullYaw=0 指向敌阵 (-z)，hullYaw=PI 指向玩家 (+z)
    this.rig.rotation.y = Math.PI - t.hullYaw;
    // 行驶引擎轻微震动
    const bob = Math.sin(time * 28 + t.id) * 0.025;
    this.hull.position.y = bob;
    this.turret.rotation.y = -t.turretYaw;
    this.turret.position.set(0, this.turretY + bob, -t.recoil * 0.36);

    // 收编高光 + 开炮微闪
    const glow = Math.max(t.captureGlow * 0.75, t.recoil * 0.25);
    this.mat.emissive.setRGB(glow * 0.22, glow * 0.55, glow * 0.85);
    const ringScale = 1 + t.captureGlow * 0.45 + Math.sin(time * 5 + t.id) * 0.04;
    this.halo.scale.setScalar(ringScale);
    this.haloMat.opacity = 0.42 + t.captureGlow * 0.48 + Math.sin(time * 4 + t.id) * 0.08;
    this.badgeSprite.position.y = (t.r / 1.5) * 2.55 + Math.sin(time * 3 + t.id) * 0.08;
  }

  dispose() {
    this.badge.dispose();
    this.group.removeFromParent();
    disposeObject(this.group);
  }
}
