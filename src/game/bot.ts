import { BOSS_STRIKE_HALF, HALVES, LANES, THROW_RADIUS, WEAPONS, soldierDps } from './config';
import type { Rng } from './rng';
import type { Gate, World } from './world';

const THREAT: Record<string, number> = { walker: 1, runner: 1, brute: 4, exploder: 5, giant: 18 };

/**
 * 自动驾驶：给几个候选站位打分（前方门的收益、尸潮威胁、陷阱、武器桶），挑最高的。
 * Boss 战优先打尸巢，再打血少的，并躲开投弹红圈。
 * mistake 是每次做决定时随便选的概率，用来模拟一般玩家。平衡脚本、测试和 ?autoplay 用。
 */
export class Bot {
  private choice: number | null = null;
  private choiceUntil = -1;

  constructor(
    private readonly rng: Rng,
    private readonly mistake = 0,
  ) {}

  target(w: World): number {
    // 红圈里的兵全死，看到就躲（防线里就是换到另一条道）
    if (w.defense) return this.dodge(w, this.defenseTarget(w));
    return w.state === 'boss' ? this.dodge(w, this.bossTarget(w)) : this.runTarget(w);
  }

  /** 防线：Boss 进射程就集火；放出来的好门快到了就站门道；尸潮压得太近就去清；其余时间打门道的障碍和门 */
  private defenseTarget(w: World): number {
    const def = w.defense!;
    const sq = w.squad;
    const gateX = def.gateSide * HALVES[1];
    const enemyX = -gateX;
    const count = Math.max(1, sq.count);
    if (this.mistake > 0 && this.choice !== null && w.time < this.choiceUntil) return this.choice;
    if (this.mistake > 0 && this.rng() < this.mistake * 0.05) {
      this.choice = this.rng() < 0.5 ? gateX : enemyX;
      this.choiceUntil = w.time + 1.5;
      return this.choice;
    }
    let gate: Gate | null = null;
    for (const g of w.gates) if (!g.consumed && g.d > sq.d && (!gate || g.d < gate.d)) gate = g;
    const blocker = w.barrels.find((b) => b.alive && b.block && b.armed);
    const released = gate && (!blocker || gate.d < blocker.d);
    const arrive = gate && released ? (gate.d - sq.d) / def.conveyor : Infinity;
    const st = { n: count, tier: sq.tier, rate: sq.rate };
    if (gate) this.applyGate(gate, st);
    const good = gate && this.power(st.n, st.tier, st.rate) > this.power(count, sq.tier, sq.rate);
    const boss = w.bosses.find((b) => b.alive && b.active && b.d < sq.d + 44);
    if (boss && !(good && arrive < 1.0)) return boss.x;
    if (arrive < 1.4) return good ? gateX : enemyX;
    let threat = 0;
    for (const z of w.zombies) if (z.alive && z.d < sq.d + 20) threat += THREAT[z.kind] ?? 1;
    if (threat > count * 0.15 + 2) return enemyX;
    return gateX;
  }

  /** 按地面预警选择安全站位，同时尽量保持原来的攻击目标。 */
  private dodge(w: World, x: number): number {
    const sq = w.squad;
    const lo = w.lo + w.halfWidth;
    const hi = w.hi - w.halfWidth;
    const clamp = (v: number) => Math.max(lo, Math.min(hi, v));
    const threats = [
      ...w.projectiles.filter((p) => p.T - p.t <= 1.1).map((p) => ({ x: p.tx, r: THROW_RADIUS + w.halfWidth + 0.2 })),
      ...w.bosses.filter((b) => b.alive && b.active && b.attacking).map((b) => ({ x: b.attackX, r: BOSS_STRIKE_HALF + w.halfWidth + 0.2 })),
    ];
    if (!threats.length) return clamp(x);
    const candidates = [clamp(x), lo, hi, ...threats.flatMap((t) => [clamp(t.x - t.r), clamp(t.x + t.r)])];
    return candidates.reduce((best, v) => {
      const score = (at: number) =>
        threats.reduce((s, t) => s + (Math.abs(at - t.x) < t.r ? 100 + (t.r - Math.abs(at - t.x)) * 10 : 0), 0) +
        Math.abs(at - x) + Math.abs(at - sq.x) * 0.1;
      return score(v) < score(best) ? v : best;
    }, candidates[0]);
  }

  private bossTarget(w: World): number {
    const sq = w.squad;
    const alive = w.bosses.filter((b) => b.alive);
    let x = sq.x;
    if (alive.length) {
      const focus = alive.find((b) => b.kind === 'hive') ?? alive.reduce((a, b) => (b.hp < a.hp ? b : a));
      x = focus.x;
    }
    return x;
  }

  private runTarget(w: World): number {
    const sq = w.squad;
    if (this.choice !== null && sq.d < this.choiceUntil) return this.choice;
    let candidates: number[];
    let scoreFn: (x: number) => number;
    const wallAhead = w.walls.find((wl) => wl.d0 > sq.d && wl.d0 < sq.d + 30);
    const gateBeforeWall = wallAhead && w.gates.some((g) => !g.consumed && g.d > sq.d && g.d < wallAhead.d0);
    if (wallAhead && !gateBeforeWall && sq.side === 0) {
      // 进墙前：把墙里每一边的门、尸潮、桶都算一遍，选一边
      candidates = [...HALVES];
      scoreFn = (x) => this.sideScore(w, x, wallAhead.d0, wallAhead.d1);
    } else {
      candidates = [...LANES, ...HALVES].filter((x) => x >= w.lo - 0.01 && x <= w.hi + 0.01);
      if (candidates.length === 0) candidates = [(w.lo + w.hi) / 2];
      scoreFn = (x) => this.score(w, x);
    }
    const scores = candidates.map(scoreFn);
    let best = 0;
    for (let i = 1; i < scores.length; i++) if (scores[i] > scores[best]) best = i;
    if (this.mistake > 0 && this.rng() < this.mistake) best = Math.floor(this.rng() * candidates.length);
    this.choice = candidates[best];
    this.choiceUntil = sq.d + 3;
    return this.choice;
  }

  private power(n: number, tier: number, rate: number): number {
    return Math.max(0.3, n) * soldierDps(tier) * rate;
  }

  /** 一扇门对（人数、武器、射速）的影响；负门假设能打回来几点 */
  private applyGate(g: Gate, st: { n: number; tier: number; rate: number }) {
    if (g.kind === 'add') st.n += g.value + (g.value < 0 ? Math.min(-g.value, 3) : 1);
    else if (g.kind === 'mul') st.n *= g.value;
    else if (g.kind === 'weapon') st.tier = Math.max(st.tier, Math.min(WEAPONS.length - 1, g.value));
    else st.rate *= 1 + g.value / 100;
  }

  private threat(w: World, x: number, d0: number, d1: number, band: number): number {
    let threat = 0;
    for (const z of w.zombies) {
      if (!z.alive || z.d < d0 || z.d > d1) continue;
      if (Math.abs(z.x - x) < band) threat += THREAT[z.kind] ?? 1;
    }
    return threat;
  }

  private score(w: World, x: number): number {
    const sq = w.squad;
    const count = Math.max(1, sq.count);
    const st = { n: count, tier: sq.tier, rate: sq.rate };
    // 只看最近一组门
    let firstD = Infinity;
    for (const g of w.gates) if (!g.consumed && g.d > sq.d && g.d < sq.d + 46 && g.d < firstD) firstD = g.d;
    for (const g of w.gates) {
      if (g.consumed || Math.abs(g.d - firstD) > 0.5 || x < g.x0 || x > g.x1) continue;
      this.applyGate(g, st);
    }
    if (st.n <= 0) return -100;
    let score = Math.log(this.power(st.n, st.tier, st.rate) / this.power(count, sq.tier, sq.rate)) * 3;
    // 护送时躲开尸潮等于放它们去撞车，所以几乎不躲
    score -= (this.threat(w, x, sq.d, sq.d + 32, w.halfWidth + 1.5) / count) * 1.2;
    for (const h of w.hazards) {
      if (h.d1 < sq.d || h.d0 > sq.d + 26) continue;
      if (x + w.halfWidth > h.x0 && x - w.halfWidth < h.x1) score -= 0.6;
    }
    score += this.barrelScore(w, x, sq.d + 6, sq.d + 40);
    return score;
  }

  private barrelScore(w: World, x: number, d0: number, d1: number): number {
    let score = 0;
    for (const b of w.barrels) {
      if (!b.alive || b.d < d0 || b.d > d1 || Math.abs(b.x - x) > 1.8) continue;
      if (b.reward.kind === 'weapon' && b.reward.tier > w.squad.tier) score += 0.5;
      else if (b.reward.kind === 'soldiers') score += 0.2;
      else if (b.reward.kind === 'airstrike') score += 0.1;
    }
    return score;
  }

  /** 隔离墙一侧整段的收益 */
  private sideScore(w: World, x: number, d0: number, d1: number): number {
    const sq = w.squad;
    const count = Math.max(1, sq.count);
    const st = { n: count, tier: sq.tier, rate: sq.rate };
    const side = Math.sign(x);
    const gates = w.gates.filter((g) => !g.consumed && g.d >= d0 && g.d <= d1 && Math.sign(g.x0 + g.x1) === side).sort((a, b) => a.d - b.d);
    for (const g of gates) this.applyGate(g, st);
    const threat = this.threat(w, x, d0 - 6, d1, 3);
    st.n -= threat * 0.35;
    if (st.n <= 0) return -100;
    return Math.log(this.power(st.n, st.tier, st.rate) / this.power(count, sq.tier, sq.rate)) * 3 + this.barrelScore(w, x, d0, d1);
  }
}

/** 兼容旧调用：一次性打分 */
export function botTarget(w: World, rng: Rng, mistake = 0): number {
  return new Bot(rng, mistake).target(w);
}
