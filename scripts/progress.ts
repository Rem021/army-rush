// 局外升级的成长模拟：从零升级开始打防线，输了拿金币升级再打，看每关要打几次。
// 用法：npm run sim:progress -- [关卡数=10] [玩家数=4] [失误率=0.12] [玩家号起=0] [balanced|volley|breaker] [greedy|combat]
// 每名玩家/每关/第几次尝试独立定种子，前一关通关次数不会改变下一关随机序列。
import { Bot } from '../src/game/bot';
import { UPGRADES, upgradeEffects } from '../src/game/config';
import { clearGems, levelReward, recommendUpgrade, spendGreedy, type UpgradeLevels } from '../src/game/economy';
import { generateDefense } from '../src/game/level';
import { mulberry32 } from '../src/game/rng';
import { applyTactic, TACTICS } from '../src/game/tactics';
import { World } from '../src/game/world';

const maxLevel = Number(process.argv[2] ?? 10);
const players = Number(process.argv[3] ?? 4);
const mistake = Number(process.argv[4] ?? 0.12);
const first = Number(process.argv[5] ?? 0);
const tactic = TACTICS.find((t) => t.id === process.argv[6])?.id ?? 'balanced';
const policy = process.argv[7] ?? 'greedy';

function play(L: number, up: UpgradeLevels, seed: number) {
  const w = new World(generateDefense(L), applyTactic({ ...upgradeEffects(up), seed }, tactic));
  const bot = new Bot(mulberry32(seed * 7919 + 13), mistake);
  let peak = w.squad.count;
  while (w.state === 'run' && w.time < 400) {
    w.setTarget(bot.target(w));
    w.update(1 / 30);
    peak = Math.max(peak, w.squad.count);
    w.drainEvents();
  }
  return { w, peak };
}

const table: string[][] = [];
const peaks: number[][] = [];
for (let p = first; p < first + players; p++) {
  const up: UpgradeLevels = { soldiers: 0, damage: 0, rate: 0, income: 0, agility: 0 };
  const wallet = { coins: 0, gems: 0 };
  for (let L = 1; L <= maxLevel; L++) {
    let tries = 0;
    let won = false;
    const progress: number[] = [];
    while (!won && tries < 12) {
      tries++;
      const { w, peak } = play(L, up, 100000 * (p + 1) + L * 100 + tries);
      (peaks[L - 1] ??= []).push(peak);
      won = w.state === 'won';
      progress.push(Math.round(w.progress * 100));
      wallet.coins += levelReward(L, won, w.coins, upgradeEffects(up).coinMult, w.progress).total;
      wallet.gems += w.gems + (won ? clearGems(L) : 0);
      if (policy === 'combat') {
        // 第二种购买习惯：只买 UI 推荐的战斗升级，攒钱等下一次提升。
        for (;;) {
          const id = recommendUpgrade(wallet, up);
          if (!id) break;
          const u = UPGRADES.find((u) => u.id === id)!;
          wallet[u.currency] -= u.cost(up[id]);
          up[id]++;
        }
      } else spendGreedy(wallet, up);
    }
    // 机器可读的一行，给 work/agg.ts 汇总分布用
    console.log(`#${L},${tries},${won ? 1 : 0},${up.soldiers},${up.damage},${up.rate},${up.income},${up.agility}`);
    (table[L - 1] ??= []).push(`${won ? tries : '✗'}次(${progress.join('/')}) 兵${up.soldiers}火${up.damage}速${up.rate}金${up.income}机${up.agility}`);
    if (!won) break;
  }
}
console.log(`战术 ${tactic}，购买策略 ${policy}。失误率 ${mistake}，玩家 ${first + 1}–${first + players}。每格：第几次过关(每次打到的进度%) 过关后升级等级`);
table.forEach((row, i) => console.log(`第 ${String(i + 1).padStart(2)} 关  ${row.join('  |  ')}`));
peaks.forEach((values, i) => {
  const sorted = [...values].sort((a, b) => a - b);
  console.log(`@peak,${i + 1},${sorted[Math.floor(sorted.length / 2)]},${sorted[Math.ceil(sorted.length * 0.9) - 1]},${sorted.at(-1)}`);
});
