import { describe, expect, it } from 'vitest';
import { Bot } from '../src/game/bot';
import { BOSS_COMBO, LANE_HALF, MAX_COUNT, MAX_DEFENSE_COUNT, THROW_RADIUS, TRACK_HALF, UPGRADES, WEAPONS, ZOMBIES, upgradeEffects } from '../src/game/config';
import { levelReward, spendGreedy } from '../src/game/economy';
import { generateCampaign, generateDefense, generateEndlessStart, type LevelSpec } from '../src/game/level';
import { mulberry32 } from '../src/game/rng';
import { World } from '../src/game/world';
import { BOSS_IMPACT, bossMotion, bossPose } from '../src/render/bossMotion';

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

const opts = { startSoldiers: 5, damageMult: 1, rateMult: 1 };

function run(w: World, seconds: number, target = 0) {
  for (let t = 0; t < seconds; t += 1 / 60) {
    w.setTarget(target);
    w.update(1 / 60);
  }
}

function autoplay(w: World, seconds = 240, mistake = 0) {
  const bot = new Bot(mulberry32(1), mistake);
  for (let t = 0; t < seconds && (w.state === 'run' || w.state === 'boss'); t += 1 / 30) {
    w.setTarget(bot.target(w));
    w.update(1 / 30);
    w.drainEvents();
  }
}

describe('关卡生成', () => {
  it('同一关每次生成都一样', () => {
    expect(generateCampaign(7)).toEqual(generateCampaign(7));
  });

  it('内容都在桥面范围内，门成对或单扇，终点有 Boss', () => {
    for (let L = 1; L <= 25; L++) {
      const spec = generateCampaign(L);
      expect(spec.bosses.length).toBeGreaterThan(0);
      for (const b of spec.bosses) expect(b.hp).toBeGreaterThan(0);
      for (const g of spec.gates) {
        expect(g.x0).toBeGreaterThanOrEqual(-TRACK_HALF);
        expect(g.x1).toBeLessThanOrEqual(TRACK_HALF);
        expect(g.d).toBeLessThan(spec.length);
      }
      const groups = new Map<number, number>();
      for (const g of spec.gates) groups.set(g.group, (groups.get(g.group) ?? 0) + 1);
      for (const n of groups.values()) expect(n === 1 || n === 2).toBe(true);
      for (const z of spec.zombies) expect(Math.abs(z.x)).toBeLessThanOrEqual(TRACK_HALF);
      for (const b of spec.barrels) expect(b.hp).toBeGreaterThan(0);
    }
  });

  it('第 5 关是双 Boss，第 3 关起有巨尸', () => {
    expect(generateCampaign(5).bosses).toHaveLength(2);
    expect(generateCampaign(6).zombies.some((z) => z.kind === 'giant')).toBe(true);
  });

  it('三道抉择：左右是门，中间是尸潮', () => {
    const spec = generateCampaign(4);
    const sideGates = spec.gates.filter((g) => g.x1 <= -LANE_HALF + 0.01 || g.x0 >= LANE_HALF - 0.01);
    expect(sideGates.length).toBeGreaterThan(0);
    const g = sideGates[0];
    const middle = spec.zombies.filter((z) => Math.abs(z.x) < LANE_HALF && z.d < g.d && z.d > g.d - 26);
    expect(middle.length).toBeGreaterThan(0);
  });

  it('各模式都能生成', () => {
    expect(generateCampaign(3).mode).toBe('campaign');
    expect(generateDefense(3).defense).not.toBeNull();
    expect(generateEndlessStart(1).spec.length).toBe(Infinity);
  });

  it('加人门和障碍奖励保持小额，人数上限防止连续叠加', () => {
    const rush = generateCampaign(1);
    const cages = rush.barrels.filter((b) => b.reward.kind === 'soldiers');
    expect(cages.length).toBeGreaterThan(0);
    expect(Math.max(...cages.map((b) => b.reward.kind === 'soldiers' ? b.reward.amount : 0))).toBeLessThanOrEqual(3);
    const defense = generateDefense(1);
    const firstArmor = defense.barrels.find((b) => b.reward.kind === 'soldiers');
    expect(firstArmor?.reward).toMatchObject({ kind: 'soldiers', amount: 3 });
    expect(Math.max(...defense.gates.filter((g) => g.kind === 'add').slice(0, 3).map((g) => g.value))).toBeLessThanOrEqual(3);
    expect(MAX_COUNT).toBeLessThan(MAX_DEFENSE_COUNT);
  });
});

describe('门', () => {
  it('冲锋的大型乘法门不会让队伍失去横向闪避空间', () => {
    const w = new World(emptySpec({ gates: [{ kind: 'mul', x0: -TRACK_HALF, x1: TRACK_HALF, d: 10, value: 4, group: 0 }] }), { ...opts, startSoldiers: 100, rateMult: 0 });
    run(w, 1.5);
    expect(w.squad.count).toBe(MAX_COUNT);
    expect(w.halfWidth).toBeLessThanOrEqual(2.3);
    run(w, 0.6, 4);
    expect(w.squad.x).toBeGreaterThan(3);
  });

  it('穿过加法门和乘法门', () => {
    const w = new World(
      emptySpec({
        gates: [
          { kind: 'add', x0: -TRACK_HALF, x1: 0, d: 10, value: 7, group: 0 },
          { kind: 'add', x0: 0, x1: TRACK_HALF, d: 10, value: -3, group: 0 },
          { kind: 'mul', x0: -TRACK_HALF, x1: 0, d: 20, value: 2, group: 1 },
          { kind: 'add', x0: 0, x1: TRACK_HALF, d: 20, value: 100, group: 1 },
        ],
      }),
      { ...opts, rateMult: 0 },
    );
    run(w, 3, -2.5);
    // (5 + 7) × 2，另一扇门不生效
    expect(w.squad.count).toBe(24);
    expect(w.gates.every((g) => g.consumed)).toBe(true);
    expect(w.gates.filter((g) => g.taken)).toHaveLength(2);
  });

  it('射击能把负数门打成正数', () => {
    const w = new World(emptySpec({ gates: [{ kind: 'add', x0: -TRACK_HALF, x1: TRACK_HALF, d: 40, value: -4, group: 0 }] }), opts);
    run(w, 5);
    const gate = w.gates[0];
    expect(gate.taken).toBe(true);
    expect(gate.value).toBeGreaterThan(0);
    expect(w.squad.count).toBeGreaterThan(5);
  });

  it('武器门和射速门', () => {
    const w = new World(
      emptySpec({
        gates: [
          { kind: 'weapon', x0: -TRACK_HALF, x1: TRACK_HALF, d: 10, value: 3, group: 0 },
          { kind: 'rate', x0: -TRACK_HALF, x1: TRACK_HALF, d: 20, value: 20, group: 1 },
        ],
      }),
      { ...opts, rateMult: 0 },
    );
    run(w, 3);
    expect(w.squad.tier).toBe(3);
    expect(w.squad.rate).toBeCloseTo(1.2);
  });

  it('人数归零就输', () => {
    const w = new World(emptySpec({ gates: [{ kind: 'add', x0: -TRACK_HALF, x1: TRACK_HALF, d: 5, value: -99, group: 0 }] }), { ...opts, rateMult: 0 });
    run(w, 2);
    expect(w.state).toBe('lost');
  });
});

describe('地形', () => {
  it('隔离墙里只能待在一侧', () => {
    const w = new World(emptySpec({ walls: [{ d0: 5, d1: 60 }] }), { ...opts, startSoldiers: 30, rateMult: 0 });
    run(w, 1.5, -3);
    run(w, 2, 4);
    expect(w.squad.side).toBe(-1);
    expect(w.squad.x).toBeLessThan(0);
  });

  it('地刺会杀一部分人，锯片碰到就死', () => {
    const w = new World(emptySpec({ hazards: [{ kind: 'spikes', x0: -TRACK_HALF, x1: TRACK_HALF, d0: 8, d1: 14 }] }), { ...opts, startSoldiers: 60, rateMult: 0 });
    run(w, 3);
    expect(w.squad.count).toBeLessThan(60);
    expect(w.squad.count).toBeGreaterThan(20);
  });
});

describe('丧尸', () => {
  it('普通丧尸撞上来一换一', () => {
    const w = new World(emptySpec({ zombies: [{ kind: 'walker', x: 0, d: 6, hp: 1e9 }] }), { ...opts, rateMult: 0 });
    run(w, 2);
    expect(w.squad.count).toBe(4);
    expect(w.zombies[0].alive).toBe(false);
  });

  it('自爆尸被打死会炸到旁边的丧尸', () => {
    const w = new World(
      emptySpec({
        zombies: [
          { kind: 'exploder', x: 0, d: 30, hp: 1 },
          { kind: 'walker', x: 0.8, d: 30.5, hp: 1e9 },
        ],
      }),
      opts,
    );
    run(w, 1.5);
    expect(w.zombies.every((z) => !z.alive)).toBe(true);
  });

  it('巨尸打死掉武器', () => {
    const w = new World(emptySpec({ zombies: [{ kind: 'giant', x: 0, d: 40, hp: 30, reward: { kind: 'weapon', tier: 2 } }] }), { ...opts, startSoldiers: 40 });
    run(w, 3);
    expect(w.zombies[0].alive).toBe(false);
    expect(w.squad.tier).toBe(2);
  });
});

describe('Boss', () => {
  it('近战先慢击两次再快速三连击', () => {
    const w = new World(emptySpec({ length: 40, bosses: [{ kind: 'brute', x: 0, hp: 1e9 }] }), { ...opts, startSoldiers: 160, rateMult: 0 });
    const hits: number[] = [];
    const combo: number[] = [];
    let overlap = false;
    let breather = false;
    let lastRecovery = -1;
    for (let t = 0; t < 60 && (hits.length < 5 || !breather); t += 1 / 60) {
      w.update(1 / 60);
      const b = w.bosses[0];
      const motion = bossMotion(b);
      if (b.recover > 0) {
        if (b.comboStep === 0 && b.recover <= BOSS_COMBO[4].recover - 0.58) {
          breather = true;
          expect(motion.kind).toBe('none');
        } else {
          expect(motion.kind).toBe('release');
          expect(motion.phase).toBeGreaterThanOrEqual(lastRecovery);
          lastRecovery = motion.phase;
        }
      } else lastRecovery = -1;
      if (b.attacking && b.comboStep === 3 && b.slam > 0.1) {
        overlap = true;
        expect(motion.kind).toBe('windup');
        expect(motion.phase).toBeLessThan(BOSS_IMPACT);
      }
      for (const e of w.drainEvents()) if (e.type === 'bossSmash') {
        hits.push(w.time);
        combo.push(e.combo);
        expect(motion.phase).toBeCloseTo(BOSS_IMPACT, 1);
      }
    }
    expect(hits).toHaveLength(5);
    expect(combo).toEqual([0, 1, 2, 3, 4]);
    expect(overlap).toBe(true);
    expect(breather).toBe(true);
    expect(hits[1] - hits[0]).toBeGreaterThan(hits[3] - hits[2] + 0.8);
    expect(hits[2] - hits[1]).toBeGreaterThan(hits[4] - hits[3]);
    expect(w.bosses[0].comboStep).toBe(0);
  });

  it('模型备用动作在命中前后衔接，投弹收招后再起手', () => {
    const before = bossPose(BOSS_IMPACT - 0.0001);
    const after = bossPose(BOSS_IMPACT + 0.0001);
    expect(Math.abs(before.arm - after.arm)).toBeLessThan(0.01);
    expect(Math.abs(before.body - after.body)).toBeLessThan(0.01);

    const w = new World(emptySpec({ length: 40, bosses: [{ kind: 'thrower', x: 0, hp: 1e9 }] }), { ...opts, startSoldiers: 80, rateMult: 0 });
    let sawRelease = false;
    let sawIdle = false;
    let sawNextWindup = false;
    for (let t = 0; t < 12; t += 1 / 60) {
      w.update(1 / 60);
      const b = w.bosses[0];
      const motion = bossMotion(b);
      if (b.slam > 0) sawRelease ||= motion.kind === 'release';
      if (sawRelease && b.slam === 0 && b.windup < 0.5) sawIdle ||= motion.kind === 'none';
      if (sawIdle && b.windup >= 0.5) sawNextWindup ||= motion.kind === 'windup';
      w.drainEvents();
    }
    expect(sawRelease && sawIdle && sawNextWindup).toBe(true);
  });

  it('危险带锁定后，整队横移能躲开砸击', () => {
    for (const size of [12, 240]) {
      const w = new World(emptySpec({ length: 40, bosses: [{ kind: 'brute', x: 0, hp: 1e9 }] }), { ...opts, startSoldiers: size, rateMult: 0 });
      while (!w.bosses[0].attacking || w.bosses[0].windup < 0.1) {
        w.update(1 / 60);
        w.drainEvents();
        expect(w.time).toBeLessThan(30);
      }
      expect(w.bosses[0].attackX).toBeCloseTo(0);
      const count = w.squad.count;
      run(w, 1.8, 4);
      expect(w.squad.x).toBeGreaterThan(3);
      expect(w.drainEvents().find((e) => e.type === 'bossSmash')).toMatchObject({ killed: 0 });
      expect(w.squad.count).toBe(count);
    }
  });

  it('双 Boss 都打死才算赢', () => {
    const w = new World(
      emptySpec({
        length: 60,
        bosses: [
          { kind: 'brute', x: -2.7, hp: 50 },
          { kind: 'thrower', x: 2.7, hp: 50 },
        ],
      }),
      { ...opts, startSoldiers: 60 },
    );
    autoplay(w, 60);
    expect(w.bosses.every((b) => !b.alive)).toBe(true);
    expect(w.state).toBe('won');
  });

  it('投弹屠夫会扔油桶，落地炸死红圈里的人', () => {
    const w = new World(emptySpec({ length: 40, bosses: [{ kind: 'thrower', x: 0, hp: 1e9 }] }), { ...opts, startSoldiers: 80, rateMult: 0 });
    run(w, 10);
    expect(w.squad.count).toBeLessThan(80);
  });
});

describe('模式', () => {
  it('无尽模式会一直续内容', () => {
    const start = generateEndlessStart(3);
    const w = new World(start.spec, { ...opts, startSoldiers: 3000, damageMult: 50, endless: { gen: start.gen, until: start.until } });
    run(w, 40);
    expect(w.squad.d).toBeGreaterThan(300);
    expect(w.gates.some((g) => g.d > 300)).toBe(true);
  });

  it('自动驾驶能打通前两关', () => {
    for (let L = 1; L <= 2; L++) {
      const w = new World(generateCampaign(L), { startSoldiers: 5, damageMult: 1.3, rateMult: 1.1 });
      autoplay(w);
      expect(w.state, `第 ${L} 关`).toBe('won');
    }
  });
});

describe('防线', () => {
  it('队伍不动，门滑过来；中途的 Boss 死了不算赢', () => {
    const spec = generateDefense(4);
    const w = new World(spec, { startSoldiers: MAX_DEFENSE_COUNT, damageMult: 30, rateMult: 2 });
    const bot = new Bot(mulberry32(1));
    let midBossDead = false;
    let passed = 0;
    for (let t = 0; t < 200 && w.state === 'run'; t += 1 / 30) {
      w.setTarget(bot.target(w));
      w.update(1 / 30);
      for (const e of w.drainEvents()) {
        if (e.type === 'bossDie' && w.time < spec.defense!.duration - 1) midBossDead = true;
        if (e.type === 'gatePass') passed++;
      }
    }
    expect(w.squad.d).toBe(0);
    expect(midBossDead).toBe(true);
    expect(w.state).toBe('won');
    expect(w.time).toBeGreaterThan(spec.defense!.duration);
    expect(passed).toBeGreaterThan(5);
  });

  it('门道队列：大障碍卡住时后面的门不动，打掉才继续往前', () => {
    const spec = emptySpec({
      length: Infinity,
      gates: [
        { kind: 'add', x0: 0.3, x1: TRACK_HALF, d: 14, value: 5, group: 1 },
        { kind: 'add', x0: 0.3, x1: TRACK_HALF, d: 30, value: 7, group: 2 },
      ],
      barrels: [{ x: 2.7, d: 22, r: 2, hp: 1e6, reward: { kind: 'soldiers', amount: 10 }, look: 'armor', block: true }],
      defense: { conveyor: 6, spawnD: 60, stopD: 10, gateSide: 1, duration: 300, spawns: [] },
    });
    const w = new World(spec, { startSoldiers: 20, damageMult: 1, rateMult: 0 });
    const events: string[] = [];
    const step = (s: number) => {
      run(w, s, 2.7);
      for (const e of w.drainEvents()) events.push(e.type);
    };
    step(4);
    const blocker = w.barrels[0];
    const behind = w.gates.find((g) => g.value === 7)!;
    expect(blocker.d).toBeCloseTo(10, 5);
    expect(blocker.armed).toBe(true);
    expect(events).toContain('blocked');
    // 前面那扇门照常滑过来、被穿过
    expect(events).toContain('gatePass');
    // 后面的门挤到障碍身后就停住
    const frozen = behind.d;
    expect(frozen).toBeGreaterThan(blocker.d + blocker.r);
    step(3);
    expect(behind.d).toBeCloseTo(frozen, 5);
    // 打掉障碍，后面的门接着往前
    w['breakBarrel'](blocker);
    step(1);
    expect(behind.d).toBeLessThan(frozen - 5);
  });

  it('Boss 一批一批来：中途几只，最后是最终 Boss', () => {
    const def = generateDefense(5).defense!;
    const mids = def.spawns.filter((sp) => sp.boss && sp.t < def.duration - 0.01);
    const finals = def.spawns.filter((sp) => sp.boss && sp.t >= def.duration - 0.01);
    expect(mids.length).toBe(3);
    expect(new Set(mids.map((sp) => sp.t)).size).toBe(3);
    expect(finals.length).toBeGreaterThanOrEqual(1);
    // 每 5 关一个 Boss 关，最终是双 Boss
    expect(generateDefense(5).defense!.spawns.filter((sp) => sp.boss && sp.t >= generateDefense(5).defense!.duration - 0.01).length).toBe(2);
    expect(generateDefense(6).defense!.spawns.filter((sp) => sp.boss && sp.t >= generateDefense(6).defense!.duration - 0.01).length).toBe(1);
  });

  it('死一个人只有补位的那个人挪动，整队不会跟着换位置', () => {
    const spec = emptySpec({ length: Infinity, defense: { conveyor: 6, spawnD: 60, stopD: 10, gateSide: 1, duration: 300, spawns: [] } });
    const w = new World(spec, { startSoldiers: MAX_DEFENSE_COUNT, damageMult: 1, rateMult: 0 });
    run(w, 2, 2.7);
    const before = w.soldiers.map((s) => ({ s, x: s.ox, z: s.oz }));
    w['killSoldier'](10, 'zombie');
    run(w, 0.15, 2.7);
    const moved = before.filter((b) => w.soldiers.includes(b.s) && Math.hypot(b.s.ox - b.x, b.s.oz - b.z) > 0.3);
    expect(moved.length).toBeLessThanOrEqual(1);
  });

  it('大障碍一进视野血量就定了，卡住时不会再变', () => {
    const w = new World(generateDefense(3), { startSoldiers: 40, damageMult: 1, rateMult: 0 });
    const seen = new Map<number, number>();
    let checked = 0;
    for (let t = 0; t < 40; t += 1 / 30) {
      w.setTarget(-2.7);
      w.update(1 / 30);
      for (const b of w.barrels) {
        if (!b.block || !b.priced) continue;
        if (!seen.has(b.id)) seen.set(b.id, b.maxHp);
        expect(b.maxHp).toBe(seen.get(b.id));
        if (b.armed) checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('尸潮道源源不断刷丧尸', () => {
    const spec = generateDefense(3);
    const weak = new World(spec, { startSoldiers: 5, damageMult: 1, rateMult: 1 });
    const strong = new World(spec, { startSoldiers: 300, damageMult: 3, rateMult: 1 });
    // 开局几秒不刷（让人先打第一个障碍），之后在第一波大尸潮（12 秒）之前就一直在刷
    run(weak, 1, spec.defense!.gateSide * 2.7);
    run(strong, 1, spec.defense!.gateSide * 2.7);
    expect(weak.zombies.length).toBe(0);
    run(weak, 5.5, spec.defense!.gateSide * 2.7);
    run(strong, 5.5, spec.defense!.gateSide * 2.7);
    const counts: number[] = [];
    for (let i = 0; i < 3; i++) {
      run(weak, 1.5, spec.defense!.gateSide * 2.7);
      run(strong, 1.5, spec.defense!.gateSide * 2.7);
      counts.push(weak.zombies.length);
    }
    expect(counts[0]).toBeGreaterThan(0);
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThan(counts[i - 1]);
    // 同关同进度的敌血固定，升级不会触发敌人追涨
    const unit = (w: World) => {
      const recent = w.zombies.slice(-12);
      return recent.reduce((s, z) => s + z.maxHp / ZOMBIES[z.kind].hp, 0) / recent.length;
    };
    expect(unit(strong)).toBeCloseTo(unit(weak), 6);
  });

});

describe('局外升级', () => {
  it('第 1 关可凭操作零升级通过，升级后依然可通关', () => {
    const play = (lvl: number, seed: number) => {
      const w = new World(generateDefense(1), { ...upgradeEffects({ soldiers: lvl, damage: lvl, rate: lvl }), seed });
      autoplay(w, 300, 0);
      return w;
    };
    expect([1, 2, 3].some((seed) => play(0, seed).state === 'won')).toBe(true);
    expect([1, 2, 3].some((seed) => play(4, seed).state === 'won')).toBe(true);
  });

  it('输了也给金币，钱够就买最便宜的升级', () => {
    // 第 1 关输一把（战斗里拿了 60 金币）就够买两级
    expect(levelReward(1, false, 60).total).toBeGreaterThan(UPGRADES[0].cost(0) + UPGRADES[1].cost(0));
    expect(levelReward(1, true, 60).total).toBeGreaterThan(levelReward(1, false, 60).total);
    // Boss 关通关奖励翻倍
    expect(levelReward(5, true, 0).bonus).toBeGreaterThan(levelReward(4, true, 0).bonus * 1.8);
    // 金币买火力、射速等，钻石只能买兵力
    const up = { soldiers: 0, damage: 0, rate: 0, income: 0, agility: 0 };
    const wallet = { coins: 200, gems: 0 };
    spendGreedy(wallet, up);
    expect(up.soldiers).toBe(0);
    expect(up.damage + up.rate + up.income + up.agility).toBeGreaterThanOrEqual(2);
    expect(wallet.coins).toBeLessThan(Math.min(...UPGRADES.filter((u) => u.currency === 'coins').map((u) => u.cost(up[u.id]))));
    wallet.gems = UPGRADES[0].cost(0) + UPGRADES[0].cost(1);
    spendGreedy(wallet, up);
    expect(up.soldiers).toBe(2);
    expect(wallet.gems).toBe(0);
  });
});

describe('Boss 惩罚、子弹和升级进化', () => {
  const defenseSpec = (over: Partial<LevelSpec> = {}) =>
    emptySpec({ length: Infinity, defense: { conveyor: 6, spawnD: 60, stopD: 10, gateSide: 1, duration: 300, spawns: [] }, ...over });

  it('油桶落地：红圈里的兵全部炸死，防线里也会炸', () => {
    const w = new World(defenseSpec(), { startSoldiers: MAX_DEFENSE_COUNT, damageMult: 1, rateMult: 0 });
    run(w, 1.5, 2.7);
    const x = w.squad.x;
    const d = w.squad.d - 2;
    const inside = () => w.soldiers.filter((s) => Math.hypot(w.squad.x + s.ox - x, w.squad.d + s.oz - d) < THROW_RADIUS).length;
    const before = inside();
    expect(before).toBeGreaterThan(10);
    w.projectiles.push({ id: 999, x0: x, d0: 30, tx: x, td: d, t: 0.99, T: 1 });
    w.update(1 / 60);
    const boom = w.drainEvents().find((e) => e.type === 'explode');
    expect(boom && boom.type === 'explode' && boom.killed).toBe(before);
    expect(w.squad.count).toBe(MAX_DEFENSE_COUNT - before);
  });

  it('防线里子弹不会被 Boss 吸走，一律直着飞', () => {
    const w = new World(generateDefense(3), { startSoldiers: 60, damageMult: 1, rateMult: 1 });
    run(w, 2, 2.7);
    w['bosses'].push(w['makeBoss']({ kind: 'brute', x: -2.7, hp: 1e9 }, 20));
    w.bosses[0].active = true;
    run(w, 0.5, 2.7);
    expect(w.bullets.length).toBeGreaterThan(10);
    // 只有枪本身的散布，没有被 Boss 往一边拉
    for (const b of w.bullets) expect(Math.abs(b.vx)).toBeLessThanOrEqual(WEAPONS[w.squad.tier].spread + 1e-9);
  });

  it('穿甲弹打穿第一只丧尸，接着打后面那只', () => {
    const zombies = [
      { kind: 'walker' as const, x: 0, d: 8, hp: 4 },
      { kind: 'walker' as const, x: 0, d: 9, hp: 4 },
    ];
    const plain = new World(emptySpec({ zombies }), { ...opts, startSoldiers: 1 });
    const pierce = new World(emptySpec({ zombies }), { ...opts, startSoldiers: 1, ammo: 1 });
    for (const w of [plain, pierce]) {
      w.squad.moving = false;
      w.bullets.push({ x: 0, d: 6, vx: 0, vd: 60, dmg: 6, travel: 0, pierce: w.ammo.pierce, lastHit: -1 });
      for (let i = 0; i < 6; i++) {
        w['collectNear']();
        w['updateBullets'](1 / 60);
      }
    }
    expect(plain.zombies.filter((z) => z.alive).length).toBe(1);
    expect(pierce.zombies.filter((z) => z.alive).length).toBe(0);
  });

  it('升级进化：火力换开局枪、射速换子弹、兵力加数字门', () => {
    expect(upgradeEffects({ damage: 5 }).startTier).toBe(0);
    expect(upgradeEffects({ damage: 6 }).startTier).toBe(1);
    expect(upgradeEffects({ rate: 16 }).ammo).toBe(2);
    expect(upgradeEffects({ soldiers: 6 }).gateBonus).toBeCloseTo(1.2, 5);
    expect(upgradeEffects({ income: 5 }).coinMult).toBeCloseTo(1.4, 5);
    // 开局枪已经比武器箱给的好：这个箱子改成给兵
    const w = new World(generateDefense(2), { startSoldiers: 10, damageMult: 1, rateMult: 1, startTier: 2 });
    expect(w.squad.tier).toBe(2);
    for (const b of w.barrels) if (b.reward.kind === 'weapon') expect(b.reward.tier).toBeGreaterThan(2);
  });
});
