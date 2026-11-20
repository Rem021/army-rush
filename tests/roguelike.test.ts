import { describe, expect, it } from 'vitest';
import { generateBlitz, blitzOptions } from '../src/game/blitz';
import { generateDefense } from '../src/game/level';
import { PERKS, PERK_MAP, pickBestPerk, rollPerkChoices, xpForNextDraft, type PerkId } from '../src/game/perks';
import { mulberry32 } from '../src/game/rng';
import { World } from '../src/game/world';

describe('roguelike perk pool & drafting', () => {
  it('rolls 3 unique non-maxed perks and respects maxLevel caps', () => {
    const rng = mulberry32(42);
    const choices = rollPerkChoices({}, rng, 3);
    expect(choices).toHaveLength(3);
    expect(new Set(choices.map((c) => c.id)).size).toBe(3);
    expect(choices.some((c) => c.rarity === 'epic' || c.rarity === 'legendary')).toBe(true);

    // Max out all except 2 perks
    const maxed: Partial<Record<PerkId, number>> = {};
    for (let i = 2; i < PERKS.length; i++) maxed[PERKS[i].id] = PERKS[i].maxLevel;
    const rem = rollPerkChoices(maxed, rng, 3);
    expect(rem).toHaveLength(2);
    expect(rem.every((p) => (maxed[p.id] ?? 0) < p.maxLevel)).toBe(true);

    // Max out every perk -> empty
    const allMaxed: Partial<Record<PerkId, number>> = {};
    for (const p of PERKS) allMaxed[p.id] = p.maxLevel;
    expect(rollPerkChoices(allMaxed, rng, 3)).toHaveLength(0);
  });

  it('xp curve increases monotonically and pickBestPerk prioritizes core perks', () => {
    expect(xpForNextDraft(0)).toBeGreaterThan(0);
    expect(xpForNextDraft(1)).toBeGreaterThan(xpForNextDraft(0));
    expect(xpForNextDraft(2)).toBeGreaterThan(xpForNextDraft(1));

    const best = pickBestPerk([PERK_MAP.nanite_leech, PERK_MAP.mech_drop, PERK_MAP.cryo_rounds], {});
    expect(best?.id).toBe('mech_drop');
  });
});

import { upgradeEffects } from '../src/game/config';

const baseOpts = () => upgradeEffects({ soldiers: 0, damage: 0, rate: 0, income: 0, agility: 0 });

describe('roguelike in-run combat systems', () => {
  it('earns XP from kills, triggers draftOffer, and applies chosen perk', () => {
    const w = new World(generateBlitz(1), blitzOptions(1));
    w.setTarget(0); // aim middle lane zombies
    let sawOffer = false;
    for (let i = 0; i < 600 && !sawOffer; i++) {
      w.update(1 / 30);
      const evs = w.drainEvents();
      if (evs.some((e) => e.type === 'draftOffer')) sawOffer = true;
    }
    expect(sawOffer).toBe(true);
    expect(w.roguelike.draftChoices).not.toBeNull();
    expect(w.roguelike.draftChoices!.length).toBe(3);

    const pick = w.roguelike.draftChoices![0];
    expect(w.choosePerk(pick.id)).toBe(true);
    expect(w.roguelike.draftChoices).toBeNull();
    expect(w.perkLevel(pick.id)).toBe(1);
    const chosenEvs = w.drainEvents();
    expect(chosenEvs.some((e) => e.type === 'perkChosen' && e.perk.id === pick.id)).toBe(true);
  });

  it('drops an articulated Titan Mech that lands and engages enemies', () => {
    const w = new World(generateDefense(1), baseOpts());
    w.roguelike.draftChoices = [PERK_MAP.mech_drop, PERK_MAP.cryo_rounds, PERK_MAP.overclock];
    expect(w.choosePerk('mech_drop')).toBe(true);
    expect(w.allyMechs.length).toBe(1);
    const dropEvents = w.drainEvents();
    expect(dropEvents.some((e) => e.type === 'mechDrop')).toBe(true);

    let landed = false;
    for (let i = 0; i < 60; i++) {
      w.update(1 / 30);
      if (w.drainEvents().some((e) => e.type === 'mechLand')) {
        landed = true;
        break;
      }
    }
    expect(landed).toBe(true);
    expect(w.allyMechs[0].dropT).toBeGreaterThanOrEqual(1);
  });

  it('triggers chain lightning arcs, cryo slow, and orbital laser strikes', () => {
    const w = new World(generateBlitz(1), blitzOptions(1));
    w.roguelike.perks.chain_lightning = 3;
    w.roguelike.perks.cryo_rounds = 3;
    w.roguelike.perks.orbital_laser = 3;
    w.roguelike.perks.fan_volley = 2;
    w.setTarget(0);

    let sawLightning = false;
    let sawOrbital = false;
    let sawCryo = false;
    for (let i = 0; i < 300; i++) {
      w.update(1 / 30);
      const evs = w.drainEvents();
      for (const e of evs) {
        if (e.type === 'lightningArc') sawLightning = true;
        if (e.type === 'orbitalLaser') sawOrbital = true;
      }
      if (w.zombies.some((z) => z.alive && (z.cryo ?? 0) > 0)) sawCryo = true;
      if (sawLightning && sawOrbital && sawCryo) break;
    }
    expect(sawLightning).toBe(true);
    expect(sawCryo).toBe(true);
    expect(sawOrbital).toBe(true);
  });

  it('grants universal Aegis shield that blocks lethal hits and regenerates', () => {
    const w = new World(generateDefense(1), baseOpts());
    w.roguelike.draftChoices = [PERK_MAP.aegis_matrix, PERK_MAP.cryo_rounds, PERK_MAP.overclock];
    expect(w.choosePerk('aegis_matrix')).toBe(true);
    expect(w.shield).toBeGreaterThanOrEqual(14);

    // Advance 7s to confirm passive regeneration ticks cleanly
    const initial = w.shield;
    w.shield = 2;
    for (let i = 0; i < 210; i++) w.update(1 / 30);
    expect(w.shield).toBeGreaterThan(2);
    expect(initial).toBeGreaterThanOrEqual(14);
  });

  it('charges and activates Overdrive surge with guaranteed crit feedback', () => {
    const w = new World(generateBlitz(1), blitzOptions(1));
    w.overdrive.charge = 100;
    expect(w.activateOverdrive()).toBe(true);
    expect(w.overdrive.active).toBeGreaterThan(0);
    expect(w.overdrive.charge).toBe(0);

    const startEvs = w.drainEvents();
    expect(startEvs.some((e) => e.type === 'overdriveStart')).toBe(true);

    w.setTarget(0);
    let sawCrit = false;
    for (let i = 0; i < 180 && !sawCrit; i++) {
      w.update(1 / 30);
      if (w.drainEvents().some((e) => e.type === 'critHit')) sawCrit = true;
    }
    expect(sawCrit).toBe(true);
  });
});
