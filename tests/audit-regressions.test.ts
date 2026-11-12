import { afterEach, describe, expect, it, vi } from 'vitest';
import { Bot } from '../src/game/bot';
import { CARNAGE_OPTIONS, generateCarnage } from '../src/game/carnage';
import { SpatialBins, segCircle } from '../src/game/collision';
import { SKINS, THROWER_MELEE_TIME, UPGRADES, soldierDps } from '../src/game/config';
import { coinScale, settleRun } from '../src/game/economy';
import { computeFormation, formationLaneCap, slotX, slotZ } from '../src/game/formation';
import { extendEndless, generateDefense, generateEndlessStart, type LevelSpec } from '../src/game/level';
import { mulberry32 } from '../src/game/rng';
import { World, type Gate } from '../src/game/world';
import { GATE_COLORS, gateColor } from '../src/render/entities';
import { loadSave, resetSave } from '../src/save';

afterEach(() => vi.unstubAllGlobals());

function stubStorage(raw: unknown) {
  let stored = raw === undefined ? null : typeof raw === 'string' ? raw : JSON.stringify(raw);
  vi.stubGlobal('localStorage', {
    getItem: () => stored,
    setItem: (_k: string, v: string) => {
      stored = v;
    },
  });
}

function emptySpec(over: Partial<LevelSpec> = {}): LevelSpec {
  return {
    mode: 'campaign',
    level: 1,
    theme: 0,
    length: 400,
    gates: [],
    barrels: [],
    zombies: [],
    walls: [],
    hazards: [],
    banners: [],
    bosses: [],
    defense: null,
    expected: 0,
    estimates: [],
    ...over,
  };
}

describe('存档校验与防篡改加固 (save.ts)', () => {
  it('拦截超出上限/负数/非数字升级，拒绝未拥有的皮肤并过滤非法拥有项', () => {
    const paidSkin = SKINS[1].id;
    const unownedSkin = SKINS[SKINS.length - 1].id;
    stubStorage({
      level: -5,
      defenseLevel: 0,
      coins: -999,
      gems: 12.9,
      skin: unownedSkin,
      owned: [paidSkin, '', '   ', 123, null, paidSkin],
      sensitivity: 99,
      motion: 'turbo',
      upgrades: { soldiers: 999, damage: -3, rate: 'NaN', income: 999, agility: 4 },
    });
    const s = loadSave();
    expect(s.level).toBe(1);
    expect(s.defenseLevel).toBe(1);
    expect(s.coins).toBe(0);
    expect(s.gems).toBe(12);
    expect(s.owned).toEqual([paidSkin]);
    expect(s.skin).toBe(paidSkin); // 未拥有的皮肤自动回退到已拥有列表首项
    expect(s.sensitivity).toBe(1);
    expect(s.motion).toBe('system');
    const maxMap = Object.fromEntries(UPGRADES.map((u) => [u.id, u.max]));
    expect(s.upgrades.soldiers).toBe(maxMap.soldiers);
    expect(s.upgrades.damage).toBe(0);
    expect(s.upgrades.rate).toBe(0);
    expect(s.upgrades.income).toBe(maxMap.income);
    expect(s.upgrades.agility).toBe(4);
  });

  it('非对象 JSON（数组、null、原始值）安全回退初始存档，resetSave 彻底重置所有字段', () => {
    for (const bad of ['null', '[1,2,3]', '"hello"', '42', '{broken']) {
      stubStorage(bad);
      const s = loadSave();
      expect(s.level).toBe(1);
      expect(s.owned).toEqual([SKINS[0].id]);
    }
    stubStorage({});
    const s = loadSave();
    s.carnageAdmin = true;
    s.carnageBest = 8888;
    s.coins = 5000;
    resetSave(s);
    expect(s.carnageAdmin).toBe(false);
    expect(s.carnageBest).toBe(0);
    expect(s.coins).toBe(0);
  });
});

describe('统一结算与经济边界保护 (economy.ts)', () => {
  it('无尽模式主动撤退/暂停重开不发放距离里程补贴，也不触发新纪录', () => {
    stubStorage({});
    const s = loadSave();
    s.endlessBest = 200;
    const retreated = settleRun(s, {
      mode: 'endless',
      level: 1,
      won: false,
      retreated: true,
      practice: false,
      runCoins: 35,
      runGems: 2,
      kills: 40,
      progress: 0,
      distance: 600,
    });
    expect(retreated.coins).toBe(35);
    expect(retreated.bonusCoins).toBe(0);
    expect(retreated.record).toBe(false);
    expect(s.endlessBest).toBe(600);
    expect(s.coins).toBe(35);
    expect(s.gems).toBe(2);

    const normal = settleRun(s, {
      mode: 'endless',
      level: 1,
      won: false,
      retreated: false,
      practice: false,
      runCoins: 35,
      runGems: 0,
      kills: 10,
      progress: 0,
      distance: 800,
    });
    expect(normal.bonusCoins).toBe(40);
    expect(normal.coins).toBe(75);
    expect(normal.record).toBe(true);
  });

  it('演练模式与狂潮模式严格隔离主线资源，高关卡 coinScale 与越界 soldierDps 不会溢出报错', () => {
    stubStorage({});
    const s = loadSave();
    settleRun(s, {
      mode: 'defense',
      level: 5,
      won: true,
      retreated: false,
      practice: true,
      runCoins: 500,
      runGems: 3,
      kills: 120,
      progress: 1,
      distance: 0,
    });
    expect(s.coins).toBe(0);
    expect(s.gems).toBe(0);
    expect(s.defenseLevel).toBe(1);

    settleRun(s, {
      mode: 'carnage',
      level: 1,
      won: true,
      retreated: false,
      practice: false,
      runCoins: 999,
      runGems: 5,
      kills: 2345,
      progress: 1,
      distance: 0,
    });
    expect(s.coins).toBe(0);
    expect(s.gems).toBe(0);
    expect(s.carnageBest).toBe(2345);

    expect(Number.isFinite(coinScale(10000))).toBe(true);
    expect(soldierDps(-5)).toBe(soldierDps(0));
    expect(soldierDps(99)).toBeGreaterThan(0);
  });
});

describe('阵型查找表与空间网格碰撞器 (formation.ts & collision.ts)', () => {
  it('狂潮模式 240 人编队横向半宽受控于 1.2，可顺畅驶入左右外道 (-4.7 / +4.35)', () => {
    expect(formationLaneCap('carnage', true)).toBe(1.2);
    const f = computeFormation(240, 'carnage', true, -6.2, 6.2);
    expect(f.sx).toBeLessThanOrEqual(1.2);
    for (let i = 0; i < 240; i++) {
      expect(Math.abs(slotX(i, f))).toBeLessThanOrEqual(1.21);
      expect(Number.isFinite(slotZ(i, f))).toBe(true);
    }
    const w = new World(generateCarnage(), { ...CARNAGE_OPTIONS, startSoldiers: 240 });
    for (let i = 0; i < 4 * 60; i++) {
      w.setTarget(-4.7);
      w.update(1 / 60);
      w.drainEvents();
    }
    expect(w.squad.x).toBeLessThan(-3.9);
    expect(w.carnage.recruits).toBeGreaterThan(0);
    for (let i = 0; i < 4 * 60; i++) {
      w.setTarget(4.35);
      w.update(1 / 60);
      w.drainEvents();
    }
    expect(w.squad.x).toBeGreaterThan(3.9);
    expect(w.carnage.batteries).toBeGreaterThan(0);
  });

  it('segCircle 与 SpatialBins 精确命中最近圆且支持零分配重用', () => {
    expect(segCircle(0, 0, 0, 10, 0, 5, 1)).toBeCloseTo(0.4, 5);
    expect(segCircle(0, 0, 0, 10, 3, 5, 1)).toBe(-1);
    const bins = new SpatialBins<{ id: number; d: number; r: number; alive: boolean }>(4);
    const list = [
      { id: 1, d: 3.9, r: 0.4, alive: true },
      { id: 2, d: 4.1, r: 0.4, alive: true },
      { id: 3, d: 40, r: 0.4, alive: true },
      { id: 4, d: 4.0, r: 0.4, alive: false },
    ];
    bins.build(list, 0, 50);
    const [b0, b1] = bins.range(3.5, 4.5);
    const found: number[] = [];
    for (let k = b0; k <= b1; k++) {
      for (const item of bins.bins[k]) found.push(item.id);
    }
    expect(found).toEqual([1, 2]);
  });
});

describe('核心战斗逻辑缺陷回归测试 (world.ts & level.ts & bot.ts)', () => {
  it('连续两排地刺分别独立判定，不会因第一排存活而对后续地刺永久免疫', () => {
    const spec = emptySpec({
      hazards: [
        { kind: 'spikes', x0: -5, x1: 5, d0: 8, d1: 12 },
        { kind: 'spikes', x0: -5, x1: 5, d0: 20, d1: 24 },
      ],
    });
    const w = new World(spec, { startSoldiers: 60, damageMult: 1, rateMult: 1 });
    let afterFirst = 60;
    for (let i = 0; i < 60 * 3.5; i++) {
      w.update(1 / 60);
      if (w.squad.d > 15 && w.squad.d < 17) afterFirst = w.squad.count;
    }
    expect(afterFirst).toBeLessThan(50);
    expect(w.squad.count).toBeLessThan(afterFirst - 5);
  });

  it('防线近战 Boss 跨桥面锁敌距离受限，且在远处空挥不会刷虚高躲避计数', () => {
    const spec = generateDefense(1);
    spec.zombies = [];
    spec.gates = [];
    spec.barrels = [];
    spec.defense!.spawns = [{ t: 0, boss: { kind: 'brute', x: -3.2, hp: 50000 } }];
    const w = new World(spec, { startSoldiers: 20, damageMult: 0, rateMult: 0 });
    w.squad.x = 3.2;
    w.setTarget(3.2);
    w.update(1 / 60);
    const b = w.bosses[0];
    b.d = 35;
    b.engaged = true;
    for (let i = 0; i < 180; i++) {
      b.d = 35;
      w.update(1 / 60);
      if (b.attacking) {
        expect(b.attackX).toBeLessThanOrEqual(b.x + 2.201);
      }
    }
    expect(w.stats.dodges).toBe(0);
  });

  it('投弹 Boss 半血狂暴不会重置当前抬手造成瞬间连投，超时切近战会发出横幅提示', () => {
    const spec = emptySpec({
      bosses: [{ kind: 'thrower', hp: 1000, x: 0 }],
    });
    const w = new World(spec, { startSoldiers: 10, damageMult: 0, rateMult: 0 });
    const b = w.bosses[0];
    b.d = 24;
    b.active = true;
    w.state = 'boss';
    w.squad.moving = false;
    w.squad.d = 6;
    for (let i = 0; i < 48; i++) w.update(1 / 60);
    const timerBefore = b.timer;
    expect(timerBefore).toBeGreaterThan(0.5);
    b.hp = 400; // 触发狂暴 (< 50%)
    w.update(1 / 60);
    expect(b.enraged).toBe(true);
    expect(w.projectiles.length).toBe(0);
    expect(b.timer).toBeLessThan(timerBefore);

    b.fightTime = THROWER_MELEE_TIME + 0.1;
    w.update(1 / 60);
    const events = w.drainEvents();
    expect(events.some((e) => e.type === 'banner' && e.tone === 'danger')).toBe(true);
  });

  it('当逻辑兵力高于场上实体兵数时，吃油桶爆炸只按单趟比例扣减，不会把替补兵重复炸死', () => {
    const spec = generateCarnage();
    spec.zombies = [];
    spec.gates = [];
    spec.barrels = [];
    spec.defense!.spawns = [];
    const w = new World(spec, { ...CARNAGE_OPTIONS, startSoldiers: 100, damageMult: 0, rateMult: 0 });
    w.carnage.shells = 0;
    // 模拟超编状态：逻辑兵力 400 人，场上实体 100 人（每人代表 4 兵力）
    w.squad.count = 400;
    expect(w.soldiers.length).toBe(100);
    w.projectiles.push({ id: 1, x0: 0, d0: 28, tx: w.squad.x + 2.2, td: 0, t: 0.99, T: 1 });
    w.update(0.05);
    expect(w.squad.count).toBeGreaterThan(200);
  });

  it('胜利结算立即将场内残余丧尸全部置为阵亡，狂潮中期 Boss 不发放防线援军奖励', () => {
    const spec = generateCarnage();
    spec.zombies = [{ kind: 'walker', hp: 5000, x: 0, d: 30 }];
    spec.defense!.spawns = [
      { t: 0, boss: { kind: 'brute', x: 0, hp: 10 } },
      { t: 80, boss: { kind: 'brute', x: 0, hp: 10 } },
    ];
    const w = new World(spec, { ...CARNAGE_OPTIONS, startSoldiers: 36 });
    w.carnage.shells = 0;
    for (let i = 0; i < 60 && w.bosses.length === 0; i++) w.update(1 / 60);
    while (w.bosses[0].alive) w.update(1 / 60);
    expect(w.squad.count).toBe(36);

    w.time = 95;
    w.update(1 / 60);
    for (const z of w.zombies) z.alive = false;
    for (const b of w.bosses) b.hp = 1;
    for (let i = 0; i < 120 && w.state !== 'won'; i++) w.update(1 / 60);
    expect(w.state).toBe('won');
    expect(w.zombies.every((z) => !z.alive)).toBe(true);
  });

  it('无尽模式超远距离预算渐近收敛不溢出 Infinity，自动驾驶在狂潮模式会主动择道躲危险带', () => {
    const start = generateEndlessStart(42);
    for (let i = 0; i < 60; i++) {
      const next = extendEndless(start.gen, start.until, start.until + 260);
      start.until = next.until;
    }
    expect(Number.isFinite(start.gen.E)).toBe(true);
    expect(start.gen.E).toBeLessThan(1e4);

    const w = new World(generateCarnage(), CARNAGE_OPTIONS);
    const bot = new Bot(mulberry32(7), 0);
    const normalTarget = bot.target(w);
    expect(Math.abs(normalTarget)).toBeGreaterThan(1);

    w.bosses.push({
      id: 99,
      kind: 'brute',
      x: -4.2,
      homeX: -4.2,
      d: 4,
      hp: 5000,
      maxHp: 5000,
      r: 1.4,
      active: true,
      alive: true,
      phase: 0,
      windup: 0.6,
      slam: 0,
      flash: 0,
      attacking: true,
      attackX: -4.2,
      attackD: 2.5,
      attackLength: 4.8,
      comboStep: 0,
      engaged: true,
      recover: 0,
      smashes: 0,
      timer: 0,
      fightTime: 1,
      final: false,
      pair: false,
      enraged: false,
    });
    expect(bot.target(w)).toBeGreaterThan(-1.5);
  });

  it('0 值门的主色与过门粒子色一致（+0 / +0% 为正向色，负值为红色）', () => {
    const mk = (kind: Gate['kind'], value: number): Gate => ({
      id: 1,
      d: 10,
      x0: -2,
      x1: 0,
      group: 1,
      kind,
      value,
      hits: 0,
      bump: 0,
      consumed: false,
      taken: false,
    });
    expect(gateColor(mk('add', 0))).toBe(GATE_COLORS.good);
    expect(gateColor(mk('add', -1))).toBe(GATE_COLORS.bad);
    expect(gateColor(mk('rate', 0))).toBe(GATE_COLORS.rate);
    expect(gateColor(mk('rate', -5))).toBe(GATE_COLORS.bad);
  });
});
