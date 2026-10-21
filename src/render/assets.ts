import type * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/**
 * 外部模型（CC0，来源和许可见 public/models/CREDITS.md）。
 * 构建前用 scripts/assets.ts 把原始包压成 meshopt 压缩的 .glb，放在 public/models/。
 */
export const MODEL_FILES = {
  soldier: 'soldier.glb',
  zombie: 'zombie.glb',
  zombieRunner: 'zombie-runner.glb',
  zombieFat: 'zombie-fat.glb',
  zombieArm: 'zombie-arm.glb',
  orc: 'orc.glb',
  blob: 'blob.glb',
  props: 'props.glb',
} as const;

export type ModelId = keyof typeof MODEL_FILES;

export interface LoadedModel {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

export type Models = Partial<Record<ModelId, LoadedModel>>;

/** 并行加载所有模型；某个文件缺失或坏了就跳过，渲染器会退回到代码生成的模型 */
export async function loadModels(onProgress: (done: number, total: number) => void): Promise<Models> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const base = `${import.meta.env.BASE_URL}models/`;
  const entries = Object.entries(MODEL_FILES) as [ModelId, string][];
  let done = 0;
  onProgress(0, entries.length);
  const out: Models = {};
  await Promise.all(
    entries.map(async ([id, file]) => {
      try {
        const gltf: GLTF = await loader.loadAsync(base + file);
        out[id] = { scene: gltf.scene, animations: gltf.animations };
      } catch (err) {
        console.warn(`模型 ${file} 没加载上，用内置模型代替`, err);
      } finally {
        onProgress(++done, entries.length);
      }
    }),
  );
  return out;
}
