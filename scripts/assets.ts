// 把挑中的 CC0 模型（Quaternius，见 public/models/CREDITS.md）处理成游戏用的 .glb：
// 删掉用不到的节点和动画、减面、重采样动画、meshopt 压缩，输出到 public/models/。
// 原始素材不进仓库：先按 CREDITS.md 里的地址下载到 work/assets-raw/，再跑
//   npx tsx scripts/assets.ts [原始素材目录=work/assets-raw]
import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, mergeDocuments, meshopt, prune, resample, simplify, simplifyPrimitive, unpartition, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const raw = process.argv[2] ?? 'work/assets-raw';
const out = 'public/models';
mkdirSync(out, { recursive: true });

const TOON = join(raw, 'quaternius-toon-shooter-kit');
const ZOMBIE = join(raw, 'quaternius-zombie-apocalypse-kit');
const MONSTERS = join(raw, 'quaternius-ultimate-monsters');

interface Job {
  file: string;
  src: string;
  /** 只留这些动画 */
  anims: string[];
  /** 删掉这些节点（连同下面的网格） */
  drop?: string[];
  /** 减面比例和允许误差（相对模型尺寸） */
  ratio: number;
  error?: number;
  /** 这些节点下的小网格（枪）单独再减一刀：误差按它自己的尺寸算，所以要给大一点 */
  small?: { nodes: string[]; ratio: number; error: number };
}

const SOLDIER_GUNS_UNUSED = ['Knife_1', 'Knife_2', 'Revolver', 'Revolver_Small', 'ShortCannon', 'Shotgun', 'Shovel'];

const jobs: Job[] = [
  {
    file: 'soldier.glb',
    src: join(TOON, 'Characters/glTF/Character_Soldier.gltf'),
    anims: ['Idle', 'Idle_Shoot', 'Run', 'Run_Shoot', 'Death', 'HitReact'],
    drop: SOLDIER_GUNS_UNUSED,
    // 人群里一次要画几百个，面数压低（离镜头远，看不出来）
    ratio: 0.14,
    error: 0.06,
    small: { nodes: ['Pistol', 'SMG', 'AK', 'Sniper_2', 'GrenadeLauncher', 'Sniper', 'RocketLauncher'], ratio: 0.3, error: 0.15 },
  },
  { file: 'zombie.glb', src: join(ZOMBIE, 'Characters/glTF/Zombie_Basic.gltf'), anims: ['Run', 'Walk', 'Punch', 'Death', 'Idle'], ratio: 0.1, error: 0.06 },
  { file: 'zombie-runner.glb', src: join(ZOMBIE, 'Characters/glTF/Zombie_Ribcage.gltf'), anims: ['Run', 'Walk', 'Death', 'Idle'], ratio: 0.17, error: 0.06 },
  { file: 'zombie-fat.glb', src: join(ZOMBIE, 'Characters/glTF/Zombie_Chubby.gltf'), anims: ['Run', 'Walk', 'Punch', 'Death', 'Idle'], ratio: 0.13, error: 0.06 },
  { file: 'zombie-arm.glb', src: join(ZOMBIE, 'Characters/glTF/Zombie_Arm.gltf'), anims: ['Walk', 'Run', 'Punch', 'Run_Attack', 'Death', 'HitReact', 'Idle'], ratio: 0.45, error: 0.01 },
  { file: 'orc.glb', src: join(MONSTERS, 'Big/glTF/Orc.gltf'), anims: ['Walk', 'Run', 'Weapon', 'Punch', 'Death', 'HitReact', 'Idle'], ratio: 0.5, error: 0.01 },
  { file: 'blob.glb', src: join(MONSTERS, 'Blob/glTF/GreenSpikyBlob.gltf'), anims: ['Walk', 'Idle', 'Bite_Front', 'Death', 'HitRecieve'], ratio: 0.5, error: 0.01 },
];

/** 道具：每个一个具名根节点，合进一个文件 */
const props: { name: string; src: string; ratio: number }[] = [
  { name: 'Crate', src: join(TOON, 'Environment/glTF/Crate.gltf'), ratio: 1 },
  { name: 'Barrel', src: join(TOON, 'Environment/glTF/ExplodingBarrel.gltf'), ratio: 1 },
  { name: 'Tires', src: join(TOON, 'Environment/glTF/Debris_Tires.gltf'), ratio: 0.4 },
  { name: 'Sandbags', src: join(TOON, 'Environment/glTF/SackTrench.gltf'), ratio: 1 },
  { name: 'Chest', src: join(ZOMBIE, 'Environment/glTF/Chest.gltf'), ratio: 0.35 },
  { name: 'Barrier', src: join(ZOMBIE, 'Environment/glTF/TrafficBarrier_1.gltf'), ratio: 0.6 },
];

async function main() {
  await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

  const finish = async (doc: Document, ratio: number, error: number) => {
    await doc.transform(
      prune(),
      dedup(),
      weld(),
      ...(ratio < 1 ? [simplify({ simplifier: MeshoptSimplifier, ratio, error })] : []),
      resample(),
      prune(),
      unpartition(),
      meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
    );
  };
  const tris = (doc: Document) =>
    doc
      .getRoot()
      .listMeshes()
      .reduce((s, m) => s + m.listPrimitives().reduce((t, p) => t + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION')!.getCount()) / 3, 0), 0);

  for (const job of jobs) {
    const doc = await io.read(job.src);
    const root = doc.getRoot();
    for (const a of root.listAnimations()) if (!job.anims.includes(a.getName())) a.dispose();
    for (const n of root.listNodes()) if (job.drop?.includes(n.getName())) n.dispose();
    const before = tris(doc);
    if (job.small) {
      await doc.transform(weld());
      for (const n of root.listNodes()) {
        if (!job.small.nodes.includes(n.getName())) continue;
        for (const prim of n.getMesh()?.listPrimitives() ?? []) simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: job.small.ratio, error: job.small.error });
      }
    }
    await finish(doc, job.ratio, job.error ?? 0.01);
    const path = join(out, job.file);
    await io.write(path, doc);
    console.log(`${job.file.padEnd(18)} ${Math.round(before)} → ${Math.round(tris(doc))} 三角形  ${(statSync(path).size / 1024).toFixed(0)} KB  动画 ${root.listAnimations().map((a) => a.getName()).join(',')}`);
  }

  const doc = new Document();
  doc.createScene('props');
  for (const p of props) {
    const part = await io.read(p.src);
    if (p.ratio < 1) await part.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: p.ratio, error: 0.01 }));
    mergeDocuments(doc, part);
    const scenes = doc.getRoot().listScenes();
    const added = scenes[scenes.length - 1];
    const holder = doc.createNode(p.name);
    for (const n of added.listChildren()) holder.addChild(n);
    scenes[0].addChild(holder);
    added.dispose();
  }
  await finish(doc, 1, 0);
  const path = join(out, 'props.glb');
  await io.write(path, doc);
  console.log(`props.glb          ${Math.round(tris(doc))} 三角形  ${(statSync(path).size / 1024).toFixed(0)} KB`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
