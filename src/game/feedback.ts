/** 只在本机本局统计，用于解释损兵，不上传玩家行为。 */
export type LossCause = 'zombie' | 'giant' | 'explosion' | 'bomb' | 'boss' | 'hazard' | 'barrel' | 'gate';

export const LOSS_INFO: Record<LossCause, { name: string; tip: string }> = {
  zombie: { name: '尸潮接触', tip: '尸潮接近桥头时先换道清怪，再回来拆补给。' },
  giant: { name: '巨尸碾压', tip: '巨尸贴身会持续碾人；提前集火，靠近时横移拉开。' },
  explosion: { name: '自爆尸爆炸', tip: '提前打爆自爆尸可连锁清怪；别等它靠近队伍。' },
  bomb: { name: '油桶爆炸', tip: '油桶落地前让整队离开红圈，外侧士兵也要移出。' },
  boss: { name: 'Boss 砸击', tip: '红色危险带锁定后横移，连击结束的停顿再回来集火。' },
  hazard: { name: '锯片 / 地刺', tip: '提早选路，让整个阵型绕开陷阱；不要只看队伍中心。' },
  barrel: { name: '撞上障碍', tip: '障碍来不及打破时绕开，别用士兵硬撞。' },
  gate: { name: '减员门', tip: '红门可射成正数；来不及转正就选另一条路。' },
};

export class CombatStats {
  readonly losses: Record<LossCause, number> = { zombie: 0, giant: 0, explosion: 0, bomb: 0, boss: 0, hazard: 0, barrel: 0, gate: 0 };
  lastLoss: LossCause | null = null;
  gatesTaken = 0;
  gatesMissed = 0;
  supplies = 0;
  dodges = 0;

  lose(cause: LossCause, count: number) {
    if (count <= 0) return;
    this.losses[cause] += count;
    this.lastLoss = cause;
  }

  get mainLoss(): LossCause | null {
    return (Object.keys(this.losses) as LossCause[]).filter((k) => this.losses[k] > 0)
      .sort((a, b) => this.losses[b] - this.losses[a])[0] ?? null;
  }

  advice(won: boolean, defense = false): string {
    const cause = won ? this.mainLoss : this.lastLoss;
    const tip = cause === 'zombie' && !defense ? '尸潮贴近前排时先集火或换到空道，别为增兵门撞进怪群。' : cause ? LOSS_INFO[cause].tip : '';
    if (cause) return `${won ? '下一次可以更稳' : `最后损兵：${LOSS_INFO[cause].name}`}。${tip}`;
    if (this.gatesMissed) return '有增益门从身边滑过；障碍打破后及时回门道接住补给。';
    return '子弹只打正前方；数字门按命中次数成长，障碍与敌人按伤害掉血。';
  }
}
