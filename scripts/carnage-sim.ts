import { CARNAGE_OPTIONS, generateCarnage } from '../src/game/carnage';
import { World } from '../src/game/world';
for (const strategy of ['gates', 'sweep', 'horde'] as const) {
  const w = new World(generateCarnage(), CARNAGE_OPTIONS);
  let maxAlive = 0, maxBullets = 0, peak = 0, blasts = 0;
  const snapshots: unknown[] = [];
  for (let frame = 0; frame < 180 * 60 && ['run', 'boss'].includes(w.state); frame++) {
    let target = strategy === 'horde' ? -2.7 : strategy === 'gates' ? 2.7 : Math.floor(w.time / 5) % 3 === 0 ? 2.7 : -2.7;
    const boss = w.bosses.find((b) => b.alive);
    if (boss && w.time > 91) target = boss.x;
    if (boss?.windup && boss.windup > .45) target = boss.attackX > 0 ? -3.5 : 3.5;
    w.setTarget(target);
    w.releaseNova();
    w.update(1 / 60);
    blasts += w.drainEvents().filter((e) => e.type === 'carnageBlast').length;
    maxAlive = Math.max(maxAlive, w.zombies.filter((z) => z.alive).length);
    maxBullets = Math.max(maxBullets, w.bullets.length);
    peak = Math.max(peak, w.squad.count);
    if (frame % 900 === 0) snapshots.push({ t: Math.floor(w.time), n: w.squad.count, kills: w.kills, charge: Math.floor(w.carnage.charge), bosses: w.bosses.filter(b => b.alive).map(b => Math.round(b.hp)) });
  }
  console.log(JSON.stringify({ strategy, time: w.time, state: w.state, kills: w.kills, clears: w.carnage.clears, maxAlive, maxBullets, peak, blasts, snapshots }));
}
