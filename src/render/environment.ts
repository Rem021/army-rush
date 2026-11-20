import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LANE_HALF, TRACK_HALF } from '../game/config';
import { mulberry32 } from '../game/rng';

export interface Theme {
  skyTop: number;
  skyMid: number;
  skyBottom: number;
  sunGlow: number;
  fog: number;
  water: number;
  sun: number;
  sunIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  city: number;
  accent: number;
  lamps: boolean;
}

export const THEMES: Theme[] = [
  // 0: 晴空跨海战区 — 高对比现代战地日光 + 澄澈海面反射
  {
    skyTop: 0x124788,
    skyMid: 0x3b86cc,
    skyBottom: 0xaad8f5,
    sunGlow: 0xfff3c8,
    fog: 0x89bee0,
    water: 0x0b4c84,
    sun: 0xfff8eb,
    sunIntensity: 2.8,
    hemiSky: 0xd9f0ff,
    hemiGround: 0x4b5c70,
    hemiIntensity: 1.25,
    city: 0x4c6278,
    accent: 0x38bdf8,
    lamps: false,
  },
  // 1: 炽焰黄昏战线 — 烈火晚霞 + 暖金金属反光
  {
    skyTop: 0x261a47,
    skyMid: 0x9b3a4f,
    skyBottom: 0xff8d4d,
    sunGlow: 0xffd584,
    fog: 0xd97d54,
    water: 0x1c2c52,
    sun: 0xffcfa0,
    sunIntensity: 2.7,
    hemiSky: 0xffd2b0,
    hemiGround: 0x453542,
    hemiIntensity: 1.15,
    city: 0x3a2a3e,
    accent: 0xf97316,
    lamps: true,
  },
  // 2: 霓虹夜战协议 — 深蓝战术夜空 + 赛博青金辉光
  {
    skyTop: 0x060b1a,
    skyMid: 0x112044,
    skyBottom: 0x1f3c6b,
    sunGlow: 0x7dd3fc,
    fog: 0x0f1d36,
    water: 0x06162b,
    sun: 0xbadcff,
    sunIntensity: 2.1,
    hemiSky: 0x7ca7db,
    hemiGround: 0x1c2638,
    hemiIntensity: 1.05,
    city: 0x162238,
    accent: 0x22d3ee,
    lamps: true,
  },
  // 3: 风暴前线 — 铁灰雷云 + 冷钢战地氛围
  {
    skyTop: 0x182430,
    skyMid: 0x354d61,
    skyBottom: 0x6f8b9e,
    sunGlow: 0xcbe4f5,
    fog: 0x4e6678,
    water: 0x0e2a3e,
    sun: 0xd9eeff,
    sunIntensity: 2.4,
    hemiSky: 0xb9d0e0,
    hemiGround: 0x2f3b47,
    hemiIntensity: 1.2,
    city: 0x2e3f4f,
    accent: 0x38bdf8,
    lamps: true,
  },
];

export const DECK_HALF = TRACK_HALF + 0.65;
/** 跑步机：所有重复的桥面构件都在镜头前后这个范围里循环摆放 */
const AHEAD = 230;
const BEHIND = 50;
const TOWER_GAP = 104;
const _envMat = new THREE.Matrix4();

/** 生成现代战术沥青桥面的 PBR 漫反射贴图 + 粗糙度贴图（1024×512） */
function deckTextures(): { map: THREE.CanvasTexture; roughnessMap: THREE.CanvasTexture } {
  const W = 1024;
  const H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;

  const rC = document.createElement('canvas');
  rC.width = W;
  rC.height = H;
  const rCtx = rC.getContext('2d')!;

  // 深铁灰战术沥青基底（让亮色子弹、电弧、护盾、爆炸产生次世代电影级反差）
  ctx.fillStyle = '#2d333d';
  ctx.fillRect(0, 0, W, H);
  rCtx.fillStyle = '#c8c8c8'; // 较粗糙沥青基准
  rCtx.fillRect(0, 0, W, H);

  const width = TRACK_HALF * 2 + 0.4;
  const px = (x: number) => ((x + width / 2) / width) * W;
  const rng = mulberry32(42);

  // 颗粒感沥青骨料噪点
  for (let i = 0; i < 4200; i++) {
    const x = rng() * W;
    const y = rng() * H;
    const v = 36 + Math.floor(rng() * 34);
    ctx.fillStyle = `rgb(${v},${v + 3},${v + 8})`;
    ctx.fillRect(x, y, 2 + rng() * 2.5, 2 + rng() * 2.5);
  }

  // 车道胎痕磨损带（略微光滑反光，增加纵深感）
  const laneCenters = [-TRACK_HALF * 0.65, 0, TRACK_HALF * 0.65];
  for (const lx of laneCenters) {
    for (const off of [-0.42, 0.42]) {
      const cx = px(lx + off);
      const grad = ctx.createLinearGradient(cx - 28, 0, cx + 28, 0);
      grad.addColorStop(0, 'rgba(18,22,28,0)');
      grad.addColorStop(0.5, 'rgba(18,22,28,0.28)');
      grad.addColorStop(1, 'rgba(18,22,28,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(cx - 28, 0, 56, H);

      const rGrad = rCtx.createLinearGradient(cx - 24, 0, cx + 24, 0);
      rGrad.addColorStop(0, 'rgba(120,120,120,0)');
      rGrad.addColorStop(0.5, 'rgba(105,105,105,0.65)');
      rGrad.addColorStop(1, 'rgba(120,120,120,0)');
      rCtx.fillStyle = rGrad;
      rCtx.fillRect(cx - 24, 0, 48, H);
    }
  }

  // 桥面横向钢制伸缩缝 + 螺栓铆钉纹理
  ctx.fillStyle = '#1b2028';
  ctx.fillRect(0, 0, W, 10);
  ctx.fillStyle = '#475161';
  ctx.fillRect(0, 10, W, 3);
  ctx.fillRect(0, H - 3, W, 3);
  rCtx.fillStyle = '#606060';
  rCtx.fillRect(0, 0, W, 13);

  // 轻微战术网格微刻线
  ctx.strokeStyle = 'rgba(148,163,184,0.06)';
  ctx.lineWidth = 2;
  for (let y = 128; y < H; y += 128) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  // 车道虚线 + 发光猫眼反光道钉
  for (const x of [-LANE_HALF, LANE_HALF]) {
    const cx = px(x);
    ctx.fillStyle = 'rgba(226,232,240,0.88)';
    ctx.fillRect(cx - 6, 36, 12, H * 0.48);
    // 蓝色战术猫眼道钉
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(cx - 7, H * 0.72, 14, 16);
    ctx.fillStyle = '#e0f2fe';
    ctx.fillRect(cx - 4, H * 0.72 + 4, 8, 8);
    rCtx.fillStyle = '#505050';
    rCtx.fillRect(cx - 8, 36, 16, H * 0.48);
  }

  // 双侧军事黄黑警示边线 + 琥珀导向条
  for (const edge of [-TRACK_HALF + 0.08, TRACK_HALF - 0.08]) {
    const cx = px(edge);
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(cx - 10, 0, 20, H);
    ctx.fillStyle = '#1e242e';
    for (let y = -64; y < H + 64; y += 64) {
      ctx.beginPath();
      ctx.moveTo(cx - 10, y);
      ctx.lineTo(cx + 10, y + 22);
      ctx.lineTo(cx + 10, y + 48);
      ctx.lineTo(cx - 10, y + 26);
      ctx.closePath();
      ctx.fill();
    }
    rCtx.fillStyle = '#808080';
    rCtx.fillRect(cx - 10, 0, 20, H);
  }

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.ClampToEdgeWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;

  const roughnessMap = new THREE.CanvasTexture(rC);
  roughnessMap.wrapS = THREE.ClampToEdgeWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.anisotropy = 4;

  return { map, roughnessMap };
}

function waveTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#d8e9f5';
  ctx.fillRect(0, 0, 512, 512);
  const rng = mulberry32(7);
  for (let i = 0; i < 160; i++) {
    const bright = rng() > 0.35;
    ctx.fillStyle = bright ? `rgba(255,255,255,${0.18 + rng() * 0.28})` : `rgba(110,150,190,${0.22 + rng() * 0.25})`;
    ctx.beginPath();
    ctx.ellipse(rng() * 512, rng() * 512, 24 + rng() * 72, 2.5 + rng() * 4.5, (rng() - 0.5) * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** 摩天大楼夜幕窗户纹理，让远处城市剪影拥有真实战区灯火感 */
function cityWindowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#b4c2d1';
  ctx.fillRect(0, 0, 128, 256);
  const rng = mulberry32(101);
  for (let y = 8; y < 248; y += 12) {
    for (let x = 6; x < 122; x += 10) {
      const lit = rng();
      if (lit < 0.24) ctx.fillStyle = '#fff3c4';
      else if (lit < 0.35) ctx.fillStyle = '#7dd3fc';
      else ctx.fillStyle = '#738294';
      ctx.fillRect(x, y, 6, 7);
    }
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
  private readonly deckRoughTex: THREE.CanvasTexture;
  private readonly deck: THREE.Group;
  private readonly ledStripMat: THREE.MeshBasicMaterial;
  private readonly beaconMat: THREE.MeshBasicMaterial;
  private readonly posts: THREE.InstancedMesh;
  private readonly lamps: THREE.InstancedMesh;
  private readonly lampHeads: THREE.InstancedMesh;
  private readonly lampMat: THREE.MeshBasicMaterial;
  private readonly towers: THREE.Group[] = [];
  private readonly radars: THREE.Object3D[] = [];
  private readonly scenery: Scenery[] = [];
  private readonly cityMat: THREE.MeshStandardMaterial;
  private readonly smokes: { sprite: THREE.Sprite; base: THREE.Vector3; phase: number }[] = [];
  private readonly arena: THREE.Group;
  private readonly bunkers: THREE.Group;
  private propsApplied = false;
  private time = 0;
  private lastP0 = NaN;
  private lastL0 = NaN;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);

    // 次世代大气天空穹顶：三段色渐变 + 地平线辉光带 + 太阳光盘散射
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color() },
        mid: { value: new THREE.Color() },
        bottom: { value: new THREE.Color() },
        sunGlow: { value: new THREE.Color() },
        sunDir: { value: new THREE.Vector3(-0.28, 0.34, -0.89).normalize() },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; uniform vec3 sunGlow; uniform vec3 sunDir; varying vec3 vDir;
        void main(){
          vec3 d = normalize(vDir);
          float h = clamp(d.y * 1.45 + 0.06, 0.0, 1.0);
          vec3 col = mix(bottom, mid, smoothstep(0.0, 0.36, h));
          col = mix(col, top, smoothstep(0.32, 0.95, h));
          float sunDot = max(dot(d, sunDir), 0.0);
          col += sunGlow * (pow(sunDot, 16.0) * 0.28 + pow(sunDot, 220.0) * 1.15);
          float haze = exp(-abs(d.y) * 9.0) * 0.22;
          col = mix(col, bottom, haze);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(620, 32, 20), this.skyMat);
    this.sky.renderOrder = -10;
    this.group.add(this.sky);

    // PBR 波光海面
    this.waterTex = waveTexture();
    this.waterTex.repeat.set(34, 68);
    this.water = new THREE.Mesh(
      new THREE.PlaneGeometry(980, 1900),
      new THREE.MeshStandardMaterial({
        color: 0x0b4c84,
        map: this.waterTex,
        roughness: 0.26,
        metalness: 0.52,
      }),
    );
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = -9;
    this.group.add(this.water);

    // PBR 现代战地跨海大桥桥面
    const deckMaps = deckTextures();
    this.deckTex = deckMaps.map;
    this.deckRoughTex = deckMaps.roughnessMap;
    const len = AHEAD + BEHIND;
    const repY = len / 5.6;
    this.deckTex.repeat.set(1, repY);
    this.deckRoughTex.repeat.set(1, repY);
    this.deck = new THREE.Group();

    const top = new THREE.Mesh(
      new THREE.PlaneGeometry(TRACK_HALF * 2 + 0.4, len),
      new THREE.MeshStandardMaterial({
        map: this.deckTex,
        roughnessMap: this.deckRoughTex,
        roughness: 0.86,
        metalness: 0.14,
      }),
    );
    top.rotation.x = -Math.PI / 2;
    top.position.z = -(AHEAD - BEHIND) / 2;
    top.receiveShadow = true;
    this.deck.add(top);

    const concrete = new THREE.MeshStandardMaterial({ color: 0x5d6775, roughness: 0.85, metalness: 0.12 });
    const darkSteel = new THREE.MeshStandardMaterial({ color: 0x2c3543, roughness: 0.42, metalness: 0.72 });
    const lightSteel = new THREE.MeshStandardMaterial({ color: 0x7b899b, roughness: 0.36, metalness: 0.68 });
    this.ledStripMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, toneMapped: false });
    this.beaconMat = new THREE.MeshBasicMaterial({ color: 0xff3b30, toneMapped: false });

    const under = new THREE.Mesh(new THREE.BoxGeometry(DECK_HALF * 2 + 1.4, 1.6, len), darkSteel);
    under.position.set(0, -0.82, top.position.z);
    this.deck.add(under);

    for (const side of [-1, 1]) {
      // 重型防撞护栏混凝土基座
      const curb = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.48, len), concrete);
      curb.position.set(side * (TRACK_HALF + 0.72), 0.24, top.position.z);
      curb.receiveShadow = true;
      this.deck.add(curb);
      // 护栏内侧发光战术导引灯带（配 Bloom 产生高级科幻战地视觉边缘）
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, len), this.ledStripMat);
      led.position.set(side * (TRACK_HALF + 0.21), 0.36, top.position.z);
      this.deck.add(led);
      // 双层枪钢防护横杆
      for (const y of [0.85, 1.35]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, len), lightSteel);
        rail.position.set(side * (TRACK_HALF + 0.96), y, top.position.z);
        this.deck.add(rail);
      }
    }
    this.group.add(this.deck);

    this.posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.065, 0.07, 1.05, 6), darkSteel, Math.ceil(len / 2.4) * 2 + 4);
    this.posts.frustumCulled = false;
    this.group.add(this.posts);

    // 现代战地桥面双臂高杆灯
    const pole = new THREE.CylinderGeometry(0.07, 0.1, 5.4, 8);
    pole.translate(0, 2.7, 0);
    this.lamps = new THREE.InstancedMesh(pole, darkSteel, Math.ceil(len / 24) * 2 + 4);
    this.lampMat = new THREE.MeshBasicMaterial({ color: 0xe0f2fe, toneMapped: false });
    const head = new THREE.BoxGeometry(1.05, 0.14, 0.36);
    head.translate(0.42, 5.4, 0);
    this.lampHeads = new THREE.InstancedMesh(head, this.lampMat, this.lamps.count);
    for (const m of [this.lamps, this.lampHeads]) {
      m.frustumCulled = false;
      this.group.add(m);
    }

    // 现代重型斜拉钢桥塔 + 塔顶航空警示信标 + 横梁战术灯条
    const towerMat = new THREE.MeshStandardMaterial({ color: 0x3b4757, roughness: 0.48, metalness: 0.58 });
    const cableMat = new THREE.MeshStandardMaterial({ color: 0x9fb0c4, roughness: 0.35, metalness: 0.72 });
    const towerX = DECK_HALF + 2.3;
    for (let i = 0; i < 4; i++) {
      const t = new THREE.Group();
      for (const side of [-1, 1]) {
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.75, 48, 2.2), towerMat);
        pillar.position.set(side * towerX, 10, 0);
        pillar.castShadow = true;
        t.add(pillar);
        // 塔顶避雷天线与闪烁航空红灯
        const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.14, 4.2, 6), lightSteel);
        spire.position.set(side * towerX, 36.1, 0);
        const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), this.beaconMat);
        beacon.position.set(side * towerX, 38.2, 0);
        t.add(spire, beacon);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(towerX * 2 + 1.8, 1.8, 2.0), towerMat);
      beam.position.y = 31.5;
      t.add(beam);
      const beamLight = new THREE.Mesh(new THREE.BoxGeometry(towerX * 2 - 1.2, 0.22, 0.3), this.ledStripMat);
      beamLight.position.set(0, 30.55, 0.95);
      t.add(beamLight);

      const mats: THREE.Matrix4[] = [];
      for (const side of [-1, 1]) {
        for (let k = 1; k <= 6; k++) {
          for (const dir of [-1, 1]) {
            mats.push(beamMatrix(new THREE.Vector3(side * towerX, 30.5 - k * 1.65, 0), new THREE.Vector3(side * (TRACK_HALF + 1.25), 1.35, dir * k * 7.5), 0.075));
          }
        }
      }
      const cables = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 5), cableMat, mats.length);
      mats.forEach((m, j) => cables.setMatrixAt(j, m));
      t.add(cables);
      this.towers.push(t);
      this.group.add(t);
    }

    // 远处战地海景：岛礁、近海战术雷达平台、巡航驱逐舰、带夜灯纹理的摩天楼剪影 + 战火硝烟
    const rng = mulberry32(17);
    const islandMat = new THREE.MeshStandardMaterial({ color: 0x3b6346, roughness: 0.92, metalness: 0.04 });
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x6f6c64, roughness: 0.9, metalness: 0.08 });
    const shipMat = new THREE.MeshStandardMaterial({ color: 0x455262, roughness: 0.5, metalness: 0.55 });
    const winTex = cityWindowTexture();
    winTex.repeat.set(2, 3);
    this.cityMat = new THREE.MeshStandardMaterial({
      color: 0x4c6278,
      map: winTex,
      roughness: 0.65,
      metalness: 0.35,
    });

    // 岛礁
    for (let i = 0; i < 8; i++) {
      const side = i % 2 ? 1 : -1;
      const g = new THREE.Group();
      const r = 14 + rng() * 24;
      const island = new THREE.Mesh(new THREE.ConeGeometry(r, r * (0.42 + rng() * 0.45), 7), islandMat);
      const beach = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.05, r * 1.12, 1.3, 7), rockMat);
      beach.position.y = 0.2;
      g.add(island, beach);
      g.position.set(side * (120 + rng() * 150), -9, 0);
      this.scenery.push({ obj: g, d: rng() * SCENERY_SPAN });
      this.group.add(g);
    }

    // 海上战术雷达与防空平台（带旋转雷达天线与发光信标）
    for (let i = 0; i < 6; i++) {
      const side = i % 2 ? 1 : -1;
      const rig = new THREE.Group();
      for (const sx of [-4.5, 4.5]) {
        for (const sz of [-4.5, 4.5]) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.75, 14, 8), darkSteel);
          leg.position.set(sx, 5, sz);
          rig.add(leg);
        }
      }
      const platform = new THREE.Mesh(new THREE.BoxGeometry(13, 1.4, 13), towerMat);
      platform.position.y = 12;
      const deckStrip = new THREE.Mesh(new THREE.BoxGeometry(13.2, 0.25, 0.4), this.ledStripMat);
      deckStrip.position.set(0, 12.6, 6.5);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 7, 8), lightSteel);
      mast.position.set(2.5, 16, -2);
      const radar = new THREE.Group();
      radar.position.set(2.5, 19.6, -2);
      const dish = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.3, 0.35), lightSteel);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 6), this.beaconMat);
      tip.position.y = 1.1;
      radar.add(dish, tip);
      this.radars.push(radar);
      rig.add(platform, deckStrip, mast, radar);
      rig.position.set(side * (62 + rng() * 55), -9, 0);
      this.scenery.push({ obj: rig, d: i * (SCENERY_SPAN / 6) + 90 });
      this.group.add(rig);
    }

    // 远海巡航海军驱逐舰剪影
    for (let i = 0; i < 4; i++) {
      const side = i % 2 ? 1 : -1;
      const ship = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(7.5, 3.2, 42), shipMat);
      hull.position.y = 1.4;
      const bow = new THREE.Mesh(new THREE.ConeGeometry(4.2, 11, 4), shipMat);
      bow.rotation.x = -Math.PI / 2;
      bow.rotation.y = Math.PI / 4;
      bow.position.set(0, 1.6, -25.5);
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(5.4, 6.2, 12), towerMat);
      bridge.position.set(0, 5.8, -3);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.45, 7, 6), lightSteel);
      mast.position.set(0, 11.5, -4);
      const navLight = new THREE.Mesh(new THREE.SphereGeometry(0.35, 6, 6), this.ledStripMat);
      navLight.position.set(0, 15.2, -4);
      ship.add(hull, bow, bridge, mast, navLight);
      ship.position.set(side * (90 + rng() * 95), -8.8, 0);
      ship.rotation.y = side * 0.14;
      this.scenery.push({ obj: ship, d: i * (SCENERY_SPAN / 4) + 210 });
      this.group.add(ship);
    }

    // 远处城市天际线 + 战区硝烟
    const smokeTex = smokeTexture();
    for (let i = 0; i < 10; i++) {
      const side = i % 2 ? 1 : -1;
      const city = new THREE.Group();
      const blocks = 6 + Math.floor(rng() * 6);
      const blockGeoms: THREE.BufferGeometry[] = [];
      for (let b = 0; b < blocks; b++) {
        const h = 18 + rng() * 54;
        const w = 9 + rng() * 13;
        const g = new THREE.BoxGeometry(w, h, 9 + rng() * 11);
        g.translate((b - blocks / 2) * 14 + rng() * 4, h / 2 - 9, rng() * 22);
        blockGeoms.push(g);
      }
      const mergedCity = mergeGeometries(blockGeoms, false);
      for (const g of blockGeoms) g.dispose();
      if (mergedCity) city.add(new THREE.Mesh(mergedCity, this.cityMat));
      city.position.set(side * (260 + rng() * 120), 0, 0);
      this.scenery.push({ obj: city, d: rng() * SCENERY_SPAN });
      this.group.add(city);
      if (i % 2 === 0) {
        for (let k = 0; k < 6; k++) {
          const sprite = new THREE.Sprite(
            new THREE.SpriteMaterial({ map: smokeTex, color: 0x262930, transparent: true, opacity: 0.5, depthWrite: false }),
          );
          const base = new THREE.Vector3(rng() * 20 - 10, 22 + k * 14, rng() * 10);
          sprite.scale.setScalar(28 + k * 8);
          city.add(sprite);
          this.smokes.push({ sprite, base, phase: rng() * 6 });
        }
      }
    }

    // Boss 决战区：红光警示地面 + 沙袋路障 + 废车
    this.arena = new THREE.Group();
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(TRACK_HALF * 2, 44),
      new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0.025, 6);
    this.arena.add(floor);
    const sandMat = new THREE.MeshStandardMaterial({ color: 0xb69c6d, roughness: 0.92, metalness: 0.05 });
    for (let i = 0; i < 18; i++) {
      const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.5, 3, 8), sandMat);
      bag.rotation.z = Math.PI / 2;
      bag.position.set(-TRACK_HALF + 0.3 + (i % 9) * 1.3 + (i >= 9 ? 0.65 : 0), 0.3 + (i >= 9 ? 0.5 : 0), -16);
      bag.castShadow = true;
      bag.userData.fallbackBag = true;
      this.arena.add(bag);
    }
    const carMat = new THREE.MeshStandardMaterial({ color: 0x3b424d, roughness: 0.55, metalness: 0.45 });
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

    // 防线桥头阵地
    this.bunkers = new THREE.Group();
    this.bunkers.visible = false;
    this.group.add(this.bunkers);
  }

  /** 用 props.glb 中的 CC0 模型升级 Boss 决战区与防线阵地 */
  setProps(prop: (name: string, fit: number) => THREE.BufferGeometry | null) {
    if (this.propsApplied) return;
    const sandbags = prop('Sandbags', 2.3);
    const barrier = prop('Barrier', 1.8);
    const turret = prop('Turret', 1.6);
    if (!sandbags && !barrier && !turret) return;
    this.propsApplied = true;
    const propMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.25 });

    if (sandbags) {
      for (const c of [...this.arena.children]) {
        if (c.userData.fallbackBag) {
          this.arena.remove(c);
          if (c instanceof THREE.Mesh && !c.geometry.userData?.shared) c.geometry.dispose();
        }
      }
      for (const x of [-4.4, -2.2, 0, 2.2, 4.4]) {
        const m = new THREE.Mesh(sandbags, propMat);
        m.position.set(x, 0, -16);
        m.castShadow = true;
        this.arena.add(m);
      }
    }
    if (barrier) {
      for (const x of [-3.3, 3.3]) {
        const m = new THREE.Mesh(barrier, propMat);
        m.position.set(x, 0, -14.8);
        m.rotation.y = x < 0 ? 0.18 : -0.18;
        m.castShadow = true;
        this.arena.add(m);
      }
    }
    for (const side of [-1, 1]) {
      if (sandbags) {
        const bag = new THREE.Mesh(sandbags, propMat);
        bag.position.set(side * (TRACK_HALF - 0.75), 0, 2.6);
        bag.rotation.y = side * -0.28;
        bag.castShadow = true;
        this.bunkers.add(bag);
      }
      if (turret) {
        const gun = new THREE.Mesh(turret, propMat);
        gun.position.set(side * (TRACK_HALF - 0.55), 0, 3.5);
        gun.rotation.y = Math.PI + side * 0.15;
        gun.castShadow = true;
        this.bunkers.add(gun);
      }
    }
  }

  build(theme: number, arenaD: number) {
    this.theme = THEMES[theme % THEMES.length];
    const th = this.theme;
    (this.skyMat.uniforms.top.value as THREE.Color).set(th.skyTop);
    (this.skyMat.uniforms.mid.value as THREE.Color).set(th.skyMid);
    (this.skyMat.uniforms.bottom.value as THREE.Color).set(th.skyBottom);
    (this.skyMat.uniforms.sunGlow.value as THREE.Color).set(th.sunGlow);
    (this.water.material as THREE.MeshStandardMaterial).color.set(th.water);
    this.cityMat.color.set(th.city);
    this.cityMat.emissive.set(th.lamps ? 0x26344a : 0x000000);
    this.cityMat.emissiveIntensity = th.lamps ? 0.45 : 0;
    this.ledStripMat.color.set(th.accent);
    this.lampMat.color.set(th.lamps ? 0xffeeb0 : 0x9fb0c4);

    const scene = this.group.parent as THREE.Scene;
    scene.fog = new THREE.FogExp2(th.fog, th.lamps ? 0.0052 : 0.0044);
    scene.background = new THREE.Color(th.fog);
    this.arena.visible = Number.isFinite(arenaD);
    if (this.arena.visible) this.arena.position.z = -arenaD;
    this.bunkers.visible = !Number.isFinite(arenaD);
    this.lastP0 = NaN;
    this.lastL0 = NaN;
  }

  /** focusD：镜头对着的世界 d 坐标 */
  update(dt: number, focusD: number) {
    this.time += dt;
    const z = -focusD;
    this.sky.position.set(0, 0, z);
    const tileLen = 1900 / this.waterTex.repeat.y;
    this.water.position.z = z;
    this.waterTex.offset.y = -z / tileLen;
    this.waterTex.offset.x += dt * 0.005;
    this.deck.position.z = z;
    this.deckTex.offset.y = focusD / 5.6;
    this.deckRoughTex.offset.y = focusD / 5.6;

    // 塔顶航空信标红灯呼吸闪烁
    const blink = 0.55 + 0.45 * Math.sin(this.time * 4.5);
    this.beaconMat.color.setRGB(1.4 * blink, 0.18 * blink, 0.14 * blink);

    // 海上雷达天线旋转
    for (let i = 0; i < this.radars.length; i++) {
      this.radars[i].rotation.y = this.time * (1.2 + (i % 3) * 0.25) + i;
    }

    // 栏杆和路灯：只在格点起点变化时重算实例矩阵
    const p0 = Math.floor((focusD - BEHIND) / 2.4);
    if (p0 !== this.lastP0) {
      this.lastP0 = p0;
      let n = 0;
      for (let i = p0; n < this.posts.count - 1; i++) {
        for (const side of [-1, 1]) {
          _envMat.makeTranslation(side * (TRACK_HALF + 0.96), 0.92, -i * 2.4);
          this.posts.setMatrixAt(n++, _envMat);
        }
      }
      this.posts.instanceMatrix.needsUpdate = true;
    }

    const l0 = Math.floor((focusD - BEHIND) / 24);
    if (l0 !== this.lastL0) {
      this.lastL0 = l0;
      let n = 0;
      for (let i = l0; n < this.lamps.count - 1; i++) {
        for (const side of [-1, 1]) {
          _envMat.makeRotationY(side > 0 ? Math.PI : 0);
          _envMat.setPosition(side * (TRACK_HALF + 1.18), 0, -(i * 24 + 12));
          this.lamps.setMatrixAt(n, _envMat);
          this.lampHeads.setMatrixAt(n, _envMat);
          n++;
        }
      }
      this.lamps.instanceMatrix.needsUpdate = true;
      this.lampHeads.instanceMatrix.needsUpdate = true;
    }

    const t0 = Math.floor((focusD - BEHIND) / TOWER_GAP);
    for (let i = 0; i < this.towers.length; i++) {
      this.towers[i].position.z = -((t0 + i) * TOWER_GAP + 65);
    }

    for (let i = 0; i < this.scenery.length; i++) {
      const s = this.scenery[i];
      while (s.d < focusD - 300) s.d += SCENERY_SPAN;
      while (s.d > focusD - 300 + SCENERY_SPAN) s.d -= SCENERY_SPAN;
      s.obj.position.z = -s.d;
    }
    for (let i = 0; i < this.smokes.length; i++) {
      const s = this.smokes[i];
      s.sprite.position.set(s.base.x + Math.sin(this.time * 0.3 + s.phase) * 4, s.base.y + Math.sin(this.time * 0.2 + s.phase) * 3, s.base.z);
    }
  }
}
