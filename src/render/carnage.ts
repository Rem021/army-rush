import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { World, GameEvent, Boss } from '../game/world';
import type { Models } from './assets';
import { bakeSoldierBody, buildSoldier } from './characters';
import { Crowd, type AgentPose } from './crowd';
import { BlobShadows, BulletMesh, Explosions, Particles, Rings } from './effects';
import { Label } from './label';
import { soldierBody, soldierLeg } from './models';
import { VatCrowd } from './vat';

const BLUE = { id: 'carnage-blue', name: '蓝军', team: 0x1657f2, shirt: 0x155aff, price: 0 };
const RED = { id: 'carnage-red', name: '红军', team: 0xd53537, shirt: 0xe54441, price: 0 };
const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), size = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
interface Herd { begin(): void; push(pose: AgentPose & { clip?: string; cycle?: number }): void; end(): void }

/** 合并同类炮管和护甲，整排发射架只有一次绘制。 */
function rocketPod(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const add = (geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number) => {
    const g = geo.toNonIndexed(); geo.dispose(); g.translate(x, y, z);
    const c = new THREE.Color(color), rgb = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < rgb.length; i += 3) { rgb[i] = c.r; rgb[i + 1] = c.g; rgb[i + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
    g.deleteAttribute('uv'); parts.push(g);
  };
  add(new THREE.BoxGeometry(1.55, .28, 1.65), 0x514b40, 0, .2, 0);
  const casing = new THREE.CylinderGeometry(.86, .86, .9, 6); casing.rotateX(Math.PI / 2);
  add(casing, 0x9f702e, 0, 1, 0);
  const plate = new THREE.CylinderGeometry(.75, .75, .06, 6); plate.rotateX(Math.PI / 2);
  add(plate, 0xd5a751, 0, 1, .49);
  for (let i = 0; i < 7; i++) {
    const a = (i - 1) * Math.PI / 3, x = i === 0 ? 0 : Math.cos(a) * .44, y = 1 + (i === 0 ? 0 : Math.sin(a) * .44);
    const tube = new THREE.CylinderGeometry(.205, .205, 1.25, 12); tube.rotateX(Math.PI / 2);
    add(tube, 0x4a4642, x, y, .17);
    add(new THREE.TorusGeometry(.176, .038, 5, 12), 0xc2b593, x, y, .81);
    add(new THREE.CircleGeometry(.143, 12), 0x0b0c10, x, y, .815);
  }
  for (const x of [-.74, .74]) add(new THREE.BoxGeometry(.22, .4, 1.35), 0x302f30, x, .26, 0);
  const result = mergeGeometries(parts)!; parts.forEach(g => g.dispose()); return result;
}

function instances(scene: THREE.Scene, geometry: THREE.BufferGeometry, material: THREE.Material, cap: number) {
  const mesh = new THREE.InstancedMesh(geometry, material, cap); mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(mesh); return mesh;
}
function place(mesh: THREE.InstancedMesh, index: number, x: number, y: number, z: number, sx = 1, sy = sx, sz = sx) {
  p.set(x, y, z); size.set(sx, sy, sz); q.identity(); m.compose(p, q, size); mesh.setMatrixAt(index, m);
}
function finish(mesh: THREE.InstancedMesh, count: number) { mesh.count = count; mesh.instanceMatrix.needsUpdate = true; }
function numberSprite(label: Label, width: number, height: number) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: label.texture, depthTest: false, depthWrite: false, toneMapped: false }));
  sprite.scale.set(width, height, 1); sprite.renderOrder = 8; return sprite;
}

/** 红甲、黑发、肩甲和长剑：参考图中的人形巨人，直接由几何体建立。 */
class RedChampion {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private swordArm = new THREE.Group();
  private leftLeg = new THREE.Group();
  private rightLeg = new THREE.Group();
  private death = 0;
  constructor(scene: THREE.Scene, readonly boss: Boss) {
    const red = new THREE.MeshLambertMaterial({ color: 0xc9342c });
    const darkRed = new THREE.MeshLambertMaterial({ color: 0x7c221f });
    const skin = new THREE.MeshLambertMaterial({ color: 0xd9a17a });
    const hair = new THREE.MeshLambertMaterial({ color: 0x24232c });
    const steel = new THREE.MeshLambertMaterial({ color: 0xc6c6c3 });
    const gold = new THREE.MeshLambertMaterial({ color: 0xb88b42 });
    const make = (parent: THREE.Group, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx = 1, sy = sx, sz = sx) => {
      const mesh = new THREE.Mesh(geo, mat); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.castShadow = true; parent.add(mesh); return mesh;
    };
    scene.add(this.root); this.root.add(this.body); this.root.scale.setScalar(1.55);
    make(this.body, new THREE.SphereGeometry(1, 16, 12), red, 0, 1.85, 0, .77, .91, .5);
    make(this.body, new THREE.SphereGeometry(1, 16, 12), darkRed, 0, 1.2, .03, .8, .38, .52);
    make(this.body, new THREE.BoxGeometry(1.5, .16, 1.02), hair, 0, 1.23, .02);
    make(this.body, new THREE.BoxGeometry(.31, .22, .07), steel, 0, 1.23, .58);
    make(this.body, new THREE.SphereGeometry(.43, 16, 12), skin, 0, 2.94, .09, 1, 1.1, 1);
    make(this.body, new THREE.SphereGeometry(.48, 16, 12), hair, 0, 3.13, -.03, 1, .85, 1);
    make(this.body, new THREE.BoxGeometry(.78, .12, .24), red, 0, 3.01, .4);
    for (const x of [-.15, .15]) make(this.body, new THREE.BoxGeometry(.13, .045, .035), hair, x, 2.9, .48);
    make(this.body, new THREE.SphereGeometry(.13, 10, 8), skin, 0, 2.8, .5, 1, .65, .7);
    make(this.body, new THREE.BoxGeometry(.27, .04, .03), darkRed, 0, 2.64, .47);
    make(this.body, new THREE.ConeGeometry(.25, .8, 8), hair, .07, 3.55, -.25).rotation.z = -.3;
    make(this.body, new THREE.SphereGeometry(.43, 12, 10), steel, .84, 2.45, 0);
    make(this.body, new THREE.SphereGeometry(.3, 10, 8), steel, .9, 2.5, .27, 1, .8, .7);
    for (const x of [.8, .99]) make(this.body, new THREE.SphereGeometry(.07, 8, 6), hair, x, 2.52, .47);
    make(this.body, new THREE.CylinderGeometry(.25, .2, .95, 12), skin, .95, 1.88, .05).rotation.z = .25;
    make(this.body, new THREE.SphereGeometry(.25, 12, 8), skin, .88, 1.38, .27);
    this.body.add(this.swordArm); this.swordArm.position.set(-.8, 2.35, 0);
    make(this.swordArm, new THREE.CylinderGeometry(.26, .21, .9, 12), skin, -.17, -.4, .1).rotation.z = -.3;
    make(this.swordArm, new THREE.SphereGeometry(.24, 12, 8), skin, -.29, -.87, .3);
    make(this.swordArm, new THREE.CylinderGeometry(.08, .08, .6, 8), hair, -.29, -.65, .38);
    make(this.swordArm, new THREE.BoxGeometry(.55, .1, .25), gold, -.29, -.35, .38);
    make(this.swordArm, new THREE.BoxGeometry(.2, 2.1, .09), gold, -.29, .73, .38).rotation.z = -.06;
    for (const [leg, x] of [[this.leftLeg, -.39], [this.rightLeg, .39]] as const) {
      this.body.add(leg); leg.position.set(x, 1.05, 0);
      make(leg, new THREE.CylinderGeometry(.24, .22, .7, 10), darkRed, 0, -.34, 0);
      make(leg, new THREE.BoxGeometry(.5, .3, .7), hair, 0, -.85, .12);
    }
  }
  dispose() {
    const materials = new Set<THREE.Material>();
    this.root.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); materials.add(o.material as THREE.Material); } });
    for (const material of materials) material.dispose();
    this.root.removeFromParent();
  }
  update(dt: number, t: number) {
    const b = this.boss;
    this.root.position.set(b.x, .07 + Math.abs(Math.sin(t * 2)) * .05, -b.d);
    this.body.rotation.y = Math.sin(t * .7) * .08;
    this.swordArm.rotation.x = b.attacking ? -b.windup * 2.6 + b.slam * 2.3 : -.3;
    this.leftLeg.rotation.x = Math.sin(b.phase) * .1; this.rightLeg.rotation.x = -Math.sin(b.phase) * .1;
    if (!b.alive) { this.death += dt; this.root.rotation.x = -Math.min(Math.PI / 2, this.death * 2); this.root.visible = this.death < 1.4; }
  }
}

/** 与主线分开的完整场景，按参考图设置四列构图，不复用绿门/公路桥主题。 */
export class ReferenceCarnageView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(43, 1, .1, 220);
  private world!: World;
  private blue: Herd;
  private guns: VatCrowd | null = null;
  private red: Herd;
  private blueBoards: THREE.InstancedMesh;
  private blueText: THREE.InstancedMesh;
  private yellowBoards: THREE.InstancedMesh;
  private yellowText: THREE.InstancedMesh;
  private pods: THREE.InstancedMesh;
  private missiles: THREE.InstancedMesh;
  private counter = new Label(256, 128);
  private podCounter = new Label(128, 96);
  private counterSprite: THREE.Sprite;
  private podSprite: THREE.Sprite;
  private squadLabel = new Label(256, 96);
  private squadSprite: THREE.Sprite;
  private champions = new Map<number, RedChampion>();
  private bullets: BulletMesh;
  private sparks: Particles;
  private debris: Particles;
  private explosions: Explosions;
  private rings: Rings;
  private shadows: BlobShadows;
  private time = 0;
  private width = 390;
  private height = 844;
  private trauma = 0;

  constructor(models: Models) {
    const scene = this.scene;
    scene.background = new THREE.Color(0x0c1120);
    scene.fog = new THREE.Fog(0x0c1120, 100, 200);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x65697d, 2));
    const sun = new THREE.DirectionalLight(0xfff2dc, 2.1); sun.position.set(-8, 22, 12); scene.add(sun);
    const c = document.createElement('canvas'); c.width = 512; c.height = 512;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#b9b9c2'; ctx.fillRect(0, 0, 512, 512);
    for (let row = 0; row < 8; row++) for (let col = -1; col < 8; col++) {
      const x = col * 76 + (row % 2) * 38, y = row * 64;
      const shade = 182 + ((row * 11 + col * 17 + 127) % 18);
      ctx.fillStyle = `rgb(${shade},${shade},${shade + 6})`; ctx.fillRect(x + 1, y + 1, 74, 62);
      ctx.strokeStyle = '#a7a7b1'; ctx.lineWidth = 1.2; ctx.strokeRect(x + 1, y + 1, 74, 62);
      ctx.fillStyle = '#d2d2d7'; ctx.fillRect(x + 2, y + 2, 72, 1);
    }
    const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(2, 35); texture.anisotropy = 8;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(12, 200), new THREE.MeshLambertMaterial({ map: texture }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, -.02, -60); scene.add(ground);
    const concrete = new THREE.MeshLambertMaterial({ color: 0x646773 });
    const rail = instances(scene, new THREE.BoxGeometry(.28, .65, 2.1), concrete, 200);
    let ri = 0;
    for (let i = 0; i < 100; i++) for (const x of [-5.85, 5.85]) place(rail, ri++, x, .3, 12 - i * 2.2);
    finish(rail, ri);
    const divider = instances(scene, new THREE.BoxGeometry(.13, .35, 2.4), concrete, 100);
    let di = 0;
    for (let i = 0; i < 30; i++) for (const x of [-4.0, .05, 2.95]) place(divider, di++, x, .16, -16 - i * 2.5);
    finish(divider, di);
    const labelMaterial = (text: string) => {
      const label = new Label(256, 160); label.set(text, { fill:'#ffffff', stroke:'#18202d', size:120 });
      return new THREE.MeshBasicMaterial({ map: label.texture, transparent:true, depthWrite:false, toneMapped:false });
    };
    this.blueBoards = instances(scene, new THREE.BoxGeometry(1.24, 1.05, .22), new THREE.MeshLambertMaterial({ color:0x1682f7 }), 180);
    this.blueText = instances(scene, new THREE.PlaneGeometry(1.12, .83), labelMaterial('+1'), 180);
    this.yellowBoards = instances(scene, new THREE.BoxGeometry(2.55, 1.85, .22), new THREE.MeshLambertMaterial({ color:0xffd32d }), 90);
    this.yellowText = instances(scene, new THREE.PlaneGeometry(2.4, 1.65), labelMaterial('+99'), 90);
    this.pods = instances(scene, rocketPod(), new THREE.MeshLambertMaterial({ vertexColors:true }), 100);
    this.missiles = instances(scene, new THREE.ConeGeometry(.12, .85, 8), new THREE.MeshBasicMaterial({ color:0xffdf66 }), 64);
    if (models.soldier) {
      const kit = buildSoldier(models.soldier, BLUE);
      this.blue = new VatCrowd(scene, 320, kit.body, { shadow:false });
      this.guns = new VatCrowd(scene, 320, kit.guns[4], { shadow:false });
      this.red = new VatCrowd(scene, 750, bakeSoldierBody(models.soldier, RED), { shadow:false });
    } else {
      this.blue = new Crowd(scene, 320, soldierBody(BLUE,4), soldierLeg(BLUE.team));
      this.red = new Crowd(scene, 750, soldierBody(RED,0), soldierLeg(RED.team));
    }
    this.counterSprite = numberSprite(this.counter, 3.3, 1.5); scene.add(this.counterSprite);
    this.podSprite = numberSprite(this.podCounter, 1.5, 1); scene.add(this.podSprite);
    this.squadSprite = numberSprite(this.squadLabel, 1.5, .6); scene.add(this.squadSprite);
    this.bullets = new BulletMesh(scene); this.bullets.setColor(0xffc72a, 4, 0xffcb22);
    (this.bullets.mesh.material as THREE.MeshBasicMaterial).color.set(0xffbd18);
    (this.bullets.glow.material as THREE.MeshBasicMaterial).opacity=.34;
    this.sparks = new Particles(scene, new THREE.OctahedronGeometry(1,0), new THREE.MeshBasicMaterial({ blending:THREE.AdditiveBlending, transparent:true, depthWrite:false }), 900);
    this.debris = new Particles(scene, new THREE.BoxGeometry(1,1,1), new THREE.MeshLambertMaterial(), 700);
    this.explosions = new Explosions(scene, 180); this.rings = new Rings(scene); this.shadows = new BlobShadows(scene);
  }

  load(world: World) {
    this.world = world; this.time = 0; this.trauma = 0;
    for (const v of this.champions.values()) v.dispose(); this.champions.clear();
    this.sparks.clear(); this.debris.clear(); this.explosions.clear(); this.rings.clear();
  }
  resize(width:number, height:number) { this.width = width; this.height = height; this.camera.aspect = width/height; this.camera.updateProjectionMatrix(); }
  handle(events: GameEvent[], reduced: boolean) {
    let budget = 30;
    for (const e of events) {
      if (e.type === 'hit' && budget-- > 0) this.sparks.burst(e.x,.9,-e.d,3,3,.2,.065,[0xffdf68,0xffffff],10,.4);
      else if (e.type === 'zombieDie' && budget-- > 0) this.debris.burst(e.x,.4,-e.d,3,3,.4,.1,[0xc73032,0xec7662],12,.4);
      else if (e.type === 'barrelBreak') {
        this.explosions.spawn(e.barrel.x,1,-e.barrel.d,2.1,true);
        this.debris.burst(e.barrel.x,1,-e.barrel.d,18,7,.8,.18,[0xbda265,0x565047,0xffd55e],18,.5);
      } else if (e.type === 'carnageBlast') {
        this.explosions.spawn(e.x,.7,-e.d,e.nova?5:2.4,!reduced);
        this.rings.spawn(e.x,-e.d,e.nova?24:6,0xffcf40,.5);
        this.sparks.burst(e.x,1,-e.d,reduced?8:e.nova?100:24,10,.6,.12,[0xffcc33,0xfff1a6,0xffffff],12,.7);
        if (!reduced) this.trauma = e.nova?.22:.03;
      }
    }
  }
  update(dt:number, reduced:boolean, menu:boolean) {
    const w = this.world, t = this.time += dt;
    this.shadows.begin(); this.blue.begin(); this.guns?.begin(); this.red.begin();
    for (const s of w.soldiers) {
      const pose = { x:w.squad.x+s.ox, y:0, d:s.oz, yaw:0, phase:s.phase, scale:.72, flash:0, tilt:0, stride:.1, clip:menu?'idle':'shoot', cycle:t+s.phase*.2 };
      this.blue.push(pose); this.guns?.push(pose); this.shadows.push(pose.x,-pose.d,.58);
    }
    this.blue.end(); this.guns?.end();
    for (const z of w.zombies) if (z.alive && z.d < 80) {
      const pose = { x:z.x,y:0,d:z.d,yaw:Math.PI,phase:z.phase,scale:.52,flash:Math.min(.15,z.flash*.15),tilt:0,stride:.65,clip:'run',cycle:z.phase/6.28 };
      this.red.push(pose); this.shadows.push(z.x,-z.d,.4);
    }
    this.red.end(); this.shadows.end();
    let blue=0, gold=0;
    for (const g of w.gates) {
      if (g.consumed || g.d < -3 || g.d > 100) continue;
      const isBlue = g.carnage==='recruit', x=(g.x0+g.x1)/2, y=isBlue?.55:.95;
      const a=isBlue?this.blueBoards:this.yellowBoards, b=isBlue?this.blueText:this.yellowText, i=isBlue?blue++:gold++;
      place(a,i,x,y,-g.d); place(b,i,x,y+.01,-g.d+.125);
    }
    finish(this.blueBoards,blue); finish(this.blueText,blue); finish(this.yellowBoards,gold); finish(this.yellowText,gold);
    let pods=0;
    for (const b of w.barrels) if (b.alive && b.d<100) {
      if (b.carnage==='battery') {
        for (const [dx,dy] of [[-.53,0],[.53,0],[0,1.0]]) place(this.pods,pods++,b.x+dx,dy,-b.d,.82);
      } else place(this.pods,pods++,b.x,0,-b.d,.95);
    }
    finish(this.pods,pods);
    const battery=w.barrels.find(b=>b.alive&&b.carnage==='battery');
    this.counterSprite.visible=!!battery;
    if (battery) { this.counter.set(String(Math.ceil(battery.hp)),{fill:'#ffffff',stroke:'#211b17',size:116}); this.counterSprite.position.set(battery.x,.8,-battery.d+1.9); }
    const pod=w.barrels.find(b=>b.alive&&b.carnage==='pod'); this.podSprite.visible=!!pod;
    if(pod){this.podCounter.set(String(Math.ceil(pod.hp)),{fill:'#ffffff',stroke:'#211b17',size:82});this.podSprite.position.set(pod.x,.6,-pod.d+1.1);}
    for(const b of w.bosses){let v=this.champions.get(b.id);if(!v){v=new RedChampion(this.scene,b);this.champions.set(b.id,v);}v.update(dt,t);}
    this.bullets.update(w.bullets);
    let mi=0;
    for(const r of w.rockets){
      const k=Math.min(1,r.t/r.T), y=.8+Math.sin(k*Math.PI)*5;
      const x=THREE.MathUtils.lerp(r.x0,r.x,k), d=THREE.MathUtils.lerp(r.d0,r.d,k);
      dir.set(r.x-r.x0,Math.cos(k*Math.PI)*9,-(r.d-r.d0)).normalize();q.setFromUnitVectors(up,dir);
      p.set(x,y,-d);size.set(1,1,1);m.compose(p,q,size);this.missiles.setMatrixAt(mi++,m);
      if(dt>0)this.sparks.spawn(x,y,-d,.1,-.5,2,.22,.11,0xffc630,0);
    }finish(this.missiles,mi);
    this.sparks.update(dt);this.debris.update(dt);this.explosions.update(dt);this.rings.update(dt);
    this.squadLabel.set(String(w.squad.count),{fill:'#ffffff',stroke:'#153581',pill:'#1d5fe2',size:72});
    this.squadSprite.position.set(w.squad.x,1.25,-Math.max(-2,w.back*.2));
    const wide=this.width/this.height>1.2;
    // 固定俯视长桥：玩家约在下方 2/3，四列队列全部同时入镜。
    this.camera.fov=wide?43:32;
    this.camera.position.set(0,45,38);
    this.camera.lookAt(0,0,-13.5);
    if(!reduced&&this.trauma>0){this.camera.position.x+=Math.sin(t*67)*this.trauma;this.trauma=Math.max(0,this.trauma-dt);}
    this.camera.updateProjectionMatrix();
    if (!wide) this.camera.projectionMatrix.elements[0] *= 1.22;
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
  }
  render(renderer:THREE.WebGLRenderer){renderer.render(this.scene,this.camera);}
}
