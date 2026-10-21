import * as THREE from 'three';
import { LANE_HALF, TRACK_HALF } from '../game/config';
import { mulberry32 } from '../game/rng';

export interface Theme {
  skyTop: number;
  skyBottom: number;
  fog: number;
  water: number;
  sun: number;
  sunIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  /** 远处城市剪影 */
  city: number;
  /** 路灯是否亮 */
  lamps: boolean;
}

export const THEMES: Theme[] = [
  // 白天
  { skyTop: 0x3d9cf0, skyBottom: 0xd4f0ff, fog: 0xc4e6fb, water: 0x2a8de0, sun: 0xffffff, sunIntensity: 2.2, hemiSky: 0xffffff, hemiGround: 0x9fb3c8, hemiIntensity: 1.6, city: 0x9fb4c8, lamps: false },
  // 黄昏
  { skyTop: 0xf4825a, skyBottom: 0xffe2b0, fog: 0xffd3a8, water: 0x4c7ec0, sun: 0xffe2c0, sunIntensity: 2.1, hemiSky: 0xfff0e0, hemiGround: 0xa89890, hemiIntensity: 1.5, city: 0xb08a80, lamps: true },
  // 傍晚
  { skyTop: 0x34408f, skyBottom: 0xffa6bd, fog: 0xe6a9c4, water: 0x2f5596, sun: 0xffd6e0, sunIntensity: 1.9, hemiSky: 0xe8e0ff, hemiGround: 0x8a86a8, hemiIntensity: 1.5, city: 0x7a6a98, lamps: true },
];

export const DECK_HALF = TRACK_HALF + 0.6;
/** 跑步机：所有重复的桥面构件都在镜头前后这个范围里循环摆放 */
const AHEAD = 230;
const BEHIND = 50;
const TOWER_GAP = 110;

/** 整条桥宽一张贴图：点阵 + 车道虚线，只沿长度方向重复 */
function deckTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#d6d8dc';
  ctx.fillRect(0, 0, W, H);
  const width = TRACK_HALF * 2 + 0.4;
  const px = (x: number) => ((x + width / 2) / width) * W;
  ctx.fillStyle = '#c3c6cc';
  for (let y = 0; y < 6; y++) {
    for (let x = 0; x < 24; x++) {
      ctx.beginPath();
      ctx.arc(10 + x * 21.5 + (y % 2) * 10, 20 + y * 43, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // 车道虚线
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  for (const x of [-LANE_HALF, LANE_HALF]) {
    ctx.fillRect(px(x) - 4, 0, 8, H * 0.55);
  }
  // 两侧实线
  ctx.fillStyle = '#f2c21b';
  for (const x of [-TRACK_HALF + 0.05, TRACK_HALF - 0.05]) ctx.fillRect(px(x) - 5, 0, 10, H);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function waveTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 256, 256);
  const rng = mulberry32(7);
  for (let i = 0; i < 70; i++) {
    ctx.fillStyle = `rgba(190,215,240,${0.25 + rng() * 0.3})`;
    ctx.beginPath();
    ctx.ellipse(rng() * 256, rng() * 256, 20 + rng() * 50, 3 + rng() * 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function smokeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function beamMatrix(a: THREE.Vector3, b: THREE.Vector3, radius: number): THREE.Matrix4 {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  return new THREE.Matrix4().compose(mid, q, new THREE.Vector3(radius, len, radius));
}

interface Scenery {
  obj: THREE.Object3D;
  /** 世界 d 坐标，落到镜头后面就往前挪一个周期 */
  d: number;
}

const SCENERY_SPAN = 1400;

export class Environment {
  readonly group = new THREE.Group();
  theme: Theme = THEMES[0];
  private readonly skyMat: THREE.ShaderMaterial;
  private readonly sky: THREE.Mesh;
  private readonly water: THREE.Mesh;
  private readonly waterTex: THREE.CanvasTexture;
  private readonly deckTex: THREE.CanvasTexture;
  private readonly deck: THREE.Group;
  private readonly posts: THREE.InstancedMesh;
  private readonly lamps: THREE.InstancedMesh;
  private readonly lampHeads: THREE.InstancedMesh;
  private readonly lampMat: THREE.MeshBasicMaterial;
  private readonly towers: THREE.Group[] = [];
  private readonly scenery: Scenery[] = [];
  private readonly cityMat: THREE.MeshLambertMaterial;
  private readonly smokes: { sprite: THREE.Sprite; base: THREE.Vector3; phase: number }[] = [];
  private readonly arena: THREE.Group;
  private time = 0;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } },
      vertexShader: `varying vec3 vPos; void main(){ vPos = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 bottom; varying vec3 vPos;
        void main(){ float h = clamp(vPos.y * 1.6 + 0.1, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, pow(h, 0.8)), 1.0);
        #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(600, 24, 16), this.skyMat);
    this.sky.renderOrder = -10;
    this.group.add(this.sky);

    this.waterTex = waveTexture();
    this.waterTex.repeat.set(30, 60);
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(900, 1800), new THREE.MeshLambertMaterial({ color: 0x2a8de0, map: this.waterTex }));
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = -9;
    this.group.add(this.water);

    // 桥面：长度固定，跟着镜头走，贴图按世界坐标对齐
    this.deckTex = deckTexture();
    const len = AHEAD + BEHIND;
    this.deckTex.repeat.set(1, len / 5.6);
    this.deck = new THREE.Group();
    const top = new THREE.Mesh(new THREE.PlaneGeometry(TRACK_HALF * 2 + 0.4, len), new THREE.MeshLambertMaterial({ map: this.deckTex }));
    top.rotation.x = -Math.PI / 2;
    top.position.z = -(AHEAD - BEHIND) / 2;
    top.receiveShadow = true;
    this.deck.add(top);
    const concrete = new THREE.MeshLambertMaterial({ color: 0xc9ccd1 });
    const steel = new THREE.MeshLambertMaterial({ color: 0x8f98a3 });
    const under = new THREE.Mesh(new THREE.BoxGeometry(DECK_HALF * 2 + 1.2, 1.4, len), new THREE.MeshLambertMaterial({ color: 0x9aa0a8 }));
    under.position.set(0, -0.72, top.position.z);
    this.deck.add(under);
    for (const side of [-1, 1]) {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.42, len), concrete);
      curb.position.set(side * (TRACK_HALF + 0.7), 0.2, top.position.z);
      curb.receiveShadow = true;
      this.deck.add(curb);
      for (const y of [0.85, 1.35]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, len), steel);
        rail.position.set(side * (TRACK_HALF + 0.95), y, top.position.z);
        this.deck.add(rail);
      }
    }
    this.group.add(this.deck);

    this.posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.06, 1.0, 6), steel, Math.ceil(len / 2.4) * 2 + 4);
    this.posts.frustumCulled = false;
    this.group.add(this.posts);

    // 路灯
    const pole = new THREE.CylinderGeometry(0.07, 0.09, 5.2, 6);
    pole.translate(0, 2.6, 0);
    this.lamps = new THREE.InstancedMesh(pole, steel, Math.ceil(len / 24) * 2 + 4);
    this.lampMat = new THREE.MeshBasicMaterial({ color: 0xfff1c0, toneMapped: false });
    const head = new THREE.BoxGeometry(0.9, 0.14, 0.32);
    head.translate(0.35, 5.2, 0);
    this.lampHeads = new THREE.InstancedMesh(head, this.lampMat, this.lamps.count);
    for (const m of [this.lamps, this.lampHeads]) {
      m.frustumCulled = false;
      this.group.add(m);
    }

    // 斜拉桥塔：几座塔循环使用
    const towerMat = new THREE.MeshLambertMaterial({ color: 0x858d96 });
    const cableMat = new THREE.MeshLambertMaterial({ color: 0xd8dde3 });
    const towerX = DECK_HALF + 2.2;
    for (let i = 0; i < 4; i++) {
      const t = new THREE.Group();
      for (const side of [-1, 1]) {
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 46, 2.0), towerMat);
        pillar.position.set(side * towerX, 9, 0);
        pillar.castShadow = true;
        t.add(pillar);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(towerX * 2 + 1.6, 1.6, 1.8), towerMat);
      beam.position.y = 31;
      t.add(beam);
      const mats: THREE.Matrix4[] = [];
      for (const side of [-1, 1]) {
        for (let k = 1; k <= 6; k++) {
          for (const dir of [-1, 1]) {
            mats.push(beamMatrix(new THREE.Vector3(side * towerX, 30 - k * 1.6, 0), new THREE.Vector3(side * (TRACK_HALF + 1.2), 1.3, dir * k * 7.5), 0.07));
          }
        }
      }
      const cables = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 5), cableMat, mats.length);
      mats.forEach((m, j) => cables.setMatrixAt(j, m));
      t.add(cables);
      this.towers.push(t);
      this.group.add(t);
    }

    // 远处：小岛、城市剪影、黑烟
    const rng = mulberry32(17);
    const islandMat = new THREE.MeshLambertMaterial({ color: 0x5f9e5a });
    const rockMat = new THREE.MeshLambertMaterial({ color: 0xb8a98c });
    this.cityMat = new THREE.MeshLambertMaterial({ color: 0x9fb4c8 });
    for (let i = 0; i < 12; i++) {
      const side = i % 2 ? 1 : -1;
      const g = new THREE.Group();
      const r = 12 + rng() * 26;
      const island = new THREE.Mesh(new THREE.ConeGeometry(r, r * (0.4 + rng() * 0.5), 7), islandMat);
      const beach = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.05, r * 1.1, 1.2, 7), rockMat);
      beach.position.y = 0.2;
      g.add(island, beach);
      g.position.set(side * (110 + rng() * 160), -9, 0);
      this.scenery.push({ obj: g, d: rng() * SCENERY_SPAN });
      this.group.add(g);
    }
    const smokeTex = smokeTexture();
    for (let i = 0; i < 10; i++) {
      const side = i % 2 ? 1 : -1;
      const city = new THREE.Group();
      const blocks = 5 + Math.floor(rng() * 6);
      for (let b = 0; b < blocks; b++) {
        const h = 14 + rng() * 46;
        const w = 8 + rng() * 12;
        const block = new THREE.Mesh(new THREE.BoxGeometry(w, h, 8 + rng() * 10), this.cityMat);
        block.position.set((b - blocks / 2) * 13 + rng() * 4, h / 2 - 9, rng() * 20);
        city.add(block);
      }
      city.position.set(side * (280 + rng() * 120), 0, 0);
      this.scenery.push({ obj: city, d: rng() * SCENERY_SPAN });
      this.group.add(city);
      if (i % 2 === 0) {
        // 城里冒黑烟
        for (let k = 0; k < 6; k++) {
          const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0x3d3a3a, transparent: true, opacity: 0.55, depthWrite: false }));
          const base = new THREE.Vector3(rng() * 20 - 10, 20 + k * 14, rng() * 10);
          sprite.scale.setScalar(26 + k * 8);
          city.add(sprite);
          this.smokes.push({ sprite, base, phase: rng() * 6 });
        }
      }
    }

    // Boss 区：红色地面 + 身后的沙袋路障和燃烧的车
    this.arena = new THREE.Group();
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(TRACK_HALF * 2, 44),
      new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.09, depthWrite: false }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0.02, 6);
    this.arena.add(floor);
    const sandMat = new THREE.MeshLambertMaterial({ color: 0xc2a46e });
    for (let i = 0; i < 18; i++) {
      const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.5, 3, 8), sandMat);
      bag.rotation.z = Math.PI / 2;
      bag.position.set(-TRACK_HALF + 0.3 + (i % 9) * 1.3 + (i >= 9 ? 0.65 : 0), 0.3 + (i >= 9 ? 0.5 : 0), -16);
      bag.castShadow = true;
      this.arena.add(bag);
    }
    const carMat = new THREE.MeshLambertMaterial({ color: 0x4a4a52 });
    for (const x of [-3.6, 3.8]) {
      const car = new THREE.Group();
      const b = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.8, 4), carMat);
      b.position.y = 0.6;
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 2), carMat);
      cab.position.set(0, 1.3, 0.3);
      car.add(b, cab);
      car.position.set(x, 0, -21);
      car.rotation.y = x < 0 ? 0.4 : -0.5;
      car.rotation.z = x < 0 ? 0.08 : -0.05;
      this.arena.add(car);
    }
    this.arena.visible = false;
    this.group.add(this.arena);
  }

  build(theme: number, arenaD: number) {
    this.theme = THEMES[theme % THEMES.length];
    const th = this.theme;
    (this.skyMat.uniforms.top.value as THREE.Color).set(th.skyTop);
    (this.skyMat.uniforms.bottom.value as THREE.Color).set(th.skyBottom);
    (this.water.material as THREE.MeshLambertMaterial).color.set(th.water);
    this.cityMat.color.set(th.city);
    this.lampMat.color.set(th.lamps ? 0xfff1c0 : 0xb8bec6);
    const scene = this.group.parent as THREE.Scene;
    scene.fog = new THREE.Fog(th.fog, 60, 230);
    scene.background = new THREE.Color(th.fog);
    this.arena.visible = Number.isFinite(arenaD);
    if (this.arena.visible) this.arena.position.z = -arenaD;
  }

  /** focusD：镜头对着的世界 d 坐标 */
  update(dt: number, focusD: number) {
    this.time += dt;
    const z = -focusD;
    this.sky.position.set(0, 0, z);
    const tileLen = 1800 / this.waterTex.repeat.y;
    this.water.position.z = z;
    this.waterTex.offset.y = -z / tileLen;
    this.waterTex.offset.x += dt * 0.004;
    this.deck.position.z = z;
    this.deckTex.offset.y = focusD / 5.6;

    // 栏杆和路灯：按世界坐标对齐的格点
    const m = new THREE.Matrix4();
    let n = 0;
    const p0 = Math.floor((focusD - BEHIND) / 2.4);
    for (let i = p0; n < this.posts.count - 1; i++) {
      for (const side of [-1, 1]) {
        m.makeTranslation(side * (TRACK_HALF + 0.95), 0.9, -i * 2.4);
        this.posts.setMatrixAt(n++, m);
      }
    }
    this.posts.instanceMatrix.needsUpdate = true;
    n = 0;
    const l0 = Math.floor((focusD - BEHIND) / 24);
    for (let i = l0; n < this.lamps.count - 1; i++) {
      for (const side of [-1, 1]) {
        m.makeRotationY(side > 0 ? Math.PI : 0);
        m.setPosition(side * (TRACK_HALF + 1.15), 0, -(i * 24 + 12));
        this.lamps.setMatrixAt(n, m);
        this.lampHeads.setMatrixAt(n, m);
        n++;
      }
    }
    this.lamps.instanceMatrix.needsUpdate = true;
    this.lampHeads.instanceMatrix.needsUpdate = true;

    const t0 = Math.floor((focusD - BEHIND) / TOWER_GAP);
    this.towers.forEach((t, i) => {
      t.position.z = -((t0 + i) * TOWER_GAP + 70);
    });

    for (const s of this.scenery) {
      while (s.d < focusD - 300) s.d += SCENERY_SPAN;
      while (s.d > focusD - 300 + SCENERY_SPAN) s.d -= SCENERY_SPAN;
      s.obj.position.z = -s.d;
    }
    for (const s of this.smokes) {
      s.sprite.position.set(s.base.x + Math.sin(this.time * 0.3 + s.phase) * 4, s.base.y + Math.sin(this.time * 0.2 + s.phase) * 3, s.base.z);
    }
  }
}
