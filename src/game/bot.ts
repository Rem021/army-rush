import { CARNAGE_LANES } from './carnage';
import { BOSS_STRIKE_HALF, HALVES, LANES, THROW_RADIUS, WEAPONS, soldierDps } from './config';
import type { Rng } from './rng';
import type { Gate, World } from './world';

const THREAT: Record<string, number> = { walker: 1, runner: 1, brute: 4, exploder: 5, giant: 18 };
const RUN_CANDIDATES = [...LANES, ...HALVES] as const;

/**
 * 自动驾驶：给几个候选站位打分（前方门的收益、尸潮威胁、陷阱、武器桶），挑最高的。
 * Boss 战优先打尸巢，再打血少的，并躲开投弹红圈。
 * mistake 是每次做决定时随便选的概率，用来模拟一般玩家。平衡脚本、测试和 ?autoplay 用。
 */
export class Bot {
  private choice: number | null = null;
  private choiceUntil = -1;
  private readonly threats: { x: number; r: number }[] = [];
  private readonly candidates: number[] = [];
  private readonly scratchSt = { n: 0, tier: 0, rate: 1 };

  constructor(
    private readonly rng: Rng,
    private readonly mistake = 0,
  ) {}

  target(w: World): number {
    if (w.spec.mode === 'carnage') return this.dodge(w, this.carnageTarget(w));
    // 红圈里的兵全死，看到就躲（防线里就是换到另一条道）
    if (w.defense) return this.dodge(w, this.defenseTarget(w));
    return w.state === 'boss' ? this.dodge(w, this.bossTarget(w)) : this.runTarget(w);
  }

  /** 狂潮自动驾驶：兼顾左侧蓝门增兵、中央弹药牌、右侧火箭炮架拆解与终局巨人集火 */
  private carnageTarget(w: World): number {
    const boss = w.bosses.find((b) => b.alive && b.active);
    if (boss && w.time > 90) return boss.x;
    if (w.squad.count < 96) {
      for (let i = 0; i < w.gates.length; i++) {
        const g = w.gates[i];
        if (!g.consumed && g.carnage === 'recruit' && g.d > 0 && g.d < 10) return CARNAGE_LANES.recruit;
      }
    }
    if (w.carnage.shells < 80) {
      for (let i = 0; i < w.gates.length; i++) {
        const g = w.gates[i];
        if (!g.consumed && g.carnage === 'ammo' && g.d > 0 && g.d < 14) return CARNAGE_LANES.ammo;
      }
    }
    const battery = w.barrels.find((b) => b.alive && b.carnage === 'battery' && b.d <= 22);
    if (battery) return CARNAGE_LANES.ammo;
    if (w.carnage.batteries < 4 && Math.floor(w.time / 4) % 2 === 0) return CARNAGE_LANES.rockets;
    return boss ? boss.x : CARNAGE_LANES.horde;
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
    for (let i = 0; i < w.gates.length; i++) {
      const g = w.gates[i];
      if (!g.consumed && g.d > sq.d && (!gate || g.d < gate.d)) gate = g;
    }
    let blockerD = Infinity;
    for (let i = 0; i < w.barrels.length; i++) {
      const b = w.barrels[i];
      if (b.alive && b.block && b.armed && b.d < blockerD) blockerD = b.d;
    }
    const released = gate !== null && gate.d < blockerD;
    const arrive = gate && released ? (gate.d - sq.d) / def.conveyor : Infinity;
    const st = this.scratchSt;
    st.n = count;
    st.tier = sq.tier;
    st.rate = sq.rate;
    if (gate) this.applyGate(gate, st);
    const good = gate && this.power(st.n, st.tier, st.rate) > this.power(count, sq.tier, sq.rate);
    let bossX: number | null = null;
    for (let i = 0; i < w.bosses.length; i++) {
      const b = w.bosses[i];
      if (b.alive && b.active && b.d < sq.d + 44) {
        bossX = b.x;
        break;
      }
    }
    if (bossX !== null && !(good && arrive < 1.0)) return bossX;
    if (arrive < 1.4) return good ? gateX : enemyX;
    let threat = 0;
    for (let i = 0; i < w.zombies.length; i++) {
      const z = w.zombies[i];
      if (z.alive && z.d < sq.d + 20) threat += THREAT[z.kind] ?? 1;
    }
    if (threat > count * 0.15 + 2) return enemyX;
    return gateX;
  }

  /** 按地面预警选择安全站位，同时尽量保持原来的攻击目标。零热路径数组分配。 */
  private dodge(w: World, x: number): number {
    const sq = w.squad;
    const lo = w.lo + w.halfWidth;
    const hi = w.hi - w.halfWidth;
    const clamp = (v: number) => (lo <= hi ? Math.max(lo, Math.min(hi, v)) : (w.lo + w.hi) * 0.5);

    let threatCount = 0;
    const projPad = THROW_RADIUS + w.halfWidth + 0.2;
    for (let i = 0; i < w.projectiles.length; i++) {
      const p = w.projectiles[i];
      if (p.T - p.t <= 1.1) {
        const slot = this.threats[threatCount] ?? (this.threats[threatCount] = { x: 0, r: 0 });
        slot.x = p.tx;
        slot.r = projPad;
        threatCount++;
      }
    }
    const strikePad = BOSS_STRIKE_HALF + w.halfWidth + 0.2;
    for (let i = 0; i < w.bosses.length; i++) {
      const b = w.bosses[i];
      if (b.alive && b.active && b.attacking) {
        const slot = this.threats[threatCount] ?? (this.threats[threatCount] = { x: 0, r: 0 });
        slot.x = b.attackX;
        slot.r = strikePad;
        threatCount++;
      }
    }
    if (threatCount === 0) return clamp(x);

    const cands = this.candidates;
    cands.length = 0;
    cands.push(clamp(x), lo, hi);
    for (let i = 0; i < threatCount; i++) {
      const t = this.threats[i];
      cands.push(clamp(t.x - t.r), clamp(t.x + t.r));
    }

    const evalAt = (at: number) => {
      let s = Math.abs(at - x) + Math.abs(at - sq.x) * 0.1;
      for (let i = 0; i < threatCount; i++) {
        const t = this.threats[i];
        const dx = Math.abs(at - t.x);
        if (dx < t.r) s += 100 + (t.r - dx) * 10;
      }
      return s;
    };

    let best = cands[0];
    let bestScore = evalAt(best);
    for (let i = 1; i < cands.length; i++) {
      const v = cands[i];
      const sc = evalAt(v);
      if (sc < bestScore) {
        bestScore = sc;
        best = v;
      }
    }
    return best;
  }

  private bossTarget(w: World): number {
    const sq = w.squad;
    let hiveX: number | null = null;
    let lowBossX: number | null = null;
    let lowHp = Infinity;
    for (let i = 0; i < w.bosses.length; i++) {
      const b = w.bosses[i];
      if (!b.alive) continue;
      if (b.kind === 'hive' && hiveX === null) hiveX = b.x;
      if (b.hp < lowHp) {
        lowHp = b.hp;
        lowBossX = b.x;
      }
    }
    return hiveX ?? lowBossX ?? sq.x;
  }

  private runTarget(w: World): number {
    const sq = w.squad;
    if (this.choice !== null && sq.d < this.choiceUntil) return this.choice;
    const cands = this.candidates;
    cands.length = 0;

    let wallAhead = null;
    for (let i = 0; i < w.walls.length; i++) {
      const wl = w.walls[i];
      if (wl.d0 > sq.d && wl.d0 < sq.d + 30) {
        wallAhead = wl;
        break;
      }
    }
    let gateBeforeWall = false;
    if (wallAhead) {
      for (let i = 0; i < w.gates.length; i++) {
        const g = w.gates[i];
        if (!g.consumed && g.d > sq.d && g.d < wallAhead.d0) {
          gateBeforeWall = true;
          break;
        }
      }
    }

    let best = 0;
    let bestScore = -Infinity;
    if (wallAhead && !gateBeforeWall && sq.side === 0) {
      // 进墙前：把墙里每一边的门、尸潮、桶都算一遍，选一边
      cands.push(HALVES[0], HALVES[1]);
      for (let i = 0; i < cands.length; i++) {
        const sc = this.sideScore(w, cands[i], wallAhead.d0, wallAhead.d1);
        if (sc > bestScore) {
          bestScore = sc;
          best = i;
        }
      }
    } else {
      for (let i = 0; i < RUN_CANDIDATES.length; i++) {
        const cx = RUN_CANDIDATES[i];
        if (cx >= w.lo - 0.01 && cx <= w.hi + 0.01) cands.push(cx);
      }
      if (cands.length === 0) cands.push((w.lo + w.hi) / 2);
      for (let i = 0; i < cands.length; i++) {
        const sc = this.score(w, cands[i]);
        if (sc > bestScore) {
          bestScore = sc;
          best = i;
        }
      }
    }

    if (this.mistake > 0 && this.rng() < this.mistake) best = Math.floor(this.rng() * cands.length);
    this.choice = cands[best];
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
    for (let i = 0; i < w.zombies.length; i++) {
      const z = w.zombies[i];
      if (!z.alive || z.d < d0 || z.d > d1) continue;
      if (Math.abs(z.x - x) < band) threat += THREAT[z.kind] ?? 1;
    }
    return threat;
  }

  private score(w: World, x: number): number {
    const sq = w.squad;
    const count = Math.max(1, sq.count);
    const st = this.scratchSt;
    st.n = count;
    st.tier = sq.tier;
    st.rate = sq.rate;
    // 只看最近一组门
    let firstD = Infinity;
    for (let i = 0; i < w.gates.length; i++) {
      const g = w.gates[i];
      if (!g.consumed && g.d > sq.d && g.d < sq.d + 46 && g.d < firstD) firstD = g.d;
    }
    for (let i = 0; i < w.gates.length; i++) {
      const g = w.gates[i];
      if (g.consumed || Math.abs(g.d - firstD) > 0.5 || x < g.x0 || x > g.x1) continue;
      this.applyGate(g, st);
    }
    if (st.n <= 0) return -100;
    let score = Math.log(this.power(st.n, st.tier, st.rate) / this.power(count, sq.tier, sq.rate)) * 3;
    score -= (this.threat(w, x, sq.d, sq.d + 32, w.halfWidth + 1.5) / count) * 1.2;
    for (let i = 0; i < w.hazards.length; i++) {
      const h = w.hazards[i];
      if (h.d1 < sq.d || h.d0 > sq.d + 26) continue;
      if (x + w.halfWidth > h.x0 && x - w.halfWidth < h.x1) score -= 0.6;
    }
    score += this.barrelScore(w, x, sq.d + 6, sq.d + 40);
    return score;
  }

  private barrelScore(w: World, x: number, d0: number, d1: number): number {
    let score = 0;
    for (let i = 0; i < w.barrels.length; i++) {
      const b = w.barrels[i];
      if (!b.alive || b.d < d0 || b.d > d1 || Math.abs(b.x - x) > 1.8) continue;
      if (b.reward.kind === 'weapon' && b.reward.tier > w.squad.tier) score += 0.5;
      else if (b.reward.kind === 'soldiers') score += 0.2;
      else if (b.reward.kind === 'airstrike') score += 0.1;
    }
    return score;
  }

  /** 隔离墙一侧整段的收益（w.gates 已按 d 升序排列） */
  private sideScore(w: World, x: number, d0: number, d1: number): number {
    const sq = w.squad;
    const count = Math.max(1, sq.count);
    const st = this.scratchSt;
    st.n = count;
    st.tier = sq.tier;
    st.rate = sq.rate;
    const side = Math.sign(x);
    for (let i = 0; i < w.gates.length; i++) {
      const g = w.gates[i];
      if (!g.consumed && g.d >= d0 && g.d <= d1 && Math.sign(g.x0 + g.x1) === side) {
        this.applyGate(g, st);
      }
    }
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
