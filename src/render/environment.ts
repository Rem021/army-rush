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
  // 0: 晴空跨海战区 — 清透自然日光 + 层次分明海天（克制过曝）
  {
    skyTop: 0x164a8a,
    skyMid: 0x3b82c4,
    skyBottom: 0x93c5e6,
    sunGlow: 0xffe8b5,
    fog: 0x7db0d4,
    water: 0x0c4a82,
    sun: 0xfff3df,
    sunIntensity: 1.88,
    hemiSky: 0xc8e4fa,
    hemiGround: 0x334457,
    hemiIntensity: 0.78,
    city: 0x475e75,
    accent: 0x29a8e8,
    lamps: false,
  },
  // 1: 炽焰黄昏战线 — 沉稳晚霞 + 暖金轮廓光
  {
    skyTop: 0x211642,
    skyMid: 0x8a354b,
    skyBottom: 0xde7844,
    sunGlow: 0xffc978,
    fog: 0xba6b49,
    water: 0x17294d,
    sun: 0xffc794,
    sunIntensity: 1.75,
    hemiSky: 0xedc09f,
    hemiGround: 0x352a3b,
    hemiIntensity: 0.68,
    city: 0x36283d,
    accent: 0xe66814,
    lamps: true,
  },
  // 2: 霓虹夜战协议 — 深蓝战术夜空 + 克制青蓝高光
  {
    skyTop: 0x060c1c,
    skyMid: 0x102247,
    skyBottom: 0x1f3f70,
    sunGlow: 0x6ec0ed,
    fog: 0x101f3b,
    water: 0x071933,
    sun: 0xaad0fa,
    sunIntensity: 1.48,
    hemiSky: 0x6e98cc,
    hemiGround: 0x182233,
    hemiIntensity: 0.58,
    city: 0x182640,
    accent: 0x1fb8d4,
    lamps: true,
  },
  // 3: 风暴前线 — 铁灰雷云 + 冷钢战地氛围
  {
    skyTop: 0x172530,
    skyMid: 0x334b61,
    skyBottom: 0x658094,
    sunGlow: 0xb5cfe0,
    fog: 0x4c6478,
    water: 0x0e2a3d,
    sun: 0xd0e2f2,
    sunIntensity: 1.62,
    hemiSky: 0xa3bccf,
    hemiGround: 0x283442,
    hemiIntensity: 0.66,
    city: 0x2e4052,
    accent: 0x2da6e0,
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

  // 沉稳风化战术沥青基底（兼顾清晰路况可读性与亮色弹道反差）
  ctx.fillStyle = '#343d4b';
  ctx.fillRect(0, 0, W, H);
  rCtx.fillStyle = '#d4d4d4'; // 较粗糙沥青基准
  rCtx.fillRect(0, 0, W, H);

  const width = TRACK_HALF * 2 + 0.4;
  const px = (x: number) => ((x + width / 2) / width) * W;
  const rng = mulberry32(42);

  // 颗粒感沥青骨料噪点
  for (let i = 0; i < 4200; i++) {
    const x = rng() * W;
    const y = rng() * H;
    const v = 26 + Math.floor(rng() * 28);
    ctx.fillStyle = `rgb(${v},${v + 3},${v + 7})`;
    ctx.fillRect(x, y, 2 + rng() * 2.5, 2 + rng() * 2.5);
  }

  // 车道胎痕磨损带（略微光滑反光，增加纵深感）
  const laneCenters = [-TRACK_HALF * 0.65, 0, TRACK_HALF * 0.65];
  for (const lx of laneCenters) {
    for (const off of [-0.42, 0.42]) {
      const cx = px(lx + off);
      const grad = ctx.createLinearGradient(cx - 28, 0, cx + 28, 0);
      grad.addColorStop(0, 'rgba(12,15,20,0)');
      grad.addColorStop(0.5, 'rgba(12,15,20,0.34)');
      grad.addColorStop(1, 'rgba(12,15,20,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(cx - 28, 0, 56, H);

      const rGrad = rCtx.createLinearGradient(cx - 24, 0, cx + 24, 0);
      rGrad.addColorStop(0, 'rgba(140,140,140,0)');
      rGrad.addColorStop(0.5, 'rgba(120,120,120,0.55)');
      rGrad.addColorStop(1, 'rgba(140,140,140,0)');
      rCtx.fillStyle = rGrad;
      rCtx.fillRect(cx - 24, 0, 48, H);
    }
  }

  // 桥面横向钢制伸缩缝 + 螺栓铆钉纹理
  ctx.fillStyle = '#151920';
  ctx.fillRect(0, 0, W, 10);
  ctx.fillStyle = '#3a4352';
  ctx.fillRect(0, 10, W, 3);
  ctx.fillRect(0, H - 3, W, 3);
  rCtx.fillStyle = '#787878';
  rCtx.fillRect(0, 0, W, 13);

  // 轻微战术网格微刻线
  ctx.strokeStyle = 'rgba(148,163,184,0.05)';
  ctx.lineWidth = 2;
  for (let y = 128; y < H; y += 128) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  // 车道虚线 + 战术反光道钉（柔和不刺眼）
  for (const x of [-LANE_HALF, LANE_HALF]) {
    const cx = px(x);
    ctx.fillStyle = 'rgba(196,208,220,0.72)';
    ctx.fillRect(cx - 5, 36, 10, H * 0.46);
    ctx.fillStyle = '#2589bd';
    ctx.fillRect(cx - 6, H * 0.72, 12, 14);
    ctx.fillStyle = '#93d6f5';
    ctx.fillRect(cx - 3, H * 0.72 + 4, 6, 6);
    rCtx.fillStyle = '#686868';
    rCtx.fillRect(cx - 7, 36, 14, H * 0.46);
  }

  // 双侧军事黄黑警示边线
  for (const edge of [-TRACK_HALF + 0.08, TRACK_HALF - 0.08]) {
    const cx = px(edge);
    ctx.fillStyle = '#c98410';
    ctx.fillRect(cx - 10, 0, 20, H);
    ctx.fillStyle = '#181d26';
    for (let y = -64; y < H + 64; y += 64) {
      ctx.beginPath();
      ctx.moveTo(cx - 10, y);
      ctx.lineTo(cx + 10, y + 22);
      ctx.lineTo(cx + 10, y + 48);
      ctx.lineTo(cx - 10, y + 26);
      ctx.closePath();
      ctx.fill();
    }
    rCtx.fillStyle = '#909090';
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
  private readonly ledStripMat: THREE.MeshStandardMaterial;
  private readonly beaconMat: THREE.MeshBasicMaterial;
  private readonly posts: THREE.InstancedMesh;
  private readonly lamps: THREE.InstancedMesh;
  private readonly lampHeads: THREE.InstancedMesh;
  private readonly lampMat: THREE.MeshStandardMaterial;
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

    // 电影级大气天空穹顶：线性空间直接输出给 EffectComposer + OutputPass，避免双重 Gamma 过曝
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
          vec3 col = mix(bottom, mid, smoothstep(0.0, 0.38, h));
          col = mix(col, top, smoothstep(0.32, 0.96, h));
          float sunDot = max(dot(d, sunDir), 0.0);
          col += sunGlow * (pow(sunDot, 20.0) * 0.14 + pow(sunDot, 220.0) * 0.52);
          float haze = exp(-abs(d.y) * 10.0) * 0.14;
          col = mix(col, bottom, haze);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(620, 32, 20), this.skyMat);
    this.sky.renderOrder = -10;
    this.group.add(this.sky);

    // PBR 深海波光海面
    this.waterTex = waveTexture();
    this.waterTex.repeat.set(34, 68);
    this.water = new THREE.Mesh(
      new THREE.PlaneGeometry(980, 1900),
      new THREE.MeshStandardMaterial({
        color: 0x083663,
        map: this.waterTex,
        roughness: 0.36,
        metalness: 0.42,
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
        roughness: 0.9,
        metalness: 0.08,
      }),
    );
    top.rotation.x = -Math.PI / 2;
    top.position.z = -(AHEAD - BEHIND) / 2;
    top.receiveShadow = true;
    this.deck.add(top);

    const concrete = new THREE.MeshStandardMaterial({ color: 0x4c5663, roughness: 0.88, metalness: 0.08 });
    const darkSteel = new THREE.MeshStandardMaterial({ color: 0x252e3a, roughness: 0.48, metalness: 0.65 });
    const lightSteel = new THREE.MeshStandardMaterial({ color: 0x677586, roughness: 0.42, metalness: 0.62 });
    const glassDark = new THREE.MeshStandardMaterial({ color: 0x101c2c, roughness: 0.22, metalness: 0.78 });
    this.ledStripMat = new THREE.MeshStandardMaterial({
      color: 0x29a8e8,
      emissive: 0x29a8e8,
      emissiveIntensity: 0.42,
      roughness: 0.35,
      metalness: 0.2,
    });
    this.beaconMat = new THREE.MeshBasicMaterial({ color: 0xd93829 });

    // 桥下重型钢箱梁与两侧斜撑腹板
    const under = new THREE.Mesh(new THREE.BoxGeometry(DECK_HALF * 2 + 1.6, 1.5, len), darkSteel);
    under.position.set(0, -0.78, top.position.z);
    const underLower = new THREE.Mesh(new THREE.BoxGeometry(DECK_HALF * 2 - 0.8, 1.1, len), darkSteel);
    underLower.position.set(0, -1.9, top.position.z);
    this.deck.add(under, underLower);

    // 真实梯形混凝土泽西防撞护栏（ExtrudeGeometry 截面）+ 钢制防撞横梁 + 内嵌柔和战术导引灯带
    const jerseyShape = new THREE.Shape();
    jerseyShape.moveTo(-0.52, 0);
    jerseyShape.lineTo(0.52, 0);
    jerseyShape.lineTo(0.46, 0.22);
    jerseyShape.lineTo(0.28, 0.66);
    jerseyShape.lineTo(-0.22, 0.66);
    jerseyShape.lineTo(-0.38, 0.22);
    jerseyShape.closePath();
    const jerseyGeo = new THREE.ExtrudeGeometry(jerseyShape, { depth: len, bevelEnabled: false });
    jerseyGeo.translate(0, 0, -len / 2);

    for (const side of [-1, 1]) {
      const curb = new THREE.Mesh(jerseyGeo, concrete);
      curb.position.set(side * (TRACK_HALF + 0.68), 0, top.position.z);
      curb.scale.x = side;
      curb.receiveShadow = true;
      this.deck.add(curb);

      // 外沿防撞钢梁 + 柔和战术导引光槽（不再刺眼泛白）
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.055, len), this.ledStripMat);
      led.position.set(side * (TRACK_HALF + 0.3), 0.42, top.position.z);
      this.deck.add(led);

      // 双层枪钢波形防护横杆 + 顶缘栏杆
      for (const y of [0.95, 1.38]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, len), lightSteel);
        rail.position.set(side * (TRACK_HALF + 0.92), y, top.position.z);
        this.deck.add(rail);
      }
      const walkEdge = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, len), darkSteel);
      walkEdge.position.set(side * (TRACK_HALF + 1.24), 0.08, top.position.z);
      this.deck.add(walkEdge);
    }
    this.group.add(this.deck);

    // 护栏工字钢立柱（底板 + 柱身）
    this.posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 1.15, 0.14), darkSteel, Math.ceil(len / 2.4) * 2 + 4);
    this.posts.frustumCulled = false;
    this.group.add(this.posts);

    // 现代战地桥面双臂高杆灯（锥形灯杆 + 斜伸悬臂 + 压铸铝灯壳）
    const poleParts = [
      (() => {
        const g = new THREE.CylinderGeometry(0.065, 0.11, 5.4, 8);
        g.translate(0, 2.7, 0);
        return g;
      })(),
      (() => {
        const g = new THREE.BoxGeometry(0.32, 0.45, 0.32);
        g.translate(0, 0.22, 0);
        return g;
      })(),
      (() => {
        const g = new THREE.BoxGeometry(1.15, 0.1, 0.14);
        g.rotateZ(0.18);
        g.translate(0.52, 5.38, 0);
        return g;
      })(),
    ];
    const poleGeo = mergeGeometries(poleParts, false)!;
    for (const g of poleParts) g.dispose();
    this.lamps = new THREE.InstancedMesh(poleGeo, darkSteel, Math.ceil(len / 24) * 2 + 4);
    this.lampMat = new THREE.MeshStandardMaterial({
      color: 0x9aa8b8,
      emissive: 0xffe4a0,
      emissiveIntensity: 0,
      roughness: 0.4,
      metalness: 0.4,
    });
    const head = new THREE.BoxGeometry(0.92, 0.12, 0.34);
    head.translate(0.95, 5.45, 0);
    this.lampHeads = new THREE.InstancedMesh(head, this.lampMat, this.lamps.count);
    for (const m of [this.lamps, this.lampHeads]) {
      m.frustumCulled = false;
      this.group.add(m);
    }

    // 宏伟 H 型斜拉钢结构主桥塔（水上混凝土沉箱承台 + 收分钢塔柱 + 双层横梁 + X 型桁架斜撑 + 锚固索鞍 + 16 根斜拉索）
    const towerMat = new THREE.MeshStandardMaterial({ color: 0x364252, roughness: 0.52, metalness: 0.52 });
    const caissonMat = new THREE.MeshStandardMaterial({ color: 0x525b66, roughness: 0.9, metalness: 0.08 });
    const cableMat = new THREE.MeshStandardMaterial({ color: 0x8ea0b5, roughness: 0.38, metalness: 0.68 });
    const towerX = DECK_HALF + 2.4;
    for (let i = 0; i < 4; i++) {
      const t = new THREE.Group();
      for (const side of [-1, 1]) {
        const sx = side * towerX;
        // 水面混凝土防撞承台基座
        const caisson = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.7, 9.5, 8), caissonMat);
        caisson.position.set(sx, -5.2, 0);
        t.add(caisson);
        // 塔柱下段加固钢墩 + 顶部收分斜柱
        const lowerLeg = new THREE.Mesh(new THREE.BoxGeometry(2.2, 16, 2.6), towerMat);
        lowerLeg.position.set(sx, 7.5, 0);
        lowerLeg.castShadow = true;
        const upperLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.88, 1.25, 22, 4), towerMat);
        upperLeg.rotation.y = Math.PI / 4;
        upperLeg.position.set(sx, 25.5, 0);
        upperLeg.castShadow = true;
        // 塔顶索鞍检修舱 + 避雷天线 + 闪烁航空红灯
        const crown = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.4, 2.3), darkSteel);
        crown.position.set(sx, 36.8, 0);
        const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.13, 4.6, 6), lightSteel);
        spire.position.set(sx, 39.6, 0);
        const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), this.beaconMat);
        beacon.position.set(sx, 42.0, 0);
        t.add(lowerLeg, upperLeg, crown, spire, beacon);
      }

      // 双层门式横梁 + 中部 X 型交叉抗震钢桁架
      const topBeam = new THREE.Mesh(new THREE.BoxGeometry(towerX * 2 + 1.8, 1.7, 2.0), towerMat);
      topBeam.position.y = 33.5;
      const midBeam = new THREE.Mesh(new THREE.BoxGeometry(towerX * 2 + 1.4, 1.35, 1.7), towerMat);
      midBeam.position.y = 22.0;
      const beamLight = new THREE.Mesh(new THREE.BoxGeometry(towerX * 2 - 2.0, 0.18, 0.24), this.ledStripMat);
      beamLight.position.set(0, 21.25, 0.88);
      t.add(topBeam, midBeam, beamLight);

      // X 交叉桁架斜撑
      const trussMats = [
        beamMatrix(new THREE.Vector3(-towerX + 0.6, 22.4, 0), new THREE.Vector3(towerX - 0.6, 33.1, 0), 0.32),
        beamMatrix(new THREE.Vector3(towerX - 0.6, 22.4, 0), new THREE.Vector3(-towerX + 0.6, 33.1, 0), 0.32),
      ];
      const truss = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 6), darkSteel, trussMats.length);
      trussMats.forEach((m, j) => truss.setMatrixAt(j, m));
      t.add(truss);

      // 双扇面 28 根高张力斜拉钢索
      const mats: THREE.Matrix4[] = [];
      for (const side of [-1, 1]) {
        for (let k = 1; k <= 7; k++) {
          for (const dir of [-1, 1]) {
            mats.push(
              beamMatrix(
                new THREE.Vector3(side * towerX, 34.8 - k * 1.65, 0),
                new THREE.Vector3(side * (TRACK_HALF + 1.2), 0.9, dir * k * 6.8),
                0.068,
              ),
            );
          }
        }
      }
      const cables = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 5), cableMat, mats.length);
      mats.forEach((m, j) => cables.setMatrixAt(j, m));
      t.add(cables);
      this.towers.push(t);
      this.group.add(t);
    }

    // 远处战地海景：岛礁、双层海上雷达与直升机平台、隐身导弹驱逐舰、带夜灯纹理的摩天楼剪影 + 战火硝烟
    const rng = mulberry32(17);
    const islandMat = new THREE.MeshStandardMaterial({ color: 0x2f523a, roughness: 0.92, metalness: 0.04 });
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x5d5b54, roughness: 0.92, metalness: 0.06 });
    const shipMat = new THREE.MeshStandardMaterial({ color: 0x3e4b59, roughness: 0.52, metalness: 0.48 });
    const shipDeckMat = new THREE.MeshStandardMaterial({ color: 0x29323d, roughness: 0.72, metalness: 0.3 });
    const radomeMat = new THREE.MeshStandardMaterial({ color: 0xbec7d1, roughness: 0.48, metalness: 0.15 });
    const helipadRingMat = new THREE.MeshStandardMaterial({ color: 0xc98a18, roughness: 0.65, metalness: 0.1 });
    const winTex = cityWindowTexture();
    winTex.repeat.set(2, 3);
    this.cityMat = new THREE.MeshStandardMaterial({
      color: 0x3b4f63,
      map: winTex,
      roughness: 0.72,
      metalness: 0.28,
    });

    // 多峰海岛礁石
    for (let i = 0; i < 8; i++) {
      const side = i % 2 ? 1 : -1;
      const g = new THREE.Group();
      const r = 14 + rng() * 24;
      const peak1 = new THREE.Mesh(new THREE.ConeGeometry(r, r * (0.42 + rng() * 0.4), 7), islandMat);
      const peak2 = new THREE.Mesh(new THREE.ConeGeometry(r * 0.65, r * 0.34, 6), islandMat);
      peak2.position.set(r * 0.45, -0.5, r * 0.25);
      const beach = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.08, r * 1.18, 1.4, 8), rockMat);
      beach.position.y = 0.2;
      g.add(peak1, peak2, beach);
      g.position.set(side * (125 + rng() * 150), -9, 0);
      this.scenery.push({ obj: g, d: rng() * SCENERY_SPAN });
      this.group.add(g);
    }

    // 海上双层战术雷达与直升机起降平台（水上钢桩 + X 斜撑桁架 + 停机坪环 + 双雷达球罩 + 旋转相控阵雷达）
    for (let i = 0; i < 6; i++) {
      const side = i % 2 ? 1 : -1;
      const rig = new THREE.Group();
      for (const sx of [-5.2, 5.2]) {
        for (const sz of [-5.2, 5.2]) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.82, 14, 8), darkSteel);
          leg.position.set(sx, 5, sz);
          rig.add(leg);
        }
      }
      // 腿间斜撑桁架
      const rigBraces = [
        beamMatrix(new THREE.Vector3(-5.2, 1, 5.2), new THREE.Vector3(5.2, 11, 5.2), 0.24),
        beamMatrix(new THREE.Vector3(5.2, 1, 5.2), new THREE.Vector3(-5.2, 11, 5.2), 0.24),
        beamMatrix(new THREE.Vector3(-5.2, 1, -5.2), new THREE.Vector3(5.2, 11, -5.2), 0.24),
        beamMatrix(new THREE.Vector3(5.2, 1, -5.2), new THREE.Vector3(-5.2, 11, -5.2), 0.24),
      ];
      const braceMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 5), darkSteel, rigBraces.length);
      rigBraces.forEach((m, j) => braceMesh.setMatrixAt(j, m));
      rig.add(braceMesh);

      // 主平台甲板 + 上层指挥舱 + 悬挑圆形停机坪
      const platform = new THREE.Mesh(new THREE.BoxGeometry(14.5, 1.5, 14.5), towerMat);
      platform.position.y = 12;
      const opsBlock = new THREE.Mesh(new THREE.BoxGeometry(7.2, 3.6, 8.5), shipMat);
      opsBlock.position.set(2.4, 14.5, -1.6);
      const opsWin = new THREE.Mesh(new THREE.BoxGeometry(7.35, 0.9, 2.2), glassDark);
      opsWin.position.set(2.4, 15.3, 1.2);
      const helipad = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.6, 0.5, 16), shipDeckMat);
      helipad.position.set(-5.8, 13.0, 2.8);
      const padRing = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.1, 20), helipadRingMat);
      padRing.rotation.x = -Math.PI / 2;
      padRing.position.set(-5.8, 13.28, 2.8);
      const radome = new THREE.Mesh(new THREE.SphereGeometry(1.45, 12, 10), radomeMat);
      radome.position.set(-1.6, 14.2, -4.2);
      const deckStrip = new THREE.Mesh(new THREE.BoxGeometry(14.6, 0.2, 0.3), this.ledStripMat);
      deckStrip.position.set(0, 12.6, 7.25);

      // 桁架主桅杆 + 旋转相控阵雷达阵面
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.85, 6.2, 8), lightSteel);
      mast.position.set(2.4, 19.2, -2.0);
      const radar = new THREE.Group();
      radar.position.set(2.4, 22.5, -2.0);
      const dish = new THREE.Mesh(new THREE.BoxGeometry(5.6, 1.35, 0.36), lightSteel);
      const dishFrame = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.25, 0.44), darkSteel);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.26, 6, 6), this.beaconMat);
      tip.position.y = 1.1;
      radar.add(dish, dishFrame, tip);
      this.radars.push(radar);
      rig.add(platform, opsBlock, opsWin, helipad, padRing, radome, deckStrip, mast, radar);
      rig.position.set(side * (64 + rng() * 55), -9, 0);
      this.scenery.push({ obj: rig, d: i * (SCENERY_SPAN / 6) + 90 });
      this.group.add(rig);
    }

    // 远海巡航现代隐身导弹驱逐舰（内倾舰体 + 舰首 127mm 主炮 + VLS 垂发井 + 阶梯式相控阵舰桥 + 机库与飞行甲板）
    const hullShape = new THREE.Shape();
    hullShape.moveTo(0, -29); // 锐利舰首
    hullShape.lineTo(4.2, -16);
    hullShape.lineTo(4.6, 14);
    hullShape.lineTo(3.4, 23); // 舰尾
    hullShape.lineTo(-3.4, 23);
    hullShape.lineTo(-4.6, 14);
    hullShape.lineTo(-4.2, -16);
    hullShape.closePath();
    const shipHullGeo = new THREE.ExtrudeGeometry(hullShape, { depth: 3.4, bevelEnabled: false });
    shipHullGeo.rotateX(Math.PI / 2);
    shipHullGeo.translate(0, 3.4, 0);

    for (let i = 0; i < 4; i++) {
      const side = i % 2 ? 1 : -1;
      const ship = new THREE.Group();
      const hull = new THREE.Mesh(shipHullGeo, shipMat);
      const mainDeck = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.25, 36), shipDeckMat);
      mainDeck.position.set(0, 3.45, 2);
      // 舰首 127mm 隐身主炮
      const turretBase = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.3, 2.6), towerMat);
      turretBase.position.set(0, 4.1, -16.5);
      const turretGun = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 4.2, 8), darkSteel);
      turretGun.rotation.x = Math.PI / 2 - 0.14;
      turretGun.position.set(0, 4.45, -19.2);
      // 垂发导弹发射井（VLS）
      const vls = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.45, 5.2), darkSteel);
      vls.position.set(0, 3.7, -11.5);
      // 分层阶梯舰桥与环绕式舰桥舷窗
      const bridgeLower = new THREE.Mesh(new THREE.BoxGeometry(6.2, 3.4, 15.5), shipMat);
      bridgeLower.position.set(0, 5.1, -1.5);
      const bridgeUpper = new THREE.Mesh(new THREE.BoxGeometry(5.0, 3.2, 8.6), towerMat);
      bridgeUpper.position.set(0, 8.2, -3.5);
      const bridgeWin = new THREE.Mesh(new THREE.BoxGeometry(5.15, 0.78, 3.2), glassDark);
      bridgeWin.position.set(0, 8.85, -6.3);
      // 一体化隐身桅杆 + 双烟囱 + 舰尾直升机甲板
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 1.15, 7.2, 4), lightSteel);
      mast.rotation.y = Math.PI / 4;
      mast.position.set(0, 13.0, -4.2);
      const funnel = new THREE.Mesh(new THREE.BoxGeometry(3.6, 3.4, 4.4), darkSteel);
      funnel.position.set(0, 7.6, 3.8);
      const hangar = new THREE.Mesh(new THREE.BoxGeometry(5.2, 2.8, 6.2), shipMat);
      hangar.position.set(0, 4.8, 10.2);
      const heliMark = new THREE.Mesh(new THREE.RingGeometry(2.0, 2.4, 18), helipadRingMat);
      heliMark.rotation.x = -Math.PI / 2;
      heliMark.position.set(0, 3.62, 17.5);
      const navLight = new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 6), this.beaconMat);
      navLight.position.set(0, 16.8, -4.2);

      ship.add(hull, mainDeck, turretBase, turretGun, vls, bridgeLower, bridgeUpper, bridgeWin, mast, funnel, hangar, heliMark, navLight);
      ship.position.set(side * (92 + rng() * 95), -8.8, 0);
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
            new THREE.SpriteMaterial({ map: smokeTex, color: 0x20242b, transparent: true, opacity: 0.45, depthWrite: false }),
          );
          const base = new THREE.Vector3(rng() * 20 - 10, 22 + k * 14, rng() * 10);
          sprite.scale.setScalar(28 + k * 8);
          city.add(sprite);
          this.smokes.push({ sprite, base, phase: rng() * 6 });
        }
      }
    }

    // Boss 决战区：低饱和战术红区 + 沙袋路障 + 废弃军用装甲越野车
    this.arena = new THREE.Group();
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(TRACK_HALF * 2, 44),
      new THREE.MeshBasicMaterial({ color: 0xd93030, transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0.025, 6);
    this.arena.add(floor);
    const sandMat = new THREE.MeshStandardMaterial({ color: 0x99835b, roughness: 0.94, metalness: 0.04 });
    for (let i = 0; i < 18; i++) {
      const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.5, 3, 8), sandMat);
      bag.rotation.z = Math.PI / 2;
      bag.position.set(-TRACK_HALF + 0.3 + (i % 9) * 1.3 + (i >= 9 ? 0.65 : 0), 0.3 + (i >= 9 ? 0.5 : 0), -16);
      bag.castShadow = true;
      bag.userData.fallbackBag = true;
      this.arena.add(bag);
    }
    const carMat = new THREE.MeshStandardMaterial({ color: 0x343c47, roughness: 0.58, metalness: 0.42 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x171a1f, roughness: 0.85, metalness: 0.1 });
    for (const x of [-3.6, 3.8]) {
      const car = new THREE.Group();
      const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.68, 4.15), carMat);
      chassis.position.y = 0.62;
      const hood = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.35, 1.35), carMat);
      hood.position.set(0, 1.02, -1.25);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.72, 1.85), carMat);
      cab.position.set(0, 1.32, 0.15);
      const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.48, 0.1), glassDark);
      windshield.position.set(0, 1.32, -0.78);
      windshield.rotation.x = -0.22;
      const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.24, 0.26), darkSteel);
      bumper.position.set(0, 0.48, -2.12);
      car.add(chassis, hood, cab, windshield, bumper);
      for (const sx of [-1.02, 1.02]) {
        for (const sz of [-1.32, 1.28]) {
          const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.28, 12), tireMat);
          w.rotation.z = Math.PI / 2;
          w.position.set(sx, 0.42, sz);
          car.add(w);
        }
      }
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
    const propMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.76, metalness: 0.22 });

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
    this.cityMat.emissive.set(th.lamps ? 0x202d40 : 0x000000);
    this.cityMat.emissiveIntensity = th.lamps ? 0.35 : 0;
    this.ledStripMat.color.set(th.accent);
    this.ledStripMat.emissive.set(th.accent);
    this.ledStripMat.emissiveIntensity = th.lamps ? 0.65 : 0.32;
    this.lampMat.color.set(th.lamps ? 0xffe6a3 : 0x7d8a99);
    this.lampMat.emissive.set(th.lamps ? 0xffd27d : 0x000000);
    this.lampMat.emissiveIntensity = th.lamps ? 0.65 : 0;

    const scene = this.group.parent as THREE.Scene;
    scene.fog = new THREE.FogExp2(th.fog, th.lamps ? 0.005 : 0.0042);
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

    // 塔顶航空信标红灯呼吸闪烁（克制亮度，不刺眼）
    const blink = 0.45 + 0.55 * Math.sin(this.time * 4.5);
    this.beaconMat.color.setRGB(0.88 * blink, 0.14 * blink, 0.1 * blink);

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
