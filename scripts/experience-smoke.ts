// 本地浏览器回归：演练隔离、结算幂等、输入、设置与小屏布局。
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, type Page } from 'playwright-core';

const base = process.argv[2] ?? 'http://127.0.0.1:5176/';
const out = process.argv[3] ?? 'work/shots/player-experience';
mkdirSync(out, { recursive: true });
const errors: string[] = [];
const receipts: unknown[] = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function ready(page: Page) {
  await page.waitForFunction('!!window.__game', undefined, { timeout: 60000 });
  await page.waitForTimeout(300);
}
async function snapshot(page: Page, name: string) {
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${out}/${name}.png` });
}
async function visibleButton(page: Page, selector: string) {
  await page.locator(selector).scrollIntoViewIfNeeded();
  const box = await page.locator(selector).boundingBox();
  assert(box && box.height >= 40, `${selector} needs a usable touch target`);
  const viewport = page.viewportSize()!;
  assert(box.x >= -1 && box.y >= -1 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, `${selector} outside viewport`);
  const unobscured = await page.locator(selector).evaluate((button) => {
    const r = button.getBoundingClientRect();
    return [0.2, 0.5, 0.8].every((x) => [0.2, 0.5, 0.8].every((y) => {
      const hit = document.elementFromPoint(r.x + r.width * x, r.y + r.height * y);
      return hit === button || !!hit && button.contains(hit);
    }));
  });
  assert(unobscured, `${selector} obscured by another element`);
}

try {
  for (const size of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
    const name = `${size.width}x${size.height}`;
    const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(base);
    await ready(page);
    // 从既有存档结构升级，复用资产而非清空。
    await page.evaluate(`localStorage.setItem('army-rush.save.v1', JSON.stringify({ ...window.__game.save, level: 4, defenseLevel: 6, best: 3, defenseBest: 5, coins: 4000, gems: 8 }))`);
    await page.reload(); await ready(page);
    await visibleButton(page, '#btn-start');
    await snapshot(page, `${name}-home`);
    await page.click('#home-tactic');
    await page.click('[data-tactic="breaker"]');
    assert.equal(await page.evaluate('window.__game.save.tactic'), 'breaker');
    await snapshot(page, `${name}-tactics`);
    await page.click('#sheet-close');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(50);
    assert.equal(await page.evaluate('window.__game.renderer.reducedMotion'), true);
    await page.click('#btn-settings');
    await page.click('[data-toggle="motion"]');
    assert.equal(await page.evaluate('window.__game.renderer.reducedMotion'), true);
    await page.click('[data-toggle="motion"]'); // full explicitly overrides system
    assert.equal(await page.evaluate('window.__game.renderer.reducedMotion'), false);
    await page.click('[data-toggle="motion"]'); // system
    assert.equal(await page.evaluate('window.__game.renderer.reducedMotion'), true);
    await page.click('[data-toggle="motion"]'); // reduced
    await page.click('[data-toggle="sensitivity"]');
    assert.equal(await page.evaluate('window.__game.save.sensitivity'), 1.3);
    await snapshot(page, `${name}-settings`);
    await page.click('#sheet-close');
    await page.click('[data-sheet="upgrades"]');
    assert.match(await page.locator('.upgrade-gain').first().innerText(), /开局直伤/);
    await snapshot(page, `${name}-upgrade-preview`);
    await page.click('#sheet-close');
    // 演练胜利、重试、撤退均不能发资源或推进关卡。
    const beforePractice = await page.evaluate('JSON.stringify(window.__game.save)');
    await page.click('[data-sheet="modes"]');
    await page.fill('#practice-defense', '1');
    await snapshot(page, `${name}-practice-select`);
    await page.click('[data-practice="defense"]');
    assert.equal(await page.evaluate('window.__game.world.spec.level'), 1);
    await page.evaluate(`Object.assign(window.__game.world, { coins: 999, gems: 9, kills: 200, state: 'won', endTime: 3 })`);
    await page.waitForFunction("window.__game.mode === 'result'");
    assert.equal(await page.evaluate('JSON.stringify(window.__game.save)'), beforePractice);
    assert.equal(await page.locator('#result-ups').isVisible(), false);
    await visibleButton(page, '#btn-next');
    await snapshot(page, `${name}-practice-result`);
    await page.click('#btn-next');
    await page.click('#btn-pause');
    assert.match(await page.locator('#btn-restart').innerText(), /无奖励/);
    await page.click('#btn-quit');
    assert.equal(await page.evaluate('JSON.stringify(window.__game.save)'), beforePractice);
    await page.click('#btn-home');
    assert.equal(await page.evaluate('window.__game.world.spec.level'), 6);
    // 主线暂停恢复有缓冲；失焦不继续掉兵。
    await page.click('#btn-start');
    await page.click('#btn-pause');
    const pausedAt = await page.evaluate('window.__game.world.time') as number;
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate('window.__game.world.time'), pausedAt);
    await page.click('#btn-resume');
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate('window.__game.world.time'), pausedAt);
    await page.waitForTimeout(850);
    assert((await page.evaluate('window.__game.world.time') as number) > pausedAt);
    await page.evaluate(`window.dispatchEvent(new Event('blur'))`);
    assert.equal(await page.evaluate('window.__game.mode'), 'paused');
    await page.click('#btn-resume');
    await page.waitForTimeout(950);
    // 主指针拖动时，第二触点不得接管目标。
    const y = size.height * 0.65;
    await page.mouse.move(size.width * 0.5, y);
    await page.mouse.down();
    const x0 = await page.evaluate('window.__game.world.squad.targetX') as number;
    await page.mouse.move(size.width * 0.65, y);
    await page.waitForTimeout(60);
    const x1 = await page.evaluate('window.__game.world.squad.targetX') as number;
    assert(x1 > x0, 'primary drag should move right');
    await page.evaluate(`document.querySelector('#app').dispatchEvent(new PointerEvent('pointerdown', { pointerId: 99, isPrimary: false, clientX: 1, clientY: ${y}, bubbles: true }))`);
    await page.mouse.move(size.width * 0.55, y);
    await page.waitForTimeout(60);
    assert((await page.evaluate('window.__game.world.squad.targetX') as number) < x1, 'second pointer must not replace primary');
    await page.mouse.up();
    // 撤退只发战斗所得，不发新手或通关奖励，不能重复结算。
    await page.click('#btn-pause');
    const coins = await page.evaluate('window.__game.save.coins') as number;
    const gems = await page.evaluate('window.__game.save.gems') as number;
    await page.evaluate('Object.assign(window.__game.world, { coins: 123.9, gems: 2 })');
    await page.click('#btn-quit');
    assert.equal(await page.evaluate('window.__game.save.coins'), coins + 123);
    assert.equal(await page.evaluate('window.__game.save.gems'), gems + 2);
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate('window.__game.save.coins'), coins + 123);
    await visibleButton(page, '#btn-next');
    await snapshot(page, `${name}-retreat`);
    await page.click('#btn-next');
    // 真实损兵模型的 UI 呈现；此处人工设定终局以免依赖自动驾驶结果。
    await page.evaluate(`window.__game.world.stats.lose('zombie', 12); window.__game.world.stats.lose('bomb', 3); Object.assign(window.__game.world, { state: 'lost', endTime: 3 })`);
    await page.waitForFunction("window.__game.mode === 'result'");
    assert.match(await page.locator('#result-advice').innerText(), /油桶爆炸/);
    assert.match(await page.locator('#result-stats').innerText(), /尸潮接触/);
    await snapshot(page, `${name}-debrief`);
    await visibleButton(page, '#btn-home');
    await page.click('#btn-home');
    await page.reload(); await ready(page);
    assert.equal(await page.evaluate('window.__game.save.tactic'), 'breaker');
    assert.equal(await page.evaluate('window.__game.renderer.reducedMotion'), true);
    receipts.push({ viewport: name, practiceIsolation: true, resumeGrace: true, pointerOwnership: true, retreatOnce: true, saveReload: true, motionOverride: true, upgradePreview: true, controlsUnobscured: true });
    await context.close();
  }
  assert.deepEqual(errors, []);
  writeFileSync(`${out}/receipt.json`, JSON.stringify({ receipts, errors }, null, 2));
  console.log(JSON.stringify({ receipts, errors }, null, 2));
} finally {
  await browser.close();
}
