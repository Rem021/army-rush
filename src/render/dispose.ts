import * as THREE from 'three';

function uploadRange(attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, itemCount: number) {
  if ('clearUpdateRanges' in attr && typeof attr.clearUpdateRanges === 'function') {
    attr.clearUpdateRanges();
    attr.addUpdateRange(0, itemCount * attr.itemSize);
  }
  attr.needsUpdate = true;
}

/**
 * 提交 InstancedMesh 当前活跃实例数：
 * - 连续空帧（count === 0 && prevCount === 0）完全跳过 GPU 上传；
 * - 非空帧仅上传 [0, count * itemSize) 的有效子区间，避免每帧整块缓冲区全量拷贝。
 */
export function commitInstances(
  mesh: THREE.InstancedMesh,
  count: number,
  prevCount: number,
  extraAttrs?: readonly THREE.InstancedBufferAttribute[],
  useColor = false,
): number {
  mesh.count = count;
  if (count === 0 && prevCount === 0) return 0;
  if (count > 0) {
    uploadRange(mesh.instanceMatrix, count);
    if (useColor && mesh.instanceColor) uploadRange(mesh.instanceColor, count);
    if (extraAttrs) {
      for (let i = 0; i < extraAttrs.length; i++) uploadRange(extraAttrs[i], count);
    }
  }
  return count;
}

/**
 * 递归释放节点树下的非共享几何体与非共享材质（不释放材质引用的共享贴图）。
 */
export function disposeObject(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((obj) => {
    const anyObj = obj as THREE.Mesh | THREE.Sprite;
    if ('geometry' in anyObj && anyObj.geometry && !anyObj.geometry.userData?.shared) {
      geometries.add(anyObj.geometry);
    }
    if ('material' in anyObj && anyObj.material) {
      if (Array.isArray(anyObj.material)) {
        for (const m of anyObj.material) {
          if (m && !m.userData?.shared) materials.add(m);
        }
      } else if (!anyObj.material.userData?.shared) {
        materials.add(anyObj.material);
      }
    }
  });
  for (const g of geometries) g.dispose();
  for (const m of materials) m.dispose();
}
