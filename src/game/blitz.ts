import type { BlitzStage } from './config';
import type { BarrelSpec, GateSpec, HazardSpec, LevelSpec, Reward, SpawnSpec, TankSpec, ZombieSpec } from './level';
import type { WorldOptions } from './world';

/** 广告奇袭三路坐标：左路极速 +1 传送门 · 中路密集尸潮/Boss/红油桶 · 右路重装坦克（击毁收编参战！）+ 超级奖励宝库 */
export const BLITZ_LANES = {
  left: -3.6,
  mid: 0,
  right: 3.6,
} as const;

export function blitzOptions(stage: BlitzStage): WorldOptions {
  return stage === 2
    ? {
        startSoldiers: 10,
        startTier: 1,
        damageMult: 1.25,
        rateMult: 1.15,
        ammo: 0,
        steerMult: 1.35,
        warnMult: 1.15,
        coinMult: 1.25,
        seed: 10202,
      }
    : {
        startSoldiers: 8,
        startTier: 1,
        damageMult: 1.2,
        rateMult: 1.12,
        ammo: 0,
        steerMult: 1.3,
        warnMult: 1.2,
        coinMult: 1.15,
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
      tank: { tier: 1, name: '轻甲突击坦', fireInterval: 5.2 },
      hp: 260,
      r: 1.45,
      rewards: [
        { reward: { kind: 'weapon', tier: 2 }, look: 'crate' },
        { reward: { kind: 'hero', hero: 'pyro' }, look: 'hero' },
        { reward: { kind: 'drone', amount: 1 }, look: 'armor' },
        { reward: { kind: 'turret', duration: 24 }, look: 'turret' },
        { reward: { kind: 'rate', amount: 25 }, look: 'crate' },
        { reward: { kind: 'shield', amount: 8 }, look: 'armor' },
      ],
      gate: { kind: 'add', value: 12 },
    },
    {
      tank: { tier: 2, name: '重装主战坦', fireInterval: 4.3 },
      hp: 2100,
      r: 1.55,
      rewards: [
        { reward: { kind: 'multishot', amount: 1 }, look: 'armor' },
        { reward: { kind: 'hero', hero: 'railgun' }, look: 'hero' },
        { reward: { kind: 'weapon', tier: 4 }, look: 'crate' },
        { reward: { kind: 'ammo', level: 2 }, look: 'armor' },
        { reward: { kind: 'mystery' }, look: 'mystery' },
        { reward: { kind: 'damage', amount: 35 }, look: 'crate' },
        { reward: { kind: 'drone', amount: 1 }, look: 'armor' },
      ],
      gate: { kind: 'mul', value: 1.5 },
    },
    {
      tank: { tier: 3, name: '天启双管坦', fireInterval: 3.5, twin: true },
      hp: 14500,
      r: 1.65,
      rewards: [
        { reward: { kind: 'weapon', tier: 6 }, look: 'crate' },
        { reward: { kind: 'hero', hero: 'commander' }, look: 'hero' },
        { reward: { kind: 'ammo', level: 3 }, look: 'armor' },
        { reward: { kind: 'multishot', amount: 1 }, look: 'armor' },
        { reward: { kind: 'turret', duration: 26 }, look: 'turret' },
        { reward: { kind: 'drone', amount: 2 }, look: 'armor' },
        { reward: { kind: 'airstrike' }, look: 'crate' },
        { reward: { kind: 'shield', amount: 14 }, look: 'armor' },
      ],
      gate: { kind: 'add', value: 26 },
    },
  ];
}

function buildStage2Convoys(): TankConvoy[] {
  return [
    {
      tank: { tier: 1, name: '钢铁步战坦', fireInterval: 4.8 },
      hp: 340,
      r: 1.45,
      rewards: [
        { reward: { kind: 'weapon', tier: 2 }, look: 'crate' },
        { reward: { kind: 'hero', hero: 'pyro' }, look: 'hero' },
        { reward: { kind: 'drone', amount: 1 }, look: 'armor' },
        { reward: { kind: 'turret', duration: 24 }, look: 'turret' },
        { reward: { kind: 'rate', amount: 28 }, look: 'crate' },
        { reward: { kind: 'shield', amount: 10 }, look: 'armor' },
      ],
      gate: { kind: 'add', value: 14 },
    },
    {
      tank: { tier: 2, name: '沙漠重甲坦', fireInterval: 4.0 },
      hp: 3200,
      r: 1.55,
      rewards: [
        { reward: { kind: 'multishot', amount: 1 }, look: 'armor' },
        { reward: { kind: 'hero', hero: 'railgun' }, look: 'hero' },
        { reward: { kind: 'ammo', level: 1 }, look: 'armor' },
        { reward: { kind: 'weapon', tier: 4 }, look: 'crate' },
        { reward: { kind: 'mystery' }, look: 'mystery' },
        { reward: { kind: 'damage', amount: 35 }, look: 'crate' },
        { reward: { kind: 'airstrike' }, look: 'crate' },
      ],
      gate: { kind: 'mul', value: 1.5 },
    },
    {
      tank: { tier: 3, name: '赤焰双管坦', fireInterval: 3.3, twin: true },
      hp: 17500,
      r: 1.62,
      rewards: [
        { reward: { kind: 'weapon', tier: 5 }, look: 'crate' },
        { reward: { kind: 'hero', hero: 'commander' }, look: 'hero' },
        { reward: { kind: 'ammo', level: 2 }, look: 'armor' },
        { reward: { kind: 'turret', duration: 26 }, look: 'turret' },
        { reward: { kind: 'drone', amount: 2 }, look: 'armor' },
        { reward: { kind: 'rate', amount: 35 }, look: 'crate' },
        { reward: { kind: 'shield', amount: 12 }, look: 'armor' },
      ],
      gate: { kind: 'add', value: 22 },
    },
    {
      tank: { tier: 4, name: '黄金天启巨坦', fireInterval: 2.9, twin: true },
      hp: 44000,
      r: 1.72,
      rewards: [
        { reward: { kind: 'weapon', tier: 6 }, look: 'crate' },
        { reward: { kind: 'mystery' }, look: 'mystery' },
        { reward: { kind: 'ammo', level: 3 }, look: 'armor' },
        { reward: { kind: 'multishot', amount: 1 }, look: 'armor' },
        { reward: { kind: 'turret', duration: 28 }, look: 'turret' },
        { reward: { kind: 'drone', amount: 2 }, look: 'armor' },
        { reward: { kind: 'damage', amount: 50 }, look: 'crate' },
        { reward: { kind: 'airstrike' }, look: 'crate' },
      ],
      gate: { kind: 'mul', value: 1.5 },
    },
  ];
}

export function generateBlitz(stage: BlitzStage = 1): LevelSpec {
  const duration = stage === 2 ? 90 : 78;
  const gates: GateSpec[] = [];
  const barrels: BarrelSpec[] = [];
  const zombies: ZombieSpec[] = [];
  const hazards: HazardSpec[] = [];
  const spawns: SpawnSpec[] = [];

  // 1. 左路：极速滑来的固定 +1 数字门流（不可射击增长，密集高频吃门滚雪球！）
  const gateCount = 240;
  for (let i = 0; i < gateCount; i++) {
    const d = 8.5 + i * 3.1;
    let kind: GateSpec['kind'] = 'add';
    let value = 1;
    if (stage === 2 && i > 5 && i % 10 === 9) {
      kind = 'add';
      value = 2;
    } else if (i > 7 && i % 16 === 15) {
      kind = 'rate';
      value = 10;
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

  // 2. 右路：重装坦克 + 身后堆叠超级奖励（击毁坦克瞬间收编开上前线一起打，英雄舱/机枪炮台/神秘盲盒全线放行！）
  const convoys = stage === 2 ? buildStage2Convoys() : buildStage1Convoys();
  let rightD = 20;
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
      reward: { kind: 'coins', amount: 80 + ci * 60 },
    });
    rightD += 4.2;
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
      rightD += 2.95;
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
      rightD += 4.6;
    }
    rightD += 3.8;
  }

  // 3. 中路：开局就铺满密集敌潮！
  const openingCount = stage === 2 ? 44 : 36;
  const openCols = 6;
  for (let i = 0; i < openingCount; i++) {
    const row = Math.floor(i / openCols);
    const col = i % openCols;
    zombies.push({
      kind: row > 3 && col % 3 === 1 ? 'runner' : 'walker',
      x: -1.55 + col * 0.62 + (row % 2 ? 0.14 : -0.1),
      d: 18 + row * 1.45,
      hp: stage === 2 ? 8 : 7,
    });
  }

  // 中路高密爆破红油桶 + 液氮冰冻桶交替登场：一点炸翻或全场急冻脆化！
  const bombCount = stage === 2 ? 18 : 14;
  for (let i = 0; i < bombCount; i++) {
    const isCryo = i % 3 === 1;
    barrels.push({
      blitzLane: 'mid',
      x: ((i % 3) - 1) * 0.85,
      d: 26 + i * 20,
      r: 0.78,
      hp: 16 + i * 7,
      look: isCryo ? 'cryo' : 'bomb',
      reward: isCryo ? { kind: 'freeze', radius: 6.4 } : { kind: 'boom', radius: 5.2 },
    });
  }

  // 4. 中路密集敌潮波次 + 黄金武装军火补给车 + 多波 Boss 连番登场
  spawns.push({
    t: 1.5,
    banner: {
      d: 0,
      text: '左吃极速 +1 门 · 右轰坦克救英雄抢炮台 · 中路引爆油桶/冰桶！',
      tone: 'info',
    },
  });

  // 广告彩蛋：定时驶入黄金武装军火补给车，打爆狂喷金币钻石+盲盒大奖！
  if (stage === 1) {
    spawns.push({
      t: 20,
      banner: { d: 0, text: '黄金军火补给车突入中路！集火打爆抢神秘大奖！', tone: 'info' },
      truck: { hp: 380, speed: 3.4, sway: 1.25, coins: 180, reward: { kind: 'mystery' } },
    });
    spawns.push({
      t: 52,
      banner: { d: 0, text: '重装黄金补给车现身！打爆空降自动加特林炮台！', tone: 'info' },
      truck: { hp: 2200, speed: 3.6, sway: 1.35, coins: 260, reward: { kind: 'turret', duration: 28 } },
    });
  } else {
    spawns.push({
      t: 17,
      banner: { d: 0, text: '黄金军火补给车现身！打爆狂喷金币+神秘盲盒！', tone: 'info' },
      truck: { hp: 460, speed: 3.5, sway: 1.3, coins: 200, reward: { kind: 'mystery' } },
    });
    spawns.push({
      t: 44,
      banner: { d: 0, text: '第二辆黄金补给车冲阵！打爆空降重型炮台！', tone: 'info' },
      truck: { hp: 2600, speed: 3.7, sway: 1.35, coins: 280, reward: { kind: 'turret', duration: 28 } },
    });
    spawns.push({
      t: 68,
      banner: { d: 0, text: '终极黄金宝藏车登场！打爆抽取终极大奖！', tone: 'info' },
      truck: { hp: 5800, speed: 3.8, sway: 1.4, coins: 380, reward: { kind: 'mystery' } },
    });
  }

  const waveInterval = stage === 2 ? 5.5 : 6.5;
  for (let t = 6; t < duration - 4; t += waveInterval) {
    const p = t / duration;
    spawns.push({ t, wave: Math.round((stage === 2 ? 32 : 26) + p * (stage === 2 ? 34 : 26)) });
  }

  // 中途巨尸穿插施压
  spawns.push({
    t: 22,
    zombie: { kind: 'giant', x: -0.6, d: 2, hp: stage === 2 ? 1100 : 750, reward: { kind: 'soldiers', amount: 8 } },
  });
  spawns.push({
    t: 48,
    zombie: { kind: 'giant', x: 0.6, d: 2, hp: stage === 2 ? 3200 : 2100, reward: { kind: 'airstrike' } },
  });

  if (stage === 1) {
    // 第 1 阶：总共 6 个 Boss（4 轮中途 Boss + 终局双王）
    spawns.push({
      t: 14,
      boss: { kind: 'brute', x: 0, hp: 2200 },
      banner: { d: 0, text: '先锋巨尸王突袭中路！收编右路坦克一起轰！', tone: 'boss' },
    });
    spawns.push({
      t: 30,
      boss: { kind: 'thrower', x: 0.25, hp: 5200 },
      banner: { d: 0, text: '投弹屠夫王登场！注意躲避红圈炮击', tone: 'boss' },
    });
    spawns.push({
      t: 46,
      boss: { kind: 'brute', x: -0.25, hp: 11000 },
      banner: { d: 0, text: '铁甲暴君杀入中路！全军与友军坦克集火！', tone: 'boss' },
    });
    spawns.push({
      t: 62,
      boss: { kind: 'thrower', x: 0, hp: 17500 },
      banner: { d: 0, text: '烈焰投弹王压境！准备迎接终局总攻', tone: 'boss' },
    });
    spawns.push({
      t: duration,
      boss: { kind: 'brute', x: -0.8, hp: 26000 },
      banner: { d: 0, text: '终局双王总攻！坦克编队全火力齐射！', tone: 'boss' },
    });
    spawns.push({
      t: duration + 0.4,
      boss: { kind: 'thrower', x: 0.8, hp: 21000 },
    });
  } else {
    // 第 2 阶：总共 10 个 Boss（连环双王压境 + 终局三王总攻）+ 中路移动锯片
    hazards.push({ kind: 'saw', x0: -1.45, x1: 1.45, d0: 7.0, d1: 7.6 });
    spawns.push({
      t: 11,
      boss: { kind: 'brute', x: 0, hp: 3000 },
      banner: { d: 0, text: '狂暴先锋王突袭！快抢右路首辆重装坦克！', tone: 'boss' },
    });
    spawns.push({
      t: 24,
      boss: { kind: 'thrower', x: 0.3, hp: 6800 },
      banner: { d: 0, text: '重炮投弹王进场！中路密集尸潮同步狂攻', tone: 'boss' },
    });
    spawns.push({
      t: 38,
      boss: { kind: 'brute', x: -0.75, hp: 12500 },
      banner: { d: 0, text: '双王合击！重坦编队全线压制！', tone: 'boss' },
    });
    spawns.push({
      t: 38.4,
      boss: { kind: 'thrower', x: 0.75, hp: 10500 },
    });
    spawns.push({
      t: 54,
      boss: { kind: 'brute', x: 0, hp: 21000 },
      banner: { d: 0, text: '地狱暴君冲阵！炸毁油桶清屏！', tone: 'boss' },
    });
    spawns.push({
      t: 70,
      boss: { kind: 'brute', x: -0.75, hp: 30000 },
      banner: { d: 0, text: '精英双王来袭！击毁黄金天启巨坦入队！', tone: 'boss' },
    });
    spawns.push({
      t: 70.4,
      boss: { kind: 'thrower', x: 0.75, hp: 26000 },
    });
    spawns.push({
      t: duration,
      boss: { kind: 'brute', x: -1.0, hp: 44000 },
      banner: { d: 0, text: '终局三王总攻！全装甲坦克群齐射！', tone: 'boss' },
    });
    spawns.push({
      t: duration + 0.35,
      boss: { kind: 'thrower', x: 0, hp: 34000 },
    });
    spawns.push({
      t: duration + 0.7,
      boss: { kind: 'brute', x: 1.0, hp: 40000 },
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
      conveyor: 6.4,
      spawnD: 54,
      stopD: 19,
      gateSide: -1,
      duration,
      spawns,
    },
    expected: stage === 2 ? 185 : 155,
    estimates: [],
  };
}
