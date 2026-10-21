import * as THREE from 'three';
import { HIP_Y, LEG_X } from './models';

export interface AgentPose {
  x: number;
  y: number;
  d: number;
  yaw: number;
  phase: number;
  scale: number;
  /** 0..1 被打中时闪白 */
  flash: number;
  /** 向后倒的角度（死亡动画） */
  tilt: number;
  /** 腿摆幅度，0 为站立 */
  stride: number;
  /** 身体颜色倍数，用来让丧尸看起来不一样 */
  tint?: readonly [number, number, number];
}

const _m = new THREE.Matrix4();
const _leg = new THREE.Matrix4();
const _tmp = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

/** 一整群小人：身体一个 InstancedMesh，腿一个 InstancedMesh（每人两条）。士兵和各种丧尸共用 */
export class Crowd {
  readonly body: THREE.InstancedMesh;
  readonly legs: THREE.InstancedMesh;
  readonly capacity: number;
  private n = 0;
  private readonly material: THREE.MeshLambertMaterial;

  constructor(scene: THREE.Scene, capacity: number, body: THREE.BufferGeometry, legs: THREE.BufferGeometry) {
    this.capacity = capacity;
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.body = new THREE.InstancedMesh(body, this.material, capacity);
    this.legs = new THREE.InstancedMesh(legs, this.material, capacity * 2);
    for (const mesh of [this.body, this.legs]) {
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(mesh);
    }
    for (let i = 0; i < capacity; i++) this.body.setColorAt(i, _c.setRGB(1, 1, 1));
    this.body.instanceColor!.setUsage(THREE.DynamicDrawUsage);
  }

  setGeometry(body: THREE.BufferGeometry, legs: THREE.BufferGeometry) {
    this.body.geometry.dispose();
    this.legs.geometry.dispose();
    this.body.geometry = body;
    this.legs.geometry = legs;
  }

  begin() {
    this.n = 0;
  }

  push(a: AgentPose) {
    if (this.n >= this.capacity) return;
    const i = this.n++;
    const bob = Math.abs(Math.sin(a.phase)) * 0.06 * a.stride;
    _e.set(a.tilt - 0.08 * a.stride, a.yaw, 0);
    _q.setFromEuler(_e);
    _p.set(a.x, a.y + bob, -a.d);
    _s.setScalar(a.scale);
    _m.compose(_p, _q, _s);
    this.body.setMatrixAt(i, _m);
    const swing = Math.sin(a.phase) * 0.75 * a.stride;
    _leg.makeRotationX(swing);
    _leg.setPosition(-LEG_X, HIP_Y, 0);
    _tmp.multiplyMatrices(_m, _leg);
    this.legs.setMatrixAt(i * 2, _tmp);
    _leg.makeRotationX(-swing);
    _leg.setPosition(LEG_X, HIP_Y, 0);
    _tmp.multiplyMatrices(_m, _leg);
    this.legs.setMatrixAt(i * 2 + 1, _tmp);
    const f = 1 + a.flash * 1.6;
    if (a.tint) this.body.setColorAt(i, _c.setRGB(a.tint[0] * f, a.tint[1] * f, a.tint[2] * f));
    else this.body.setColorAt(i, _c.setRGB(f, f, f));
  }

  end() {
    this.body.count = this.n;
    this.legs.count = this.n * 2;
    this.body.instanceMatrix.needsUpdate = true;
    this.legs.instanceMatrix.needsUpdate = true;
    this.body.instanceColor!.needsUpdate = true;
  }
}
