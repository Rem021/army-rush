import * as THREE from 'three';

const far = new THREE.Vector3(), rear = new THREE.Vector3(), nearHead = new THREE.Vector3();

/** Keep the squad clear of the controls. Landscape focuses on the bridgehead. */
export function configureCarnageCamera(camera: THREE.PerspectiveCamera, width: number, height: number, back: number) {
  const wide = width / height > 1.2;
  camera.aspect = width / height;
  camera.fov = wide ? 43 : 32;
  camera.position.set(0, wide ? 13 : 45, wide ? 11 : 38);
  camera.lookAt(0, 0, wide ? -3 : -13.5);
  camera.updateProjectionMatrix();
  if (!wide) camera.projectionMatrix.elements[0] *= 1.22;
  camera.updateMatrixWorld();

  // The far queue can extend beyond the top, but the current fight must fit.
  far.set(0, wide ? 0 : 6, wide ? -14 : -30).project(camera);
  nearHead.set(0, 6, -2.5).project(camera);
  rear.set(0, 0, -back + .4).project(camera);
  const top = Math.max(far.y, nearHead.y);
  const bottom = rear.y;
  const topLimit = 1 - (2 * 82) / height;
  const bottomLimit = 1 - (2 * (height - (wide ? 130 : 150))) / height;
  const scale = Math.min(1, (topLimit - bottomLimit) / Math.max(.001, top - bottom));
  const minShift = bottomLimit - bottom * scale;
  const maxShift = topLimit - top * scale;
  const shift = Math.min(maxShift, Math.max(minShift, 0));
  camera.projectionMatrix.elements[5] *= scale;
  camera.projectionMatrix.elements[9] = camera.projectionMatrix.elements[9] * scale - shift;
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}
