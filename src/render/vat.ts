import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { AgentPose } from './crowd';

/**
 * 顶点动画贴图（VAT）：把带骨骼动画的模型预先“烘”成每一帧的顶点位置和法线，存进浮点贴图。
 * 渲染时几百个实例共用一个 InstancedMesh，顶点着色器按每个实例自己的帧号去贴图里取位置，
 * 一次绘制调用就能画出几百个各自在跑、在开枪的小人，CPU 不用逐个算骨骼。
 */

export interface VatClip {
  /** 在贴图里的起始帧 */
  start: number;
  frames: number;
  /** 一个循环多长（秒） */
  duration: number;
}

export interface BakedModel {
  geometry: THREE.BufferGeometry;
  map: THREE.Texture | null;
  pos: THREE.DataTexture;
  /** 贴图宽度（每行放多少个顶点） */
  width: number;
  /** 每帧占几行 */
  rows: number;
  clips: Record<string, VatClip>;
  /** 烘焙后模型的高度（米） */
  height: number;
  /** 原始坐标 → 烘焙坐标的变换（挂件要用同一个，才能对得上手） */
  fix: THREE.Matrix4;
}

export interface BakeOptions {
  /** 游戏里的动画名 → GLB 里动画名的候选（不分大小写，包含即可） */
  clips: Record<string, string[]>;
  /** 每秒采样几帧 */
  fps?: number;
  /** 把模型缩放到这个高度（米） */
  height: number;
  /** 绕 Y 轴旋转，让模型面朝 -Z（游戏里的前方） */
  yaw?: number;
  /** 只烘这些网格 */
  include?: (mesh: THREE.Mesh) => boolean;
  /** 额外挂到某根骨头上的静态网格（比如枪），位置是相对骨头的 */
  attach?: { bone: string; object: THREE.Object3D }[];
  /** 只烘挂件（attach），不要角色本身：用来单独烘枪 */
  attachOnly?: boolean;
  /** 直接用这个变换，不再按包围盒自动缩放居中（烘枪时传身体的 fix） */
  fix?: THREE.Matrix4;
  /** 改材质颜色（换皮肤、金枪之类）；返回 null 表示不改 */
  recolor?: (materialName: string, color: THREE.Color) => THREE.Color | null;
}

const _v = new THREE.Vector3();
const _c = new THREE.Color();
const _t = new THREE.Color();

function findClip(animations: THREE.AnimationClip[], names: string[]): THREE.AnimationClip | null {
  for (const n of names) {
    const exact = animations.find((a) => a.name.toLowerCase() === n.toLowerCase());
    if (exact) return exact;
  }
  for (const n of names) {
    const loose = animations.find((a) => a.name.toLowerCase().includes(n.toLowerCase()));
    if (loose) return loose;
  }
  return null;
}

interface Part {
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  /** 每个顶点的颜色（材质色 × 顶点色） */
  colors: Float32Array;
  /** 这个顶点用不用贴图 */
  tex: Float32Array;
}

/** 把贴图画到画布上读像素，用来把调色板贴图转成顶点色 */
const pixelCache = new WeakMap<object, { data: Uint8ClampedArray; w: number; h: number } | null>();
function pixels(tex: THREE.Texture): { data: Uint8ClampedArray; w: number; h: number } | null {
  const img = tex.image as (CanvasImageSource & { width: number; height: number }) | undefined;
  if (!img || typeof document === 'undefined') return null;
  if (pixelCache.has(img)) return pixelCache.get(img)!;
  let out: { data: Uint8ClampedArray; w: number; h: number } | null = null;
  try {
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(img, 0, 0);
    out = { data: g.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height };
  } catch {
    out = null;
  }
  pixelCache.set(img, out);
  return out;
}

function collectParts(
  root: THREE.Object3D,
  include: (m: THREE.Mesh) => boolean,
  recolor?: BakeOptions['recolor'],
): { parts: Part[]; map: THREE.Texture | null } {
  const parts: Part[] = [];
  let map: THREE.Texture | null = null;
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !include(mesh)) return;
    const geometry = mesh.geometry;
    const n = geometry.attributes.position.count;
    const colors = new Float32Array(n * 3);
    const tex = new Float32Array(n);
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const vcol = geometry.attributes.color as THREE.BufferAttribute | undefined;
    const uvs = geometry.attributes.uv as THREE.BufferAttribute | undefined;
    const paint = (from: number, to: number, mat: THREE.Material) => {
      const m = mat as THREE.MeshStandardMaterial;
      if (m.color) _c.copy(m.color);
      else _c.setRGB(1, 1, 1);
      const changed = recolor?.(m.name, _c.clone());
      if (changed) _c.copy(changed);
      // 调色板贴图（每个面落在一个纯色格子里）：直接按 UV 取色，转成顶点色
      const px = m.map && uvs ? pixels(m.map) : null;
      const useMap = m.map && !px ? 1 : 0;
      if (useMap && !map) map = m.map;
      for (let i = from; i < to; i++) {
        let r = _c.r;
        let g = _c.g;
        let b = _c.b;
        if (px && uvs) {
          const u = uvs.getX(i) - Math.floor(uvs.getX(i));
          const v = uvs.getY(i) - Math.floor(uvs.getY(i));
          const k = (Math.min(px.h - 1, Math.floor(v * px.h)) * px.w + Math.min(px.w - 1, Math.floor(u * px.w))) * 4;
          _t.setRGB(px.data[k] / 255, px.data[k + 1] / 255, px.data[k + 2] / 255, THREE.SRGBColorSpace);
          r *= _t.r;
          g *= _t.g;
          b *= _t.b;
        }
        if (vcol) {
          r *= vcol.getX(i);
          g *= vcol.getY(i);
          b *= vcol.getZ(i);
        }
        colors[i * 3] = r;
        colors[i * 3 + 1] = g;
        colors[i * 3 + 2] = b;
        tex[i] = useMap;
      }
    };
    if (geometry.groups.length > 1 && mats.length > 1 && geometry.index) {
      // 多材质：按分组把用到的顶点涂成对应材质色
      const idx = geometry.index;
      for (const g of geometry.groups) {
        const mat = mats[g.materialIndex ?? 0];
        for (let k = g.start; k < g.start + g.count; k++) {
          const v = idx.getX(k);
          paint(v, v + 1, mat);
        }
      }
    } else {
      paint(0, n, mats[0]);
    }
    parts.push({ mesh, geometry, colors, tex });
  });
  return { parts, map };
}

/** 把模型在当前姿势下的所有顶点写进 out（模型空间，已旋转缩放前） */
function samplePositions(parts: Part[], out: Float32Array) {
  let o = 0;
  for (const p of parts) {
    const pos = p.geometry.attributes.position;
    const skinned = (p.mesh as THREE.SkinnedMesh).isSkinnedMesh ? (p.mesh as THREE.SkinnedMesh) : null;
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i);
      if (skinned) skinned.applyBoneTransform(i, _v);
      _v.applyMatrix4(p.mesh.matrixWorld);
      out[o++] = _v.x;
      out[o++] = _v.y;
      out[o++] = _v.z;
    }
  }
}

/**
 * 烘焙：采样每个动画的每一帧，算出所有顶点的位置和法线，合并成一个几何体 + 两张浮点贴图。
 * source 不会被修改（内部会克隆一份带骨骼的场景）。
 */
export function bakeModel(source: THREE.Object3D, animations: THREE.AnimationClip[], opts: BakeOptions): BakedModel {
  const root = SkeletonUtils.clone(source);
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  root.scale.set(1, 1, 1);
  const attached = new Set<THREE.Object3D>();
  for (const a of opts.attach ?? []) {
    let bone: THREE.Object3D | null = null;
    root.traverse((o) => {
      if (!bone && o.name.toLowerCase().includes(a.bone.toLowerCase())) bone = o;
    });
    const obj = a.object.clone(true);
    obj.traverse((o) => attached.add(o));
    (bone ?? root).add(obj);
  }
  const include = (m: THREE.Mesh) => (opts.attachOnly ? attached.has(m) : true) && (opts.include ? opts.include(m) || attached.has(m) : true);
  const { parts, map } = collectParts(root, include, opts.recolor);

  const vertexCount = parts.reduce((s, p) => s + p.geometry.attributes.position.count, 0);
  // 合并索引
  const indices: number[] = [];
  let base = 0;
  for (const p of parts) {
    const g = p.geometry;
    if (g.index) for (let k = 0; k < g.index.count; k++) indices.push(g.index.getX(k) + base);
    else for (let k = 0; k < g.attributes.position.count; k++) indices.push(k + base);
    base += g.attributes.position.count;
  }

  // 采样所有帧
  const fps = opts.fps ?? 24;
  const mixer = new THREE.AnimationMixer(root);
  const clips: Record<string, VatClip> = {};
  const frames: Float32Array[] = [];
  const names = Object.keys(opts.clips);
  for (const name of names) {
    const clip = findClip(animations, opts.clips[name]);
    const duration = clip ? clip.duration : 1;
    const count = clip ? Math.max(2, Math.round(duration * fps)) : 1;
    clips[name] = { start: frames.length, frames: count, duration };
    mixer.stopAllAction();
    const action = clip ? mixer.clipAction(clip) : null;
    action?.reset().play();
    for (let f = 0; f < count; f++) {
      mixer.setTime((f / count) * duration);
      root.updateMatrixWorld(true);
      const buf = new Float32Array(vertexCount * 3);
      samplePositions(parts, buf);
      frames.push(buf);
    }
    action?.stop();
  }

  // 以第一帧定大小：脚踩 y=0，水平居中，缩放到目标高度，再转向
  const fix = opts.fix?.clone() ?? normalizeMatrix(frames[0], vertexCount, opts.height, opts.yaw ?? 0);
  for (const buf of frames) {
    for (let i = 0; i < vertexCount; i++) {
      _v.set(buf[i * 3], buf[i * 3 + 1], buf[i * 3 + 2]).applyMatrix4(fix);
      buf[i * 3] = _v.x;
      buf[i * 3 + 1] = _v.y;
      buf[i * 3 + 2] = _v.z;
    }
  }

  // 法线不烘：渲染时用平面着色，片元着色器按屏幕导数自己算（低多边形风格，还省一半贴图读取）

  // 写贴图：每行最多 1024 个顶点，一帧占 rows 行
  const width = Math.min(1024, vertexCount);
  const rows = Math.ceil(vertexCount / width);
  const height = rows * frames.length;
  const posData = new Float32Array(width * height * 4);
  frames.forEach((buf, f) => {
    for (let i = 0; i < vertexCount; i++) {
      const texel = (f * rows + Math.floor(i / width)) * width + (i % width);
      posData[texel * 4] = buf[i * 3];
      posData[texel * 4 + 1] = buf[i * 3 + 1];
      posData[texel * 4 + 2] = buf[i * 3 + 2];
      posData[texel * 4 + 3] = 1;
    }
  });
  const makeTex = (data: Float32Array) => {
    const t = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
    t.minFilter = THREE.NearestFilter;
    t.magFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    return t;
  };

  // 合并后的几何体：位置/法线放第一帧（只用于包围盒），颜色、UV、顶点编号
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.BufferAttribute(frames[0].slice(), 3));
  geometry.computeVertexNormals();
  const color = new Float32Array(vertexCount * 3);
  const tex = new Float32Array(vertexCount);
  const uv = new Float32Array(vertexCount * 2);
  const vid = new Float32Array(vertexCount);
  let o = 0;
  for (const p of parts) {
    const n = p.geometry.attributes.position.count;
    color.set(p.colors, o * 3);
    tex.set(p.tex, o);
    const puv = p.geometry.attributes.uv as THREE.BufferAttribute | undefined;
    if (puv) for (let i = 0; i < n; i++) (uv[(o + i) * 2] = puv.getX(i)), (uv[(o + i) * 2 + 1] = puv.getY(i));
    o += n;
  }
  for (let i = 0; i < vertexCount; i++) vid[i] = i;
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setAttribute('aTex', new THREE.BufferAttribute(tex, 1));
  geometry.setAttribute('aVid', new THREE.BufferAttribute(vid, 1));
  geometry.computeBoundingSphere();

  const bounds = new THREE.Box3().setFromBufferAttribute(geometry.attributes.position as THREE.BufferAttribute);
  return { geometry, map, pos: makeTex(posData), width, rows, clips, height: bounds.max.y, fix };
}

function normalizeMatrix(f0: Float32Array, count: number, height: number, yaw: number): THREE.Matrix4 {
  const box = new THREE.Box3();
  for (let i = 0; i < count; i++) box.expandByPoint(_v.set(f0[i * 3], f0[i * 3 + 1], f0[i * 3 + 2]));
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = height / Math.max(1e-6, size.y);
  return new THREE.Matrix4()
    .multiply(new THREE.Matrix4().makeRotationY(yaw))
    .multiply(new THREE.Matrix4().makeScale(scale, scale, scale))
    .multiply(new THREE.Matrix4().makeTranslation(-center.x, -box.min.y, -center.z));
}

/**
 * 静态模型（道具）：合并成一个带顶点色的几何体，可以直接用顶点色材质画。
 * fit 给出目标尺寸：按最大边缩放，底面贴地、水平居中。
 */
export function staticGeometry(source: THREE.Object3D, fit: number, opts: { recolor?: BakeOptions['recolor'] } = {}): THREE.BufferGeometry {
  const root = source.clone(true);
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  root.scale.set(1, 1, 1);
  const { parts } = collectParts(root, () => true, opts.recolor);
  const count = parts.reduce((s, p) => s + p.geometry.attributes.position.count, 0);
  const pos = new Float32Array(count * 3);
  samplePositions(parts, pos);
  const indices: number[] = [];
  const color = new Float32Array(count * 3);
  let base = 0;
  for (const p of parts) {
    const g = p.geometry;
    if (g.index) for (let k = 0; k < g.index.count; k++) indices.push(g.index.getX(k) + base);
    else for (let k = 0; k < g.attributes.position.count; k++) indices.push(k + base);
    color.set(p.colors, base * 3);
    base += g.attributes.position.count;
  }
  const box = new THREE.Box3();
  for (let i = 0; i < count; i++) box.expandByPoint(_v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]));
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const s = fit / Math.max(size.x, size.y, size.z, 1e-6);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (pos[i * 3] - center.x) * s;
    pos[i * 3 + 1] = (pos[i * 3 + 1] - box.min.y) * s;
    pos[i * 3 + 2] = (pos[i * 3 + 2] - center.z) * s;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}

// ---------- 渲染 ----------

const VAT_HEAD = /* glsl */ `
uniform sampler2D uVatPos;
uniform float uVatWidth;
uniform float uVatRows;
attribute vec3 aAnim;
attribute float aVid;
attribute float aTex;
varying float vTex;
vec3 vatRead(sampler2D tex, float frame) {
  float row = frame * uVatRows + floor(aVid / uVatWidth);
  float col = mod(aVid, uVatWidth);
  return texelFetch(tex, ivec2(int(col), int(row)), 0).xyz;
}
`;

function injectVertex(shader: THREE.WebGLProgramParametersWithUniforms) {
  shader.vertexShader = VAT_HEAD + shader.vertexShader;
  // 平面着色：法线在片元里由导数算，这里给个占位就行
  shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);');
  shader.vertexShader = shader.vertexShader.replace(
    '#include <begin_vertex>',
    'vec3 transformed = mix(vatRead(uVatPos, aAnim.x), vatRead(uVatPos, aAnim.y), aAnim.z);\n  vTex = aTex;',
  );
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _col = new THREE.Color();

/**
 * 用烘焙好的模型画一群人。接口和 Crowd 一样（begin / push / end），
 * 姿势里的 stride 决定跑还是站（站着就播 idle 或 shoot），phase 决定播到哪一帧。
 */
export class VatCrowd {
  readonly mesh: THREE.InstancedMesh;
  readonly capacity: number;
  private n = 0;
  private model: BakedModel;
  private anim: THREE.InstancedBufferAttribute;
  private readonly uniforms: Record<string, THREE.IUniform>;
  private readonly material: THREE.MeshLambertMaterial;

  constructor(scene: THREE.Scene, capacity: number, model: BakedModel, opts: { shadow?: boolean } = {}) {
    this.capacity = capacity;
    this.model = model;
    this.uniforms = {
      uVatPos: { value: model.pos },
      uVatWidth: { value: model.width },
      uVatRows: { value: model.rows },
    };
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true, map: model.map, flatShading: true });
    this.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      injectVertex(shader);
      shader.fragmentShader = 'varying float vTex;\n' + shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  diffuseColor *= mix( vec4( 1.0 ), sampledDiffuseColor, vTex );
#endif`,
      );
    };
    this.material.customProgramCacheKey = () => `vat-${model.map ? 1 : 0}`;
    this.anim = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.anim.setUsage(THREE.DynamicDrawUsage);
    this.mesh = new THREE.InstancedMesh(this.instanceGeometry(model), this.material, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < capacity; i++) this.mesh.setColorAt(i, _col.setRGB(1, 1, 1));
    this.mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    // 人群默认不投实时阴影（几百个人再画一遍阴影太贵），脚下用圆形影子代替
    if (opts.shadow) {
      this.mesh.castShadow = true;
      const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
      depth.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, this.uniforms);
        injectVertex(shader);
      };
      depth.customProgramCacheKey = () => 'vat-depth';
      this.mesh.customDepthMaterial = depth;
    }
    scene.add(this.mesh);
  }

  /** 每个 InstancedMesh 要自己的帧号属性，其他属性和烘焙结果共用 */
  private instanceGeometry(model: BakedModel): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setIndex(model.geometry.index);
    for (const [k, v] of Object.entries(model.geometry.attributes)) g.setAttribute(k, v);
    g.setAttribute('aAnim', this.anim);
    g.boundingSphere = model.geometry.boundingSphere;
    return g;
  }

  /** 换模型（比如换枪）：几何体和贴图一起换 */
  setModel(model: BakedModel) {
    if (model === this.model) return;
    this.model = model;
    this.mesh.geometry.dispose();
    this.mesh.geometry = this.instanceGeometry(model);
    this.uniforms.uVatPos.value = model.pos;
    this.uniforms.uVatWidth.value = model.width;
    this.uniforms.uVatRows.value = model.rows;
    if (this.material.map !== model.map) {
      this.material.map = model.map;
      this.material.needsUpdate = true;
    }
  }

  begin() {
    this.n = 0;
  }

  /** clip 不给就按 stride 选 run / idle；cycle 是循环进度（圈数），不给就用 phase / 2π */
  push(a: AgentPose & { clip?: string; cycle?: number }) {
    if (this.n >= this.capacity) return;
    const i = this.n++;
    _e.set(a.tilt, a.yaw, 0);
    _q.setFromEuler(_e);
    _p.set(a.x, a.y, -a.d);
    _s.setScalar(a.scale);
    _m.compose(_p, _q, _s);
    this.mesh.setMatrixAt(i, _m);
    const clips = this.model.clips;
    const clip = clips[a.clip ?? (a.stride > 0.3 ? 'run' : 'idle')] ?? clips.run ?? Object.values(clips)[0];
    const cycle = a.cycle ?? a.phase / (Math.PI * 2);
    const t = (((cycle % 1) + 1) % 1) * clip.frames;
    const f0 = Math.floor(t);
    this.anim.setXYZ(i, clip.start + f0, clip.start + ((f0 + 1) % clip.frames), t - f0);
    const f = 1 + a.flash * 1.6;
    if (a.tint) this.mesh.setColorAt(i, _col.setRGB(a.tint[0] * f, a.tint[1] * f, a.tint[2] * f));
    else this.mesh.setColorAt(i, _col.setRGB(f, f, f));
  }

  end() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
    this.anim.needsUpdate = true;
  }
}
