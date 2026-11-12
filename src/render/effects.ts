import * as THREE from 'three';
import type { Bullet } from '../game/world';
import { commitInstances } from './dispose';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _white = new THREE.Color(0xffffff);

/** 固定容量的粒子池，数据放在 typed array 里 */
export class Particles {
  readonly mesh: THREE.InstancedMesh;
  private readonly cap: number;
  private n = 0;
  private prevCount = 0;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly size: Float32Array;
  private readonly spin: Float32Array;
  private readonly gravity: Float32Array;
  private readonly col: Float32Array;

  constructor(scene: THREE.Scene, geom: THREE.BufferGeometry, material: THREE.Material, cap: number) {
    this.cap = cap;
    this.mesh = new THREE.InstancedMesh(geom, material, cap);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < cap; i++) this.mesh.setColorAt(i, _c.setRGB(1, 1, 1));
    this.mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
    this.pos = new Float32Array(cap * 3);
    this.vel = new Float32Array(cap * 3);
    this.life = new Float32Array(cap);
    this.maxLife = new Float32Array(cap);
    this.size = new Float32Array(cap);
    this.spin = new Float32Array(cap);
    this.gravity = new Float32Array(cap);
    this.col = new Float32Array(cap * 3);
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, color: number, gravity = 18) {
    let i = this.n;
    if (i >= this.cap) {
      i = Math.floor(Math.random() * this.cap);
    } else {
      this.n++;
    }
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.size[i] = size;
    this.spin[i] = Math.random() * 10;
    this.gravity[i] = gravity;
    _c.set(color);
    this.col[i * 3] = _c.r;
    this.col[i * 3 + 1] = _c.g;
    this.col[i * 3 + 2] = _c.b;
  }

  burst(x: number, y: number, z: number, count: number, speed: number, life: number, size: number, colors: readonly number[], gravity = 18, up = 0.6) {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      const vy = (up + Math.random() * (1 - up)) * speed;
      this.spawn(x, y, z, Math.cos(a) * s, vy, Math.sin(a) * s, life * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.7), colors[k % colors.length], gravity);
    }
  }

  update(dt: number) {
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        const last = --this.n;
        if (i !== last) this.copy(last, i);
        continue;
      }
      const v = i * 3;
      this.vel[v + 1] -= this.gravity[i] * dt;
      this.pos[v] += this.vel[v] * dt;
      this.pos[v + 1] += this.vel[v + 1] * dt;
      this.pos[v + 2] += this.vel[v + 2] * dt;
      if (this.pos[v + 1] < 0.05 && this.gravity[i] > 0) {
        this.pos[v + 1] = 0.05;
        this.vel[v + 1] *= -0.3;
        this.vel[v] *= 0.6;
        this.vel[v + 2] *= 0.6;
      }
      this.spin[i] += dt * 8;
      i++;
    }
    for (let k = 0; k < this.n; k++) {
      const t = this.life[k] / this.maxLife[k];
      const s = this.size[k] * Math.min(1, t * 2.5);
      _e.set(this.spin[k], this.spin[k] * 0.7, 0);
      _q.setFromEuler(_e);
      _p.set(this.pos[k * 3], this.pos[k * 3 + 1], this.pos[k * 3 + 2]);
      _s.setScalar(s);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(k, _m);
      this.mesh.setColorAt(k, _c.setRGB(this.col[k * 3], this.col[k * 3 + 1], this.col[k * 3 + 2]));
    }
    this.prevCount = commitInstances(this.mesh, this.n, this.prevCount, undefined, true);
  }

  private copy(from: number, to: number) {
    for (let k = 0; k < 3; k++) {
      this.pos[to * 3 + k] = this.pos[from * 3 + k];
      this.vel[to * 3 + k] = this.vel[from * 3 + k];
      this.col[to * 3 + k] = this.col[from * 3 + k];
    }
    this.life[to] = this.life[from];
    this.maxLife[to] = this.maxLife[from];
    this.size[to] = this.size[from];
    this.spin[to] = this.spin[from];
    this.gravity[to] = this.gravity[from];
  }

  clear() {
    this.n = 0;
    this.prevCount = 0;
    this.mesh.count = 0;
  }
}

interface FlashItem {
  x: number;
  y: number;
  z: number;
  size: number;
  life: number;
  max: number;
  rot: number;
}

const _qz = new THREE.Quaternion();
const _zAxis = new THREE.Vector3(0, 0, 1);

/** 枪口火光：朝向镜头的星形亮片，一闪即逝（对象池 + O(1) 交换删除） */
export class Flashes {
  private readonly mesh: THREE.InstancedMesh;
  private readonly pool: FlashItem[];
  private n = 0;
  private cursor = 0;
  private prevCount = 0;

  constructor(scene: THREE.Scene, private readonly cap = 64) {
    this.pool = Array.from({ length: cap }, () => ({ x: 0, y: 0, z: 0, size: 1, life: 0, max: 1, rot: 0 }));
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,240,180,0.9)');
    grad.addColorStop(1, 'rgba(255,170,40,0)');
    g.fillStyle = grad;
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = i % 2 === 0 ? 32 : 9;
      g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
    }
    g.fill();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, cap);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
  }

  setColor(color: number) {
    (this.mesh.material as THREE.MeshBasicMaterial).color.set(color).lerp(_white, 0.5);
  }

  spawn(x: number, y: number, z: number, size: number) {
    let idx: number;
    if (this.n < this.cap) {
      idx = this.n++;
    } else {
      idx = this.cursor;
      this.cursor = (this.cursor + 1) % this.cap;
    }
    const it = this.pool[idx];
    const life = 0.05 + Math.random() * 0.03;
    it.x = x;
    it.y = y;
    it.z = z;
    it.size = size * (0.7 + Math.random() * 0.6);
    it.life = life;
    it.max = life;
    it.rot = Math.random() * Math.PI;
  }

  update(dt: number, camera: THREE.Camera) {
    let i = 0;
    while (i < this.n) {
      const it = this.pool[i];
      it.life -= dt;
      if (it.life <= 0) {
        const last = --this.n;
        if (i !== last) {
          this.pool[i] = this.pool[last];
          this.pool[last] = it;
        }
        continue;
      }
      const k = it.life / it.max;
      _q.copy(camera.quaternion).multiply(_qz.setFromAxisAngle(_zAxis, it.rot));
      _p.set(it.x, it.y, it.z);
      _s.setScalar(it.size * (0.6 + 0.4 * k));
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(i, _m);
      i++;
    }
    this.prevCount = commitInstances(this.mesh, this.n, this.prevCount);
  }

  clear() {
    this.n = 0;
    this.cursor = 0;
    this.prevCount = 0;
    this.mesh.count = 0;
  }
}

/** 人群脚下的圆形影子：代替几百个人的实时阴影（每人两个三角形，一次绘制） */
export class BlobShadows {
  private readonly mesh: THREE.InstancedMesh;
  private n = 0;
  private prevCount = 0;

  constructor(scene: THREE.Scene, private readonly cap = 1400) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(0.6, 'rgba(0,0,0,0.3)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 1;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
  }

  begin() {
    this.n = 0;
  }

  push(x: number, z: number, size: number) {
    if (this.n >= this.cap) return;
    _q.identity();
    _p.set(x + 0.12, 0.025, z + 0.1);
    _s.set(size, 1, size * 0.85);
    _m.compose(_p, _q, _s);
    this.mesh.setMatrixAt(this.n++, _m);
  }

  end() {
    this.prevCount = commitInstances(this.mesh, this.n, this.prevCount);
  }
}

interface SplatItem {
  x: number;
  z: number;
  size: number;
  rot: number;
  life: number;
  color: THREE.Color;
}

const _yAxis = new THREE.Vector3(0, 1, 0);

/** 地上的尸液：丧尸倒下的地方留一摊，几秒后淡掉（对象池复用 Color） */
export class Splats {
  private readonly mesh: THREE.InstancedMesh;
  private readonly pool: SplatItem[];
  private n = 0;
  private cursor = 0;
  private prevCount = 0;

  constructor(scene: THREE.Scene, private readonly cap = 160) {
    this.pool = Array.from({ length: cap }, () => ({ x: 0, z: 0, size: 1, rot: 0, life: 0, color: new THREE.Color() }));
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const r = 0.35 + (((i * 7919) % 13) / 13) * 0.25;
      pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
    }
    const geo = new THREE.ShapeGeometry(new THREE.Shape(pts));
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 1;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < cap; i++) this.mesh.setColorAt(i, _c.setRGB(1, 1, 1));
    this.mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
  }

  spawn(x: number, z: number, size: number, color: number) {
    let idx: number;
    if (this.n < this.cap) {
      idx = this.n++;
    } else {
      idx = this.cursor;
      this.cursor = (this.cursor + 1) % this.cap;
    }
    const it = this.pool[idx];
    it.x = x;
    it.z = z;
    it.size = size * (0.8 + Math.random() * 0.5);
    it.rot = Math.random() * Math.PI * 2;
    it.life = 4;
    it.color.set(color);
  }

  update(dt: number) {
    let i = 0;
    while (i < this.n) {
      const it = this.pool[i];
      it.life -= dt;
      if (it.life <= 0) {
        const last = --this.n;
        if (i !== last) {
          this.pool[i] = this.pool[last];
          this.pool[last] = it;
        }
        continue;
      }
      const grow = Math.min(1, (4 - it.life) * 8);
      const fade = Math.min(1, it.life / 1.5);
      _q.setFromAxisAngle(_yAxis, it.rot);
      _p.set(it.x, 0.03, it.z);
      const k = it.size * grow * Math.sqrt(fade);
      _s.set(k, 1, k);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(i, _m);
      this.mesh.setColorAt(i, it.color);
      i++;
    }
    this.prevCount = commitInstances(this.mesh, this.n, this.prevCount, undefined, true);
  }

  clear() {
    this.n = 0;
    this.cursor = 0;
    this.prevCount = 0;
    this.mesh.count = 0;
  }
}

interface StreakItem {
  x: number;
  y: number;
  z: number;
  v: number;
  len: number;
  life: number;
  max: number;
}

/** 速度线：门道放行时沿着道冲向镜头的细长亮条 */
export class Streaks {
  private readonly mesh: THREE.InstancedMesh;
  private readonly pool: StreakItem[];
  private n = 0;
  private cursor = 0;
  private prevCount = 0;

  constructor(scene: THREE.Scene, private readonly cap = 90) {
    this.pool = Array.from({ length: cap }, () => ({ x: 0, y: 0, z: 0, v: 0, len: 1, life: 0, max: 1 }));
    const mat = new THREE.MeshBasicMaterial({ color: 0xfff6d8, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, cap);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
  }

  /** 在 x0..x1、z0..z1 的范围里撒 n 条，速度 v（朝镜头） */
  burst(x0: number, x1: number, z0: number, z1: number, n: number, v: number) {
    for (let i = 0; i < n; i++) {
      let idx: number;
      if (this.n < this.cap) {
        idx = this.n++;
      } else {
        idx = this.cursor;
        this.cursor = (this.cursor + 1) % this.cap;
      }
      const it = this.pool[idx];
      const life = 0.25 + Math.random() * 0.25;
      it.x = x0 + Math.random() * (x1 - x0);
      it.y = 0.15 + Math.random() * 2.6;
      it.z = z0 + Math.random() * (z1 - z0);
      it.v = v * (0.7 + Math.random() * 0.6);
      it.len = 1.5 + Math.random() * 3;
      it.life = life;
      it.max = life;
    }
  }

  update(dt: number) {
    let i = 0;
    while (i < this.n) {
      const it = this.pool[i];
      it.life -= dt;
      if (it.life <= 0) {
        const last = --this.n;
        if (i !== last) {
          this.pool[i] = this.pool[last];
          this.pool[last] = it;
        }
        continue;
      }
      it.z += it.v * dt;
      const k = it.life / it.max;
      _p.set(it.x, it.y, it.z);
      _s.set(0.045, 0.045, it.len * (0.4 + k));
      _q.identity();
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(i, _m);
      i++;
    }
    this.prevCount = commitInstances(this.mesh, this.n, this.prevCount);
  }

  clear() {
    this.n = 0;
    this.cursor = 0;
    this.prevCount = 0;
    this.mesh.count = 0;
  }
}

let sharedRingGeom: THREE.RingGeometry | null = null;
function getRingGeometry(): THREE.RingGeometry {
  if (!sharedRingGeom) {
    sharedRingGeom = new THREE.RingGeometry(0.86, 1, 48);
    sharedRingGeom.userData.shared = true;
  }
  return sharedRingGeom;
}

/** 地面冲击波圆环（共用同一份 RingGeometry） */
export class Rings {
  private readonly items: { mesh: THREE.Mesh; t: number; life: number; size: number }[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  spawn(x: number, z: number, size: number, color: number, life = 0.5) {
    let item = this.items.find((r) => r.t >= r.life);
    if (!item) {
      const mesh = new THREE.Mesh(
        getRingGeometry(),
        new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.renderOrder = 3;
      this.scene.add(mesh);
      item = { mesh, t: 0, life, size };
      this.items.push(item);
    }
    item.t = 0;
    item.life = life;
    item.size = size;
    item.mesh.visible = true;
    item.mesh.position.set(x, 0.08, z);
    (item.mesh.material as THREE.MeshBasicMaterial).color.set(color);
  }

  update(dt: number) {
    for (const r of this.items) {
      if (r.t >= r.life) continue;
      r.t += dt;
      const k = Math.min(1, r.t / r.life);
      const s = r.size * (0.2 + 0.8 * Math.sqrt(k));
      r.mesh.scale.set(s, s, s);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.6;
      if (k >= 1) r.mesh.visible = false;
    }
  }

  clear() {
    for (const r of this.items) {
      r.t = r.life;
      r.mesh.visible = false;
    }
  }
}

/** 换枪时从队伍脚下冲起来的光柱：上下渐隐的发光圆筒，先变粗再收细消失 */
export class Pillar {
  private readonly mesh: THREE.Mesh;
  private readonly material: THREE.MeshBasicMaterial;
  private t = 1;
  private width = 1;

  constructor(scene: THREE.Scene) {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 4, 64);
    const tex = new THREE.CanvasTexture(canvas);
    this.material = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
    const geo = new THREE.CylinderGeometry(1, 1, 1, 32, 1, true);
    geo.translate(0, 0.5, 0);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.renderOrder = 4;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  spawn(x: number, z: number, width: number, color: number) {
    this.t = 0;
    this.width = width;
    this.mesh.position.set(x, 0, z);
    this.material.color.set(color);
    this.mesh.visible = true;
  }

  update(dt: number) {
    if (this.t >= 1) return;
    this.t = Math.min(1, this.t + dt / 0.9);
    const k = this.t;
    const grow = Math.min(1, k / 0.15);
    const w = this.width * (0.35 + 0.65 * grow) * (1 - 0.6 * Math.max(0, k - 0.15));
    this.mesh.scale.set(w, 9 * grow, w);
    this.material.opacity = Math.min(1, (1 - k) * 1.6) * 0.85;
    if (k >= 1) this.mesh.visible = false;
  }

  clear() {
    this.t = 1;
    this.mesh.visible = false;
  }
}

/** 每种枪的弹道样子：芯粗细、光晕粗细、长度倍数、光晕亮度 */
const BULLET_STYLE: { core: number; glow: number; len: number; alpha: number }[] = [
  { core: 1.15, glow: 1.1, len: 0.65, alpha: 0.58 }, // 手枪：清晰明亮的单发弹头
  { core: 0.95, glow: 1.05, len: 0.85, alpha: 0.62 }, // 冲锋枪：密集火线
  { core: 1.25, glow: 1.35, len: 1.45, alpha: 0.72 }, // 突击步枪：橙色曳光弹
  { core: 0.75, glow: 1.55, len: 2.9, alpha: 0.78 }, // 战术步枪：细长凌厉的蓝色激光束
  { core: 0.9, glow: 1.2, len: 2.1, alpha: 0.68 }, // 加特林：密集金属火舌
  { core: 1.75, glow: 2.25, len: 1.65, alpha: 0.88 }, // 黄金步枪：粗壮金光曳光弹
  { core: 2.8, glow: 3.9, len: 0.55, alpha: 0.95 }, // 等离子炮：高能发光电浆团
];

export class BulletMesh {
  readonly mesh: THREE.InstancedMesh;
  readonly glow: THREE.InstancedMesh;
  private readonly cap: number;
  private style = BULLET_STYLE[0];
  private prevCount = 0;

  constructor(scene: THREE.Scene, cap = 1400) {
    this.cap = cap;
    const core = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.062, 0.062, 1), core, cap);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.glow = new THREE.InstancedMesh(new THREE.BoxGeometry(0.17, 0.17, 1.22), glowMat, cap);
    for (const m of [this.mesh, this.glow]) {
      m.frustumCulled = false;
      m.count = 0;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
    }
  }

  /** 子弹芯用枪的颜色，外圈光晕用弹种的颜色（普通弹就还是枪的颜色），两样都看得出来 */
  setColor(color: number, tier = 0, glow = color) {
    const safeTier = Math.max(0, Math.min(BULLET_STYLE.length - 1, tier));
    this.style = BULLET_STYLE[safeTier];
    (this.glow.material as THREE.MeshBasicMaterial).opacity = this.style.alpha;
    (this.glow.material as THREE.MeshBasicMaterial).color.set(glow);
    (this.mesh.material as THREE.MeshBasicMaterial).color.set(color).lerp(_white, 0.55);
  }

  update(bullets: readonly Bullet[]) {
    const n = Math.min(bullets.length, this.cap);
    for (let i = 0; i < n; i++) {
      const b = bullets[i];
      const st = this.style;
      const len = (0.65 + Math.min(0.55, b.travel * 0.06)) * st.len;
      _e.set(0, Math.atan2(-b.vx, b.vd), 0);
      _q.setFromEuler(_e);
      _p.set(b.x, 0.74, -b.d);
      _s.set(st.core, st.core, len);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(i, _m);
      _s.set(st.glow, st.glow, len);
      _m.compose(_p, _q, _s);
      this.glow.setMatrixAt(i, _m);
    }
    commitInstances(this.glow, n, this.prevCount);
    this.prevCount = commitInstances(this.mesh, n, this.prevCount);
  }
}

const _v = new THREE.Vector3();

interface FloatItem {
  el: HTMLDivElement;
  pos: THREE.Vector3;
  t: number;
  life: number;
  rise: number;
}

/** DOM 飘字：+12、武器升级之类（DOM 节点池复用，零 createElement/remove 抖动） */
export class FloatTexts {
  private readonly items: FloatItem[] = [];
  private readonly free: FloatItem[] = [];
  private cursor = 0;

  constructor(private readonly layer: HTMLElement) {}

  spawn(text: string, x: number, y: number, z: number, cls = '', life = 1.1, rise = 1.6) {
    let stack = 0;
    for (let i = 0; i < this.items.length; i++) {
      const existing = this.items[i];
      if (existing.t < 0.5 && Math.abs(existing.pos.x - x) < 1.6 && Math.abs(existing.pos.z - z) < 1.6) stack++;
    }
    y += Math.min(4, stack) * 0.75;

    let item: FloatItem;
    if (this.items.length >= 45) {
      item = this.items[this.cursor % this.items.length];
      this.cursor = (this.cursor + 1) % 45;
    } else if (this.free.length > 0) {
      item = this.free.pop()!;
      item.el.style.display = '';
      this.items.push(item);
    } else {
      const el = document.createElement('div');
      this.layer.appendChild(el);
      item = { el, pos: new THREE.Vector3(), t: 0, life, rise };
      this.items.push(item);
    }
    item.el.className = cls ? `float-text ${cls}` : 'float-text';
    item.el.textContent = text;
    item.el.style.opacity = '1';
    item.pos.set(x, y, z);
    item.t = 0;
    item.life = life;
    item.rise = rise;
  }

  update(dt: number, camera: THREE.Camera, w: number, h: number) {
    let i = 0;
    while (i < this.items.length) {
      const it = this.items[i];
      it.t += dt;
      if (it.t >= it.life) {
        this.recycle(i);
        continue;
      }
      const k = it.t / it.life;
      _v.copy(it.pos);
      _v.y += it.rise * (1 - Math.pow(1 - k, 2.2));
      _v.project(camera);
      const sx = (_v.x * 0.5 + 0.5) * w;
      const sy = (-_v.y * 0.5 + 0.5) * h;
      const pop = k < 0.12 ? 0.55 + (k / 0.12) * 0.78 : 1.33 - Math.min(0.33, (k - 0.12) * 0.85);
      it.el.style.transform = `translate(-50%, -50%) translate(${sx}px, ${sy}px) scale(${pop})`;
      it.el.style.opacity = _v.z > 1 ? '0' : String(k > 0.68 ? (1 - k) / 0.32 : 1);
      i++;
    }
  }

  private recycle(i: number) {
    const it = this.items[i];
    it.el.style.opacity = '0';
    it.el.style.display = 'none';
    const last = this.items.length - 1;
    if (i !== last) this.items[i] = this.items[last];
    this.items.pop();
    this.free.push(it);
  }

  clear() {
    while (this.items.length > 0) this.recycle(this.items.length - 1);
    this.cursor = 0;
  }
}

interface ExplosionItem {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  t: number;
  life: number;
  size: number;
  grow: number;
  smoke: boolean;
  shade: number;
}

/** 爆炸：发光火球 + 灰色烟团（对象池 + 子区间缓冲上传） */
export class Explosions {
  private readonly fire: THREE.InstancedMesh;
  private readonly smoke: THREE.InstancedMesh;
  private readonly pool: ExplosionItem[];
  private n = 0;
  private cursor = 0;
  private prevFire = 0;
  private prevSmoke = 0;

  constructor(scene: THREE.Scene, private readonly cap = 260) {
    this.pool = Array.from({ length: cap }, () => ({
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      t: 0,
      life: 1,
      size: 1,
      grow: 1,
      smoke: false,
      shade: 1,
    }));
    const geo = new THREE.IcosahedronGeometry(1, 1);
    this.fire = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), cap);
    this.smoke = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.6, depthWrite: false }), cap);
    for (const m of [this.fire, this.smoke]) {
      m.frustumCulled = false;
      m.count = 0;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < cap; i++) m.setColorAt(i, _c.setRGB(1, 1, 1));
      m.instanceColor!.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
    }
    this.smoke.renderOrder = 4;
    this.fire.renderOrder = 5;
  }

  private alloc(): ExplosionItem {
    if (this.n < this.cap) return this.pool[this.n++];
    const it = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % this.cap;
    return it;
  }

  /** radius 大约是爆炸覆盖的半径 */
  spawn(x: number, y: number, z: number, radius: number, smoky = true) {
    const core = this.alloc();
    core.x = x;
    core.y = y;
    core.z = z;
    core.vx = 0;
    core.vy = 1;
    core.vz = 0;
    core.t = 0;
    core.life = 0.32;
    core.size = Math.min(1.1, radius * 0.32);
    core.grow = 1.3;
    core.smoke = false;
    core.shade = 1;

    const count = Math.round(4 + radius * 2);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = radius * (0.2 + Math.random() * 0.6);
      const it = this.alloc();
      it.x = x + Math.cos(a) * r * 0.5;
      it.y = y + Math.random() * radius * 0.4;
      it.z = z + Math.sin(a) * r * 0.5;
      it.vx = Math.cos(a) * r * 1.8;
      it.vy = 1.5 + Math.random() * 2.5;
      it.vz = Math.sin(a) * r * 1.8;
      it.t = 0;
      it.life = 0.3 + Math.random() * 0.25;
      it.size = Math.min(0.7, radius * (0.12 + Math.random() * 0.14));
      it.grow = 1.2;
      it.smoke = false;
      it.shade = 0.7 + Math.random() * 0.3;
    }
    if (!smoky) return;
    const smokeCount = Math.round(3 + radius * 1.5);
    for (let i = 0; i < smokeCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const it = this.alloc();
      it.x = x + Math.cos(a) * radius * 0.4;
      it.y = y + 0.3;
      it.z = z + Math.sin(a) * radius * 0.4;
      it.vx = Math.cos(a) * 0.8;
      it.vy = 1.6 + Math.random() * 1.6;
      it.vz = Math.sin(a) * 0.8;
      it.t = -0.08;
      it.life = 0.8 + Math.random() * 0.5;
      it.size = Math.min(0.9, radius * (0.14 + Math.random() * 0.12));
      it.grow = 1.1;
      it.smoke = true;
      it.shade = 0.35 + Math.random() * 0.25;
    }
  }

  update(dt: number) {
    let nf = 0;
    let ns = 0;
    let i = 0;
    while (i < this.n) {
      const it = this.pool[i];
      it.t += dt;
      if (it.t >= it.life) {
        const last = --this.n;
        if (i !== last) {
          this.pool[i] = this.pool[last];
          this.pool[last] = it;
        }
        continue;
      }
      if (it.t < 0) {
        i++;
        continue;
      }
      it.x += it.vx * dt;
      it.y += it.vy * dt;
      it.z += it.vz * dt;
      const damp = Math.pow(0.9, dt * 60);
      it.vx *= damp;
      it.vz *= damp;
      const k = it.t / it.life;
      const s = it.size * (0.5 + it.grow * Math.sqrt(k)) * (k > 0.8 ? 1 - (k - 0.8) / 0.2 : 1);
      _p.set(it.x, it.y, it.z);
      _q.identity();
      _s.setScalar(Math.max(0.01, s));
      _m.compose(_p, _q, _s);
      if (it.smoke) {
        this.smoke.setMatrixAt(ns, _m);
        this.smoke.setColorAt(ns, _c.setRGB(it.shade, it.shade, it.shade * 1.05));
        ns++;
      } else {
        const fade = 1 - k;
        _c.setRGB(1, 0.62 - k * 0.4, 0.22 - k * 0.22).multiplyScalar(fade * it.shade);
        this.fire.setMatrixAt(nf, _m);
        this.fire.setColorAt(nf, _c);
        nf++;
      }
      i++;
    }
    this.prevFire = commitInstances(this.fire, nf, this.prevFire, undefined, true);
    this.prevSmoke = commitInstances(this.smoke, ns, this.prevSmoke, undefined, true);
  }

  clear() {
    this.n = 0;
    this.cursor = 0;
    this.prevFire = 0;
    this.prevSmoke = 0;
    this.fire.count = 0;
    this.smoke.count = 0;
  }
}

const _right = new THREE.Vector3();
const _cq = new THREE.Quaternion();

/** 普通丧尸头上的小血条：挨过打才显示，始终朝向镜头 */
export class ZombieBars {
  private readonly bg: THREE.InstancedMesh;
  private readonly fill: THREE.InstancedMesh;
  private n = 0;
  private prevCount = 0;

  constructor(scene: THREE.Scene, private readonly cap = 500) {
    const geo = new THREE.PlaneGeometry(1, 1);
    this.bg = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0x14080c, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false, toneMapped: false }), cap);
    this.fill = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }), cap);
    for (const m of [this.bg, this.fill]) {
      m.frustumCulled = false;
      m.count = 0;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
    }
    for (let i = 0; i < cap; i++) this.fill.setColorAt(i, _c.setRGB(1, 0.2, 0.2));
    this.fill.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    this.bg.renderOrder = 18;
    this.fill.renderOrder = 19;
  }

  begin(camera: THREE.Camera) {
    this.n = 0;
    _cq.copy(camera.quaternion);
    _right.set(1, 0, 0).applyQuaternion(_cq);
  }

  push(x: number, y: number, z: number, width: number, ratio: number) {
    if (this.n >= this.cap) return;
    const i = this.n++;
    const h = Math.max(0.11, width * 0.15);
    _p.set(x, y, z);
    _s.set(width + 0.06, h + 0.06, 1);
    _m.compose(_p, _cq, _s);
    this.bg.setMatrixAt(i, _m);
    const w = Math.max(0.001, width * ratio);
    _p.addScaledVector(_right, -(width - w) / 2);
    _s.set(w, h, 1);
    _m.compose(_p, _cq, _s);
    this.fill.setMatrixAt(i, _m);
    this.fill.setColorAt(i, _c.setRGB(1, 0.25 + 0.6 * ratio, 0.15));
  }

  end() {
    commitInstances(this.bg, this.n, this.prevCount);
    this.prevCount = commitInstances(this.fill, this.n, this.prevCount, undefined, true);
  }
}
