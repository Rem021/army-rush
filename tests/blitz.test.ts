import { describe, expect, it } from 'vitest';
import { blitzStageUnlocked, clearedStages, modeUnlocked } from '../src/game/access';
import { BLITZ_LANES, blitzOptions, generateBlitz } from '../src/game/blitz';
import { Bot } from '../src/game/bot';
import { settleRun } from '../src/game/economy';
import { mulberry32 } from '../src/game/rng';
import { World } from '../src/game/world';
import { loadSave, resetSave, type SaveData } from '../src/save';

function freshSave(): SaveData {
  const s = loadSave();
  resetSave(s);
  return s;
}

function simulateBlitz(stage: 1 | 2, maxSeconds = 180) {
  const spec = generateBlitz(stage);
  const w = new World(spec, blitzOptions(stage));
  const bot = new Bot(mulberry32(stage === 1 ? 101 : 202), 0);
  const dt = 1 / 30;
  const steps = Math.ceil(maxSeconds / dt);
  let tankFires = 0;
  let shieldBlocks = 0;
  let strikeBlasts = 0;
  let peakSquad = w.squad.count;
  for (let i = 0; i < steps && w.state !== 'won' && w.state !== 'lost'; i++) {
    w.setTarget(bot.target(w));
    w.update(dt);
    peakSquad = Math.max(peakSquad, w.squad.count);
    for (const e of w.drainEvents()) {
      if (e.type === 'tankFire') tankFires++;
      else if (e.type === 'shieldBlock') shieldBlocks++;
      else if (e.type === 'explode' && e.source === 'strike') strikeBlasts++;
    }
  }
  return { w, tankFires, shieldBlocks, strikeBlasts, peakSquad };
}

describe('Blitz unlock & save rules', () => {
  it('unlocks Stage 1 after 5 clears and Stage 2 after 10 clears (defense or campaign)', () => {
    const s = freshSave();
    expect(clearedStages(s)).toBe(0);
    expect(modeUnlocked(s, 'blitz')).toBe(false);
    expect(blitzStageUnlocked(s, 1)).toBe(false);
    expect(blitzStageUnlocked(s, 2)).toBe(false);

    s.defenseBest = 4;
    expect(modeUnlocked(s, 'blitz')).toBe(false);

    s.defenseBest = 5;
    expect(modeUnlocked(s, 'blitz')).toBe(true);
    expect(blitzStageUnlocked(s, 1)).toBe(true);
    expect(blitzStageUnlocked(s, 2)).toBe(false);

    s.best = 10;
    expect(blitzStageUnlocked(s, 2)).toBe(true);
  });

  it('blitzAdmin unlocks both stages and resetSave clears it', () => {
    const s = freshSave();
    s.blitzAdmin = true;
    s.blitzStage = 2;
    s.blitzBest = 420;
    s.blitzCleared = 2;
    expect(modeUnlocked(s, 'blitz')).toBe(true);
    expect(blitzStageUnlocked(s, 1)).toBe(true);
    expect(blitzStageUnlocked(s, 2)).toBe(true);

    resetSave(s);
    expect(s.blitzAdmin).toBe(false);
    expect(s.blitzStage).toBe(1);
    expect(s.blitzBest).toBe(0);
    expect(s.blitzCleared).toBe(0);
    expect(modeUnlocked(s, 'blitz')).toBe(false);
  });

  it('settleRun rewards coins and first-clear gems without changing main-line levels', () => {
    const s = freshSave();
    s.level = 6;
    s.defenseLevel = 6;
    s.best = 5;
    s.defenseBest = 5;

    const first = settleRun(s, {
      mode: 'blitz',
      level: 1,
      won: true,
      retreated: false,
      practice: false,
      runCoins: 240,
      runGems: 1,
      kills: 180,
      progress: 1,
      distance: 0,
    });
    expect(first.coins).toBeGreaterThan(240);
    expect(first.bonusGems).toBe(2);
    expect(s.gems).toBe(3);
    expect(s.blitzCleared).toBe(1);
    expect(s.blitzBest).toBe(180);
    expect(s.level).toBe(6);
    expect(s.defenseLevel).toBe(6);

    // Replay Stage 1 should not grant duplicate first-clear gems
    const replay = settleRun(s, {
      mode: 'blitz',
      level: 1,
      won: true,
      retreated: false,
      practice: false,
      runCoins: 200,
      runGems: 0,
      kills: 210,
      progress: 1,
      distance: 0,
    });
    expect(replay.bonusGems).toBe(0);
    expect(s.blitzBest).toBe(210);
  });
});

describe('Blitz core mechanics', () => {
  it('shields right-lane rewards behind living tank and lets squad auto-collect after tank breaks', () => {
    const spec = generateBlitz(1);
    const w = new World(spec, blitzOptions(1));
    const tank = w.barrels.find((b) => b.look === 'tank')!;
    const reward = w.barrels.find((b) => b.blitzLane === 'right' && b.look !== 'tank')!;
    expect(tank).toBeDefined();
    expect(reward).toBeDefined();
    expect(tank.d).toBeLessThan(reward.d);

    // Put squad in right lane and shoot tank; reward behind tank stays untouched
    w.setTarget(BLITZ_LANES.right);
    const rewardHp0 = reward.hp;
    for (let i = 0; i < 15; i++) w.update(0.05);
    expect(tank.hp).toBeLessThan(tank.maxHp);
    expect(reward.hp).toBe(rewardHp0);

    // Destroy tank; right-lane reward should slide to squad and grant reward with zero soldier loss
    tank.hp = 1;
    for (let i = 0; i < 60 && tank.alive; i++) w.update(0.05);
    expect(tank.alive).toBe(false);
    expect(w.blitz.tanksDestroyed).toBeGreaterThanOrEqual(1);

    const beforeCount = w.squad.count;
    reward.d = 1.2;
    w.squad.x = BLITZ_LANES.right;
    w.update(0.05);
    expect(reward.alive).toBe(false);
    expect(w.squad.count).toBeGreaterThanOrEqual(beforeCount);
    expect(w.blitz.buffsCollected).toBeGreaterThanOrEqual(1);
  });

  it('left +1 gate upgrades when shot and red flip gate turns positive in Stage 2', () => {
    const spec2 = generateBlitz(2);
    const w = new World(spec2, blitzOptions(2));
    const leftAdd = w.gates.find((g) => g.blitzLane === 'left' && g.kind === 'add' && g.value > 0)!;
    const redFlip = w.gates.find((g) => g.blitzLane === 'left' && g.kind === 'add' && g.value < 0)!;
    expect(leftAdd).toBeDefined();
    expect(redFlip).toBeDefined();

    // Bring leftAdd into firing range and shoot it
    leftAdd.d = 18;
    const v0 = leftAdd.value;
    w.squad.x = BLITZ_LANES.left;
    w.setTarget(BLITZ_LANES.left);
    for (let i = 0; i < 20; i++) w.update(0.05);
    expect(leftAdd.value).toBeGreaterThan(v0);

    // Consume any earlier left gates so bullets directly hit redFlip
    for (const g of w.gates) {
      if (g !== redFlip && g.blitzLane === 'left') g.consumed = true;
    }
    redFlip.d = 18;
    redFlip.value = -2;
    for (let i = 0; i < 60 && redFlip.value <= 0; i++) w.update(0.05);
    expect(redFlip.value).toBeGreaterThan(0);
  });

  it('shield charges absorb incoming zombie casualties and spatial splash damages only nearby zombies', () => {
    const spec = generateBlitz(1);
    const w = new World(spec, { ...blitzOptions(1), ammo: 2 });
    // Grant shield reward via right-lane pickup (clear all other right-lane barrels)
    const shieldBarrel = w.barrels.find((b) => b.reward?.kind === 'shield')!;
    expect(shieldBarrel).toBeDefined();
    for (const b of w.barrels) if (b !== shieldBarrel && b.blitzLane === 'right') b.alive = false;
    shieldBarrel.d = 0.8;
    w.squad.x = BLITZ_LANES.right;
    w.setTarget(BLITZ_LANES.right);
    w.update(0.05);
    expect(w.blitz.shield).toBeGreaterThan(0);

    const beforeSquad = w.squad.count;
    const beforeShield = w.blitz.shield;
    const template = w.zombies[0];
    // Place a zombie directly on squad to trigger contact kill (should be absorbed by shield)
    w.zombies.push({
      ...template,
      id: 99991,
      x: w.squad.x,
      d: 0.2,
      hp: 100,
      maxHp: 100,
      kind: 'walker',
      alive: true,
      active: true,
    });
    w.update(0.05);
    expect(w.squad.count).toBe(beforeSquad);
    expect(w.blitz.shield).toBeLessThan(beforeShield);

    // Spatial splash accuracy: near zombie gets hit by splash, far zombie stays at full HP
    const nearZ = {
      ...template,
      id: 99992,
      x: 0.6,
      d: 14,
      hp: 500,
      maxHp: 500,
      kind: 'walker' as const,
      alive: true,
      active: true,
    };
    const anchorZ = {
      ...nearZ,
      id: 99993,
      x: 0,
      d: 14,
    };
    const farZ = {
      ...nearZ,
      id: 99994,
      x: 0,
      d: 35,
    };
    w.zombies.push(anchorZ, nearZ, farZ);
    w.squad.x = 0;
    w.setTarget(0);
    for (let i = 0; i < 15; i++) w.update(0.05);
    expect(anchorZ.hp).toBeLessThan(500);
    expect(nearZ.hp).toBeLessThan(500);
    expect(farZ.hp).toBe(500);
  });
});

describe('Blitz full headless Bot playthrough', () => {
  it('Stage 1 (重装坦克道) is winnable, destroys all tanks, and collects rich buffs', () => {
    const { w, tankFires, strikeBlasts, peakSquad } = simulateBlitz(1);
    expect(w.state).toBe('won');
    expect(w.blitz.tanksDestroyed).toBe(w.blitz.totalTanks);
    expect(w.blitz.totalTanks).toBe(3);
    expect(w.blitz.buffsCollected).toBeGreaterThanOrEqual(6);
    expect(w.blitz.drones).toBeGreaterThanOrEqual(1);
    expect(w.blitz.multishot).toBeGreaterThanOrEqual(2);
    expect(tankFires).toBeGreaterThan(0);
    expect(strikeBlasts).toBeGreaterThan(0);
    expect(peakSquad).toBeGreaterThan(15);
  });

  it('Stage 2 (广告大乱斗) is winnable, destroys all 4 tanks, and scales to crazy firepower', () => {
    const { w, tankFires, strikeBlasts, peakSquad } = simulateBlitz(2);
    expect(w.state).toBe('won');
    expect(w.blitz.tanksDestroyed).toBe(w.blitz.totalTanks);
    expect(w.blitz.totalTanks).toBe(4);
    expect(w.blitz.buffsCollected).toBeGreaterThanOrEqual(8);
    expect(w.blitz.drones).toBeGreaterThanOrEqual(2);
    expect(w.blitz.multishot).toBeGreaterThanOrEqual(2);
    expect(tankFires).toBeGreaterThan(0);
    expect(strikeBlasts).toBeGreaterThan(0);
    expect(peakSquad).toBeGreaterThan(20);
  });
});
