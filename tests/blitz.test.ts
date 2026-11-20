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

function simulateBlitz(stage: 1 | 2, maxSeconds = 200) {
  const spec = generateBlitz(stage);
  const w = new World(spec, blitzOptions(stage));
  const bot = new Bot(mulberry32(stage === 1 ? 101 : 202), 0);
  const dt = 1 / 30;
  const steps = Math.ceil(maxSeconds / dt);
  let tankFires = 0;
  let allyCaptures = 0;
  let allyFires = 0;
  let allyHits = 0;
  let shieldBlocks = 0;
  let strikeBlasts = 0;
  let peakSquad = w.squad.count;
  let bossesDefeated = 0;
  for (let i = 0; i < steps && w.state !== 'won' && w.state !== 'lost'; i++) {
    w.setTarget(bot.target(w));
    w.update(dt);
    peakSquad = Math.max(peakSquad, w.squad.count);
    for (const e of w.drainEvents()) {
      if (e.type === 'tankFire') tankFires++;
      else if (e.type === 'tankCapture') allyCaptures++;
      else if (e.type === 'allyTankFire') allyFires++;
      else if (e.type === 'allyShellHit') allyHits++;
      else if (e.type === 'shieldBlock') shieldBlocks++;
      else if (e.type === 'bossDie') bossesDefeated++;
      else if (e.type === 'explode' && e.source === 'strike') strikeBlasts++;
    }
  }
  return { w, tankFires, allyCaptures, allyFires, allyHits, shieldBlocks, strikeBlasts, peakSquad, bossesDefeated };
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
  it('destroying a Heavy Tank captures it as an AllyTank that drives up and fires explosive shells alongside the squad', () => {
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

    // Destroy tank -> captures AllyTank AND unlocks right-lane rewards
    tank.hp = 1;
    let captured = false;
    for (let i = 0; i < 60 && tank.alive; i++) {
      w.update(0.05);
      for (const e of w.drainEvents()) if (e.type === 'tankCapture') captured = true;
    }
    expect(tank.alive).toBe(false);
    expect(captured).toBe(true);
    expect(w.allyTanks.length).toBe(1);
    expect(w.blitz.allyTanks).toBe(1);

    // Let AllyTank drive down to flank the squad and fire shells at incoming middle-lane enemies
    let fired = 0;
    let blasted = 0;
    for (let i = 0; i < 90; i++) {
      w.update(0.05);
      for (const e of w.drainEvents()) {
        if (e.type === 'allyTankFire') fired++;
        if (e.type === 'allyShellHit') blasted++;
      }
    }
    expect(w.allyTanks[0].phase).toBe('fighting');
    expect(w.allyTanks[0].d).toBeLessThan(4);
    expect(fired).toBeGreaterThanOrEqual(2);
    expect(blasted).toBeGreaterThanOrEqual(1);

    // Right-lane reward auto-collects with zero soldier loss
    const beforeCount = w.squad.count;
    const liveReward = w.barrels.find((b) => b.alive && b.blitzLane === 'right' && b.look !== 'tank') ?? reward;
    if (!w.barrels.includes(liveReward)) w.barrels.push(liveReward);
    liveReward.alive = true;
    liveReward.d = 1.0;
    w.squad.x = BLITZ_LANES.right;
    w.update(0.05);
    expect(liveReward.alive).toBe(false);
    expect(w.squad.count).toBeGreaterThanOrEqual(beforeCount);
    expect(w.blitz.buffsCollected).toBeGreaterThanOrEqual(1);
  });

  it('left +1 number gates never increase when shot and move swiftly down the left lane', () => {
    const spec = generateBlitz(1);
    const w = new World(spec, blitzOptions(1));
    const leftAdd = w.gates.find((g) => g.blitzLane === 'left' && g.kind === 'add' && g.value === 1)!;
    expect(leftAdd).toBeDefined();

    // Place leftAdd in direct line of fire and shoot at it for 1 second
    leftAdd.d = 18;
    const d0 = leftAdd.d;
    w.squad.x = BLITZ_LANES.left;
    w.setTarget(BLITZ_LANES.left);
    for (let i = 0; i < 20; i++) w.update(0.05);

    // Value MUST stay fixed at 1 (shooting does not increment Blitz gates)
    expect(leftAdd.value).toBe(1);
    // And it advanced rapidly (~7.8 m/s)
    expect(d0 - leftAdd.d).toBeGreaterThan(7.0);
  });

  it('shield charges absorb incoming zombie casualties with shockwave repulse and spatial splash hits nearby zombies', () => {
    const spec = generateBlitz(1);
    const w = new World(spec, { ...blitzOptions(1), ammo: 2 });
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
    const attacker = {
      ...template,
      id: 99991,
      x: w.squad.x,
      d: 0.2,
      hp: 500,
      maxHp: 500,
      kind: 'walker' as const,
      alive: true,
      active: true,
    };
    w.zombies.push(attacker);
    w.update(0.05);
    expect(w.squad.count).toBe(beforeSquad);
    expect(w.blitz.shield).toBeLessThan(beforeShield);
    // Shield repulse dealt real damage to the attacker
    expect(attacker.hp).toBeLessThan(500);

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
  it('Stage 1 (重装坦克道) is winnable with dense hordes, 6 Bosses, and captured Allied Tanks fighting together', () => {
    const { w, allyCaptures, allyFires, allyHits, strikeBlasts, peakSquad, bossesDefeated } = simulateBlitz(1);
    expect(w.state).toBe('won');
    expect(w.blitz.tanksDestroyed).toBe(w.blitz.totalTanks);
    expect(allyCaptures).toBe(w.blitz.totalTanks);
    expect(allyFires).toBeGreaterThanOrEqual(15);
    expect(allyHits).toBeGreaterThanOrEqual(15);
    expect(bossesDefeated).toBeGreaterThanOrEqual(6);
    expect(w.blitz.buffsCollected).toBeGreaterThanOrEqual(8);
    expect(w.blitz.drones).toBeGreaterThanOrEqual(2);
    expect(w.blitz.multishot).toBeGreaterThanOrEqual(2);
    expect(w.squad.tier).toBeGreaterThanOrEqual(4);
    expect(strikeBlasts).toBeGreaterThan(0);
    expect(peakSquad).toBeGreaterThan(30);
    expect(w.kills).toBeGreaterThan(220);
  });

  it('Stage 2 (广告大乱斗) is winnable with 4 captured Tanks, 10 Bosses, and massive combat intensity', () => {
    const { w, allyCaptures, allyFires, bossesDefeated, strikeBlasts } = simulateBlitz(2);
    expect(w.state).toBe('won');
    expect(w.blitz.tanksDestroyed).toBe(4);
    expect(allyCaptures).toBe(4);
    expect(allyFires).toBeGreaterThanOrEqual(20);
    expect(bossesDefeated).toBeGreaterThanOrEqual(10);
    expect(w.blitz.buffsCollected).toBeGreaterThanOrEqual(10);
    expect(w.blitz.drones).toBeGreaterThanOrEqual(3);
    expect(w.blitz.multishot).toBe(3);
    expect(w.squad.tier).toBeGreaterThanOrEqual(5);
    expect(strikeBlasts).toBeGreaterThan(0);
    expect(w.kills).toBeGreaterThan(320);
  });
});
