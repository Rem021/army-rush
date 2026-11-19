import type { BlitzStage } from './config';
import type { BarrelSpec, GateSpec, HazardSpec, LevelSpec, Reward, SpawnSpec, TankSpec, ZombieSpec } from './level';
import type { WorldOptions } from './world';

/** 广告奇袭三路坐标：左路 +1 成长门 · 中路敌军与红油桶 · 右路重装坦克与奖励宝库 */
export const BLITZ_LANES = {
  left: -3.6,
  mid: 0,
  right: 3.6,
} as const;

export function blitzOptions(stage: BlitzStage): WorldOptions {
  return stage === 2
    ? {
        startSoldiers: 8,
        startTier: 1,
        damageMult: 1.25,
        rateMult: 1.15,
        ammo: 0,
        steerMult: 1.3,
        warnMult: 1.15,
        coinMult: 1.2,
        seed: 10202,
      }
    : {
        startSoldiers: 7,
        startTier: 1,
        damageMult: 1.15,
        rateMult: 1.1,
        ammo: 0,
        steerMult: 1.25,
        warnMult: 1.2,
        coinMult: 1.1,
        seed: 5101,
      };
}

interface TankConvoy {
  tank: TankSpec;
  hp: number;
  r: number;
  rewards: { reward: Reward; look: BarrelSpec['look'] }[];
  gate?: { kind: GateSpec['kind']; value: number };
}

function buildStage1Convoys(): TankConvoy[] {
  return [
    {
      tank: { tier: 1, name: '轻甲突击车', fireInterval: 5.2 },
      hp: 300,
      r: 1.45,
      rewards: [
        { reward: { kind: 'weapon', tier: 2 }, look: 'crate' },
        { reward: { kind: 'rate', amount: 25 }, look: 'crate' },
        { reward: { kind: 'drone', amount: 1 }, look: 'armor' },
        { reward: { kind: 'shield', amount: 6 }, look: 'armor' },
      ],
      gate: { kind: 'add', value: 10 },
    },
    {
      tank: { tier: 2, name: '重装主战坦克', fireInterval: 4.2 },
      hp: 2200,
      r: 1.55,
      rewards: [
        { reward: { kind: 'multishot', amount: 1 }, look: 'armor' },
        { reward: { kind: 'weapon', tier: 4 }, look: 'crate' },
        { reward: { kind: 'ammo', level: 2 }, look: 'crate' },
        { reward: { kind: 'drone', amount: 1 }, look: 'armor' },
        { reward: { kind: 'damage', amount: 30 }, look: 'crate' },
      ],
      gate: { kind: 'mul', value: 1.5 },
    },
    {
      tank: { tier: 3, name: '天启双管坦克', fireInterval: 3.4, twin: true },
      hp: 15000,
      r: 1.65,
      rewards: [
        { reward: { kind: 'weapon', tier: 6 }, look: 'crate' },
        { reward: { kind: 'ammo', level: 3 }, look: 'armor' },
        { reward: { kind: 'multishot', amount: 1 }, look: 'armor' },
        { reward: { kind: 'drone', amount: 2 }, look: 'armor' },
        { reward: { kind: 'airstrike' }, look: 'crate' },
        { reward: { kind: 'shield', amount: 12 }, look: 'armor' },
      ],
      gate: { kind: 'add', value: 24 },
    },
  ];
}

function buildStage2Convoys(): TankConvoy[] {
  return [
    {
      tank: { tier: 1, name: '钢铁步战车', fireInterval: 4.8 },
      hp: 650,
      r: 1.45,
      rewards: [
        { reward: { kind: 'weapon', tier: 2 }, look: 'crate' },
        { reward: { kind: 'drone', amount: 1 }, look: 'armor' },
        { reward: { kind: 'rate', amount: 25 }, look: 'crate' },
        { reward: { kind: 'shield', amount: 8 }, look: 'armor' },
      ],
      gate: { kind: 'add', value: 12 },
    },
    {
      tank: { tier: 2, name: '沙漠重甲坦克', fireInterval: 4.0 },
      hp: 3400,
      r: 1.55,
      rewards: [
        { reward: { kind: 'multishot', amount: 1 }, look: 'armor' },
        { reward: { kind: 'ammo', level: 1 }, look: 'crate' },
        { reward: { kind: 'weapon', tier: 4 }, look: 'crate' },
        { reward: { kind: 'damage', amount: 30 }, look: 'crate' },
      ],
      gate: { kind: 'mul', value: 1.5 },
    },
    {
      tank: { tier: 3, name: '赤焰双管攻城坦', fireInterval: 3.3, twin: true },
      hp: 18000,
      r: 1.62,
      rewards: [
        { reward: { kind: 'weapon', tier: 5 }, look: 'crate' },
        { reward: { kind: 'ammo', level: 2 }, look: 'armor' },
        { reward: { kind: 'drone', amount: 1 }, look: 'armor' },
        { reward: { kind: 'rate', amount: 35 }, look: 'crate' },
        { reward: { kind: 'airstrike' }, look: 'crate' },
      ],
      gate: { kind: 'add', value: 20 },
    },
    {
      tank: { tier: 4, name: '黄金天启巨坦', fireInterval: 2.9, twin: true },
      hp: 46000,
      r: 1.72,
      rewards: [
        { reward: { kind: 'weapon', tier: 6 }, look: 'crate' },
        { reward: { kind: 'ammo', level: 3 }, look: 'armor' },
        { reward: { kind: 'multishot', amount: 1 }, look: 'armor' },
        { reward: { kind: 'drone', amount: 2 }, look: 'armor' },
        { reward: { kind: 'damage', amount: 45 }, look: 'crate' },
        { reward: { kind: 'airstrike' }, look: 'crate' },
      ],
      gate: { kind: 'mul', value: 1.5 },
    },
  ];
}

export function generateBlitz(stage: BlitzStage = 1): LevelSpec {
  const duration = stage === 2 ? 96 : 82;
  const gates: GateSpec[] = [];
  const barrels: BarrelSpec[] = [];
  const zombies: ZombieSpec[] = [];
  const hazards: HazardSpec[] = [];
  const spawns: SpawnSpec[] = [];

  // 1. 左路：源源不断的 +1 可射击成长门（第 2 幕穿插翻转红门、射速门与倍率门）
  const gateCount = 95;
  for (let i = 0; i < gateCount; i++) {
    const d = 14 + i * 5.6;
    let kind: GateSpec['kind'] = 'add';
    let value = 1;
    if (stage === 2) {
      if (i > 2 && i % 6 === 3) {
        // 红转绿翻转门：集火快速翻正！
        kind = 'add';
        value = -4;
      } else if (i > 4 && i % 8 === 6) {
        kind = 'rate';
        value = 8;
      } else if (i > 6 && i % 11 === 10) {
        kind = 'mul';
        value = 1.5;
      }
    } else if (i > 4 && i % 9 === 8) {
      kind = 'rate';
      value = 8;
    }
    gates.push({
      blitzLane: 'left',
      kind,
      x0: -5.25,
      x1: -1.95,
      d,
      value,
      group: i,
    });
  }

  // 2. 右路：重装坦克 + 身后紧贴排列的超级奖励队列（坦克炸毁瞬间放行！）
  const convoys = stage === 2 ? buildStage2Convoys() : buildStage1Convoys();
  let rightD = 22;
  let rightGroup = 10000;
  for (let ci = 0; ci < convoys.length; ci++) {
    const c = convoys[ci];
    barrels.push({
      blitzLane: 'right',
      tank: c.tank,
      x: BLITZ_LANES.right,
      d: rightD,
      r: c.r,
      hp: c.hp,
      block: true,
      look: 'tank',
      reward: { kind: 'coins', amount: 60 + ci * 50 },
    });
    rightD += 4.6;
    for (const item of c.rewards) {
      barrels.push({
        blitzLane: 'right',
        x: BLITZ_LANES.right,
        d: rightD,
        r: 0.92,
        hp: 1,
        look: item.look,
        reward: item.reward,
      });
      rightD += 3.5;
    }
    if (c.gate) {
      gates.push({
        blitzLane: 'right',
        kind: c.gate.kind,
        x0: 1.95,
        x1: 5.25,
        d: rightD,
        value: c.gate.value,
        group: rightGroup++,
      });
      rightD += 5.4;
    }
    rightD += 4.5;
  }

  // 3. 中路：开局先导敌军 + 定时尸潮波次 + 爆裂红油桶 + 中途巨尸 + 终局 Boss
  for (let i = 0; i < 14; i++) {
    zombies.push({
      kind: 'walker',
      x: -1.2 + (i % 5) * 0.6,
      d: 26 + Math.floor(i / 5) * 2.1,
      hp: 8,
    });
  }

  // 中路爆裂红油桶：随时间滑入敌阵，一枪点爆清中路！
  const bombCount = stage === 2 ? 12 : 9;
  for (let i = 0; i < bombCount; i++) {
    barrels.push({
      blitzLane: 'mid',
      x: ((i % 3) - 1) * 0.75,
      d: 34 + i * 26,
      r: 0.72,
      hp: 16 + i * 6,
      look: 'bomb',
      reward: { kind: 'boom', radius: 4.5 },
    });
  }

  // 中路定时敌军波次与 Boss
  spawns.push({
    t: 2,
    banner: {
      d: 0,
      text: stage === 2 ? '左门成长 · 中清敌潮 · 右轰重坦！' : '左吃 +1 扩兵 · 右轰坦克爆神装！',
      tone: 'info',
    },
  });

  for (let t = 10; t < duration - 6; t += stage === 2 ? 11 : 13) {
    const p = t / duration;
    spawns.push({ t, wave: Math.round((stage === 2 ? 18 : 14) + p * (stage === 2 ? 32 : 24)) });
  }

  // 中途巨尸施压
  spawns.push({
    t: Math.round(duration * 0.42),
    zombie: { kind: 'giant', x: 0, d: 2, hp: stage === 2 ? 950 : 620, reward: { kind: 'soldiers', amount: 8 } },
    banner: { d: 0, text: '中路巨尸逼近！注意爆裂油桶', tone: 'danger' },
  });

  if (stage === 2) {
    spawns.push({
      t: Math.round(duration * 0.68),
      zombie: { kind: 'giant', x: 0, d: 2, hp: 2600, reward: { kind: 'airstrike' } },
      banner: { d: 0, text: '精英尸潮狂攻！收割右路神装反击', tone: 'danger' },
    });
    // 第 2 幕中路锯片陷阱
    hazards.push({ kind: 'saw', x0: -1.4, x1: 1.4, d0: 6.8, d1: 7.4 });
  }

  // 终局 Boss（与重装坦克夹击，击毁全部坦克 + 终局 Boss 获胜！）
  if (stage === 2) {
    spawns.push({
      t: duration,
      boss: { kind: 'brute', x: -0.7, hp: 36000 },
      banner: { d: 0, text: '终局双 Boss 与黄金巨坦总攻！', tone: 'boss' },
    });
    spawns.push({
      t: duration + 0.5,
      boss: { kind: 'thrower', x: 0.7, hp: 26000 },
    });
  } else {
    spawns.push({
      t: duration,
      boss: { kind: 'brute', x: 0, hp: 16500 },
      banner: { d: 0, text: '终局巨尸王降临！全军总攻！', tone: 'boss' },
    });
  }

  spawns.sort((a, b) => a.t - b.t);

  return {
    mode: 'blitz',
    level: stage,
    theme: stage === 2 ? 1 : 0,
    length: Infinity,
    gates,
    barrels,
    zombies,
    walls: [],
    hazards,
    banners: [],
    bosses: [],
    defense: {
      conveyor: 14,
      spawnD: 56,
      stopD: 20,
      gateSide: 1,
      duration,
      spawns,
    },
    expected: 90,
    estimates: [],
  };
}
