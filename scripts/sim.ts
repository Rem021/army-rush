// 平衡脚本：用自动驾驶跑关卡，看胜率、到 Boss 时的人数和打 Boss 用时。
// 用法：npm run sim -- [模式=defense|campaign|endless] [最大关卡=12] [每关局数=6]
import { Bot } from '../src/game/bot';
import { upgradeEffects } from '../src/game/config';
import { generateCampaign, generateDefense, generateEndlessStart, type LevelSpec } from '../src/game/level';
import { mulberry32 } from '../src/game/rng';
import { World, type WorldOptions } from '../src/game/world';

const mode = process.argv[2] ?? 'campaign';
const maxLevel = Number(process.argv[3] ?? 12);
const runs = Number(process.argv[4] ?? 6);

interface Profile {
  name: string;
  /** 每关对应的升级等级，模拟玩家边玩边买 */
  upgrades: (L: number) => { soldiers: number; damage: number; rate: number };
  mistake: number;
}

const profiles: Profile[] = [
  { name: '不升级', upgrades: () => ({ soldiers: 0, damage: 0, rate: 0 }), mistake: 0.15 },
  {
    name: '正常升级',
    upgrades: (L) => ({ soldiers: Math.floor(L * 0.6), damage: Math.floor(L * 0.7), rate: Math.floor(L * 0.4) }),
    mistake: 0.15,
  },
];

/** 每种段落结束时：实际人数 / 估算人数（几何平均），用来校准估算模型 */
const accuracy = new Map<string, { logSum: number; n: number }>();

/** 每种段落造成的损失比例，找出过难的段落 */
const blame = new Map<string, { lost: number; entered: number; n: number }>();

function segAt(spec: LevelSpec, d: number): string {
  let seg = 'opening';
  for (const e of spec.estimates) if (e.d <= d) seg = e.seg.replace(/[+-]$/, '');
  if (Number.isFinite(spec.length) && d >= spec.length - 80) seg = 'finale';
  return seg;
}

function play(spec: LevelSpec, opts: WorldOptions, seed: number, mistake: number, limit = 300) {
  const w = new World(spec, { ...opts, seed });
  const bot = new Bot(mulberry32(seed * 101 + 3), mistake);
  let bossCount = 0;
  let bossStart = 0;
  let maxCount = 0;
  const dt = 1 / 30;
  let t = 0;
  let lastSeg = '';
  let estIdx = 0;
  while (w.state === 'run' || w.state === 'boss') {
    w.setTarget(bot.target(w));
    w.update(dt);
    t += dt;
    maxCount = Math.max(maxCount, w.squad.count);
    const seg = w.state === 'boss' ? 'boss' : segAt(spec, w.squad.d);
    const before = w.squad.count;
    for (const e of w.drainEvents()) {
      if (e.type === 'soldierDie') {
        const b = blame.get(seg) ?? { lost: 0, entered: 0, n: 0 };
        b.lost += 1;
        blame.set(seg, b);
      }
      if (e.type === 'bossStart') {
        bossCount = w.squad.count;
        bossStart = t;
      }
    }
    // 走过一个段落的结尾时，对比实际人数和估算
    const ests = spec.estimates;
    while (estIdx < ests.length && w.state === 'run') {
      const endD = estIdx + 1 < ests.length ? ests[estIdx + 1].d : Number.isFinite(spec.length) ? spec.length - 80 : Infinity;
      if (w.squad.d < endD) break;
      const name = ests[estIdx].seg.replace(/[+-]$/, '');
      const a = accuracy.get(name) ?? { logSum: 0, n: 0 };
      a.logSum += Math.log(Math.max(1, w.squad.count) / Math.max(1, ests[estIdx].E));
      a.n += 1;
      accuracy.set(name, a);
      estIdx++;
    }
    if (seg !== lastSeg) {
      const b = blame.get(seg) ?? { lost: 0, entered: 0, n: 0 };
      b.entered += before;
      b.n += 1;
      blame.set(seg, b);
      lastSeg = seg;
    }
    if (t > limit) break;
  }
  return { w, t, bossCount, bossTime: bossStart ? t - bossStart : 0, maxCount };
}

const pad = (v: string | number, n: number) => String(v).padStart(n);

function campaign() {
  for (const p of profiles) {
    console.log(`\n== 冲锋 · ${p.name} ==`);
    console.log('关卡  胜率   到Boss人数(预估)  Boss血量    打Boss秒  最多人数  武器  金币  总时长  输因');
    for (let L = 1; L <= maxLevel; L++) {
      const up = p.upgrades(L);
      const spec = generateCampaign(L);
      const opts = upgradeEffects(up);
      const rs = Array.from({ length: runs }, (_, i) => play(spec, opts, i + 1, p.mistake));
      const avg = (f: (r: (typeof rs)[number]) => number) => rs.reduce((s, r) => s + f(r), 0) / rs.length;
      const wins = rs.filter((r) => r.w.state === 'won').length;
      const reasons = rs
        .filter((r) => r.w.state !== 'won')
        .map((r) => (r.bossCount ? 'B' : `${Math.round(r.w.progress * 100)}%`))
        .join(',');
      const bossHp = spec.bosses.map((b) => `${b.kind[0]}${b.hp}`).join('+');
      console.log(
        [
          pad(L, 4),
          pad(`${Math.round((wins / runs) * 100)}%`, 6),
          pad(`${Math.round(avg((r) => r.bossCount))}(${spec.expected})`, 15),
          pad(bossHp, 12),
          pad(avg((r) => r.bossTime).toFixed(1), 8),
          pad(Math.round(avg((r) => r.maxCount)), 9),
          pad(avg((r) => r.w.squad.tier).toFixed(1), 5),
          pad(Math.round(avg((r) => r.w.coins)), 5),
          pad(avg((r) => r.t).toFixed(0), 6),
          '  ' + reasons,
        ].join(' '),
      );
    }
  }
}

function endless() {
  for (const p of profiles) {
    const up = p.upgrades(5);
    const dist: number[] = [];
    for (let run = 1; run <= runs; run++) {
      const start = generateEndlessStart(900 + run);
      const r = play(start.spec, { ...upgradeEffects(up), endless: { gen: start.gen, until: start.until } }, run, p.mistake, 600);
      dist.push(Math.round(r.w.squad.d));
    }
    console.log(`无尽 · ${p.name}（按第 5 关的升级）跑了：`, dist.join(', '));
  }
}

function defense() {
  for (const p of profiles) {
    console.log(`\n== 防线 · ${p.name} ==`);
    console.log('关卡  胜率   最多人数  结束人数  武器  用时  输在');
    for (let L = 1; L <= maxLevel; L++) {
      const up = p.upgrades(L);
      const spec = generateDefense(L);
      const opts = upgradeEffects(up);
      const rs = Array.from({ length: runs }, (_, i) => play(spec, opts, i + 1, p.mistake, 400));
      const avg = (f: (r: (typeof rs)[number]) => number) => rs.reduce((s, r) => s + f(r), 0) / rs.length;
      const wins = rs.filter((r) => r.w.state === 'won').length;
      const reasons = rs.filter((r) => r.w.state !== 'won').map((r) => `${Math.round(r.w.progress * 100)}%`).join(',');
      console.log(
        [
          pad(L, 4),
          pad(`${Math.round((wins / runs) * 100)}%`, 6),
          pad(Math.round(avg((r) => r.maxCount)), 9),
          pad(Math.round(avg((r) => r.w.squad.count)), 9),
          pad(avg((r) => r.w.squad.tier).toFixed(1), 5),
          pad(avg((r) => r.t).toFixed(0), 5),
          '  ' + reasons,
        ].join(' '),
      );
    }
  }
}

if (mode === 'defense') defense();
else if (mode === 'endless') endless();
else campaign();

console.log('\n估算准确度（段落结束时 实际/估算，几何平均）：');
for (const [seg, a] of [...accuracy].sort((x, y) => x[1].logSum / x[1].n - y[1].logSum / y[1].n)) {
  console.log(`  ${seg.padEnd(10)} ×${Math.exp(a.logSum / a.n).toFixed(2)}  （${a.n} 次）`);
}
console.log('\n各段落累计损兵 / 入段兵力（有增援时可超过 100%）：');
for (const [seg, b] of [...blame].sort((a, c) => c[1].lost / Math.max(1, c[1].entered) - a[1].lost / Math.max(1, a[1].entered))) {
  console.log(`  ${seg.padEnd(10)} ${((b.lost / Math.max(1, b.entered)) * 100).toFixed(0).padStart(4)}%  （${b.n} 次）`);
}
