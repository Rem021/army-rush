import * as THREE from 'three';
import { expect, it } from 'vitest';
import { configureCarnageCamera } from '../src/render/carnageCamera';

it('手机和横屏的大军团脚下不被底部操作挡住，近战巨人血条留在 HUD 下方', () => {
  for (const [width,height] of [[390,844],[320,568],[844,390]]) {
    for (const back of [-2,-5,-9]) {
      const camera = new THREE.PerspectiveCamera();
      configureCarnageCamera(camera,width,height,back);
      const foot = new THREE.Vector3(0,0,-back+.4).project(camera);
      const health = new THREE.Vector3(0,6,-2.5).project(camera);
      const footY = (1-foot.y)*height/2;
      const healthY = (1-health.y)*height/2;
      expect(footY).toBeLessThanOrEqual(height-(width/height>1.2?130:150)+.01);
      expect(healthY).toBeGreaterThanOrEqual(82-.01);
    }
  }
});
