import * as THREE from 'three';
import type { Bullet } from '../game/world';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

/** 固定容量的粒子池，数据放在 typed array 里 */
export class Particles {
  readonly mesh: THREE.InstancedMesh;
  private readonly cap: number;
  private n = 0;
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
      // 满了就覆盖一个随机的旧粒子
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

  burst(x: number, y: number, z: number, count: number, speed: number, life: number, size: number, colors: number[], gravity = 18, up = 0.6) {
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
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
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
    this.mesh.count = 0;
  }
}

/** 枪口火光：朝向镜头的星形亮片，一闪即逝（几十个共用一次绘制） */
export class Flashes {
  private readonly mesh: THREE.InstancedMesh;
  private readonly items: { x: number; y: number; z: number; size: number; life: number; max: number; rot: number }[] = [];

  constructor(scene: THREE.Scene, private readonly cap = 64) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,240,180,0.9)');
    grad.addColorStop(1, 'rgba(255,170,40,0)');
    g.fillStyle = grad;
    g.beginPath();
    // 四角星
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
    (this.mesh.material as THREE.MeshBasicMaterial).color.set(color).lerp(new THREE.Color(0xffffff), 0.5);
  }

  spawn(x: number, y: number, z: number, size: number) {
    if (this.items.length >= this.cap) this.items.shift();
    const life = 0.05 + Math.random() * 0.03;
    this.items.push({ x, y, z, size: size * (0.7 + Math.random() * 0.6), life, max: life, rot: Math.random() * Math.PI });
  }

  update(dt: number, camera: THREE.Camera) {
    let n = 0;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      if (it.life <= 0) {
        this.items.splice(i, 1);
        continue;
      }
      const k = it.life / it.max;
      _q.copy(camera.quaternion).multiply(_qz.setFromAxisAngle(_zAxis, it.rot));
      _p.set(it.x, it.y, it.z);
      _s.setScalar(it.size * (0.6 + 0.4 * k));
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(n++, _m);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.items.length = 0;
    this.mesh.count = 0;
  }
}

const _qz = new THREE.Quaternion();
const _zAxis = new THREE.Vector3(0, 0, 1);

/** 人群脚下的圆形影子：代替几百个人的实时阴影（每人两个三角形，一次绘制） */
export class BlobShadows {
  private readonly mesh: THREE.InstancedMesh;
  private n = 0;

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
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** 地上的尸液：丧尸倒下的地方留一摊，几秒后淡掉（共用一次绘制） */
export class Splats {
  private readonly mesh: THREE.InstancedMesh;
  private readonly items: { x: number; z: number; size: number; rot: number; life: number; color: THREE.Color }[] = [];

  constructor(scene: THREE.Scene, private readonly cap = 160) {
    // 不规则的一摊：圆周上随机起伏的扇形
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const r = 0.35 + ((i * 7919) % 13) / 13 * 0.25;
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
    scene.add(this.mesh);
  }

  spawn(x: number, z: number, size: number, color: number) {
    if (this.items.length >= this.cap) this.items.shift();
    this.items.push({ x, z, size: size * (0.8 + Math.random() * 0.5), rot: Math.random() * Math.PI * 2, life: 4, color: new THREE.Color(color) });
  }

  update(dt: number) {
    let n = 0;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      if (it.life <= 0) {
        this.items.splice(i, 1);
        continue;
      }
      const grow = Math.min(1, (4 - it.life) * 8);
      const fade = Math.min(1, it.life / 1.5);
      _q.setFromAxisAngle(_yAxis, it.rot);
      _p.set(it.x, 0.03, it.z);
      // 淡出时慢慢缩小（逐个改透明度要多一个属性，不值得）
      const k = it.size * grow * Math.sqrt(fade);
      _s.set(k, 1, k);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(n, _m);
      this.mesh.setColorAt(n, it.color);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear() {
    this.items.length = 0;
    this.mesh.count = 0;
  }
}

const _yAxis = new THREE.Vector3(0, 1, 0);

/** 速度线：门道放行时沿着道冲向镜头的细长亮条 */
export class Streaks {
  private readonly mesh: THREE.InstancedMesh;
  private readonly items: { x: number; y: number; z: number; v: number; len: number; life: number; max: number }[] = [];

  constructor(scene: THREE.Scene, private readonly cap = 90) {
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
      if (this.items.length >= this.cap) this.items.shift();
      const life = 0.25 + Math.random() * 0.25;
      this.items.push({ x: x0 + Math.random() * (x1 - x0), y: 0.15 + Math.random() * 2.6, z: z0 + Math.random() * (z1 - z0), v: v * (0.7 + Math.random() * 0.6), len: 1.5 + Math.random() * 3, life, max: life });
    }
  }

  update(dt: number) {
    let n = 0;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      if (it.life <= 0) {
        this.items.splice(i, 1);
        continue;
      }
      it.z += it.v * dt;
      const k = it.life / it.max;
      _p.set(it.x, it.y, it.z);
      _s.set(0.045, 0.045, it.len * (0.4 + k));
      _q.identity();
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(n++, _m);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.items.length = 0;
    this.mesh.count = 0;
  }
}

/** 地面冲击波圆环 */
export class Rings {
  private readonly items: { mesh: THREE.Mesh; t: number; life: number; size: number }[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  spawn(x: number, z: number, size: number, color: number, life = 0.5) {
    let item = this.items.find((r) => r.t >= r.life);
    if (!item) {
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(0.86, 1, 48),
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
    // 0–0.15 冲起来变粗，之后慢慢收细变淡
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

/** 子弹：拉长的发光方块 */
/** 每种枪的弹道样子：芯粗细、光晕粗细、长度倍数、光晕亮度 */
const BULLET_STYLE: { core: number; glow: number; len: number; alpha: number }[] = [
  { core: 0.9, glow: 0.8, len: 0.5, alpha: 0.45 }, // 手枪：短小的子弹
  { core: 0.75, glow: 0.8, len: 0.7, alpha: 0.5 }, // 冲锋枪：又小又密，泼得开
  { core: 1, glow: 1.1, len: 1.2, alpha: 0.6 }, // 突击步枪：橙色曳光弹
  { core: 0.55, glow: 1.3, len: 2.6, alpha: 0.65 }, // 战术步枪：细长的蓝色光线，又快又准
  { core: 0.65, glow: 0.9, len: 1.8, alpha: 0.55 }, // 加特林：细长的光线，一大片扇面
  { core: 1.5, glow: 1.9, len: 1.4, alpha: 0.8 }, // 黄金步枪：粗金光（带闪粉拖尾）
  { core: 2.6, glow: 3.6, len: 0.45, alpha: 0.9 }, // 等离子炮：慢而大的发光弹团（带拖尾）
];

export class BulletMesh {
  readonly mesh: THREE.InstancedMesh;
  readonly glow: THREE.InstancedMesh;
  private readonly cap: number;
  private style = BULLET_STYLE[0];

  constructor(scene: THREE.Scene, cap = 1400) {
    this.cap = cap;
    const core = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.045, 0.045, 1), core, cap);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.glow = new THREE.InstancedMesh(new THREE.BoxGeometry(0.13, 0.13, 1.15), glowMat, cap);
    for (const m of [this.mesh, this.glow]) {
      m.frustumCulled = false;
      m.count = 0;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
    }
  }

  /** 子弹芯用枪的颜色，外圈光晕用弹种的颜色（普通弹就还是枪的颜色），两样都看得出来 */
  setColor(color: number, tier = 0, glow = color) {
    this.style = BULLET_STYLE[Math.min(BULLET_STYLE.length - 1, tier)];
    (this.glow.material as THREE.MeshBasicMaterial).opacity = this.style.alpha;
    (this.glow.material as THREE.MeshBasicMaterial).color.set(glow);
    (this.mesh.material as THREE.MeshBasicMaterial).color.set(color).lerp(new THREE.Color(0xffffff), 0.45);
  }

  update(bullets: readonly Bullet[]) {
    const n = Math.min(bullets.length, this.cap);
    for (let i = 0; i < n; i++) {
      const b = bullets[i];
      const st = this.style;
      const len = (0.55 + Math.min(0.45, b.travel * 0.05)) * st.len;
      _e.set(0, Math.atan2(-b.vx, b.vd), 0);
      _q.setFromEuler(_e);
      _p.set(b.x, 0.72, -b.d);
      _s.set(st.core, st.core, len);
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(i, _m);
      _s.set(st.glow, st.glow, len);
      _m.compose(_p, _q, _s);
      this.glow.setMatrixAt(i, _m);
    }
    this.mesh.count = n;
    this.glow.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.glow.instanceMatrix.needsUpdate = true;
  }
}

const _v = new THREE.Vector3();

/** DOM 飘字：+12、武器升级之类 */
export class FloatTexts {
  private readonly items: { el: HTMLDivElement; pos: THREE.Vector3; t: number; life: number; rise: number }[] = [];

  constructor(private readonly layer: HTMLElement) {}

  spawn(text: string, x: number, y: number, z: number, cls = '', life = 1.1, rise = 1.6) {
    // 同一个地方刚冒过字就往上叠一层，不要糊在一起
    let stack = 0;
    for (const it of this.items) if (it.t < 0.5 && Math.abs(it.pos.x - x) < 1.6 && Math.abs(it.pos.z - z) < 1.6) stack++;
    y += Math.min(4, stack) * 0.75;
    const el = document.createElement('div');
    el.className = `float-text ${cls}`;
    el.textContent = text;
    this.layer.appendChild(el);
    this.items.push({ el, pos: new THREE.Vector3(x, y, z), t: 0, life, rise });
    if (this.items.length > 40) this.remove(0);
  }

  update(dt: number, camera: THREE.Camera, w: number, h: number) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      if (it.t >= it.life) {
        this.remove(i);
        continue;
      }
      const k = it.t / it.life;
      _v.copy(it.pos);
      _v.y += it.rise * (1 - Math.pow(1 - k, 2));
      _v.project(camera);
      const sx = (_v.x * 0.5 + 0.5) * w;
      const sy = (-_v.y * 0.5 + 0.5) * h;
      const pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.6 : 1.2 - Math.min(0.2, (k - 0.15) * 0.5);
      it.el.style.transform = `translate(-50%, -50%) translate(${sx}px, ${sy}px) scale(${pop})`;
      // 跑到镜头背后的不画（投影会翻到屏幕另一边）
      it.el.style.opacity = _v.z > 1 ? '0' : String(k > 0.7 ? (1 - k) / 0.3 : 1);
    }
  }

  private remove(i: number) {
    this.items[i].el.remove();
    this.items.splice(i, 1);
  }

  clear() {
    while (this.items.length) this.remove(this.items.length - 1);
  }
}

/** 爆炸：发光火球 + 灰色烟团，都是会长大的球 */
export class Explosions {
  private readonly fire: THREE.InstancedMesh;
  private readonly smoke: THREE.InstancedMesh;
  private readonly items: { x: number; y: number; z: number; vx: number; vy: number; vz: number; t: number; life: number; size: number; grow: number; smoke: boolean; shade: number }[] = [];

  constructor(scene: THREE.Scene, private readonly cap = 260) {
    const geo = new THREE.IcosahedronGeometry(1, 1);
    this.fire = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), cap);
    this.smoke = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.6, depthWrite: false }), cap);
    for (const m of [this.fire, this.smoke]) {
      m.frustumCulled = false;
      m.count = 0;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < cap; i++) m.setColorAt(i, _c.setRGB(1, 1, 1));
      scene.add(m);
    }
    this.smoke.renderOrder = 4;
    this.fire.renderOrder = 5;
  }

  /** radius 大约是爆炸覆盖的半径 */
  spawn(x: number, y: number, z: number, radius: number, smoky = true) {
    const add = (it: (typeof this.items)[number]) => {
      if (this.items.length >= this.cap) this.items.shift();
      this.items.push(it);
    };
    add({ x, y, z, vx: 0, vy: 1, vz: 0, t: 0, life: 0.32, size: Math.min(1.1, radius * 0.32), grow: 1.3, smoke: false, shade: 1 });
    const n = Math.round(4 + radius * 2);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = radius * (0.2 + Math.random() * 0.6);
      add({
        x: x + Math.cos(a) * r * 0.5,
        y: y + Math.random() * radius * 0.4,
        z: z + Math.sin(a) * r * 0.5,
        vx: Math.cos(a) * r * 1.8,
        vy: 1.5 + Math.random() * 2.5,
        vz: Math.sin(a) * r * 1.8,
        t: 0,
        life: 0.3 + Math.random() * 0.25,
        size: Math.min(0.7, radius * (0.12 + Math.random() * 0.14)),
        grow: 1.2,
        smoke: false,
        shade: 0.7 + Math.random() * 0.3,
      });
    }
    if (!smoky) return;
    for (let i = 0; i < Math.round(3 + radius * 1.5); i++) {
      const a = Math.random() * Math.PI * 2;
      add({
        x: x + Math.cos(a) * radius * 0.4,
        y: y + 0.3,
        z: z + Math.sin(a) * radius * 0.4,
        vx: Math.cos(a) * 0.8,
        vy: 1.6 + Math.random() * 1.6,
        vz: Math.sin(a) * 0.8,
        t: -0.08,
        life: 0.8 + Math.random() * 0.5,
        size: Math.min(0.9, radius * (0.14 + Math.random() * 0.12)),
        grow: 1.1,
        smoke: true,
        shade: 0.35 + Math.random() * 0.25,
      });
    }
  }

  update(dt: number) {
    let nf = 0;
    let ns = 0;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      if (it.t >= it.life) {
        this.items.splice(i, 1);
        continue;
      }
      if (it.t < 0) continue;
      it.x += it.vx * dt;
      it.y += it.vy * dt;
      it.z += it.vz * dt;
      it.vx *= 0.9;
      it.vz *= 0.9;
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
        // 火球从白黄变橙红，再变暗（叠加混合下变暗等于淡出）
        const fade = 1 - k;
        _c.setRGB(1, 0.62 - k * 0.4, 0.22 - k * 0.22).multiplyScalar(fade * it.shade);
        this.fire.setMatrixAt(nf, _m);
        this.fire.setColorAt(nf, _c);
        nf++;
      }
    }
    this.fire.count = nf;
    this.smoke.count = ns;
    for (const m of [this.fire, this.smoke]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  clear() {
    this.items.length = 0;
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

  constructor(scene: THREE.Scene, private readonly cap = 500) {
    const geo = new THREE.PlaneGeometry(1, 1);
    // 两层都放进透明队列，renderOrder 才能保证填充画在底板上面
    this.bg = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0x14080c, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false, toneMapped: false }), cap);
    this.fill = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }), cap);
    for (const m of [this.bg, this.fill]) {
      m.frustumCulled = false;
      m.count = 0;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
    }
    for (let i = 0; i < cap; i++) this.fill.setColorAt(i, _c.setRGB(1, 0.2, 0.2));
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
    // 血多偏黄，血少偏红
    this.fill.setColorAt(i, _c.setRGB(1, 0.25 + 0.6 * ratio, 0.15));
  }

  end() {
    this.bg.count = this.n;
    this.fill.count = this.n;
    this.bg.instanceMatrix.needsUpdate = true;
    this.fill.instanceMatrix.needsUpdate = true;
    if (this.fill.instanceColor) this.fill.instanceColor.needsUpdate = true;
  }
}
