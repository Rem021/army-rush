import * as THREE from 'three';

const far = new THREE.Vector3(), rear = new THREE.Vector3(), nearHead = new THREE.Vector3();

/** Keep the squad clear of the controls. Landscape focuses on the bridgehead. */
export function configureCarnageCamera(camera: THREE.PerspectiveCamera, width: number, height: number, back: number) {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const wide = w / h > 1.2;
  const backPush = Math.max(0, -back - 2.2) * (wide ? 0.56 : 0.88);
  camera.aspect = w / h;
  camera.fov = wide ? 52 : 56;
  camera.position.set(0, (wide ? 8.8 : 15.6) + backPush * 0.46, (wide ? 10.2 : 18.4) + backPush);
  camera.lookAt(0, wide ? 0.5 : 0.65, wide ? -6.4 : -11.8);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  // The far queue can extend beyond the top, but the current fight must fit.
  far.set(0, wide ? 0 : 6, wide ? -14 : -30).project(camera);
  nearHead.set(0, 6, -2.5).project(camera);
  rear.set(0, 0, -back + .4).project(camera);
  const top = Math.max(far.y, nearHead.y);
  const bottom = rear.y;
  const topLimit = 1 - (2 * 82) / h;
  const bottomLimit = 1 - (2 * (h - (wide ? 130 : 150))) / h;
  const scale = Math.min(1, (topLimit - bottomLimit) / Math.max(.001, top - bottom));
  const minShift = bottomLimit - bottom * scale;
  const maxShift = topLimit - top * scale;
  const shift = Math.min(maxShift, Math.max(minShift, 0));
  camera.projectionMatrix.elements[0] *= scale;
  camera.projectionMatrix.elements[5] *= scale;
  camera.projectionMatrix.elements[9] = camera.projectionMatrix.elements[9] * scale - shift;
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}
