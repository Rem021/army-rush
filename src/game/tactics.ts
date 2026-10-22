import type { WorldOptions } from './world';

export type TacticId = 'balanced' | 'volley' | 'breaker';
export const TACTICS = [
  { id: 'balanced', name: '均衡', desc: '标准火力，适合先熟悉关卡', damage: 1, rate: 1, armor: 1 },
  { id: 'volley', name: '连射', desc: '射速 +20%，单发伤害 −20%；更快养门，持续伤害 −4%', damage: 0.8, rate: 1.2, armor: 1 },
  { id: 'breaker', name: '破甲', desc: '射速 −20%，单发伤害 +20%；对障碍、巨尸和 Boss 额外 +20% 伤害', damage: 1.2, rate: 0.8, armor: 1.2 },
] as const;

export function applyTactic(opts: WorldOptions, id: TacticId): WorldOptions {
  const t = TACTICS.find((v) => v.id === id) ?? TACTICS[0];
  return { ...opts, damageMult: opts.damageMult * t.damage, rateMult: opts.rateMult * t.rate, armorMult: t.armor };
}
