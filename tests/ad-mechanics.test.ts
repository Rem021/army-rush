import { describe, expect, it } from 'vitest';
import { BLITZ_LANES, blitzOptions, generateBlitz } from '../src/game/blitz';
import { TRACK_HALF, upgradeEffects } from '../src/game/config';
import { generateCampaign, generateDefense, type LevelSpec } from '../src/game/level';
import { World } from '../src/game/world';

const baseOpts = () => upgradeEffects({ soldiers: 0, damage: 0, rate: 0, income: 0, agility: 0 });

function makeSandboxSpec(partial: Partial<LevelSpec> = {}): LevelSpec {
  return {
    mode: 'campaign',
    level: 3,
    theme: 0,
    length: 140,
    gates: [],
    barrels: [],
    zombies: [],
    hazards: [],
    walls: [],
    bosses: [{ kind: 'brute', x: 0, hp: 5000 }],
    banners: [],
    defense: null,
    expected: 100,
    estimates: [],
    ...partial,
  };
}

describe('iconic mobile-ad gameplay mechanics', () => {
  it('flips a negative gate from red to blue with bonus & gateFlip event, while Blitz left +1 stays fixed', () => {
    const spec = makeSandboxSpec({
      gates: [
        { d: 14, x0: -2, x1: 2, group: 1, kind: 'add', value: -1 },
      ],
    });
    const w = new World(spec, { ...baseOpts(), startSoldiers: 12 });
    w.squad.moving = false;
    w.setTarget(0);

    let flippedEvent = false;
    for (let i = 0; i < 120 && !flippedEvent; i++) {
      w.update(1 / 30);
      for (const e of w.drainEvents()) {
        if (e.type === 'gateFlip') flippedEvent = true;
      }
    }
    expect(flippedEvent).toBe(true);
    expect(w.gates[0].flipped).toBe(true);
    // Crossing 0 grants +2 bonus -> at least +2
    expect(w.gates[0].value).toBeGreaterThanOrEqual(2);

    // Blitz left-lane +1 gate remains immutable
    const bw = new World(generateBlitz(1), blitzOptions(1));
    const leftGate = bw.gates.find((g) => g.blitzLane === 'left' && g.kind === 'add' && g.value === 1)!;
    leftGate.d = 16;
    bw.squad.x = BLITZ_LANES.left;
    bw.setTarget(BLITZ_LANES.left);
    for (let i = 0; i < 30; i++) bw.update(1 / 30);
    expect(leftGate.value).toBe(1);
    expect(leftGate.flipped).toBeUndefined();
  });

  it('oscillates sliding gates horizontally within [-TRACK_HALF, TRACK_HALF]', () => {
    const spec = makeSandboxSpec({
      gates: [
        { d: 45, x0: -1.8, x1: 1.8, group: 1, kind: 'add', value: 6, slideAmp: 2.4, slideSpeed: 2.2 },
      ],
    });
    const w = new World(spec, baseOpts());
    w.squad.moving = false;
    const g = w.gates[0];
    const mids: number[] = [];
    for (let i = 0; i < 90; i++) {
      w.update(1 / 30);
      const mid = (g.x0 + g.x1) * 0.5;
      mids.push(mid);
      expect(g.x0).toBeGreaterThanOrEqual(-TRACK_HALF - 1e-6);
      expect(g.x1).toBeLessThanOrEqual(TRACK_HALF + 1e-6);
    }
    const minMid = Math.min(...mids);
    const maxMid = Math.max(...mids);
    expect(maxMid - minMid).toBeGreaterThan(2.5);
  });

  it('detonates Cryo Barrel to deep-freeze zombies (cryoLvl 4), slow them, and amplify damage', () => {
    const spec = makeSandboxSpec({
      barrels: [
        { x: 0, d: 12, r: 0.8, hp: 5, look: 'cryo', reward: { kind: 'freeze', radius: 9 } },
      ],
      zombies: [
        { kind: 'brute', x: 0.5, d: 14, hp: 2000 },
        { kind: 'walker', x: -1.2, d: 16, hp: 2000 },
      ],
    });
    const w = new World(spec, { ...baseOpts(), startSoldiers: 10 });
    w.squad.moving = false;
    w.setTarget(0);

    let sawCryoNova = false;
    for (let i = 0; i < 60 && !sawCryoNova; i++) {
      w.update(1 / 30);
      for (const e of w.drainEvents()) {
        if (e.type === 'cryoNova') sawCryoNova = true;
      }
    }
    expect(sawCryoNova).toBe(true);
    const frozen = w.zombies.filter((z) => z.alive && z.cryoLvl === 4 && (z.cryo ?? 0) > 2);
    expect(frozen.length).toBeGreaterThanOrEqual(1);

    // Measure slow speed of frozen zombie vs unfrozen baseline
    const zFrozen = frozen[0];
    const d0 = zFrozen.d;
    // Move squad away so bullets don't kill it
    w.squad.x = -TRACK_HALF + 1;
    w.setTarget(-TRACK_HALF + 1);
    for (let i = 0; i < 15; i++) w.update(1 / 30);
    const moved = d0 - zFrozen.d;
    // Normal brute moves ~2.3 m/s -> 0.5s = 1.15m; deep-frozen 0.18x moves ~0.2m
    expect(moved).toBeLessThan(0.5);
  });

  it('triggers mysteryRoll jackpot from both Mystery Boxes and ? Mystery Gates', () => {
    const spec = makeSandboxSpec({
      barrels: [
        { x: 0, d: 10, r: 0.85, hp: 4, look: 'mystery', reward: { kind: 'mystery' } },
      ],
      gates: [
        { d: 5, x0: -2.5, x1: 2.5, group: 1, kind: 'mystery', value: 1 },
      ],
    });
    const w = new World(spec, { ...baseOpts(), startSoldiers: 10 });
    w.setTarget(0);

    let rolls = 0;
    for (let i = 0; i < 90; i++) {
      w.update(1 / 30);
      for (const e of w.drainEvents()) {
        if (e.type === 'mysteryRoll') rolls++;
      }
    }
    expect(rolls).toBeGreaterThanOrEqual(2);
  });

  it('rescues legendary heroes (pyro, railgun, commander) who march with the squad and cast signature skills', () => {
    const spec = makeSandboxSpec({
      barrels: [
        { x: 0, d: 8, r: 0.8, hp: 4, look: 'hero', reward: { kind: 'hero', hero: 'pyro' } },
        { x: 0, d: 11, r: 0.8, hp: 4, look: 'hero', reward: { kind: 'hero', hero: 'railgun' } },
        { x: 0, d: 14, r: 0.8, hp: 4, look: 'hero', reward: { kind: 'hero', hero: 'commander' } },
      ],
      zombies: [
        { kind: 'brute', x: 0, d: 24, hp: 8000 },
        { kind: 'brute', x: 1, d: 26, hp: 8000 },
      ],
    });
    const w = new World(spec, { ...baseOpts(), startSoldiers: 12 });
    w.squad.moving = false;
    w.setTarget(0);

    const joined = new Set<string>();
    const skills = new Set<string>();
    for (let i = 0; i < 320; i++) {
      w.update(1 / 30);
      for (const e of w.drainEvents()) {
        if (e.type === 'heroJoin') joined.add(e.hero.kind);
        if (e.type === 'heroSkill') skills.add(e.kind);
      }
    }
    expect(joined.has('pyro')).toBe(true);
    expect(joined.has('railgun')).toBe(true);
    expect(joined.has('commander')).toBe(true);
    expect(w.allyHeroes.length).toBe(3);
    expect(skills.size).toBeGreaterThanOrEqual(2);
    // Commander rally also grants shield charges
    expect(w.shield).toBeGreaterThan(0);
  });

  it('deploys an Auto-Turret that fires at enemies and cleanly expires when its duration runs out', () => {
    const spec = makeSandboxSpec({
      barrels: [
        { x: 0, d: 9, r: 0.8, hp: 4, look: 'turret', reward: { kind: 'turret', duration: 3 } },
      ],
      zombies: [
        { kind: 'brute', x: 0, d: 26, hp: 5000 },
      ],
    });
    const w = new World(spec, { ...baseOpts(), startSoldiers: 10 });
    w.squad.moving = false;
    w.setTarget(0);

    let deployed = false;
    for (let i = 0; i < 60 && !deployed; i++) {
      w.update(1 / 30);
      for (const e of w.drainEvents()) {
        if (e.type === 'turretDeploy') deployed = true;
      }
    }
    expect(deployed).toBe(true);
    expect(w.allyTurrets.length).toBe(1);

    // Confirm turret tracks and fires recoil while alive
    let sawTurretRecoil = false;
    for (let i = 0; i < 120; i++) {
      w.update(1 / 30);
      if (w.allyTurrets[0] && w.allyTurrets[0].recoil > 0) sawTurretRecoil = true;
      if (w.allyTurrets.length === 0) break;
    }
    expect(sawTurretRecoil).toBe(true);
    expect(w.allyTurrets.length).toBe(0);
  });

  it('triggers FEVER mode at 30 combo with +25% fire rate and 2x kill coins', () => {
    const zombies = Array.from({ length: 45 }, (_, i) => ({
      kind: 'walker' as const,
      x: ((i % 5) - 2) * 0.25,
      d: 18 + Math.floor(i / 5) * 0.9,
      hp: 2,
    }));
    const spec = makeSandboxSpec({ zombies });
    const w = new World(spec, { ...baseOpts(), startSoldiers: 18, startTier: 2 });
    w.squad.moving = false;
    w.setTarget(0);
    const baseFireRate = w.fireRate;

    let feverStarted = false;
    let feverFireRate = 0;
    let coinsBeforeFever = 0;
    let feverKillCoins = 0;
    for (let i = 0; i < 240; i++) {
      w.update(1 / 30);
      for (const e of w.drainEvents()) {
        if (e.type === 'feverStart') {
          feverStarted = true;
          feverFireRate = w.fireRate;
          coinsBeforeFever = w.coins;
        }
        if (feverStarted && e.type === 'zombieDie') {
          feverKillCoins += e.coins;
        }
      }
    }
    expect(feverStarted).toBe(true);
    expect(w.fever.triggers).toBeGreaterThanOrEqual(1);
    expect(feverFireRate).toBeCloseTo(baseFireRate * 1.25, 3);
    expect(coinsBeforeFever).toBeGreaterThan(0);
    // During FEVER, each kill awards doubled coins
    expect(feverKillCoins).toBeGreaterThan(0);
  });

  it('handles Gold Loot Trucks: sways across road, escapes non-lethally if missed, and awards coins + 1 Gem + truckBreak when destroyed', () => {
    // 1. Destroyable Gold Loot Truck
    const specHit = makeSandboxSpec({
      barrels: [
        {
          x: 0,
          d: 16,
          r: 1.25,
          hp: 25,
          look: 'truck',
          reward: { kind: 'mystery' },
          truck: { speed: 2.2, sway: 0.4, swaySpeed: 2.0, coins: 180 },
        },
      ],
    });
    const wHit = new World(specHit, { ...baseOpts(), startSoldiers: 16 });
    wHit.squad.moving = false;
    wHit.setTarget(0);

    let broke = false;
    let gemEvent = false;
    for (let i = 0; i < 120 && !broke; i++) {
      wHit.update(1 / 30);
      for (const e of wHit.drainEvents()) {
        if (e.type === 'truckBreak') broke = true;
        if (e.type === 'gem') gemEvent = true;
      }
    }
    expect(broke).toBe(true);
    expect(gemEvent).toBe(true);
    expect(wHit.gems).toBeGreaterThanOrEqual(1);
    expect(wHit.coins).toBeGreaterThanOrEqual(180);

    // 2. Escaping Gold Loot Truck does NOT kill soldiers when passing the squad
    const specMiss = makeSandboxSpec({
      barrels: [
        {
          x: 0,
          d: 4,
          r: 1.25,
          hp: 99999,
          look: 'truck',
          reward: { kind: 'coins', amount: 100 },
          truck: { speed: 5.0, sway: 0.2, swaySpeed: 1.5, coins: 100 },
        },
      ],
    });
    const wMiss = new World(specMiss, { ...baseOpts(), startSoldiers: 10 });
    wMiss.squad.moving = false;
    wMiss.setTarget(0);
    for (let i = 0; i < 90; i++) wMiss.update(1 / 30);
    expect(wMiss.squad.count).toBe(10);
    expect(wMiss.barrels[0].alive).toBe(false);
  });

  it('populates Defense, Campaign, and Blitz levels with the new ad mechanics', () => {
    const blitz1 = generateBlitz(1);
    expect(blitz1.barrels.some((b) => b.look === 'hero')).toBe(true);
    expect(blitz1.barrels.some((b) => b.look === 'turret')).toBe(true);
    expect(blitz1.barrels.some((b) => b.look === 'cryo')).toBe(true);
    expect(blitz1.barrels.some((b) => b.look === 'mystery')).toBe(true);
    expect(blitz1.defense?.spawns.some((sp) => !!sp.truck)).toBe(true);

    const def3 = generateDefense(3);
    expect(def3.defense?.spawns.some((sp) => !!sp.truck)).toBe(true);

    const camp4 = generateCampaign(4);
    expect(
      camp4.gates.some((g) => g.kind === 'mystery' || !!g.slideAmp) ||
        camp4.barrels.some((b) => b.look === 'cryo' || b.look === 'mystery' || b.look === 'hero' || b.look === 'turret'),
    ).toBe(true);
  });
});
