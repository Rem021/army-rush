import { BOSS_COMBO } from '../game/config';
import type { Boss } from '../game/world';

/** 贴脸攻击的模型在半段处命中，剩余半段留给收招。 */
export const BOSS_IMPACT = 0.5;

type Motion = { kind: 'windup' | 'release'; phase: number } | { kind: 'none'; phase: 0 };

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const easeOut = (n: number) => 1 - (1 - n) ** 2;
const smooth = (n: number) => n * n * (3 - 2 * n);

/** 用战斗状态驱动骨骼与备用模型，避免命中帧切回走路、余震串到下一击。 */
export function bossMotion(b: Boss): Motion {
  if (!b.alive || !b.active) return { kind: 'none', phase: 0 };
  if (b.attacking) {
    return { kind: 'windup', phase: BOSS_IMPACT * clamp01(b.windup) ** 1.25 };
  }
  if (b.recover > 0) {
    const previous = BOSS_COMBO[(b.comboStep + BOSS_COMBO.length - 1) % BOSS_COMBO.length];
    const elapsed = previous.recover - b.recover;
    // 末击的长停顿是玩家反击窗口，动作本身半秒左右就收完。
    const releaseTime = Math.min(previous.recover, 0.58);
    if (elapsed >= releaseTime) return { kind: 'none', phase: 0 };
    const progress = clamp01(elapsed / releaseTime);
    return { kind: 'release', phase: BOSS_IMPACT + (1 - BOSS_IMPACT) * easeOut(progress) };
  }
  // 投弹间隔的前半段先站稳，临出手再举桶；余震结束后才准备下一次。
  if (b.kind === 'thrower' && b.fightTime < 22) {
    if (b.slam > 0) return { kind: 'release', phase: BOSS_IMPACT + (1 - BOSS_IMPACT) * easeOut(clamp01(1 - b.slam)) };
    if (b.windup >= 0.5) return { kind: 'windup', phase: BOSS_IMPACT * clamp01((b.windup - 0.5) * 2) ** 1.25 };
  }
  return { kind: 'none', phase: 0 };
}

/** 无外部模型时的同一段预备、挥击、收势姿态，命中点两侧保持连续。 */
export function bossPose(phase: number) {
  if (phase <= BOSS_IMPACT) {
    const progress = clamp01(phase / BOSS_IMPACT);
    const raise = smooth(clamp01(progress / 0.78));
    const strike = smooth(clamp01((progress - 0.78) / 0.22));
    return { arm: -2.45 * raise + 2.95 * strike, body: 0.16 * raise - 0.4 * strike, lift: 0.1 * raise * (1 - strike) };
  }
  const settle = smooth(clamp01((phase - BOSS_IMPACT) / (1 - BOSS_IMPACT)));
  return { arm: 0.5 * (1 - settle), body: -0.24 * (1 - settle), lift: 0 };
}
