import './ui/style.css';
import { Sfx, vibrate } from './audio';
import { CARNAGE_OPTIONS, generateCarnage } from './game/carnage';
import { Bot } from './game/bot';
import { BOSSES, MODES, SKINS, TRACK_HALF, UPGRADES, upgradeEffects, type GameMode, type UpgradeId } from './game/config';
import { generateCampaign, generateDefense, generateEndlessStart } from './game/level';
import { LOSS_INFO } from './game/feedback';
import { applyTactic, type TacticId } from './game/tactics';
import { isBossLevel, settleRun } from './game/economy';
import { formatNumber } from './render/label';
import { mulberry32 } from './game/rng';
import { World, type GameEvent, type WorldOptions } from './game/world';
import { loadModels } from './render/assets';
import { renderGunIcons, renderPortraits } from './render/characters';
import { GameRenderer } from './render/renderer';
import { loadSave, resetSave, writeSave } from './save';
import { ICON } from './ui/icons';
import { UI, modeUnlocked, type ResultInfo, type UIHandlers } from './ui/ui';

function clampInt(raw: string | null, min: number, max: number): number {
  if (raw === null) return 0;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

// 调试参数：?mode=campaign 指定模式（defense / campaign / endless / carnage），?level=5 指定关卡，?autoplay 自动驾驶，?speed=3 加速，?coins=999 给钱，?up=3 全部升级到 3 级
const params = new URLSearchParams(location.search);
const debug = {
  autoplay: params.has('autoplay'),
  level: clampInt(params.get('level'), 0, 999),
  speed: Math.max(1, Math.min(8, clampInt(params.get('speed'), 1, 8) || 1)),
  coins: clampInt(params.get('coins'), 0, 1_000_000_000),
  gems: clampInt(params.get('gems'), 0, 1_000_000),
  mode: params.get('mode') as GameMode | null,
  up: clampInt(params.get('up'), 0, 99),
};
/** 临时调试资源/跳关参数仅作用于当前会话内存，不覆盖玩家真实存档。 */
const transientDebug = Boolean(debug.level || debug.coins || debug.gems || debug.up);

const save = loadSave();
function persistSave() {
  if (!transientDebug) writeSave(save);
}

// 仅授予当前浏览器的试玩通行证，不伪造主线通关或发放资源。
if (params.get('admin') === 'carnage') {
  save.carnageAdmin = true;
  persistSave();
  params.delete('admin');
  history.replaceState(null, '', `${location.pathname}${params.size ? '?' + params : ''}${location.hash}`);
}
if (debug.level > 0) {
  save.level = debug.level;
  save.defenseLevel = debug.level;
}
if (debug.coins > 0) save.coins = debug.coins;
if (debug.gems > 0) save.gems = debug.gems;
if (debug.up > 0) {
  for (const u of UPGRADES) {
    save.upgrades[u.id] = Math.min(u.max, debug.up);
  }
}
if (debug.mode && MODES.some((m) => m.id === debug.mode)) {
  save.mode = debug.mode;
  if (modeUnlocked(save, save.mode)) persistSave();
}
if (!modeUnlocked(save, save.mode) && (!debug.mode || save.mode === 'carnage')) save.mode = 'defense';

const app = document.getElementById('app')!;
const canvas = document.getElementById('game') as HTMLCanvasElement;
const fx = document.getElementById('fx')!;
const uiRoot = document.getElementById('ui')!;

const currentSkin = () => SKINS.find((s) => s.id === save.skin) ?? SKINS[0];
// 先加载外部模型（几 MB，带进度条），再建渲染器；加载失败的模型会退回代码生成的
const bootBar = document.querySelector<HTMLElement>('#boot i');
const models = await loadModels((done, total) => {
  if (bootBar) bootBar.style.width = `${Math.round((done / Math.max(1, total)) * 100)}%`;
});
const renderer = new GameRenderer(canvas, fx, currentSkin(), models);
const sfx = new Sfx();
sfx.enabled = save.sound;
let bot = new Bot(mulberry32(12345), 0.1);

type Phase = 'menu' | 'play' | 'paused' | 'result';
let phase: Phase = 'menu';
let practice: { mode: 'defense' | 'campaign'; level: number } | null = null;
let resumeAt = 0;
let world!: World;
let resultShown = false;
/** 本局兵力巅峰，算星级用 */
let peak = 0;
/** 已经弹过“武器升级”卡的档位 */
let shownTier = 0;
/** 每次重建关卡递增，过期的开场与奖励动画不能进入下一局。 */
let runId = 0;

const leftKeys = new Set<string>();
const rightKeys = new Set<string>();
const input = {
  active: false,
  pointerId: -1,
  startX: 0,
  startY: 0,
  moved: false,
  startTarget: 0,
  target: 0,
  left: false,
  right: false,
};

function cancelInput() {
  if (input.active && input.pointerId >= 0) {
    try {
      if (app.hasPointerCapture(input.pointerId)) app.releasePointerCapture(input.pointerId);
    } catch {
      // Ignore already released pointer capture
    }
  }
  input.active = false;
  input.pointerId = -1;
  leftKeys.clear();
  rightKeys.clear();
  input.left = false;
  input.right = false;
}

const activeMode = (): GameMode => practice?.mode ?? save.mode;

const handlers: UIHandlers = {
  nova() {
    if (phase !== 'play' || performance.now() < resumeAt) return;
    if (world.releaseNova()) {
      sfx.unlock();
      sfx.weaponUp(6);
      haptic([30, 35, 70]);
    }
  },
  revokeAdmin() {
    save.carnageAdmin = false;
    if (save.mode === 'carnage' && !modeUnlocked(save, 'carnage')) save.mode = 'defense';
    persistSave();
    buildWorld();
    ui.refreshMenu();
    ui.toast('管理员试玩权限已关闭');
  },
  start() {
    sfx.unlock();
    sfx.click();
    startGame();
  },
  upgrade(id: UpgradeId) {
    if (activeMode() === 'carnage') {
      ui.toast('狂潮使用固定军备；切换到主线后可升级');
      return;
    }
    const def = UPGRADES.find((u) => u.id === id)!;
    const lvl = save.upgrades[id];
    const cost = def.cost(lvl);
    const wallet = def.currency === 'gems' ? 'gems' : 'coins';
    if (lvl >= def.max) {
      ui.toast(`${def.name}已升至满级`);
      return;
    }
    if (save[wallet] < cost) {
      haptic([20, 30, 20]);
      ui.toast(
        wallet === 'gems'
          ? `钻石不足（需 ${cost} 钻石，通关 Boss 关或击败精英可获得）`
          : `金币不足（还差 ${formatNumber(cost - save.coins)} 金币）`,
      );
      return;
    }
    save[wallet] -= cost;
    save.upgrades[id] = lvl + 1;
    persistSave();
    sfx.unlock();
    sfx.coin();
    haptic(15);
    if (phase === 'menu') buildWorld();
    ui.refreshMenu();
    ui.upgradeBought(id);
    if (def.evolutions.some((e) => e.at === lvl + 1)) {
      ui.evolve(id, lvl + 1);
      sfx.weaponUp(id === 'damage' ? def.evolutions.findIndex((e) => e.at === lvl + 1) + 1 : 3);
      haptic([20, 30, 20, 30, 60]);
    }
  },
  skin(id: string) {
    if (activeMode() === 'carnage') {
      ui.toast('狂潮固定使用蓝军；其他模式可更换皮肤');
      return;
    }
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
        ui.toast(`金币不足（解锁${skin.name}需 ${formatNumber(skin.price)} 金币）`);
        return;
      }
      save.coins -= skin.price;
      save.owned.push(id);
      sfx.coin();
    } else {
      sfx.click();
    }
    save.skin = id;
    persistSave();
    renderer.setSkin(skin);
    buildWorld();
    ui.refreshMenu();
  },
  mode(id: GameMode) {
    if (!modeUnlocked(save, id) || (save.mode === id && !practice)) return;
    sfx.unlock();
    sfx.click();
    practice = null;
    save.mode = id;
    persistSave();
    buildWorld();
    ui.refreshMenu();
  },
  tactic(id: TacticId) {
    if (phase !== 'menu' && phase !== 'result') return;
    save.tactic = id;
    persistSave();
    if (phase === 'menu') buildWorld();
    ui.refreshMenu();
  },
  practice(mode, level) {
    const best = mode === 'defense' ? save.defenseBest : save.best;
    if (!Number.isInteger(level) || level < 1 || level > best) return;
    practice = { mode, level };
    ui.closeSheet();
    buildWorld();
    startGame();
  },
  cycleMotion() {
    save.motion = save.motion === 'system' ? 'reduced' : save.motion === 'reduced' ? 'full' : 'system';
    syncMotion();
    persistSave();
    ui.refreshMenu();
  },
  cycleSensitivity() {
    save.sensitivity = save.sensitivity === 1 ? 1.3 : save.sensitivity === 1.3 ? 0.75 : 1;
    persistSave();
    ui.refreshMenu();
  },
  retreat() {
    if (phase !== 'paused') return;
    world.state = 'lost';
    finish(true);
  },
  next() {
    if (phase !== 'result') return;
    sfx.click();
    buildWorld();
    startGame();
  },
  retry() {
    if (phase !== 'result') return;
    sfx.click();
    buildWorld();
    startGame();
  },
  home() {
    sfx.click();
    practice = null;
    renderer.menu = true;
    buildWorld();
    phase = 'menu';
    ui.show('menu');
  },
  pause() {
    if (phase !== 'play') return;
    sfx.click();
    cancelInput();
    phase = 'paused';
    ui.showPause(!!practice, world.spec.mode === 'carnage', hudTitle());
  },
  resume() {
    if (phase !== 'paused') return;
    sfx.click();
    phase = 'play';
    resumeAt = performance.now() + 900;
    ui.show('hud');
  },
  restart() {
    if (phase !== 'paused') return;
    sfx.click();
    if (!practice) {
      settleRun(save, {
        mode: world.spec.mode,
        level: world.spec.level,
        won: false,
        retreated: true,
        practice: false,
        runCoins: world.coins,
        runGems: world.gems,
        kills: world.kills,
        progress: world.progress,
        distance: world.squad.d,
      });
      persistSave();
    }
    buildWorld();
    startGame();
  },
  toggleSound() {
    save.sound = !save.sound;
    sfx.enabled = save.sound;
    if (save.sound) {
      sfx.unlock();
      sfx.click();
    } else {
      sfx.suspend();
    }
    persistSave();
    ui.refreshMenu();
  },
  resetProgress() {
    resetSave(save);
    practice = null;
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
    persistSave();
    haptic(30);
    ui.refreshMenu();
  },
};
const ui = new UI(uiRoot, save, handlers);
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
function syncMotion() {
  const reduced = save.motion === 'reduced' || (save.motion === 'system' && motionQuery.matches);
  renderer.reducedMotion = reduced;
  uiRoot.classList.toggle('reduced-motion', reduced);
}
motionQuery.addEventListener('change', syncMotion);
syncMotion();
// 复用主渲染器离屏目标拍皮肤立绘与各档武器图标，避免启动时额外新建两个 WebGL 上下文
if (models.soldier) {
  ui.setPortraits(renderPortraits(models.soldier, SKINS, undefined, renderer.renderer));
  ui.setGunIcons(renderGunIcons(models.soldier, undefined, renderer.renderer));
}

/** 局外升级折算成开局参数 */
function upgradeOpts(): WorldOptions {
  const e = upgradeEffects(save.upgrades);
  return applyTactic(e, save.tactic);
}

function hudTitle(): string {
  const mode = world.spec.mode;
  const level = world.spec.level;
  if (mode === 'carnage') return '火力狂潮 · 重炮阵列';
  if (mode === 'endless') return '无尽';
  return `${practice ? '演练 · ' : ''}${mode === 'defense' ? '防线' : '冲锋'} · 第 ${level} 关${isBossLevel(level) ? ' · Boss 关' : ''}`;
}

function buildWorld() {
  runId++;
  slowmo = 0;
  resumeAt = 0;
  cancelInput();
  const opts = upgradeOpts();
  switch (activeMode()) {
    case 'carnage':
      world = new World(generateCarnage(), CARNAGE_OPTIONS);
      break;
    case 'defense':
      world = new World(generateDefense(practice?.level ?? save.defenseLevel), opts);
      break;
    case 'endless': {
      const start = generateEndlessStart(Math.floor(Math.random() * 1e9));
      world = new World(start.spec, { ...opts, endless: { gen: start.gen, until: start.until } });
      break;
    }
    default:
      world = new World(generateCampaign(practice?.level ?? save.level), opts);
  }
  world.squad.moving = false;
  renderer.loadLevel(world);
  // 防线：进度条上标出中途每批 Boss 的位置
  const def = world.spec.defense;
  const marks = def ? [...new Set(def.spawns.filter((sp) => sp.boss && sp.t < def.duration - 0.01).map((sp) => sp.t / def.duration))] : [];
  ui.resetHud(hudTitle(), marks);
  input.target = world.squad.x;
  resultShown = false;
  peak = world.squad.count;
  shownTier = world.squad.tier;
  // 调试自动驾驶使用固定种子和无失误输入，截图流程可复现。
  bot = debug.autoplay ? new Bot(mulberry32(1), 0) : new Bot(mulberry32(Math.floor(Math.random() * 1e9)), 0.1);
}

function startGame() {
  if (!modeUnlocked(save, world.spec.mode) && world.spec.mode === 'carnage') return;
  if (phase === 'play') return;
  phase = 'play';
  renderer.menu = false;
  world.squad.moving = !world.defense;
  ui.show('hud');
  ui.tip(world.spec.mode);
  const bosses = world.spec.defense ? world.spec.defense.spawns.filter((sp) => sp.boss).length : world.bosses.length;
  const startedRun = runId;
  window.setTimeout(() => {
    if (phase === 'play' && runId === startedRun) {
      ui.banner(
        world.spec.mode === 'carnage'
          ? '左 +1 · 右重炮 · 开火！'
          : world.defense
            ? `${hudTitle()} · ${bosses} 只 Boss`
            : `${hudTitle()} · 开战！`,
        'info',
      );
    }
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

function finish(retreated = false) {
  if (resultShown) return;
  resultShown = true;
  cancelInput();
  const won = world.state === 'won';
  const kills = world.kills;
  const mode = world.spec.mode;
  const settled = settleRun(save, {
    mode,
    level: world.spec.level,
    won,
    retreated,
    practice: !!practice,
    runCoins: world.coins,
    runGems: world.gems,
    kills,
    progress: world.progress,
    distance: world.squad.d,
  });

  let info: ResultInfo;
  const lostSub = retreated
    ? '本局战斗收益已保留'
    : `打到了 ${Math.round(world.progress * 100)}%${world.bosses.some((b) => b.active && b.alive) ? ' · Boss 尚未击败' : ''}`;
  let bossLeft = 0;
  let bossMax = 0;
  for (const b of world.bosses) {
    if (b.active && b.alive) {
      bossLeft += Math.max(0, b.hp);
      bossMax += b.maxHp;
    }
  }

  if (practice) {
    info = {
      mode,
      won,
      title: won ? '演练完成' : '演练结束',
      sub: `${hudTitle()} · 不消耗资源，不改变进度`,
      stats: [
        ['击杀', String(kills)],
        ['进度', `${Math.round(world.progress * 100)}%`],
      ],
      coins: 0,
      next: '再练一次',
      home: '返回主页',
      stars: null,
      practice: true,
    };
  } else if (mode === 'carnage') {
    info = {
      mode,
      won,
      title: won ? '狂潮平息！' : retreated ? '狂潮撤退' : '狂潮结束',
      sub: '独立火力体验 · 不改变主线进度与资源',
      stats: [
        ['击杀', formatNumber(kills)],
        ['最高连击', String(world.carnage.bestCombo)],
        ['超载次数', String(world.carnage.clears)],
        ['增兵 / 装弹', `${world.carnage.recruits} / ${world.carnage.ammoPickups}`],
        ['拆炮架', String(world.carnage.batteries)],
        ['最佳击杀', formatNumber(save.carnageBest)],
      ],
      coins: 0,
      next: '再爽一局',
      home: '返回主页',
      stars: null,
    };
  } else if (mode === 'endless') {
    const { dist, record, coins } = settled;
    info = {
      mode,
      won: record,
      title: record ? '新纪录' : retreated ? '撤退结算' : '倒下了',
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
    const level = world.spec.level;
    const { coins, bonusCoins, bonusGems } = settled;
    const sub = won ? `第 ${level} 关 完成` : lostSub;
    const stats: [string, string][] = [['击杀', `${kills} · ${formatNumber(Math.floor(world.coins))} 金币`]];
    if (bonusCoins > 0) {
      stats.push([
        won ? (isBossLevel(level) ? 'Boss 关通关奖励' : '通关奖励') : level <= 3 ? '新手 / 推进补给' : '推进补给',
        `+${formatNumber(bonusCoins)}`,
      ]);
    }
    if (world.gems + bonusGems > 0) stats.push(['钻石', `+${world.gems + bonusGems}`]);
    if (won) stats.push(['剩余兵力', String(world.squad.count)]);
    else if (world.bosses.some((b) => b.active)) stats.push(['Boss 剩余', `${Math.max(1, Math.round((bossLeft / Math.max(1, bossMax)) * 100))}%`]);
    else stats.push(['进度', `${Math.round(world.progress * 100)}%`]);
    const keep = world.squad.count / Math.max(1, peak);
    info = {
      mode,
      won,
      title: won ? '胜利' : retreated ? '撤退结算' : '失败',
      sub,
      stats,
      coins,
      next: won ? '下一关' : '再来一次',
      home: '返回主页',
      stars: won ? (keep >= 0.6 ? 3 : keep >= 0.3 ? 2 : 1) : null,
    };
  }
  const cause = world.stats.mainLoss;
  if (cause) info.stats.push(['主要损兵', `${LOSS_INFO[cause].name} · ${world.stats.losses[cause]} 人`]);
  info.advice =
    mode === 'carnage'
      ? '左侧 +1 蓝门增兵，黄色 +99 牌装弹；巨人挥剑前，把整队移出红色危险带。'
      : retreated
        ? '调整战术或升级后可重试；同一关的路线保持不变。'
        : world.stats.advice(won, !!world.defense);
  info.detail = `接门 ${world.stats.gatesTaken} · 漏门 ${world.stats.gatesMissed} · 拆补给 ${world.stats.supplies} · 躲砸击 ${world.stats.dodges}`;
  if (!practice) persistSave();
  phase = 'result';
  ui.showResult(info);
}

// ---------- 输入 ----------

/** 拖动灵敏度：按桥面在屏幕上的可视宽度换算，竖屏与横屏桌面都能 1:1 丝滑跟手 */
const DRAG_GAIN = 1.35;

function steerLimits(): [number, number] {
  const lo = world.lo + world.halfWidth;
  const hi = world.hi - world.halfWidth;
  return lo <= hi ? [lo, hi] : [(world.lo + world.hi) / 2, (world.lo + world.hi) / 2];
}

function controlSpanPx(): { left: number; width: number } {
  const d = world ? world.squad.d : 0;
  const l = renderer.toScreen(-TRACK_HALF, 0.5, d);
  const r = renderer.toScreen(TRACK_HALF, 0.5, d);
  if (l && r && r.x - l.x > 120) {
    return { left: l.x, width: r.x - l.x };
  }
  const vw = app.clientWidth || window.innerWidth;
  const vh = app.clientHeight || window.innerHeight;
  const width = Math.min(vw, Math.max(320, vh * 0.56));
  return { left: (vw - width) * 0.5, width };
}

app.addEventListener('pointerdown', (e) => {
  if ((e.target as HTMLElement).closest('button, .modal, .sheet-wrap')) return;
  sfx.unlock();
  if (phase !== 'play' || input.active || !e.isPrimary || e.button !== 0) return;
  app.setPointerCapture(e.pointerId);
  input.active = true;
  input.pointerId = e.pointerId;
  input.startX = e.clientX;
  input.startY = e.clientY;
  input.moved = false;
  input.startTarget = input.target;
});

window.addEventListener('pointermove', (e) => {
  if (phase !== 'play' || !input.active || e.pointerId !== input.pointerId) return;
  if (Math.hypot(e.clientX - input.startX, e.clientY - input.startY) > 6) input.moved = true;
  const { width } = controlSpanPx();
  const span = TRACK_HALF * 2 * DRAG_GAIN * save.sensitivity;
  const dx = ((e.clientX - input.startX) / Math.max(180, width)) * span;
  const [lo, hi] = steerLimits();
  const raw = input.startTarget + dx;
  input.target = Math.max(lo, Math.min(hi, raw));
  // 撞到边以后，往回拖要立刻有反应
  if (raw !== input.target) input.startTarget = input.target - dx;
});

// iOS 有时只认 touchend/click 里的解锁
for (const type of ['touchend', 'click'] as const) window.addEventListener(type, () => sfx.unlock(), { passive: true });

const endPointer = (e: PointerEvent) => {
  if (e.pointerId !== input.pointerId) return;
  if (input.active && e.type === 'pointerup' && !input.moved && phase === 'play') {
    const { left, width } = controlSpanPx();
    const u = ((e.clientX - left) / Math.max(180, width)) * 2 - 1;
    const [lo, hi] = steerLimits();
    input.target = Math.max(lo, Math.min(hi, u * TRACK_HALF));
  }
  input.active = false;
  input.pointerId = -1;
};
window.addEventListener('pointerup', endPointer);
window.addEventListener('pointercancel', endPointer);
app.addEventListener('lostpointercapture', endPointer);

const isLeftKey = (key: string) => key === 'ArrowLeft' || key === 'a' || key === 'A';
const isRightKey = (key: string) => key === 'ArrowRight' || key === 'd' || key === 'D';

window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement)?.matches('input, select, textarea')) return;
  if (e.key === 'Escape') {
    if (ui.evolveOpen) {
      ui.closeEvolve();
      return;
    }
    if (ui.sheetOpen) {
      ui.closeSheet();
      return;
    }
    if (phase === 'result') {
      handlers.home();
      return;
    }
  }
  if (['ArrowLeft', 'ArrowRight', ' '].includes(e.key) && phase === 'play') e.preventDefault();
  if (phase !== 'play' && phase !== 'paused' && phase !== 'menu') return;
  if (e.key === 'e' || e.key === 'E') handlers.nova();
  if (isLeftKey(e.key)) {
    leftKeys.add(e.key.toLowerCase());
    input.left = true;
  }
  if (isRightKey(e.key)) {
    rightKeys.add(e.key.toLowerCase());
    input.right = true;
  }
  if ((e.key === ' ' || e.key === 'Enter') && phase === 'menu' && ui.screen === 'menu' && !ui.sheetOpen) {
    sfx.unlock();
    startGame();
  }
  if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
    if (phase === 'play') handlers.pause();
    else if (phase === 'paused') handlers.resume();
  }
});
window.addEventListener('keyup', (e) => {
  if (isLeftKey(e.key)) {
    leftKeys.delete(e.key.toLowerCase());
    input.left = leftKeys.size > 0;
  }
  if (isRightKey(e.key)) {
    rightKeys.delete(e.key.toLowerCase());
    input.right = rightKeys.size > 0;
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    sfx.suspend();
    if (phase === 'play') {
      cancelInput();
      phase = 'paused';
      ui.showPause(!!practice, world.spec.mode === 'carnage', hudTitle());
    }
  }
});
window.addEventListener('blur', () => {
  if (phase === 'play') handlers.pause();
  else cancelInput();
});

function resize() {
  renderer.resize(app.clientWidth || window.innerWidth, app.clientHeight || window.innerHeight);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
if (typeof ResizeObserver !== 'undefined') {
  new ResizeObserver(() => resize()).observe(app);
}

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
    if (world.spec.mode === 'carnage') continue;
    if (e.type === 'bossDie') {
      slowmo = 0.5;
      const p = renderer.toScreen(e.boss.x, 3, e.boss.d);
      if (p) {
        for (let i = 0; i < 10; i++) {
          window.setTimeout(() => {
            if (runId === eventRun && phase === 'play') {
              ui.flyCoin(p.x + (Math.random() - 0.5) * 80, p.y + (Math.random() - 0.5) * 50, undefined, true);
            }
          }, i * 45);
        }
      }
    } else if (e.type === 'bossEnrage') {
      ui.banner(`${BOSSES[e.boss.kind].name} 狂暴了！`, 'boss');
    } else if (e.type === 'gem') {
      const p = renderer.toScreen(e.x, 1.5, e.d);
      if (p) {
        for (let i = 0; i < Math.min(4, e.amount); i++) {
          window.setTimeout(() => {
            if (runId === eventRun && phase === 'play') {
              ui.flyCoin(p.x, p.y, '#hud-gems-pill .gem-ico', true, ICON.gem);
            }
          }, i * 90);
        }
      }
    } else if (e.type === 'zombieDie' && e.coins > 0 && now - lastCoinFly > 90) {
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
  const resuming = phase === 'play' && now < resumeAt;
  ui.resumeCountdown(resuming ? resumeAt - now : 0);
  if (phase === 'play' && !resuming) {
    for (let k = 0; k < debug.speed; k++) {
      if (debug.autoplay) {
        input.target = bot.target(world);
        if (world.spec.mode === 'carnage' && world.carnage.charge >= 100) {
          world.releaseNova();
        }
      } else if (input.left || input.right) {
        const [lo, hi] = steerLimits();
        input.target = Math.max(lo, Math.min(hi, input.target + ((input.right ? 1 : 0) - (input.left ? 1 : 0)) * 11 * dt));
      } else if (!input.active) {
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
  const freeze = phase === 'paused' || resuming;
  renderer.update(freeze ? 0 : phase === 'menu' ? dt : gdt, freeze ? 0 : dt);
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
