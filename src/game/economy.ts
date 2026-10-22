import { UPGRADES, WEAPONS, ZOMBIES, soldierDps, upgradeEffects, type UpgradeId, type ZombieKind } from './config';

/**
 * 金币经济（参考 Kongregate《The Math of Idle Games》、Royal Match/SayGames 的关卡节奏数据）：
 *
 * - 一局里的金币都在战斗中实时累计，顶栏看到的就是能拿到的：击杀 + Boss 赏金；赢了再加通关奖励。
 * - 赢一关大约：击杀 40–50%、Boss 赏金 20–30%、通关奖励 25–35%。输了保留已经拿到的（按进度，
 *   大约是赢的 40–60%），所以输一两把就够买一次像样的升级。
 * - 所有数额按关卡指数涨（ECON.growth），和升级价格的指数增长对上；Boss 关（每 5 关）赏金翻倍。
 * - 金币升级是加法倍数、封顶约 ×2，价格比战斗升级陡，避免“先点满金币”成为唯一解。
 */
export const ECON = {
  /** 每过一关，所有金币数额乘这么多 */
  growth: 1.22,
  /** 击杀金币 = 丧尸基础金币 × 这个系数 */
  kill: 0.6,
  /** 中途 Boss 赏金 */
  midBoss: 30,
  /** 最终 Boss 赏金（双 Boss 各拿 60%） */
  finalBoss: 90,
  /** 通关奖励 */
  clear: 110,
  /** Boss 关赏金和通关奖励的倍数 */
  bossLevel: 2,
  /** 新手奖励：前几关输了额外给（第 1 关输一把就能买到第一批升级） */
  rookie: [90, 70, 45, 20],
  /** 正常败退按到达进度给补给，最多为通关奖励的 35%；主动撤退不领取。 */
  progressSupply: 0.35,
};

/** 关卡越往后，金币数额越大 */
export function coinScale(level: number): number {
  return Math.pow(ECON.growth, Math.max(0, level - 1));
}

/** 每 5 关一个 Boss 关（双 Boss、更难、奖励翻倍） */
export function isBossLevel(level: number): boolean {
  return level >= 5 && level % 5 === 0;
}

/** Boss 关后面那一关稍微松一点，让玩家喘口气 */
export function isRestLevel(level: number): boolean {
  return level > 5 && level % 5 === 1;
}

/** 打死一只丧尸给多少金币（还没乘金币升级倍数） */
export function killCoins(kind: ZombieKind, level: number): number {
  return ZOMBIES[kind].coins * ECON.kill * coinScale(level);
}

/** 打死一个 Boss 的赏金（还没乘金币升级倍数） */
export function bossBounty(level: number, final: boolean, pair: boolean): number {
  const base = final ? ECON.finalBoss * (pair ? 0.6 : 1) : ECON.midBoss;
  return base * coinScale(level) * (isBossLevel(level) ? ECON.bossLevel : 1);
}

/** 通关奖励（还没乘金币升级倍数） */
export function clearBonus(level: number): number {
  return ECON.clear * coinScale(level) * (isBossLevel(level) ? ECON.bossLevel : 1);
}

/**
 * 结算：runCoins 是战斗里已经拿到的（击杀 + Boss 赏金，已经乘过金币倍数），
 * 赢了加通关奖励；失败按推进给补给，与前期新手奖励取较大值。
 */
export function levelReward(level: number, won: boolean, runCoins: number, coinMult = 1, progress = 0): { total: number; bonus: number } {
  const supply = clearBonus(level) * ECON.progressSupply * Math.max(0, Math.min(1, progress));
  const bonus = won ? clearBonus(level) : Math.max(ECON.rookie[level - 1] ?? 0, supply);
  const b = Math.round(bonus * coinMult);
  return { total: Math.floor(runCoins) + b, bonus: b };
}

/**
 * 钻石：稀有货币，只用来升兵力。只有最终 Boss 一定给 1 颗（Boss 关的两个各 1 颗，再加 1 颗通关钻石），
 * 其他全靠运气：中途 Boss 25%、巨尸 12%、胖尸 0.4%、自爆尸 0.2%，普通丧尸不掉。
 * 一关下来平均 1–2 颗，兵力升一级要攒好几关。
 */
export const GEMS = {
  finalBoss: 1,
  midBoss: 0.25,
  drop: { walker: 0, runner: 0, brute: 0.004, exploder: 0.002, giant: 0.12 } as Record<ZombieKind, number>,
};

/** 打死一个 Boss 掉几颗钻石；roll 是 [0,1) 的随机数（中途 Boss 靠运气） */
export function bossGems(final: boolean, roll: number): number {
  if (final) return GEMS.finalBoss;
  return roll < GEMS.midBoss ? 1 : 0;
}

/** 通关额外给的钻石：Boss 关 1 颗 */
export function clearGems(level: number): number {
  return isBossLevel(level) ? 1 : 0;
}

export type UpgradeLevels = Record<UpgradeId, number>;

export interface Wallet {
  coins: number;
  gems: number;
}

/** 自动驾驶和平衡脚本用的“玩家”花钱策略：钻石全买兵力；金币一直买当前最便宜的那项，直到买不起 */
export function spendGreedy(wallet: Wallet, levels: UpgradeLevels) {
  for (;;) {
    let best: (typeof UPGRADES)[number] | null = null;
    for (const u of UPGRADES) {
      if (levels[u.id] >= u.max) continue;
      const have = u.currency === 'gems' ? wallet.gems : wallet.coins;
      if (have < u.cost(levels[u.id])) continue;
      if (!best || (u.currency === 'gems' ? 0 : u.cost(levels[u.id])) < (best.currency === 'gems' ? 0 : best.cost(levels[best.id]))) best = u;
    }
    if (!best) return;
    if (best.currency === 'gems') wallet.gems -= best.cost(levels[best.id]);
    else wallet.coins -= best.cost(levels[best.id]);
    levels[best.id]++;
  }
}

/** 开局单目标直伤收益；穿透和溅射依赖敌人分布，另外说明，不伪装成固定 DPS。 */
export function upgradeGain(levels: UpgradeLevels, id: UpgradeId): { dps: number; gates: number; text: string } {
  const a = upgradeEffects(levels);
  const b = upgradeEffects({ ...levels, [id]: levels[id] + 1 });
  const power = (e: typeof a) => e.startSoldiers * soldierDps(e.startTier) * e.damageMult * e.rateMult;
  const shots = (e: typeof a) => e.startSoldiers * e.rateMult * WEAPONS[e.startTier].rate;
  const dps = power(b) / power(a) - 1;
  const gates = shots(b) / shots(a) - 1;
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  let text = id === 'income' ? `结算金币 +${pct(b.coinMult / a.coinMult - 1)}`
    : id === 'agility' ? `跟手速度 +${pct(b.steerMult / a.steerMult - 1)}${b.warnMult > a.warnMult ? '，油桶预警延长' : ''}`
    : `开局直伤 +${pct(dps)}${gates > 0 ? `，射门命中 +${pct(gates)}` : '；射门命中不变'}`;
  if (b.ammo > a.ammo) text += '；新弹种提升群体伤害';
  if (b.gateBonus > a.gateBonus) text += '；加人门收益提升';
  return { dps, gates, text };
}

/** 只比较买得起的战斗升级的边际直伤 / 成本，钻石和金币不混算。 */
export function recommendUpgrade(wallet: Wallet, levels: UpgradeLevels): UpgradeId | null {
  let best: (typeof UPGRADES)[number] | null = null;
  let bestScore = Infinity;
  for (const u of UPGRADES) {
    if (u.id === 'income' || u.id === 'agility') continue;
    const lvl = levels[u.id];
    if (lvl >= u.max) continue;
    const cost = u.cost(lvl);
    if (cost > (u.currency === 'gems' ? wallet.gems : wallet.coins)) continue;
    const score = u.currency === 'gems' ? 0 : cost / Math.max(0.0001, upgradeGain(levels, u.id).dps);
    if (score < bestScore) {
      bestScore = score;
      best = u;
    }
  }
  return best?.id ?? null;
}
