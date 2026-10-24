// Normal-speed UI regression: touch events, buttons and keys only.
// Read __game for assertions; never change or fast-forward its world.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
const base = process.argv[2] ?? 'http://127.0.0.1:5179/';
const out = process.argv[3] ?? 'work/playthrough/carnage-ui-regression';
mkdirSync(out, { recursive:true });
const browser = await chromium.launch({ channel:'chrome', headless:true, args:['--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport:{width:390,height:844},isMobile:true,hasTouch:true,recordVideo:{dir:`${out}/video`,size:{width:390,height:844}} });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
const errors:string[]=[];
page.on('pageerror',e=>errors.push(e.message));
const receipts:unknown[]=[];
interface Peek { phase:string;time:number;state:string;x:number;n:number;bossLoss:number;recruits:number;ammoPickups:number;blueAhead:number;clears:number;bosses:{x:number;attackX:number;attacking:boolean}[] }
async function read():Promise<Peek> {
  return await page.evaluate(`(()=>{const w=__game.world;return {phase:__game.mode,time:w.time,state:w.state,x:w.squad.x,n:w.squad.count,bossLoss:w.stats.losses.boss,recruits:w.carnage.recruits,ammoPickups:w.carnage.ammoPickups,blueAhead:w.gates.filter(g=>g.carnage==='recruit'&&!g.consumed&&g.d>0&&g.d<30).length,clears:w.carnage.clears,bosses:w.bosses.filter(b=>b.alive).map(b=>({x:b.x,attackX:b.attackX,attacking:b.attacking}))}})()`);
}
async function snapshot(name:string) {
  await page.screenshot({path:`${out}/${name}.png`});
  receipts.push({name,...await read()});
  writeFileSync(`${out}/receipt.json`,JSON.stringify({onlyRealInputs:true,fastForward:false,receipts,errors},null,2));
}
async function dragTo(target:number) {
  const current=(await read()).x,vp=page.viewportSize()!;
  const dx=(target-current)/14.04*vp.width,start=dx>0?25:vp.width-25,y=vp.height*.63;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:start,y,id:1}]});
  for(let i=1;i<=16;i++) {
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:Math.max(5,Math.min(vp.width-5,start+dx*i/16)),y,id:1}]});
    await page.waitForTimeout(10);
  }
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  receipts.push({action:'touch-drag',target,time:(await read()).time});
}
const progress=()=>page.evaluate(`JSON.stringify(Object.fromEntries(Object.entries(__game.save).filter(([k])=>['level','best','defenseLevel','defenseBest','coins','gems','kills','wins','upgrades'].includes(k))))`);
try {
  await page.goto(`${base}?admin=carnage&mode=carnage`);
  await page.waitForFunction('!!window.__game');await page.waitForTimeout(600);
  assert.equal(await page.locator('#home-ups').isVisible(),false);
  const before=await progress();
  await page.click('#btn-start');await page.waitForTimeout(1600);await dragTo(-4.7);
  await page.waitForFunction('__game.world.bosses.some(b=>b.alive&&b.attacking)',undefined,{timeout:15000});
  await snapshot('01-telegraph');
  assert(await page.locator('#hud-cue').evaluate(e=>e.classList.contains('visible')));
  const danger=(await read()).bosses.find(b=>b.attacking)!;
  assert(Math.abs(danger.x-danger.attackX)<.01);
  await dragTo(4.35);await page.waitForTimeout(2200);
  assert.equal((await read()).bossLoss,0);
  assert((await read()).recruits>0);
  await snapshot('02-dodged');
  await page.click('#btn-pause');const frozen=await read();await page.waitForTimeout(900);
  assert.equal((await read()).time,frozen.time);
  await page.click('#btn-resume');await page.keyboard.press('e');assert.equal((await read()).clears,frozen.clears);
  await page.waitForTimeout(1000);await dragTo(1.55);
  await page.waitForFunction('__game.world.carnage.ammoPickups>0',undefined,{timeout:22000});
  await snapshot('03-ammo-collected');
  let segment=-1,marker=0;
  const deadline=Date.now()+100000;
  while((await read()).phase!=='result') {
    assert(Date.now()<deadline,'normal-speed run did not finish');
    const s=await read();
    const nextSegment=s.time<42?0:s.time<58?1:s.time<76?2:s.time<90?3:4;
    if(nextSegment!==segment){segment=nextSegment;await dragTo([ -4.7,1.55,-4.7,4.35,1.55 ][segment]);}
    if(await page.locator('#btn-nova').isEnabled())await page.click('#btn-nova');
    if(s.time>88)assert(s.blueAhead>0);
    if(Math.floor(s.time/20)>marker){marker=Math.floor(s.time/20);await snapshot(`stage-${marker*20}`);}
    await page.waitForTimeout(1500);
  }
  await page.waitForTimeout(800);await snapshot('04-result');
  assert.equal((await read()).state,'won');assert.equal(await progress(),before);
  assert.equal(await page.locator('#result .reward').isVisible(),false);
  assert.equal(await page.locator('#result-ups').isVisible(),false);
  assert.equal(await page.locator('#result .result-tactic').isVisible(),false);
  assert.equal(await page.locator('#result-ribbon').evaluate(e=>getComputedStyle(e).whiteSpace),'nowrap');
  assert((await page.locator('#result-advice').innerText()).includes('左侧 +1'));
  await page.click('#btn-next');await page.waitForTimeout(400);await page.click('#btn-pause');
  assert.equal((await read()).n,36);assert.equal((await read()).recruits,0);
  await page.click('#btn-restart');await page.waitForTimeout(400);await page.click('#btn-pause');
  assert.equal((await read()).n,36);assert.equal((await read()).clears,0);
  await page.click('#btn-quit');await page.waitForTimeout(500);await page.click('#btn-home');
  await page.click('#mode-card');await page.click('[data-mode="defense"]');
  assert.equal(await page.locator('#home-ups').isVisible(),true);
  await page.click('#btn-start');await page.waitForTimeout(2200);await snapshot('05-main-mode');
  assert.equal(await page.evaluate('__game.world.spec.mode'),'defense');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,receipts,errors,out}));
} finally {await ctx.close();await browser.close();}
