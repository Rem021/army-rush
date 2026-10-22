import { afterEach, describe, expect, it, vi } from 'vitest';
import { upgradeEffects, UPGRADES } from '../src/game/config';
import { levelReward, recommendUpgrade, upgradeGain } from '../src/game/economy';
import { CombatStats } from '../src/game/feedback';
import { DEFENSE_TUNING, generateCampaign, generateDefense, generateEndlessStart, type LevelSpec } from '../src/game/level';
import { applyTactic } from '../src/game/tactics';
import { World } from '../src/game/world';
import { loadSave, resetSave, writeSave } from '../src/save';

const zero = { soldiers: 0, damage: 0, rate: 0, income: 0, agility: 0 };
const opts = upgradeEffects(zero);
function empty(over: Partial<LevelSpec> = {}): LevelSpec {
  return { mode: 'campaign', level: 1, theme: 0, length: 400, gates: [], barrels: [], zombies: [], walls: [], hazards: [], banners: [], bosses: [], defense: null, expected: 0, estimates: [], ...over };
}
function run(w: World, seconds: number, x = 0) {
  for (let i = 0; i < seconds * 60; i++) { w.setTarget(x); w.update(1 / 60); w.drainEvents(); }
}

describe('公平难度与战术取舍', () => {
  it('高火力进冲锋 Boss 战不会临时提高 Boss 血量', () => {
    const w = new World(generateCampaign(5), { ...opts, startSoldiers: 60, damageMult: 100, rateMult: 100 });
    const hp = w.bosses.map((b) => b.maxHp);
    w['startBoss']();
    expect(w.bosses.map((b) => b.maxHp)).toEqual(hp);
  });

  it('防线各阶段预算与实际人数、火力和战术无关', () => {
    for (const level of [1, 5, 10, 16]) {
      const a = new World(generateDefense(level), opts);
      const b = new World(generateDefense(level), applyTactic({ ...opts, damageMult: 100, startSoldiers: 64 }, 'breaker'));
      for (const p of [0, 0.25, 0.5, 0.9, 1]) expect(a['refDps'](p)).toBe(b['refDps'](p));
    }
  });

  it('有限升级对应有界的后期火力、障碍和波次预算', () => {
    for (const level of [20, 30, 50, 100, 1000]) {
      expect(DEFENSE_TUNING.expectedEnd(level)).toBeLessThan(17000);
      expect(DEFENSE_TUNING.blockerHp(level, 0)).toBeLessThan(2000);
      expect(DEFENSE_TUNING.waveSize(level, 1)).toBeLessThanOrEqual(100);
    }
  });

  it('连射增加射门命中，但单体直伤比均衡低；破甲降低射门频率', () => {
    const a = new World(empty(), opts);
    const v = new World(empty(), applyTactic(opts, 'volley'));
    const b = new World(empty(), applyTactic(opts, 'breaker'));
    expect(v.fireRate / a.fireRate).toBeCloseTo(1.2);
    expect(v.dps() / a.dps()).toBeCloseTo(0.96);
    expect(b.fireRate / a.fireRate).toBeCloseTo(0.8);
    expect(b.dps() / a.dps()).toBeCloseTo(0.96);
    const g = { kind: 'add' as const, x0: -5.4, x1: 5.4, d: 30, value: -20, group: 0 };
    const wa = new World(empty({ gates: [g] }), { ...opts, rateMult: 10 });
    const wv = new World(empty({ gates: [g] }), applyTactic({ ...opts, rateMult: 10 }, 'volley'));
    run(wa, 1); run(wv, 1);
    expect(wv.gates[0].value).toBeGreaterThan(wa.gates[0].value);
  });

  it('无尽续生成不根据实际兵力、换枪和射速抬高同种子同距离的敌人预算', () => {
    const worlds = [opts, { ...opts, startSoldiers: 60, startTier: 4, rateMult: 10 }].map((o) => {
      const start = generateEndlessStart(42);
      return new World(start.spec, { ...o, endless: { gen: start.gen, until: start.until } });
    });
    const budget = (w: World) => ({
      zombies: w.zombies.map(({ kind, x, d, maxHp, weight }) => ({ kind, x, d, maxHp, weight })),
      barrels: w.barrels.map(({ x, d, maxHp }) => ({ x, d, maxHp })),
      // 武器门会保底为当前开局武器，不参与敌人预算比较。
    });
    worlds[1].squad.rate = 4;
    for (let i = 0; i < 5; i++) {
      for (const w of worlds) w['extend']();
      expect(budget(worlds[0])).toEqual(budget(worlds[1]));
    }
  });

  it('破甲加成确实作用于障碍、巨尸和 Boss，普通尸潮不吃加成', () => {
    for (const kind of ['barrel', 'giant', 'boss', 'walker']) {
      const spec = () => empty({
        barrels: kind === 'barrel' ? [{ x: 0, d: 20, r: 3, hp: 10000, reward: { kind: 'coins', amount: 1 }, look: 'crate' }] : [],
        zombies: ['giant', 'walker'].includes(kind) ? [{ kind: kind as 'giant' | 'walker', x: 0, d: 20, hp: 10000 }] : [],
        bosses: kind === 'boss' ? [{ kind: 'brute', x: 0, hp: 10000 }] : [],
      });
      const a = new World(spec(), { ...opts, rateMult: 10, armorMult: 1 });
      const b = new World(spec(), { ...opts, rateMult: 10, armorMult: 1.2 });
      if (kind === 'boss') for (const w of [a, b]) { w.bosses[0].d = 20; w.bosses[0].active = true; }
      run(a, 0.8); run(b, 0.8);
      const hp = (w: World) => kind === 'barrel' ? w.barrels[0].hp : kind === 'boss' ? w.bosses[0].hp : w.zombies[0].hp;
      expect(10000 - hp(a)).toBeGreaterThan(0);
      expect((10000 - hp(b)) / (10000 - hp(a))).toBeCloseTo(kind === 'walker' ? 1 : 1.2, 5);
    }
  });

  it('高射速合并弹丸仍保留逻辑射门命中数，超过绘制预算也不会白升', () => {
    const a = new World(empty(), { ...opts, startSoldiers: 60, startTier: 4, rateMult: 3 });
    a['fire'](1);
    const hits = a.bullets.reduce((n, b) => n + (b.gateHits ?? 1), 0);
    expect(a.bullets.length).toBe(600);
    expect(hits).toBeCloseTo(60 * 9 * 3, 5);
    const gate = new World(empty({ gates: [{ kind: 'add', x0: -5, x1: 5, d: 20, value: -10, group: 0 }] }), opts).gates[0];
    a['gateHit'](gate, 100);
    expect(gate.value).toBeGreaterThan(0);
  });
});

describe('可解释的损兵与稳定结算', () => {
  it('区分最多损兵原因和最后一次损兵，不把最多损失误称为致命原因', () => {
    const stats = new CombatStats();
    stats.lose('zombie', 15); stats.lose('bomb', 2); stats.lose('boss', 0);
    expect(stats.mainLoss).toBe('zombie');
    expect(stats.lastLoss).toBe('bomb');
    expect(stats.advice(false)).toContain('油桶爆炸');
    expect(stats.advice(true, true)).toContain('先换道清怪');
  });

  it('减员门记录实际损失，错过的正门只计一次', () => {
    const w = new World(empty({ gates: [
      { kind: 'add', x0: -5.4, x1: 5.4, d: 3, value: -20, group: 0 },
    ] }), { ...opts, startSoldiers: 5, rateMult: 0 });
    run(w, 1);
    expect(w.state).toBe('lost');
    expect(w.stats.losses.gate).toBe(5);
    expect(w.stats.gatesTaken).toBe(1);
    const missed = new World(empty({ gates: [{ kind: 'add', x0: -5.4, x1: -2, d: 5, value: 5, group: 0 }] }), { ...opts, rateMult: 0 });
    run(missed, 3, 3);
    expect(missed.stats.gatesMissed).toBe(1);
  });

  it('碰撞和陷阱损兵有明确分类', () => {
    const w = new World(empty({ barrels: [{ x: 0, d: 5, r: 3, hp: 10000, reward: { kind: 'coins', amount: 1 }, look: 'crate' }] }), { ...opts, startSoldiers: 5, rateMult: 0 });
    run(w, 1);
    expect(w.stats.losses.barrel).toBeGreaterThan(0);
    const z = new World(empty({ zombies: [{ kind: 'walker', x: 0, d: 5, hp: 10000 }] }), { ...opts, rateMult: 0 });
    run(z, 1);
    expect(z.stats.losses.zombie).toBe(1);
  });

  it('结束后残留子弹不能改写胜负或追加收益', () => {
    const w = new World(empty({ bosses: [{ kind: 'brute', x: 0, hp: 1 }] }), opts);
    w.bosses[0].active = true; w.bosses[0].d = 10;
    w.bullets.push({ x: 0, d: 9, vx: 0, vd: 60, dmg: 10000, travel: 0, pierce: 0, lastHit: -1 });
    w.state = 'lost';
    run(w, 3);
    expect(w.time).toBe(0);
    expect(w.state).toBe('lost');
    expect(w.bosses[0].hp).toBe(1);
    expect(w.coins).toBe(0);
    expect(w.gems).toBe(0);
  });
});

describe('升级信息与存档兼容', () => {
  afterEach(() => vi.unstubAllGlobals());
  const storage = () => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v) });
    return data;
  };

  it('推荐按边际直伤而非最低价格，进化收益如实展示', () => {
    const levels = { ...zero, damage: 5, rate: 5 };
    expect(upgradeGain(levels, 'damage').dps).toBeGreaterThan(0.6);
    expect(upgradeGain(zero, 'damage').gates).toBe(0);
    const winner = recommendUpgrade({ coins: 10000, gems: 0 }, levels)!;
    const efficiency = (id: 'damage' | 'rate') => upgradeGain(levels, id).dps / UPGRADES.find((u) => u.id === id)!.cost(levels[id]);
    expect(winner).toBe(efficiency('damage') > efficiency('rate') ? 'damage' : 'rate');
    expect(upgradeGain({ ...zero, rate: 7 }, 'rate').text).toContain('群体伤害');
    expect(upgradeGain(zero, 'damage').text).toContain('射门命中不变');
  });

  it('推进补给随真实进度增长且低于通关奖励，零进度无后期补给', () => {
    expect(levelReward(12, false, 0, 1, 0).bonus).toBe(0);
    const halfway = levelReward(12, false, 0, 1, 0.5);
    const final = levelReward(12, false, 0, 1, 1);
    expect(halfway.bonus).toBeGreaterThan(0);
    expect(final.bonus).toBeGreaterThan(halfway.bonus);
    expect(final.bonus).toBeLessThan(levelReward(12, true, 0).bonus);
    expect(levelReward(12, false, 0, 1, 99)).toEqual(final);
  });

  it('旧存档加载保留进度资产，用默认战术补齐新字段', () => {
    const data = storage();
    data.set('army-rush.save.v1', JSON.stringify({ level: 9, defenseLevel: 12, coins: 12345, gems: 27, upgrades: { ...zero, damage: 18 }, owned: ['blue', 'gold'], skin: 'gold' }));
    const save = loadSave();
    expect(save).toMatchObject({ level: 9, defenseLevel: 12, coins: 12345, gems: 27, tactic: 'balanced', motion: 'system', sensitivity: 1, skin: 'gold' });
    expect(save.upgrades.damage).toBe(18);
    expect(save.owned).toEqual(['blue', 'gold']);
    writeSave(save);
    expect(loadSave()).toEqual(save);
  });

  it('无效新字段回退，重置保留操作与动态偏好', () => {
    const data = storage();
    data.set('army-rush.save.v1', JSON.stringify({ tactic: 'missing', motion: 'invalid', sensitivity: 99 }));
    const save = loadSave();
    expect(save.tactic).toBe('balanced');
    expect(save.motion).toBe('system');
    expect(save.sensitivity).toBe(1);
    Object.assign(save, { motion: 'reduced', sensitivity: 0.75, coins: 500, tactic: 'volley' });
    resetSave(save);
    expect(save).toMatchObject({ motion: 'reduced', sensitivity: 0.75, coins: 0, tactic: 'balanced' });
  });
});
