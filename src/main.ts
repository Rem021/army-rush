import './ui/style.css';
import { Sfx, vibrate } from './audio';
import { Bot } from './game/bot';
import { BOSSES, MODES, SKINS, TRACK_HALF, UPGRADES, upgradeEffects, type GameMode, type UpgradeId } from './game/config';
import { generateCampaign, generateDefense, generateEndlessStart } from './game/level';
import { clearGems, isBossLevel, levelReward } from './game/economy';
import { formatNumber } from './render/label';
import { mulberry32 } from './game/rng';
import { World, type GameEvent, type WorldOptions } from './game/world';
import { loadModels } from './render/assets';
import { renderGunIcons, renderPortraits } from './render/characters';
import { GameRenderer } from './render/renderer';
import { loadSave, resetSave, writeSave } from './save';
import { ICON } from './ui/icons';
import { UI, modeUnlocked, type ResultInfo, type UIHandlers } from './ui/ui';

// 调试参数：?mode=campaign 指定模式（defense / campaign / endless），?level=5 指定关卡，?autoplay 自动驾驶，?speed=3 加速，?coins=999 给钱，?up=3 全部升级到 3 级
const params = new URLSearchParams(location.search);
const debug = {
  autoplay: params.has('autoplay'),
  level: Number(params.get('level')) || 0,
  speed: Math.max(1, Math.min(8, Number(params.get('speed')) || 1)),
  coins: Number(params.get('coins')) || 0,
  gems: Number(params.get('gems')) || 0,
  mode: params.get('mode') as GameMode | null,
  up: Number(params.get('up')) || 0,
};

const save = loadSave();
if (debug.level) {
  save.level = debug.level;
  save.defenseLevel = debug.level;
}
if (debug.coins) save.coins = debug.coins;
if (debug.gems) save.gems = debug.gems;
if (debug.up) save.upgrades = { soldiers: debug.up, damage: debug.up, rate: debug.up, income: debug.up, agility: debug.up };
if (debug.mode && MODES.some((m) => m.id === debug.mode)) save.mode = debug.mode;
if (!modeUnlocked(save, save.mode) && !debug.mode) save.mode = 'defense';

const app = document.getElementById('app')!;
const canvas = document.getElementById('game') as HTMLCanvasElement;
const fx = document.getElementById('fx')!;
const uiRoot = document.getElementById('ui')!;

const currentSkin = () => SKINS.find((s) => s.id === save.skin) ?? SKINS[0];
// 先加载外部模型（几 MB，带进度条），再建渲染器；加载失败的模型会退回代码生成的
const bootBar = document.querySelector<HTMLElement>('#boot i');
const models = await loadModels((done, total) => {
  if (bootBar) bootBar.style.width = `${Math.round((done / total) * 100)}%`;
});
const renderer = new GameRenderer(canvas, fx, currentSkin(), models);
const sfx = new Sfx();
sfx.enabled = save.sound;
let bot = new Bot(mulberry32(12345), 0.1);

type Phase = 'menu' | 'play' | 'paused' | 'result';
let phase: Phase = 'menu';
let world!: World;
let resultShown = false;
/** 本局兵力巅峰，算星级用 */
let peak = 0;
/** 已经弹过“武器升级”卡的档位 */
let shownTier = 0;
/** 每次重建关卡递增，过期的开场与奖励动画不能进入下一局。 */
let runId = 0;

const input = {
  active: false,
  pointerId: -1,
  startX: 0,
  startTarget: 0,
  target: 0,
  left: false,
  right: false,
};

const handlers: UIHandlers = {
  start() {
    sfx.unlock();
    sfx.click();
    startGame();
  },
  upgrade(id: UpgradeId) {
    const def = UPGRADES.find((u) => u.id === id)!;
    const lvl = save.upgrades[id];
    const cost = def.cost(lvl);
    // 兵力用钻石买，其他用金币
    const wallet = def.currency === 'gems' ? 'gems' : 'coins';
    if (lvl >= def.max || save[wallet] < cost) return;
    save[wallet] -= cost;
    save.upgrades[id] = lvl + 1;
    writeSave(save);
    sfx.unlock();
    sfx.coin();
    haptic(15);
    // 主页上换了升级就重建一下背景里的队伍；结算弹窗里升级等点“再来一次”时再建
    if (phase === 'menu') buildWorld();
    ui.refreshMenu();
    ui.upgradeBought(id);
    // 买到进化那一级：弹全屏进化卡（前后对比），音效换成升级武器的
    if (def.evolutions.some((e) => e.at === lvl + 1)) {
      ui.evolve(id, lvl + 1);
      sfx.weaponUp(id === 'damage' ? def.evolutions.findIndex((e) => e.at === lvl + 1) + 1 : 3);
      haptic([20, 30, 20, 30, 60]);
    }
  },
  skin(id: string) {
    const skin = SKINS.find((s) => s.id === id);
    if (!skin) return;
    sfx.unlock();
    if (save.skin === id) {
      sfx.click();
      return;
    }
    if (!save.owned.includes(id)) {
      if (save.coins < skin.price) {
        haptic([20, 30, 20]);
        return;
      }
      save.coins -= skin.price;
      save.owned.push(id);
      sfx.coin();
    } else {
      sfx.click();
    }
    save.skin = id;
    writeSave(save);
    renderer.setSkin(skin);
    buildWorld();
    ui.refreshMenu();
  },
  mode(id: GameMode) {
    if (!modeUnlocked(save, id) || save.mode === id) return;
    sfx.unlock();
    sfx.click();
    save.mode = id;
    writeSave(save);
    buildWorld();
    ui.refreshMenu();
  },
  next() {
    sfx.click();
    buildWorld();
    startGame();
  },
  retry() {
    sfx.click();
    buildWorld();
    startGame();
  },
  home() {
    sfx.click();
    // Boss 连战中途撤退：金币已经按轮发过了，回到第一轮
    renderer.menu = true;
    buildWorld();
    phase = 'menu';
    ui.show('menu');
  },
  pause() {
    if (phase !== 'play') return;
    sfx.click();
    input.active = false;
    input.left = false;
    input.right = false;
    phase = 'paused';
    ui.show('pause');
  },
  resume() {
    sfx.click();
    phase = 'play';
    ui.show('hud');
  },
  restart() {
    sfx.click();
    buildWorld();
    startGame();
  },
  toggleSound() {
    save.sound = !save.sound;
    sfx.enabled = save.sound;
    sfx.unlock();
    sfx.click();
    writeSave(save);
    ui.refreshMenu();
  },
  resetProgress() {
    resetSave(save);
    sfx.enabled = save.sound;
    renderer.setSkin(currentSkin());
    renderer.menu = true;
    buildWorld();
    phase = 'menu';
    ui.closeSheet();
    ui.show('menu');
    ui.toast('进度已重置，从第 1 关重新开始');
  },
  toggleHaptics() {
    save.haptics = !save.haptics;
    writeSave(save);
    haptic(30);
    ui.refreshMenu();
  },
};
const ui = new UI(uiRoot, save, handlers);
// 皮肤页的头像、各档枪的图都用真模型拍
if (models.soldier) {
  ui.setPortraits(renderPortraits(models.soldier, SKINS));
  ui.setGunIcons(renderGunIcons(models.soldier));
}

/** 局外升级折算成开局参数 */
function upgradeOpts(): WorldOptions {
  const e = upgradeEffects(save.upgrades);
  return { startSoldiers: e.startSoldiers, damageMult: e.damageMult, rateMult: e.rateMult, startTier: e.startTier, ammo: e.ammo, gateBonus: e.gateBonus, steerMult: e.steerMult, warnMult: e.warnMult, coinMult: e.coinMult };
}

function hudTitle(): string {
  switch (save.mode) {
    case 'defense':
      return `防线 · 第 ${save.defenseLevel} 关${isBossLevel(save.defenseLevel) ? ' · Boss 关' : ''}`;
    case 'endless':
      return '无尽';
    default:
      return `冲锋 · 第 ${save.level} 关`;
  }
}

function buildWorld() {
  runId++;
  slowmo = 0;
  const opts = upgradeOpts();
  switch (save.mode) {
    case 'defense':
      world = new World(generateDefense(save.defenseLevel), opts);
      break;
    case 'endless': {
      const start = generateEndlessStart(Math.floor(Math.random() * 1e9));
      world = new World(start.spec, { ...opts, endless: { gen: start.gen, until: start.until } });
      break;
    }
    default:
      world = new World(generateCampaign(save.level), opts);
  }
  world.squad.moving = false;
  renderer.loadLevel(world);
  // 防线：进度条上标出中途每批 Boss 的位置
  const def = world.spec.defense;
  const marks = def ? [...new Set(def.spawns.filter((sp) => sp.boss && sp.t < def.duration - 0.01).map((sp) => sp.t / def.duration))] : [];
  ui.resetHud(hudTitle(), marks);
  input.target = world.squad.x;
  input.active = false;
  input.left = false;
  input.right = false;
  resultShown = false;
  peak = world.squad.count;
  shownTier = world.squad.tier;
  // 调试自动驾驶使用固定种子和无失误输入，截图流程可复现。
  bot = debug.autoplay ? new Bot(mulberry32(1), 0) : new Bot(mulberry32(Math.floor(Math.random() * 1e9)), 0.1);
}

function startGame() {
  if (phase === 'play') return;
  phase = 'play';
  renderer.menu = false;
  world.squad.moving = !world.defense;
  ui.show('hud');
  ui.tip(save.mode);
  // 镜头甩到位以后打出开场横幅
  const bosses = world.spec.defense ? world.spec.defense.spawns.filter((sp) => sp.boss).length : world.bosses.length;
  const startedRun = runId;
  window.setTimeout(() => {
    if (phase === 'play' && runId === startedRun) ui.banner(world.defense ? `${hudTitle()} · ${bosses} 只 Boss` : `${hudTitle()} · 开战！`, 'info');
  }, 650);
}

function haptic(pattern: number | number[]) {
  if (save.haptics) vibrate(pattern);
}

function hapticsFor(events: GameEvent[]) {
  for (const e of events) {
    if (e.type === 'gatePass') haptic(e.after >= e.before ? 18 : [35, 40, 35]);
    else if (e.type === 'barrelBreak') haptic(25);
    else if (e.type === 'blocked') haptic(30);
    else if (e.type === 'bossSmash') haptic(e.combo === 4 ? 75 : e.combo >= 2 ? 38 : 65);
    else if (e.type === 'giantSmash') haptic(70);
    else if (e.type === 'explode' && e.source === 'impact') haptic(90);
    else if (e.type === 'reward' && e.reward.kind === 'weapon' && e.upgraded) haptic([20, 30, 20]);
    else if (e.type === 'bossDie') haptic([40, 40, 80]);
    else if (e.type === 'won') haptic([40, 60, 40, 60, 140]);
    else if (e.type === 'lost') haptic(260);
  }
}

function finish() {
  resultShown = true;
  // 钻石：这局拿到多少就存多少（输了也算）
  save.gems += world.gems;
  const won = world.state === 'won';
  const kills = world.kills;
  save.kills += kills;
  let info: ResultInfo;
  const mode = save.mode;
  const lostSub = world.bosses.some((b) => b.active) ? '差一点就打倒 Boss 了' : `打到了 ${Math.round(world.progress * 100)}%`;
  const bossLeft = world.bosses.filter((b) => b.active).reduce((s, b) => s + Math.max(0, b.hp), 0);
  const bossMax = world.bosses.reduce((s, b) => s + b.maxHp, 0);

  if (mode === 'endless') {
    const dist = Math.floor(world.squad.d);
    const record = dist > save.endlessBest;
    save.endlessBest = Math.max(save.endlessBest, dist);
    const coins = Math.floor(world.coins) + Math.floor(dist / 20);
    save.coins += coins;
    info = {
      mode,
      won: record,
      title: record ? '新纪录' : '倒下了',
      sub: `跑了 ${dist} 米`,
      stats: [
        ['击杀', String(kills)],
        ['最远', `${save.endlessBest} 米`],
      ],
      coins,
      next: '再跑一次',
      home: '返回主页',
      stars: null,
    };
  } else {
    const level = mode === 'defense' ? save.defenseLevel : save.level;
    const reward = levelReward(level, won, world.coins, upgradeEffects(save.upgrades).coinMult);
    const coins = reward.total;
    // Boss 关通关再给 1 颗钻石
    const bonusGems = won ? clearGems(level) : 0;
    save.gems += bonusGems;
    const sub = won ? `第 ${level} 关 完成` : lostSub;
    if (won) {
      save.wins += 1;
      if (mode === 'campaign') {
        save.best = Math.max(save.best, level);
        save.level = level + 1;
      } else if (mode === 'defense') {
        save.defenseBest = Math.max(save.defenseBest, level);
        save.defenseLevel = level + 1;
      }
    }
    save.coins += coins;
    // 金币明细：战斗里拿到的（击杀 + Boss 赏金）和通关/新手奖励
    const stats: [string, string][] = [['击杀', `${kills} · ${formatNumber(Math.floor(world.coins))} 金币`]];
    if (reward.bonus > 0) stats.push([won ? (isBossLevel(level) ? 'Boss 关通关奖励' : '通关奖励') : '新手奖励', `+${formatNumber(reward.bonus)}`]);
    if (world.gems + bonusGems > 0) stats.push(['钻石', `+${world.gems + bonusGems}`]);
    if (won) stats.push(['剩余兵力', String(world.squad.count)]);
    else if (world.bosses.some((b) => b.active)) stats.push(['Boss 剩余', `${Math.max(1, Math.round((bossLeft / Math.max(1, bossMax)) * 100))}%`]);
    else stats.push(['进度', `${Math.round(world.progress * 100)}%`]);
    // 星级：剩下的兵力占巅峰的比例
    const keep = world.squad.count / Math.max(1, peak);
    info = {
      mode,
      won,
      title: won ? '胜利' : '失败',
      sub,
      stats,
      coins,
      next: won ? '下一关' : '再来一次',
      home: '返回主页',
      stars: won ? (keep >= 0.6 ? 3 : keep >= 0.3 ? 2 : 1) : null,
    };
  }
  writeSave(save);
  phase = 'result';
  ui.showResult(info);
}

// ---------- 输入 ----------

/** 拖动灵敏度：手指划过整个屏幕宽度 ≈ 队伍横跨 1.3 倍桥宽 */
const DRAG_GAIN = 1.3;

function steerLimits(): [number, number] {
  const lo = world.lo + world.halfWidth;
  const hi = world.hi - world.halfWidth;
  return lo <= hi ? [lo, hi] : [(world.lo + world.hi) / 2, (world.lo + world.hi) / 2];
}

app.addEventListener('pointerdown', (e) => {
  if ((e.target as HTMLElement).closest('button, .modal, .sheet-wrap')) return;
  sfx.unlock();
  if (phase !== 'play') return;
  input.active = true;
  input.pointerId = e.pointerId;
  input.startX = e.clientX;
  input.startTarget = input.target;
});

window.addEventListener('pointermove', (e) => {
  if (!input.active || e.pointerId !== input.pointerId) return;
  const span = TRACK_HALF * 2 * DRAG_GAIN;
  const dx = ((e.clientX - input.startX) / Math.max(1, window.innerWidth)) * span;
  const [lo, hi] = steerLimits();
  const raw = input.startTarget + dx;
  input.target = Math.max(lo, Math.min(hi, raw));
  // 撞到边以后，往回拖要立刻有反应
  if (raw !== input.target) input.startTarget = input.target - dx;
});

// iOS 有时只认 touchend/click 里的解锁
for (const type of ['touchend', 'click'] as const) window.addEventListener(type, () => sfx.unlock(), { passive: true });

const endPointer = (e: PointerEvent) => {
  if (e.pointerId === input.pointerId) input.active = false;
};
window.addEventListener('pointerup', endPointer);
window.addEventListener('pointercancel', endPointer);

window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') input.left = true;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') input.right = true;
  if ((e.key === ' ' || e.key === 'Enter') && phase === 'menu' && ui.screen === 'menu' && !ui.sheetOpen) {
    sfx.unlock();
    startGame();
  }
  if (e.key === 'Escape' || e.key === 'p') {
    if (phase === 'play') handlers.pause();
    else if (phase === 'paused') handlers.resume();
  }
});
window.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') input.left = false;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') input.right = false;
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && phase === 'play') {
    input.active = false;
    input.left = false;
    input.right = false;
    phase = 'paused';
    ui.show('pause');
  }
});
window.addEventListener('blur', () => {
  input.active = false;
  input.left = false;
  input.right = false;
});

function resize() {
  renderer.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));

// ---------- 主循环 ----------

/** 整体节奏：游戏时间比真实时间快 20% */
const GAME_SPEED = 1.2;
/** 剩余的慢动作时间（真实秒）：Boss 倒下、换枪时顿一下 */
let slowmo = 0;
let lastCoinFly = 0;

function route(events: GameEvent[]) {
  renderer.handleEvents(events);
  const now = performance.now();
  const eventRun = runId;
  for (const e of events) {
    if (e.type === 'banner') ui.banner(e.text, e.tone);
    else if (e.type === 'bossDie') {
      slowmo = 0.5;
      // Boss 赏金：一大把金币从 Boss 身上飞进顶栏
      const p = renderer.toScreen(e.boss.x, 3, e.boss.d);
      if (p) for (let i = 0; i < 10; i++) window.setTimeout(() => {
        if (runId === eventRun && phase === 'play') ui.flyCoin(p.x + (Math.random() - 0.5) * 80, p.y + (Math.random() - 0.5) * 50, undefined, true);
      }, i * 45);
    } else if (e.type === 'bossEnrage') ui.banner(`${BOSSES[e.boss.kind].name} 狂暴了！`, 'boss');
    else if (e.type === 'gem') {
      // 钻石飞进顶栏的钻石框
      const p = renderer.toScreen(e.x, 1.5, e.d);
      if (p) for (let i = 0; i < Math.min(4, e.amount); i++) window.setTimeout(() => {
        if (runId === eventRun && phase === 'play') ui.flyCoin(p.x, p.y, '#hud-gems-pill .gem-ico', true, ICON.gem);
      }, i * 90);
    }
    else if (e.type === 'zombieDie' && e.coins > 0 && now - lastCoinFly > 90) {
      // 金币飞向顶栏（限流，免得满屏都是）
      const p = renderer.toScreen(e.x, 1, e.d);
      if (p) {
        lastCoinFly = now;
        ui.flyCoin(p.x, p.y);
      }
    }
  }
  // 换了更好的枪（门、补给箱都算）：慢动作一下，中间弹武器升级卡
  if (world.squad.tier > shownTier) {
    const origin = renderer.toScreen(world.squad.x, 1.5, world.squad.d);
    ui.weaponUp(world.squad.tier, shownTier, origin ?? undefined);
    sfx.weaponUp(world.squad.tier);
    slowmo = Math.max(slowmo, 0.18);
    shownTier = world.squad.tier;
  }
}

let last = performance.now();
/** 性能计数（平滑毫秒）：sim 是模拟，frame 是渲染器整帧（含 render） */
const perf = { sim: 0, frame: 0 };
function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;

  const ts = performance.now();
  renderer.trackFrame(dt);
  const slow = slowmo > 0 ? 0.3 : 1;
  slowmo = Math.max(0, slowmo - dt);
  const gdt = dt * GAME_SPEED * slow;
  if (phase === 'play') {
    for (let k = 0; k < debug.speed; k++) {
      if (debug.autoplay) {
        input.target = bot.target(world);
      } else if (input.left || input.right) {
        const [lo, hi] = steerLimits();
        input.target = Math.max(lo, Math.min(hi, input.target + ((input.right ? 1 : 0) - (input.left ? 1 : 0)) * 11 * dt));
      } else if (!input.active) {
        // 进出隔离墙时，把目标拉回可去的范围，免得松手后队伍往墙里挤
        const [lo, hi] = steerLimits();
        input.target = Math.max(lo, Math.min(hi, input.target));
      }
      world.setTarget(input.target);
      world.update(gdt);
      const events = world.drainEvents();
      route(events);
      sfx.handle(events, world.squad.tier, (world.state === 'run' || world.state === 'boss') && world.squad.count > 0);
      hapticsFor(events);
    }
    peak = Math.max(peak, world.squad.count);
    ui.updateHud(world, save.endlessBest);
    const wait = world.state === 'won' ? 1.8 : 1.1;
    if ((world.state === 'won' || world.state === 'lost') && world.endTime > wait && !resultShown) finish();
  } else if (phase === 'result') {
    world.update(gdt);
    route(world.drainEvents());
  }

  perf.sim = perf.sim * 0.95 + (performance.now() - ts) * 0.05;
  const tr = performance.now();
  renderer.update(phase === 'paused' ? 0 : phase === 'menu' ? dt : gdt, phase === 'paused' ? 0 : dt);
  perf.frame = perf.frame * 0.95 + (performance.now() - tr) * 0.05;
  renderer.render();
}

resize();
buildWorld();
ui.show('menu');
requestAnimationFrame((t) => {
  last = t;
  frame(t);
  document.getElementById('boot')?.classList.add('done');
});

// 给自动化测试和调试用
Object.assign(window, {
  __game: {
    get world() {
      return world;
    },
    get mode() {
      return phase;
    },
    renderer,
    perf,
    save,
    start: startGame,
    next: () => handlers.next(),
  },
});
