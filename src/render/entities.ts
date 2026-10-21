import * as THREE from 'three';
import { BOSSES, WEAPONS, WALL_HALF, type SkinDef } from '../game/config';
import type { Barrel, Boss, Gate, Hazard, Projectile, Strike, Wall } from '../game/world';
import { HpBar, Label, formatNumber, labelPlane, labelSprite } from './label';
import { barrelGeometry, coinGeometry, gunGeometry, tiresGeometry, tiresHeight } from './models';
import {
  armorGeometry,
  barrierGeometry,
  buildBossRig,
  cageGeometry,
  crateGeometry,
  crateHeight,
  drumMesh,
  missileGeometry,
  sawBladeGeometry,
  sawRailGeometry,
  spikesGeometry,
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
const _white = new THREE.Color(0xffffff);

/** 0..1 衰减的弹跳曲线：先冲高再回落 */
function easePop(k: number): number {
  return k <= 0 ? 0 : Math.sin(k * Math.PI) * (0.6 + 0.4 * k);
}

/** 门面板上流动的斜条纹，所有门共用一张，每帧挪一下 */
export const stripeTexture = (() => {
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

function gateColor(g: Gate): number {
  if (g.kind === 'mul') return GATE_COLORS.mul;
  if (g.kind === 'weapon') return GATE_COLORS.weapon;
  if (g.kind === 'rate') return g.value > 0 ? GATE_COLORS.rate : GATE_COLORS.bad;
  return g.value > 0 ? GATE_COLORS.good : GATE_COLORS.bad;
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
        this.gun.geometry.dispose();
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
    // 挨打：门板闪白、轻微抖动；数字涨了就弹一下
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
      // 穿过的门闪一下然后往下收，避免挡住镜头
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
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.panelMat.dispose();
    this.floorMat.dispose();
    this.postMat.dispose();
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
  private readonly label = new Label(256, 128);
  private readonly labelSprite: THREE.Sprite;
  private readonly rewardLabel?: Label;
  private flyT = -1;
  private readonly flyFrom = new THREE.Vector3();
  /** 每个桶自己一份材质，被打时单独闪白 */
  private readonly mat: THREE.MeshLambertMaterial;
  /** 掉血到 75% / 50% / 25% 时各崩一次，渲染器据此放碎块 */
  private stage = 0;
  private stageHit = false;
  topY: number;

  constructor(
    readonly barrel: Barrel,
    skin: SkinDef,
    prop?: (name: string, fit: number) => THREE.BufferGeometry | null,
  ) {
    this.group.position.set(barrel.x, 0, -barrel.d);
    let geom: THREE.BufferGeometry;
    // 优先用外部道具模型（轮胎堆、木箱、军用箱、油桶），没有就用代码生成的
    const external = prop ? externalProp(barrel, prop) : null;
    if (external) {
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
    this.body = new THREE.Mesh(geom, this.mat);
    this.body.castShadow = true;
    // 防线的大障碍：放大到几乎占满一条道
    if (barrel.block && (barrel.look === 'crate' || barrel.look === 'cage')) {
      this.body.scale.setScalar(barrel.r / 1.2);
      this.topY *= barrel.r / 1.2;
    }
    this.group.add(this.body);

    const big = barrel.r >= 1.5 ? 1.12 : 1;
    this.labelSprite = labelSprite(this.label, 2.6 * big, 1.3 * big);
    this.labelSprite.position.set(0, this.topY * 0.5 + 0.2, barrel.r + 0.4);
    this.group.add(this.labelSprite);

    const r = barrel.reward;
    if (r.kind === 'weapon') {
      const gun = new THREE.Mesh(gunGeometry(r.tier, 4.6), vertexMat);
      gun.rotation.y = Math.PI / 2;
      gun.castShadow = true;
      this.reward.add(gun);
      this.reward.add(glowRing(0xffd34d));
    } else if (r.kind === 'airstrike') {
      const m = new THREE.Mesh(missileGeometry(), vertexMat);
      m.rotation.z = Math.PI / 2;
      m.scale.setScalar(1.3);
      this.reward.add(m);
      this.reward.add(glowRing(0xff5a3a));
      this.rewardLabel = new Label(256, 96);
      this.rewardLabel.set('空袭', { fill: '#ffffff', stroke: '#7a1a0a', pill: '#e3462f', size: 58 });
      const s = labelSprite(this.rewardLabel, 1.6, 0.6, false);
      s.position.y = 0.85;
      this.reward.add(s);
    } else {
      this.rewardLabel = new Label(256, 128);
      if (r.kind === 'soldiers') this.rewardLabel.set(`+${r.amount}`, { fill: '#ffffff', stroke: '#1d7a33', pill: '#2fd14a', size: 70 });
      else if (r.kind === 'coins') this.rewardLabel.set(`+${r.amount}`, { fill: '#ffffff', stroke: '#9a6a00', pill: '#ffbf1f', size: 70 });
      else this.rewardLabel.set(`+${r.amount}%`, { fill: '#ffffff', stroke: '#0a5a6a', pill: '#14c8e0', size: 60, icon: 'bolt' });
      const s = labelSprite(this.rewardLabel, 2.0, 1.0, false);
      s.position.y = 0.3;
      this.reward.add(s);
      if (r.kind === 'coins') {
        const coin = new THREE.Mesh(coinGeometry(), vertexMat);
        coin.position.set(0, 1.0, 0);
        this.reward.add(coin);
      }
    }
    this.reward.position.set(0, this.topY + 1.0, 0);
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
    this.flyT = 0;
    this.reward.getWorldPosition(this.flyFrom);
    this.group.remove(this.reward);
    this.group.parent?.add(this.reward);
    this.reward.position.copy(this.flyFrom);
    this.body.visible = false;
    this.labelSprite.visible = false;
  }

  update(dt: number, time: number, squadPos: THREE.Vector3) {
    const b = this.barrel;
    if (b.alive) {
      this.group.position.z = -b.d;
      const base = b.block && (b.look === 'crate' || b.look === 'cage') ? b.r / 1.2 : 1;
      const s = (1 + b.bump * 0.07) * base;
      this.body.scale.set(s, (1 - b.bump * 0.05) * base, s);
      // 挨打：闪白、左右抖；血越少抖得越厉害
      const ratio = b.maxHp > 0 ? b.hp / b.maxHp : 1;
      this.mat.emissive.setScalar(b.bump * 0.35);
      const shake = b.bump * (0.05 + (1 - ratio) * 0.06);
      this.body.position.x = Math.sin(time * 53) * shake;
      this.body.rotation.z = Math.sin(time * 41) * shake * 0.4;
      const stage = ratio < 0.25 ? 3 : ratio < 0.5 ? 2 : ratio < 0.75 ? 1 : 0;
      if (stage > this.stage) {
        this.stage = stage;
        this.stageHit = true;
      }
      // 血条颜色：满血橙红，快打爆时转成亮黄
      this.label.set(formatNumber(Math.max(0, Math.ceil(b.hp))), { fill: ratio < 0.25 ? '#ffe066' : '#ffffff', stroke: '#d9480f', size: 88 });
      const big = b.r >= 1.5 ? 1.12 : 1;
      this.labelSprite.scale.set(2.6 * big * (1 + b.bump * 0.1), 1.3 * big * (1 + b.bump * 0.1), 1);
      this.reward.rotation.y = time * 1.8;
      this.reward.position.y = this.topY + 1.0 + Math.sin(time * 3) * 0.12;
      return;
    }
    if (this.flyT < 0) return;
    this.flyT += dt;
    const k = Math.min(1, this.flyT / 0.45);
    this.reward.position.lerpVectors(this.flyFrom, squadPos, k * k);
    this.reward.position.y += Math.sin(k * Math.PI) * 2.5;
    this.reward.rotation.y += dt * 12;
    this.reward.scale.setScalar(1 - k * 0.6);
    if (k >= 1) {
      this.reward.visible = false;
      this.flyT = -1;
    }
  }

  dispose() {
    this.label.dispose();
    this.rewardLabel?.dispose();
    this.reward.removeFromParent();
    for (const root of [this.group, this.reward]) {
      root.traverse((o) => {
        // 外部道具几何体是缓存共用的，不能释放
        if (o instanceof THREE.Mesh && !o.geometry.userData.shared) o.geometry.dispose();
      });
    }
    this.mat.dispose();
  }
}

function glowRing(color: number): THREE.Mesh {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 0.95, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.45;
  return ring;
}

const DROP_TIME = 0.55;

export class BossView {
  readonly rig: BossRig;
  private readonly bar = new HpBar(360, 96);
  private readonly hpSprite: THREE.Sprite;
  private deathT = 0;
  private throwT = 9;
  /** 从天而降：-1 表示不播 */
  private dropT = -1;
  private landed = false;
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
    // 头顶血条：名字 + 血量条 + 数字
    const mat = new THREE.SpriteMaterial({ map: this.bar.texture, depthTest: false, depthWrite: false, toneMapped: false });
    this.hpSprite = new THREE.Sprite(mat);
    this.hpSprite.scale.set(1.7, 0.42, 1);
    this.hpSprite.renderOrder = 20;
    this.rig.hpAnchor.add(this.hpSprite);
    this.rig.root.position.set(boss.x, 0, -boss.d);
    scene.add(this.rig.root);
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
    rig.root.position.set(boss.x, drop, -boss.d);
    // 持续被打时只是轻微泛红，不要一直发白
    for (const m of rig.materials) m.emissive.setRGB(boss.flash * 0.22, boss.flash * 0.06, boss.flash * 0.04);
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
    const walking = boss.active && !boss.attacking && boss.kind !== 'thrower' ? 1 : boss.kind === 'thrower' && boss.active ? 0.4 : 0;
    const walk = Math.sin(boss.phase) * walking;
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

    if (boss.kind === 'thrower' && !boss.attacking) {
      // 蓄力把油桶举到身后，扔出去后手往前甩
      const w = boss.windup;
      rig.armR.rotation.x = -w * 2.6 + boss.slam * 1.4;
      rig.armL.rotation.x = Math.sin(time * 2) * 0.2;
      if (rig.drum) rig.drum.visible = this.throwT > 0.5;
      rig.body.rotation.x = w * 0.12 - boss.slam * 0.2;
      return;
    }

    if (boss.attacking) {
      const w = boss.windup;
      const raise = w < 0.75 ? w / 0.75 : 1 - (w - 0.75) / 0.25;
      const armX = -raise * 2.6 + boss.slam * 0.6;
      rig.armL.rotation.x = armX;
      rig.armR.rotation.x = armX;
      rig.body.rotation.x = raise * 0.18 - boss.slam * 0.25;
    } else if (boss.kind !== 'hive') {
      rig.armL.rotation.x = -walk * 0.5;
      rig.armR.rotation.x = walk * 0.5;
      rig.body.rotation.x = -boss.slam * 0.25;
    }
  }

  dispose() {
    this.rig.root.removeFromParent();
    this.bar.dispose();
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
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
  }
}

/** 所有隔离墙的水泥墩，红白相间 */
export class WallsView {
  private readonly red: THREE.InstancedMesh;
  private readonly white: THREE.InstancedMesh;

  constructor(scene: THREE.Scene) {
    this.red = new THREE.InstancedMesh(barrierGeometry(0xd9361f), vertexMat, 200);
    this.white = new THREE.InstancedMesh(barrierGeometry(0xf4f4f4), vertexMat, 200);
    for (const m of [this.red, this.white]) {
      m.castShadow = true;
      m.count = 0;
      m.frustumCulled = false;
      scene.add(m);
    }
  }

  set(walls: readonly Wall[], nearD: number) {
    let r = 0;
    let w = 0;
    const m = new THREE.Matrix4();
    for (const wall of walls) {
      if (wall.d1 < nearD - 30 || wall.d0 > nearD + 260) continue;
      for (let d = wall.d0 + 1; d < wall.d1; d += 2) {
        m.makeTranslation(0, 0, -d);
        const i = Math.round((d - wall.d0) / 2);
        if (i % 2 === 0 && r < 200) this.red.setMatrixAt(r++, m);
        else if (w < 200) this.white.setMatrixAt(w++, m);
      }
    }
    this.red.count = r;
    this.white.count = w;
    this.red.instanceMatrix.needsUpdate = true;
    this.white.instanceMatrix.needsUpdate = true;
  }
}

export const WALL_WIDTH = WALL_HALF * 2;

/** 投弹：飞行的油桶 + 地上的红圈预警 */
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
  private readonly drum: THREE.Group;
  private readonly fill: THREE.Mesh;
  private readonly ring: THREE.Mesh;
  private readonly skull: THREE.Mesh;

  constructor(
    scene: THREE.Scene,
    readonly proj: Projectile,
    radius: number,
  ) {
    this.drum = drumMesh();
    this.drum.scale.setScalar(1.4);
    // 红圈画在士兵上面，不然大部队会把它挡住
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
    // 越快落地闪得越急、红得越深
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
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
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
    this.mark.geometry.dispose();
  }
}
