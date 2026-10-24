import type { LevelSpec, SpawnSpec } from './level';
import type { WorldOptions } from './world';

/** 参考图的四列布局和独立预算，不改变主线升级。 */
export const CARNAGE_OPTIONS: WorldOptions = {
  startSoldiers: 36, startTier: 4, damageMult: 2.4, rateMult: 1.5,
  ammo: 1, steerMult: 1.3, seed: 3686,
};
export const CARNAGE_LANES = { recruit: -4.7, horde: -2, ammo: 1.55, rockets: 4.35 };

export function generateCarnage(): LevelSpec {
  const spawns: SpawnSpec[] = [];
  for (let t = 4; t < 90; t += 4) spawns.push({ t, wave: 90 + Math.floor(t / 15) * 18 });
  for (const [t, hp] of [[0, 20000], [30, 26000], [60, 32000], [90, 42000]] as const) {
    spawns.push({ t, boss: { kind: 'brute', x: -2, hp } });
  }
  const gates: LevelSpec['gates'] = [];
  const barrels: LevelSpec['barrels'] = [];
  for (let i = 0; i < 180; i++) {
    gates.push({ kind: 'add', carnage: 'recruit', x0: -5.35, x1: -4.05,
      d: 10 + i * 1.5, value: 1, group: i });
    if (i < 90) gates.push({ kind: 'add', carnage: 'ammo', x0: 0.2, x1: 2.85,
      d: 24 + i * 3.4, value: 99, group: 1000 + i });
    if (i < 80) barrels.push({ x: 4.35, d: 20 + i * 3, r: 0.85,
      hp: 20, block: true, look: 'armor', carnage: 'pod', reward: { kind: 'airstrike' } });
  }
  barrels.push({ x: 1.55, d: 20, r: 1.25, hp: 504, block: true,
    look: 'armor', carnage: 'battery', reward: { kind: 'airstrike' } });
  const zombies: LevelSpec['zombies'] = [];
  for (let i = 0; i < 420; i++) zombies.push({ kind: 'walker',
    x: -3.7 + (i % 10) * 0.35, d: 19 + Math.floor(i / 10) * 0.54, hp: 9 });
  spawns.sort((a, b) => a.t - b.t);
  return { mode: 'carnage', level: 30, theme: 0, length: Infinity, gates, barrels,
    zombies, walls: [], hazards: [], banners: [], bosses: [],
    defense: { conveyor: 3.4, spawnD: 48, stopD: 18, gateSide: 1, duration: 90, spawns },
    expected: 240, estimates: [] };
}
