import { afterEach, describe, expect, it, vi } from 'vitest';
import { modeUnlocked } from '../src/game/access';
import { CARNAGE_OPTIONS, generateCarnage } from '../src/game/carnage';
import { generateDefense } from '../src/game/level';
import { World } from '../src/game/world';
import { loadSave, resetSave, writeSave } from '../src/save';

afterEach(() => vi.unstubAllGlobals());
function storage(raw: unknown = null) {
  let value = raw === null ? null : JSON.stringify(raw);
  vi.stubGlobal('localStorage', { getItem: () => value, setItem: (_k: string, v: string) => { value = v; } });
}
describe('火力狂潮解锁与存档', () => {
  it('必须实际通关 30 关；当前关卡和调试跳关不代替通关', () => {
    storage(); const s = loadSave();
    s.level = s.defenseLevel = 999;
    expect(modeUnlocked(s, 'carnage')).toBe(false);
    s.best = 29; expect(modeUnlocked(s, 'carnage')).toBe(false);
    s.defenseBest = 30; expect(modeUnlocked(s, 'carnage')).toBe(true);
  });
  it('管理员通行证持久化且不伪造资源和主线，重置后撤销', () => {
    storage(); const s = loadSave(); const before = { ...s };
    s.carnageAdmin = true; writeSave(s);
    expect(modeUnlocked(loadSave(), 'carnage')).toBe(true);
    expect({ ...loadSave(), carnageAdmin: false }).toEqual(before);
    resetSave(s); expect(modeUnlocked(s, 'carnage')).toBe(false);
  });
  it('旧存档兼容，管理员字段严格校验', () => {
    storage({ level: 12, best: 11, coins: 456, carnageAdmin: 'true', carnageBest: 'invalid' });
    const s = loadSave(); expect(s.coins).toBe(456); expect(s.best).toBe(11);
    expect(s.carnageAdmin).toBe(false); expect(s.carnageBest).toBe(0);
  });
});
describe('狂潮战斗', () => {
  it('专用军团上限和弹药不改变主线', () => {
    const c = new World(generateCarnage(), { ...CARNAGE_OPTIONS, startSoldiers: 999 });
    const d = new World(generateDefense(1), { ...CARNAGE_OPTIONS, startSoldiers: 999 });
    expect(c.squad.count).toBe(240); expect(d.squad.count).toBe(64);
    expect(c.ammo.pierce).toBe(4); expect(d.ammo.pierce).toBe(1);
  });
  it('清屏实际造成伤害，消耗能量且结束后不可释放', () => {
    const spec = generateCarnage();
    spec.zombies.push({ kind: 'walker', hp: 100, x: 0, d: 20 });
    const w = new World(spec, CARNAGE_OPTIONS);
    expect(w.releaseNova()).toBe(false);
    w.carnage.charge = 100;
    const rate = w.fireRate;
    expect(w.releaseNova()).toBe(true);
    expect(w.zombies[0].alive).toBe(false);
    expect(w.carnage.charge).toBeLessThan(2);
    expect(w.fireRate).toBe(rate * 2);
    expect(w.releaseNova()).toBe(false);
    w.carnage.charge = 100; w.state = 'won';
    expect(w.releaseNova()).toBe(false);
  });
  it('左侧固定 +1，右侧固定 +99；弹药牌不会伪装成增兵门', () => {
    const spec = generateCarnage();
    expect(spec.gates.filter(g => g.carnage === 'recruit').every(g => g.value === 1 && g.x1 < 0)).toBe(true);
    expect(spec.gates.filter(g => g.carnage === 'ammo').every(g => g.value === 99 && g.x0 > 0)).toBe(true);
    spec.gates = [ { ...spec.gates.find(g => g.carnage === 'ammo')!, d:0 } ];
    spec.barrels = []; spec.zombies = []; spec.defense!.spawns = [];
    const w = new World(spec, CARNAGE_OPTIONS); w.update(1/60);
    expect(w.carnage.shells).toBe(219); expect(w.squad.count).toBe(36);
  });
  it('蓝门接连补人且不会被射成 +2，炮架必须受击后才补弹', () => {
    const w = new World(generateCarnage(), CARNAGE_OPTIONS);
    for (let i=0;i<5*60;i++) { w.setTarget(-4.7); w.update(1/60); w.drainEvents(); }
    expect(w.carnage.recruits).toBeGreaterThan(0);
    expect(w.squad.count).toBeGreaterThan(36);
    expect(w.gates.filter(g=>g.carnage==='recruit').every(g=>g.value===1)).toBe(true);
    expect(w.carnage.batteries).toBe(0);
    for (let i=0;i<4*60;i++) { w.setTarget(4.35); w.update(1/60); w.drainEvents(); }
    expect(w.carnage.batteries).toBeGreaterThan(0);
  });
  it('实体火箭消耗弹药，飞行结束才造成爆炸伤害', () => {
    const w = new World(generateCarnage(), CARNAGE_OPTIONS);
    w.carnage.shells=1;
    for(let i=0;i<181;i++){w.update(1/60);w.drainEvents();}
    expect(w.carnage.shells).toBe(0); expect(w.rockets).toHaveLength(1);
    const hp=w.bosses[0].hp;
    for(let i=0;i<42;i++){w.update(1/60);w.drainEvents();}
    expect(w.rockets).toHaveLength(0); expect(w.bosses[0].hp).toBeLessThan(hp);
  });
  it('完整波次可以通关，预算有界，开局巨人与后续 Boss 均可击败', () => {
    const w = new World(generateCarnage(), CARNAGE_OPTIONS);
    let maxAlive = 0, peak = 0;
    for (let i = 0; i < 150 * 60 && w.state === 'run'; i++) {
      const boss = w.bosses.find((b) => b.alive);
      w.setTarget(w.time > 91 && boss ? boss.x : 2.7);
      w.releaseNova(); w.update(1 / 60); w.drainEvents();
      maxAlive = Math.max(maxAlive, w.zombies.filter((z) => z.alive).length);
      peak = Math.max(peak, w.squad.count);
    }
    expect(w.state).toBe('won'); expect(w.bosses).toHaveLength(4);
    expect(w.kills).toBeGreaterThan(2000); expect(peak).toBeGreaterThanOrEqual(36); expect(peak).toBeLessThanOrEqual(240);
    expect(w.coins).toBe(0); expect(w.gems).toBe(0);
    expect(maxAlive).toBeLessThanOrEqual(650); expect(w.time).toBeLessThan(125);
  });
});
