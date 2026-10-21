// 冒烟测试：用本机 Chrome 打开游戏，截几张图，检查控制台报错。
// 先 `npm run dev`，再 `npm run smoke -- [url] [输出目录]`
import { mkdirSync } from 'node:fs';
import { chromium, type Page } from 'playwright-core';

const base = process.argv[2] ?? 'http://localhost:5173/';
const out = process.argv[3] ?? 'work/shots';
mkdirSync(out, { recursive: true });

const errors: string[] = [];

async function waitFor(page: Page, fn: string, timeout = 60000) {
  await page.waitForFunction(fn, undefined, { timeout, polling: 200 });
}

// 用字符串，避免 tsx 给函数名注入 __name 辅助函数
const FPS_PROBE = `new Promise((resolve) => {
  let n = 0;
  const t0 = performance.now();
  const tick = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(tick); else resolve(n); };
  requestAnimationFrame(tick);
})`;

async function fps(page: Page): Promise<number> {
  return (await page.evaluate(FPS_PROBE)) as number;
}

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

  // 1. 主页和弹层
  await page.goto(`${base}?level=3&coins=1500`);
  await waitFor(page, '!!window.__game');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/1-home.png` });
  // 主页底部的永久升级
  const coinsBefore = (await page.evaluate('window.__game.save.coins')) as number;
  await page.click('#home-ups [data-up="damage"]');
  await page.waitForTimeout(300);
  const coinsAfter = (await page.evaluate('window.__game.save.coins')) as number;
  if (!(coinsAfter < coinsBefore)) errors.push('[error] 主页升级没有扣钱');
  await page.click('[data-sheet="modes"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/2-modes.png` });
  await page.click('#sheet-close');

  // 2. 防线：点开始，手动拖一会儿
  await page.click('#btn-start');
  await page.mouse.move(195, 600);
  await page.mouse.down();
  for (let i = 0; i < 40; i++) {
    await page.mouse.move(195 + Math.sin(i / 6) * 140, 600);
    await page.waitForTimeout(60);
  }
  await page.mouse.up();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${out}/3-defense.png` });
  const fpsRun = await fps(page);
  const state1 = await page.evaluate(
    'JSON.stringify({ mode: window.__game.world.spec.mode, state: window.__game.world.state, count: window.__game.world.squad.count, d: window.__game.world.squad.d, t: Math.round(window.__game.world.time) })',
  );

  // 3. 冲锋第 1 关自动驾驶打到结算
  await page.goto(`${base}?mode=campaign&level=1&autoplay&speed=2&up=2`);
  await waitFor(page, '!!window.__game');
  await page.click('#btn-start');
  await waitFor(page, "window.__game.world.state === 'boss'", 90000);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/4-boss.png` });
  const fpsBoss = await fps(page);
  await waitFor(page, "window.__game.mode === 'result'", 90000);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/5-result.png` });
  const state2 = await page.evaluate(
    'JSON.stringify({ state: window.__game.world.state, count: window.__game.world.squad.count, kills: window.__game.world.kills, level: window.__game.save.level, coins: window.__game.save.coins })',
  );

  // 4. 防线第 6 关（双 Boss）自动驾驶
  await page.goto(`${base}?mode=defense&level=6&autoplay&speed=3&up=6`);
  await waitFor(page, '!!window.__game');
  await page.click('#btn-start');
  await waitFor(page, 'window.__game.world.bosses.length >= 2', 150000);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/6-defense-boss.png` });
  const fpsDouble = await fps(page);

  console.log(JSON.stringify({ fpsRun, fpsBoss, fpsDouble, state1: JSON.parse(state1 as string), state2: JSON.parse(state2 as string) }, null, 2));
  if (errors.length) {
    console.log('控制台报错：');
    for (const e of errors) console.log(' ', e);
  }
  await browser.close();
  if (errors.some((e) => e.startsWith('[error]') || e.startsWith('[pageerror]'))) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  for (const x of errors) console.log(' ', x);
  process.exit(1);
});
