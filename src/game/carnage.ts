import { TRACK_HALF } from './config';
import type { LevelSpec, SpawnSpec } from './level';
import type { WorldOptions } from './world';

/** 独立固定预算；主线升级和试玩权限均不改变敌人血量。 */
export const CARNAGE_OPTIONS: WorldOptions = {
  startSoldiers: 48, startTier: 4, damageMult: 2.4, rateMult: 1.5,
  ammo: 3, steerMult: 1.3, seed: 3686,
};

export function generateCarnage(): LevelSpec {
  const spawns: SpawnSpec[] = [];
  for (let t = 1; t < 90; t += 4) spawns.push({ t, wave: 90 + Math.floor(t / 15) * 18 });
  for (const [t, kind, hp] of [[30, 'brute', 18000], [60, 'thrower', 24000], [90, 'hive', 42000]] as const) {
    spawns.push({ t, boss: { kind, x: -2.7, hp } });
  }
  const gates: LevelSpec['gates'] = [];
  const barrels: LevelSpec['barrels'] = [];
  // 右侧连续的大数字门，重甲火力箱卡住队列；左侧密集尸潮。
  for (let i = 0; i < 48; i++) {
    const d = 14 + i * 7;
    gates.push({ kind: i % 6 === 5 ? 'mul' : 'add', x0: 0.3, x1: TRACK_HALF,
      d, value: i % 6 === 5 ? 1.5 : [12, 24, 36, 48, 99][i % 6], group: i });
    if (i % 8 === 7) barrels.push({ x: 2.7, d: d + 3.5, r: 1.25,
      hp: 1500 + i * 70, block: true, look: 'armor', reward: { kind: 'airstrike' } });
  }
  spawns.sort((a, b) => a.t - b.t);
  return { mode: 'carnage', level: 30, theme: 1, length: Infinity, gates, barrels,
    zombies: [], walls: [{ d0: 12, d1: 100 }], hazards: [], banners: [], bosses: [],
    defense: { conveyor: 6.5, spawnD: 48, stopD: 22, gateSide: 1, duration: 90, spawns },
    expected: 240, estimates: [] };
}
