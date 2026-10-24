import { AMMO, BOSSES, MODES, SKINS, UPGRADES, WEAPONS, soldierDps, type GameMode, type UpgradeId } from '../game/config';
import { modeUnlocked, progressLevel } from '../game/access';
export { modeUnlocked, progressLevel } from '../game/access';
import { isBossLevel, recommendUpgrade, upgradeGain } from '../game/economy';
import { TACTICS, type TacticId } from '../game/tactics';
import type { World } from '../game/world';
import { formatNumber } from '../render/label';
import type { SaveData } from '../save';
import { EMBLEM, ICON, MODE_STYLE, RANK_SHIELD, SVG_DEFS } from './icons';

export interface UIHandlers {
  start(): void;
  nova(): void;
  revokeAdmin(): void;
  upgrade(id: UpgradeId): void;
  skin(id: string): void;
  mode(id: GameMode): void;
  next(): void;
  retry(): void;
  home(): void;
  pause(): void;
  resume(): void;
  restart(): void;
  toggleSound(): void;
  toggleHaptics(): void;
  tactic(id: TacticId): void;
  practice(mode: 'defense' | 'campaign', level: number): void;
  cycleMotion(): void;
  cycleSensitivity(): void;
  retreat(): void;
  /** 重置全部进度（设置里，点两次确认） */
  resetProgress(): void;
}

export interface ResultInfo {
  mode: GameMode;
  won: boolean;
  title: string;
  sub: string;
  stats: [string, string][];
  coins: number;
  next: string | null;
  /** 第二个按钮 */
  home: string;
  /** 0–3 星，null 不显示 */
  stars: number | null;
  advice?: string;
  detail?: string;
  practice?: boolean;
}

type Screen = 'menu' | 'hud' | 'result' | 'pause';
type Sheet = 'upgrades' | 'skins' | 'modes' | 'records' | 'settings' | 'tactics' | 'help';

const SHEET_TITLES: Record<Sheet, string> = {
  upgrades: '军械库',
  skins: '皮肤',
  modes: '选择模式',
  records: '战绩',
  settings: '设置',
  tactics: '战术选择',
  help: '战地手册',
};

const UPGRADE_LOOK: Record<UpgradeId, { icon: string; bg: string }> = {
  soldiers: { icon: ICON.soldier, bg: 'linear-gradient(160deg,#5fe08c,#1f9a54)' },
  damage: { icon: ICON.gun, bg: 'linear-gradient(160deg,#ff8f52,#c4321c)' },
  rate: { icon: ICON.bolt, bg: 'linear-gradient(160deg,#b38bff,#5a32c8)' },
  income: { icon: ICON.coin, bg: 'linear-gradient(160deg,#ffe07a,#d98a00)' },
  agility: { icon: ICON.dash, bg: 'linear-gradient(160deg,#6fd6ff,#1f7fd1)' },
};

/** 离下一次进化的进度：上一次进化到下一次之间每级一个点，买过的点亮；级数太多就用进度条 */
function evoPips(u: (typeof UPGRADES)[number], lvl: number): string {
  const next = nextEvolution(u, lvl);
  if (!next) return '';
  const prev = [...u.evolutions].reverse().find((e) => e.at <= lvl)?.at ?? 0;
  const span = next.at - prev;
  const done = lvl - prev;
  if (span > 8) return `<div class="evo-bar"><i style="width:${Math.round((done / span) * 100)}%"></i></div>`;
  return `<div class="evo-pips">${Array.from({ length: span }, (_, i) => `<i class="${i < done ? 'on' : ''}"></i>`).join('')}</div>`;
}

/** 一条升级线下一次进化（没有就 null） */
function nextEvolution(u: (typeof UPGRADES)[number], lvl: number) {
  return u.evolutions.find((e) => e.at > lvl) ?? null;
}

const MODE_TIPS: Partial<Record<GameMode, string>> = {
  defense: '左右拖动换道：门道打门、拆补给变强，另一边的尸潮别让它冲到脚下',
  campaign: '左右拖动选道，子弹只打正前方',
  carnage: '右侧接大数字门，左侧扫尸潮；能量满后点超载清屏，键盘按 E',
  endless: '越往后越难，看你能撑多远',
};

function el<T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string): T {
  const e = root.querySelector(sel);
  if (!e) throw new Error(`missing ${sel}`);
  return e as T;
}

function hex(c: number): string {
  return `#${c.toString(16).padStart(6, '0')}`;
}

function coin(cls = '') {
  return `<span class="coin-ico ${cls}">${ICON.coin}</span>`;
}

export class UI {
  private readonly root: HTMLElement;
  private current: Screen | null = null;
  private sheet: Sheet | null = null;
  private lastPct = -1;
  private lastTier = -1;
  private lastRate = -1;
  private lastCoins = -1;
  private lastGems = -1;
  private bossBars: { fill: HTMLElement; text: HTMLElement; ghost: HTMLElement; shown: number }[] = [];
  private bossKey = '';
  private bossDead = new Map<number, number>();
  private bannerTimer = 0;
  private tipTimer = 0;
  private countTimer = 0;
  private marks: { el: HTMLElement; at: number }[] = [];
  /** 皮肤头像（用真模型渲染的图），没有就用 CSS 小人 */
  private portraits: Record<string, string> = {};
  /** 每档武器的侧面图（真模型渲染），没有就用图标 */
  private guns: string[] = [];
  private weaponUpTimer = 0;
  private weaponUpEndTimer = 0;
  private weaponUpReturn: Animation | null = null;
  private evolveTimer = 0;
  private flying = 0;

  constructor(
    root: HTMLElement,
    private save: SaveData,
    h: UIHandlers,
  ) {
    this.root = root;
    root.innerHTML = `
      ${SVG_DEFS}
      <div id="hud" class="screen passthrough">
        <div class="hud-bar panel">
          <button class="icon-btn" id="btn-pause" aria-label="暂停">${ICON.pause}</button>
          <div class="hud-mid">
            <div class="hud-title"><span id="hud-title">第 1 关</span><span class="num" id="hud-pct">0%</span></div>
            <div class="hud-track"><div class="bar"><i id="hud-fill"></i></div><div id="hud-marks"></div><div class="hud-skull">${ICON.skull}</div></div>
          </div>
          <div class="hud-wallet">
            <div class="pill hud-coins">${coin()}<span id="hud-coins">0</span></div>
            <div class="pill hud-gems" id="hud-gems-pill"><span class="gem-ico">${ICON.gem}</span><span id="hud-gems">0</span></div>
          </div>
        </div>
        <div class="hud-row">
          <div class="weapon-badge" id="hud-weapon"><div class="wb-gun">${ICON.gun}</div><div class="wb-text"><b>手枪</b><div class="wb-pips">${WEAPONS.map(() => '<i></i>').join('')}</div></div></div>
          <div class="chip" id="hud-rate">${ICON.bolt}<span>射速 100%</span></div>
          <div class="chip ammo" id="hud-ammo">${ICON.ammo}<span></span></div>
        </div>
        <div id="carnage-hud" hidden>
          <div class="carnage-score"><small>RAMPAGE / 火力狂潮</small><b id="carnage-combo">0 连击</b><span id="carnage-count">击杀 0</span></div>
          <button id="btn-nova" disabled><span id="nova-title">超载蓄能</span><b id="nova-charge">0%</b><i id="nova-fill"></i><small>清屏 + 6 秒双倍弹幕 · E</small></button>
        </div>
        <div class="boss-bars" id="boss-bars"></div>
        <div id="hud-cue" class="hud-cue"></div>
        <div id="resume-count" class="resume-count" hidden>准备 · 1</div>
        <div class="banner" id="banner"></div>
        <div class="weapon-up" id="weapon-up">
          <div class="wu-rays"></div>
          <div class="wu-label">武器升级</div>
          <div class="wu-gun"></div>
          <div class="wu-name"></div>
          <div class="wu-pips">${WEAPONS.map(() => '<i></i>').join('')}</div>
          <div class="wu-stats"></div>
        </div>
        <div class="tip panel" id="tip">${ICON.hand}<span></span></div>
      </div>

      <div id="menu" class="screen passthrough">
        <div class="topbar">
          <div class="player"><div class="rank">${RANK_SHIELD}<b id="rank-num">1</b></div><div class="player-name">指挥官<small id="player-sub"></small></div></div>
          <div class="spacer"></div>
          <div class="pill gem-pill"><span class="gem-ico">${ICON.gem}</span><span id="menu-gems">0</span></div>
          <div class="pill">${coin()}<span id="menu-coins">0</span></div>
          <button class="icon-btn" id="btn-settings" aria-label="设置">${ICON.gear}</button>
        </div>
        <div class="logo"><div class="logo-emblem">${EMBLEM}</div><div class="logo-title">军团冲锋</div><div class="logo-sub">ARMY RUSH</div></div>
        <div class="menu-dock">
          <button class="panel mode-card" id="mode-card"></button>
          <div class="home-ups" id="home-ups"></div>
          <div class="brief-actions"><button data-sheet="tactics" id="home-tactic">战术 · 均衡</button><button data-sheet="help">战地手册</button></div>
          <button class="btn btn-gold start-btn" id="btn-start">开始战斗<span class="sub" id="start-sub"></span></button>
        </div>
        <div class="nav">
          <button class="nav-item" data-sheet="skins"><i>${ICON.shirt}</i>皮肤</button>
          <button class="nav-item" data-sheet="upgrades"><i>${ICON.ammo}</i>军械库</button>
          <button class="nav-item" data-sheet="modes"><i>${ICON.modes}</i>模式</button>
          <button class="nav-item" data-sheet="records"><i>${ICON.trophy}</i>战绩</button>
        </div>
      </div>

      <div class="toast" id="toast"></div>

      <div class="evo-pop" id="evolve">
        <div class="ev-rays"></div>
        <div class="ev-card">
          <div class="ev-label">进化！</div>
          <div class="ev-pair"><div class="ev-from"></div><div class="ev-arrow">${ICON.arrow}</div><div class="ev-to"></div></div>
          <div class="ev-name"></div>
          <div class="ev-desc"></div>
          <div class="ev-tap">点击继续</div>
        </div>
      </div>

      <div class="sheet-wrap" id="sheet-wrap">
        <div class="sheet">
          <div class="sheet-head">
            <h2 id="sheet-title"></h2>
            <div class="pill">${coin()}<span id="sheet-coins">0</span></div>
            <button class="icon-btn" id="sheet-close" aria-label="关闭">${ICON.close}</button>
          </div>
          <div class="sheet-body" id="sheet-body"></div>
        </div>
      </div>

      <div id="result" class="screen modal">
        <div class="dialog panel">
          <div class="ribbon" id="result-ribbon">胜利</div>
          <div class="stars" id="result-stars"></div>
          <div class="result-sub" id="result-sub"></div>
          <div class="result-stats" id="result-stats"></div>
          <div class="result-advice" id="result-advice"></div>
          <div class="result-detail" id="result-detail"></div>
          <div class="reward">${coin()}<b id="r-coins">+0</b></div>
          <div class="result-ups-title">升级部队<span class="wallet"><span class="pill gem-pill"><span class="gem-ico">${ICON.gem}</span><span id="result-gems">0</span></span><span class="pill">${coin('small')}<span id="result-balance">0</span></span></span></div>
          <div class="home-ups result-ups" id="result-ups"></div>
          <button class="result-tactic" data-sheet="tactics">调整战术</button>
          <button class="btn btn-gold" id="btn-next">下一关</button>
          <button class="btn btn-ghost" id="btn-home">返回主页</button>
        </div>
      </div>

      <div id="pause" class="screen modal">
        <div class="dialog panel">
          <div class="ribbon">暂停</div>
          <button class="btn btn-gold" id="btn-resume">继续战斗</button>
          <button class="btn btn-blue" id="btn-restart">保留战利品并重试</button>
          <button class="btn btn-ghost" id="btn-quit">撤退并结算</button>
        </div>
      </div>
    `;

    const on = (sel: string, fn: () => void) => el(root, sel).addEventListener('click', fn);
    on('#btn-pause', () => h.pause());
    on('#btn-resume', () => h.resume());
    on('#btn-restart', () => h.restart());
    on('#btn-quit', () => h.retreat());
    on('#btn-start', () => h.start());
    on('#btn-nova', () => h.nova());
    on('#btn-settings', () => this.openSheet('settings'));
    on('#mode-card', () => this.openSheet('modes'));
    on('#sheet-close', () => this.closeSheet());
    on('#btn-home', () => h.home());
    on('#evolve', () => this.closeEvolve());
    on('#btn-next', () => {
      if (el(root, '#btn-next').dataset.mode === 'retry') h.retry();
      else h.next();
    });
    el(root, '#sheet-wrap').addEventListener('click', (ev) => {
      if (ev.target === ev.currentTarget) this.closeSheet();
    });
    for (const b of root.querySelectorAll<HTMLElement>('[data-sheet]')) {
      b.addEventListener('click', () => this.openSheet(b.dataset.sheet as Sheet));
    }
    for (const box of ['#home-ups', '#result-ups']) {
      el(root, box).addEventListener('click', (ev) => {
        const up = (ev.target as HTMLElement).closest<HTMLElement>('[data-up]');
        if (up && !up.classList.contains('disabled')) h.upgrade(up.dataset.up as UpgradeId);
      });
    }
    el(root, '#sheet-body').addEventListener('click', (ev) => {
      const t = ev.target as HTMLElement;
      const up = t.closest<HTMLElement>('[data-up]');
      if (up && !up.classList.contains('disabled')) h.upgrade(up.dataset.up as UpgradeId);
      const skin = t.closest<HTMLElement>('[data-skin]');
      if (skin) h.skin(skin.dataset.skin!);
      const mode = t.closest<HTMLElement>('[data-mode]');
      if (mode && !mode.classList.contains('locked')) {
        h.mode(mode.dataset.mode as GameMode);
        this.closeSheet();
      }
      const tactic = t.closest<HTMLElement>('[data-tactic]');
      if (tactic) h.tactic(tactic.dataset.tactic as TacticId);
      const practice = t.closest<HTMLElement>('[data-practice]');
      if (practice) {
        const id = practice.dataset.practice as 'defense' | 'campaign';
        const field = el<HTMLInputElement>(root, `#practice-${id}`);
        if (field.checkValidity()) h.practice(id, Number(field.value));
        else field.reportValidity();
      }
      if (t.closest('[data-revoke-admin]')) h.revokeAdmin();
      const reset = t.closest<HTMLElement>('[data-reset]');
      if (reset) {
        // 第一次点变红提示，3 秒内再点一次才真的重置
        if (reset.classList.contains('armed')) {
          reset.classList.remove('armed');
          h.resetProgress();
        } else {
          reset.classList.add('armed');
          el(reset, '#reset-title').textContent = '再点一次确认重置';
          window.setTimeout(() => {
            reset.classList.remove('armed');
            const title = reset.querySelector('#reset-title');
            if (title) title.textContent = '重置全部进度';
          }, 3000);
        }
      }
      const toggle = t.closest<HTMLElement>('[data-toggle]');
      if (toggle) {
        if (toggle.dataset.toggle === 'sound') h.toggleSound();
        else if (toggle.dataset.toggle === 'haptics') h.toggleHaptics();
        else if (toggle.dataset.toggle === 'motion') h.cycleMotion();
        else if (toggle.dataset.toggle === 'sensitivity') h.cycleSensitivity();
      }
    });
  }

  /** 屏幕中间偏上弹一条提示，两秒后消失 */
  toast(text: string) {
    const t = el(this.root, '#toast');
    t.textContent = text;
    t.classList.remove('show');
    void t.offsetWidth;
    t.classList.add('show');
  }

  /** 刚买的那张升级卡片弹一下 */
  upgradeBought(id: UpgradeId) {
    for (const card of this.root.querySelectorAll<HTMLElement>(`[data-up="${id}"]`)) {
      card.classList.remove('bought');
      void card.offsetWidth;
      card.classList.add('bought');
    }
  }

  setPortraits(p: Record<string, string>) {
    this.portraits = p;
    if (this.sheet === 'skins') this.renderSheet();
  }

  setGunIcons(icons: string[]) {
    this.guns = icons;
    this.lastTier = -1;
    this.refreshMenu();
    if (this.sheet === 'upgrades') this.renderSheet();
  }

  /** 一把枪的图（没渲染出来就用枪的图标） */
  private gunImg(tier: number, cls = ''): string {
    const src = this.guns[tier];
    return src ? `<img class="gun-img ${cls}" src="${src}" alt="${WEAPONS[tier].name}" draggable="false" />` : `<span class="gun-img ${cls}">${ICON.gun}</span>`;
  }

  /** 对局里换枪：卡片从队伍位置升起，短暂停留，再飞入底部武器牌。 */
  weaponUp(tier: number, from: number, origin?: { x: number; y: number }) {
    const box = el(this.root, '#weapon-up');
    const visible = box.classList.contains('show');
    const leaving = box.classList.contains('leave');
    const returnFrom = leaving ? getComputedStyle(box).transform : '';
    const returnOpacity = leaving ? getComputedStyle(box).opacity : '';
    const banner = el(this.root, '#banner');
    if (banner.classList.contains('info')) banner.className = 'banner';
    const w = WEAPONS[tier];
    const color = hex(w.color);
    box.style.setProperty('--wc', color);
    el(box, '.wu-gun').innerHTML = this.gunImg(tier);
    el(box, '.wu-name').textContent = w.name;
    [...box.querySelectorAll<HTMLElement>('.wu-pips i')].forEach((p, i) => {
      p.className = i < tier ? 'on' : i === tier ? 'on new' : '';
    });
    const mult = soldierDps(tier) / Math.max(0.01, soldierDps(from));
    el(box, '.wu-stats').innerHTML = `<span>每人火力 <b>×${mult.toFixed(1)}</b></span><span>${w.trait}</span>`;
    window.clearTimeout(this.weaponUpTimer);
    window.clearTimeout(this.weaponUpEndTimer);
    this.weaponUpReturn?.cancel();
    this.weaponUpReturn = null;
    if (visible) {
      // 连续升级沿用当前卡片，枪在原位变更；退场中收到升级就短距离返回。
      box.classList.remove('leave');
      if (leaving && !this.root.classList.contains('reduced-motion')) {
        this.weaponUpReturn = box.animate(
          [{ transform: returnFrom, opacity: returnOpacity }, { transform: 'translate(-50%, 0) scale(1)', opacity: 1 }],
          { duration: 120, easing: 'ease-out' },
        );
      }
    } else {
      box.classList.remove('show', 'leave');
      const startX = Math.max(24, Math.min(window.innerWidth - 24, origin?.x ?? window.innerWidth / 2));
      const startY = Math.max(90, Math.min(window.innerHeight - 80, origin?.y ?? window.innerHeight * 0.65));
      box.style.setProperty('--wu-enter-x', `${startX - window.innerWidth / 2}px`);
      box.style.setProperty('--wu-enter-y', `${startY - (window.innerHeight * 0.21 + box.offsetHeight / 2)}px`);
      void box.offsetWidth;
      box.classList.add('show');
    }
    this.weaponUpTimer = window.setTimeout(() => {
      const card = box.getBoundingClientRect();
      const badge = el(this.root, '#hud-weapon').getBoundingClientRect();
      box.style.setProperty('--wu-exit-x', `${badge.left + badge.width / 2 - (card.left + card.width / 2)}px`);
      box.style.setProperty('--wu-exit-y', `${badge.top + badge.height / 2 - (card.top + card.height / 2)}px`);
      box.classList.add('leave');
      const weaponBadge = el(this.root, '#hud-weapon');
      weaponBadge.classList.remove('charge');
      void weaponBadge.offsetWidth;
      weaponBadge.classList.add('charge');
      this.weaponUpEndTimer = window.setTimeout(() => box.classList.remove('show', 'leave'), 300);
    }, 620);
  }

  /** 局外升级买到进化那一级：全屏弹一张“进化”卡，前后对比 */
  evolve(id: UpgradeId, lvl: number) {
    const u = UPGRADES.find((x) => x.id === id)!;
    const idx = u.evolutions.findIndex((e) => e.at === lvl);
    if (idx < 0) return;
    const evo = u.evolutions[idx];
    const box = el(this.root, '#evolve');
    const look = UPGRADE_LOOK[id];
    // 前后对比：左边进化前，右边进化后，下面写名字
    const side = (art: string, caption: string) => `${art}<small>${caption}</small>`;
    let from: string;
    let to: string;
    let desc: string;
    let color: string;
    if (id === 'damage') {
      const w = WEAPONS[idx + 1];
      from = side(this.gunImg(idx), WEAPONS[idx].name);
      to = side(this.gunImg(idx + 1), w.name);
      color = hex(w.color);
      desc = `每局开局直接拿${w.name} · 每人火力 ×${(soldierDps(idx + 1) / soldierDps(idx)).toFixed(1)} · ${w.trait}`;
    } else if (id === 'rate') {
      const a = AMMO[idx];
      const b = AMMO[idx + 1];
      const bullet = (c: number | null) => `<span class="ev-bullet" style="--bc:${hex(c ?? 0xfff1b0)}"><i></i><i></i><i></i></span>`;
      from = side(bullet(a.color), a.name);
      to = side(bullet(b.color), b.name);
      color = hex(b.color ?? 0xffd34d);
      desc = [b.pierce ? `穿透 ${b.pierce} 个敌人` : '', b.splash ? `命中爆炸（范围 ${b.splash} 米）` : ''].filter(Boolean).join(' · ');
    } else {
      const art = `<span class="ev-ico" style="background:${look.bg}">${look.icon}</span>`;
      from = side(art, idx === 0 ? '基础' : u.evolutions[idx - 1].name);
      to = side(art, evo.name);
      color = '#7dff9a';
      desc = id === 'soldiers' ? '每扇加人门给的人更多' : id === 'agility' ? 'Boss 炸弹的红圈出现得更早，更好躲' : '';
    }
    box.style.setProperty('--ec', color);
    el(box, '.ev-label').textContent = id === 'damage' ? '武器进化！' : id === 'rate' ? '子弹进化！' : '进化！';
    el(box, '.ev-from').innerHTML = from;
    el(box, '.ev-to').innerHTML = to;
    el(box, '.ev-name').textContent = evo.name;
    el(box, '.ev-desc').textContent = desc;
    box.classList.remove('show');
    void box.offsetWidth;
    box.classList.add('show');
    window.clearTimeout(this.evolveTimer);
    this.evolveTimer = window.setTimeout(() => this.closeEvolve(), 3200);
  }

  closeEvolve() {
    window.clearTimeout(this.evolveTimer);
    el(this.root, '#evolve').classList.remove('show');
  }

  get screen(): Screen | null {
    return this.current;
  }

  get sheetOpen(): boolean {
    return this.sheet !== null;
  }

  show(screen: Screen) {
    this.current = screen;
    for (const id of ['hud', 'menu', 'result', 'pause'] as const) {
      const visible = id === screen || (id === 'hud' && (screen === 'pause' || screen === 'result'));
      el(this.root, `#${id}`).classList.toggle('visible', visible);
    }
    if (screen !== 'menu') this.closeSheet();
    if (screen === 'menu') this.refreshMenu();
  }

  openSheet(sheet: Sheet) {
    this.sheet = sheet;
    el(this.root, '#sheet-title').textContent = SHEET_TITLES[sheet];
    el(this.root, '#sheet-wrap').classList.add('visible');
    this.renderSheet();
  }

  closeSheet() {
    this.sheet = null;
    el(this.root, '#sheet-wrap').classList.remove('visible');
  }

  /** 存档变了以后刷新主页和打开的弹层 */
  refreshMenu() {
    el(this.root, '#home-tactic').textContent = `战术 · ${TACTICS.find((t) => t.id === this.save.tactic)!.name}`;
    const s = this.save;
    const coins = formatNumber(s.coins);
    el(this.root, '#menu-coins').textContent = coins;
    el(this.root, '#sheet-coins').textContent = coins;
    el(this.root, '#rank-num').textContent = String(progressLevel(s));
    el(this.root, '#player-sub').textContent = `防线 ${s.defenseLevel} · 冲锋 ${s.level}`;
    const skin = SKINS.find((k) => k.id === s.skin) ?? SKINS[0];
    document.documentElement.style.setProperty('--team', hex(skin.team));
    const cards = this.upgradeCards();
    el(this.root, '#home-ups').innerHTML = cards;
    el(this.root, '#result-ups').innerHTML = cards;
    el(this.root, '#result-balance').textContent = coins;
    el(this.root, '#menu-gems').textContent = String(s.gems);
    el(this.root, '#result-gems').textContent = String(s.gems);
    const def = MODES.find((m) => m.id === s.mode)!;
    const style = MODE_STYLE[s.mode];
    const { tag, desc, start } = this.modeSummary(s.mode);
    el(this.root, '#mode-card').innerHTML = `
      <div class="mode-tile" style="background:${style.bg}">${style.icon}</div>
      <div class="mode-text"><div class="mode-title">${def.name}<span class="tag">${tag}</span></div><div class="mode-desc">${desc}</div></div>
      <div class="mode-switch">切换${ICON.chevron}</div>`;
    el(this.root, '#start-sub').textContent = start;
    if (this.sheet) this.renderSheet();
  }

  /** 五张永久升级卡片（主页底部和结算弹窗共用）：角标是等级，下面一排点是离下一次进化还差几级，点满就进化 */
  private upgradeCards(): string {
    const s = this.save;
    const rec = recommendUpgrade(s, s.upgrades);
    return UPGRADES.map((u) => {
      const lvl = s.upgrades[u.id];
      const look = UPGRADE_LOOK[u.id];
      const maxed = lvl >= u.max;
      const cost = u.cost(lvl);
      const gems = u.currency === 'gems';
      const poor = !maxed && (gems ? s.gems : s.coins) < cost;
      const next = nextEvolution(u, lvl);
      const evolving = !!next && next.at === lvl + 1;
      // 火力线下一次进化是换枪：卡片太窄，直接放那把枪的图，不写字
      const label = next && u.id === 'damage' ? this.gunImg(u.evolutions.indexOf(next) + 1, 'card') : next ? `<span>${next.name}</span>` : '';
      const evo = next ? `<div class="up-evo">${evoPips(u, lvl)}<div class="up-next">${label}</div></div>` : '<div class="up-evo"></div>';
      const price = maxed ? '满级' : gems ? `<span class="gem-ico small">${ICON.gem}</span>${cost}` : `${coin('small')}${formatNumber(cost)}`;
      return `<button class="up-card ${maxed || poor ? 'disabled' : 'ready'} ${evolving ? 'evolve' : ''} ${rec === u.id ? 'recommend' : ''} ${gems ? 'gems' : ''}" data-up="${u.id}" aria-label="${u.name} ${u.value(lvl)}${maxed ? ' 满级' : `，下级 ${upgradeGain(s.upgrades, u.id).text}，价格 ${cost} ${gems ? '钻石' : '金币'}`}" title="${maxed ? '已满级' : upgradeGain(s.upgrades, u.id).text}">
        <div class="up-ico" style="background:${look.bg}">${look.icon}<i class="up-lv">${lvl}</i></div>
        <div class="up-name">${u.name}</div>
        <div class="up-val">${u.value(lvl)}</div>
        ${evo}
        <div class="up-cost">${price}</div>
      </button>`;
    }).join('');
  }

  private modeSummary(mode: GameMode): { tag: string; desc: string; start: string } {
    const s = this.save;
    const def = MODES.find((m) => m.id === mode)!;
    switch (mode) {
      case 'carnage':
        return { tag: s.carnageAdmin ? '管理员已解锁' : '已通关解锁', desc: def.desc, start: '火力狂潮 · 90 秒释放' };
      case 'defense': {
        const boss = isBossLevel(s.defenseLevel);
        return { tag: `第 ${s.defenseLevel} 关${boss ? ' · Boss 关' : ''}`, desc: boss ? '双 Boss 守关：更难打，赏金和通关奖励翻倍' : def.desc, start: `防线 · 第 ${s.defenseLevel} 关${boss ? ' · Boss 关' : ''}` };
      }
      case 'campaign':
        return { tag: `第 ${s.level} 关`, desc: def.desc, start: `冲锋 · 第 ${s.level} 关` };
      default:
        return { tag: `最远 ${formatNumber(s.endlessBest)} 米`, desc: def.desc, start: '无尽模式' };
    }
  }

  private renderSheet() {
    const body = el(this.root, '#sheet-body');
    const s = this.save;
    switch (this.sheet) {
      case 'upgrades':
        // 军械库：每条升级线的效果和进化路线
        body.innerHTML = `<div class="guide-note">推荐按开局直伤 / 花费比较。穿透、溅射、养门和机动各有用途，请结合关卡选择。</div>` + UPGRADES.map((u) => {
          const lvl = s.upgrades[u.id];
          const look = UPGRADE_LOOK[u.id];
          const maxed = lvl >= u.max;
          const cost = u.cost(lvl);
          const gems = u.currency === 'gems';
          const poor = (gems ? s.gems : s.coins) < cost;
          const pips = nextEvolution(u, lvl) ? `<div class="evo-progress">${evoPips(u, lvl)}<span>再升 ${nextEvolution(u, lvl)!.at - lvl} 级：${nextEvolution(u, lvl)!.name}</span></div>` : '';
          const track = u.evolutions.length
            ? `<div class="evo-track">${u.evolutions.map((e, i) => `<span class="evo ${lvl >= e.at ? 'done' : nextEvolution(u, lvl) === e ? 'next' : ''}"><b>Lv${e.at}</b>${u.id === 'damage' ? this.gunImg(i + 1, 'tiny') : ''}${e.name}</span>`).join('')}</div>`
            : '';
          return `<div class="row upgrade-row">
            <div class="mode-tile" style="background:${look.bg};color:#fff">${look.icon}</div>
            <div class="row-main">
              <div class="row-title">${u.name}<span class="lv">Lv.${lvl}</span><span class="up-now">${u.value(lvl)}${maxed ? '' : ` → <b>${u.value(lvl + 1)}</b>`}</span></div>
              ${pips}${track}<div class="upgrade-gain">${maxed ? '已满级' : upgradeGain(s.upgrades, u.id).text}</div>
            </div>
            <button class="btn btn-gold buy ${maxed || poor ? 'disabled' : ''}" data-up="${u.id}">${maxed ? '满级' : gems ? `<span class="gem-ico">${ICON.gem}</span>${cost}` : `${coin()}${formatNumber(cost)}`}</button>
          </div>`;
        }).join('');
        break;
      case 'skins':
        body.innerHTML = `<div class="skin-grid">${SKINS.map((k) => {
          const owned = s.owned.includes(k.id);
          const active = s.skin === k.id;
          const label = active ? '使用中' : owned ? '点击使用' : `${coin('small')}${k.price}`;
          return `<button class="skin ${active ? 'active' : ''} ${!owned && s.coins < k.price ? 'poor' : ''}" data-skin="${k.id}">
            ${
              this.portraits[k.id]
                ? `<img class="skin-portrait" src="${this.portraits[k.id]}" alt="${k.name}" draggable="false" />`
                : `<div class="skin-figure" style="--c:${hex(k.team)};--s:${hex(k.shirt)}"><i class="helmet"></i><i class="head"></i><i class="body"></i><i class="legs"></i></div>`
            }
            <div class="skin-name">${k.name}</div>
            <div class="skin-price">${label}</div>
          </button>`;
        }).join('')}</div>`;
        break;
      case 'modes':
        body.innerHTML = MODES.map((m) => {
          const locked = !modeUnlocked(s, m.id);
          const style = MODE_STYLE[m.id];
          const { tag, desc } = this.modeSummary(m.id);
          return `<button class="row ${s.mode === m.id ? 'active' : ''} ${locked ? 'locked' : ''}" data-mode="${m.id}" style="text-align:left">
            <div class="mode-tile" style="background:${style.bg}">${locked ? ICON.lock : style.icon}</div>
            <div class="row-main">
              <div class="row-title">${m.name}<span class="lv">${locked ? (m.id === 'carnage' ? '通关第 30 关解锁' : `第 ${m.unlock} 关解锁`) : tag}</span></div>
              <div class="row-sub">${desc}</div>
            </div>
          </button>`;
        }).join('');
        body.innerHTML += `<div class="guide-note carnage-note">火力狂潮：${s.carnageAdmin ? '管理员试玩已开启，可直接进入。' : '防线或冲锋通关第 30 关解锁。'}独立火力与击杀纪录，不发主线金币或钻石。</div>`;
        body.innerHTML += `<div class="guide-note">已通关关卡可随时演练：使用当前升级和战术，不消耗资源，也不结算金币、钻石和战绩。</div>${(['defense', 'campaign'] as const).map((id) => {
          const best = id === 'defense' ? s.defenseBest : s.best;
          return best < 1 ? '' : `<div class="practice-row"><label for="practice-${id}">${id === 'defense' ? '防线' : '冲锋'}演练 · 1–${best} 关</label><input id="practice-${id}" type="number" inputmode="numeric" min="1" max="${best}" step="1" value="${best}" /><button class="btn btn-blue" data-practice="${id}">开始演练</button></div>`;
        }).join('')}`;
        break;
      case 'records': {
        const stat = (icon: string, bg: string, label: string, value: string) =>
          `<div class="stat"><div class="stat-ico" style="background:${bg}">${icon}</div><div><span>${label}</span><b>${value}</b></div></div>`;
        body.innerHTML = `<div class="stat-grid">
          ${stat(ICON.defense, MODE_STYLE.defense.bg, '防线最高', `第 ${s.defenseBest} 关`)}
          ${stat(ICON.campaign, MODE_STYLE.campaign.bg, '冲锋最高', `第 ${s.best} 关`)}
          ${stat(ICON.bolt, MODE_STYLE.carnage.bg, '狂潮最佳击杀', formatNumber(s.carnageBest))}
          ${stat(ICON.endless, MODE_STYLE.endless.bg, '无尽最远', `${formatNumber(s.endlessBest)} 米`)}
          ${stat(ICON.trophy, 'linear-gradient(160deg,#4a5a80,#25304d)', '胜利场次', String(s.wins))}
          ${stat(ICON.zombie, 'linear-gradient(160deg,#4a5a80,#25304d)', '累计击杀', formatNumber(s.kills))}
          ${stat(ICON.coin, 'linear-gradient(160deg,#4a5a80,#25304d)', '当前金币', formatNumber(s.coins))}
        </div>`;
        break;
      }
      case 'tactics':
        body.innerHTML = `<div class="guide-note">免费切换，下一局生效。敌人不会因为你变强而加血。</div>${TACTICS.map((t) => `<button class="row tactic-row ${s.tactic === t.id ? 'active' : ''}" data-tactic="${t.id}" aria-pressed="${s.tactic === t.id}"><div class="row-main"><div class="row-title">${t.name}${s.tactic === t.id ? ' · 已选择' : ''}</div><div class="row-sub">${t.desc}</div></div></button>`).join('')}<div class="guide-note">数字门按命中次数涨数；连射更擅长养门。破甲对装甲目标的持续伤害比均衡高约 15%，但养门更慢、清普通尸潮稍弱。关卡路线固定，可用演练比较打法。</div>`;
        break;
      case 'help':
        body.innerHTML = `<div class="guide"><h3>单手就能玩</h3><p>按住空白处左右拖动，子弹自动打向正前方。手指放在屏幕下部也能换道。设置里可调灵敏度。</p><h3>防线：两条道，两件事</h3><p>开局先拆门道障碍，打破后回到门道接住一串增益门。尸潮接近桥头时切去清怪；一直贪补给会被包围。</p><h3>看清数字，再选路</h3><p>+ 是加人，− 是减员，× 是人数倍率，枪和闪电分别升级武器和射速。红门可以射成正数；数字门按命中次数成长，敌人和障碍按伤害掉血。</p><h3>Boss：先躲，再打</h3><p>砸击先锁红色危险带，整队移出去；两次慢砸后有三连击，停顿时再集火。油桶红圈内的士兵都会被炸。</p><h3>失败也有进步</h3><p>战斗所得会保留，结算会告诉你怎样损兵。免费换战术，升级前到军械库看真实收益。模式页可演练已通关关卡；撤退和主动重试保留战利品，但没有额外新手补贴。</p></div>`;
        break;
      case 'settings':
        body.innerHTML = `
          <button class="row" data-toggle="sound" style="text-align:left"><div class="stat-ico" style="background:linear-gradient(160deg,#4a5a80,#25304d)">${ICON.soundOn}</div><div class="row-main"><div class="row-title">音效</div><div class="row-sub">枪声、爆炸和提示音</div></div><span class="toggle ${s.sound ? 'on' : ''}"></span></button>
          <button class="row" data-toggle="haptics" style="text-align:left"><div class="stat-ico" style="background:linear-gradient(160deg,#4a5a80,#25304d)">${ICON.vibrate}</div><div class="row-main"><div class="row-title">振动</div><div class="row-sub">安卓有效，iOS 网页不支持</div></div><span class="toggle ${s.haptics ? 'on' : ''}"></span></button>
          <button class="row" data-toggle="motion" style="text-align:left"><div class="row-main"><div class="row-title">动态效果：${s.motion === 'system' ? '跟随系统' : s.motion === 'reduced' ? '减少' : '完整'}</div><div class="row-sub">减少时关闭镜头震动、推近和全屏闪光</div></div></button>
          <button class="row" data-toggle="sensitivity" style="text-align:left"><div class="row-main"><div class="row-title">拖动灵敏度：${s.sensitivity === 1 ? '标准' : s.sensitivity < 1 ? '精细' : '灵敏'}</div><div class="row-sub">切换精细 / 标准 / 灵敏，移动速度由机动升级决定</div></div></button>
          <button class="row danger-row" data-reset style="text-align:left"><div class="stat-ico" style="background:linear-gradient(160deg,#ff6b6b,#b5121f)">${ICON.close}</div><div class="row-main"><div class="row-title" id="reset-title">重置全部进度</div><div class="row-sub">关卡、金币、钻石、升级、皮肤、战绩全部清零，从头开始</div></div></button>
          ${s.carnageAdmin ? '<button class="row" data-revoke-admin><div class="row-main"><div class="row-title">管理员试玩 · 已开启</div><div class="row-sub">点击关闭狂潮直通权限，正常通关解锁仍保留</div></div></button>' : ''}
          <div class="credits">人物、丧尸、Boss 和道具模型：Quaternius（CC0 公共领域）</div>`;
        break;
      default:
        body.innerHTML = '';
    }
  }

  // ---------- 游戏内 ----------

  resetHud(title: string, marks: number[] = []) {
    window.clearTimeout(this.weaponUpTimer);
    window.clearTimeout(this.weaponUpEndTimer);
    this.weaponUpReturn?.cancel();
    this.weaponUpReturn = null;
    window.clearTimeout(this.bannerTimer);
    window.clearTimeout(this.tipTimer);
    el(this.root, '#weapon-up').classList.remove('show', 'leave');
    for (const coin of this.root.querySelectorAll<HTMLElement>('.fly-coin')) {
      for (const animation of coin.getAnimations()) animation.cancel();
      coin.remove();
    }
    this.flying = 0;
    el(this.root, '#hud-title').textContent = title;
    el(this.root, '#carnage-hud').hidden = !title.startsWith('火力狂潮');
    this.root.classList.toggle('carnage-mode', title.startsWith('火力狂潮'));
    const box = el(this.root, '#hud-marks');
    box.innerHTML = marks.map((f) => `<i class="hud-mark" style="left:${(f * 100).toFixed(1)}%">${ICON.skull}</i>`).join('');
    this.marks = [...box.querySelectorAll<HTMLElement>('.hud-mark')].map((e, i) => ({ el: e, at: marks[i] * 100 }));
    el(this.root, '#hud-cue').textContent = '';
    this.lastPct = -1;
    this.lastTier = -1;
    this.lastRate = -1;
    this.lastCoins = -1;
    this.lastGems = -1;
    this.bossKey = '';
    this.bossDead.clear();
    el(this.root, '#boss-bars').innerHTML = '';
    el(this.root, '#boss-bars').classList.remove('visible');
    el(this.root, '#hud-rate').style.display = 'none';
    el(this.root, '#banner').className = 'banner';
    el(this.root, '#tip').classList.remove('visible');
  }

  /** 开局提示，几秒后消失 */
  tip(mode: GameMode, extra?: string) {
    const text = extra ?? MODE_TIPS[mode];
    if (!text) return;
    const t = el(this.root, '#tip');
    el(t, 'span').textContent = text;
    t.classList.add('visible');
    window.clearTimeout(this.tipTimer);
    this.tipTimer = window.setTimeout(() => t.classList.remove('visible'), 3600);
  }

  updateHud(w: World, best: number) {
    if (w.spec.mode === 'carnage') {
      const c = w.carnage;
      el(this.root, '#carnage-combo').textContent = `${c.combo} 连击`;
      el(this.root, '#carnage-count').textContent = `击杀 ${formatNumber(w.kills)} · 军团 ${w.squad.count}`;
      const nova = el<HTMLButtonElement>(this.root, '#btn-nova');
      nova.disabled = c.charge < 100 || !['run', 'boss'].includes(w.state);
      nova.classList.toggle('ready', c.charge >= 100);
      el(this.root, '#nova-title').textContent = w.time < c.burstUntil ? `超载 ${(c.burstUntil - w.time).toFixed(1)}s` : c.charge >= 100 ? '释放超载' : '超载蓄能';
      el(this.root, '#nova-charge').textContent = `${Math.floor(c.charge)}%`;
      el(this.root, '#nova-fill').style.width = `${c.charge}%`;
    }
    const endless = w.spec.mode === 'endless';
    const pct = endless ? Math.floor(w.squad.d) : Math.round(w.progress * 100);
    if (pct !== this.lastPct) {
      this.lastPct = pct;
      if (endless) {
        const goal = Math.max(500, Math.ceil((Math.max(best, pct) + 1) / 500) * 500);
        el(this.root, '#hud-fill').style.width = `${Math.min(100, (pct / goal) * 100)}%`;
        el(this.root, '#hud-pct').textContent = `${pct} 米${best > 0 ? ` / ${best}` : ''}`;
      } else {
        el(this.root, '#hud-fill').style.width = `${pct}%`;
        el(this.root, '#hud-pct').textContent = `${pct}%`;
        for (const m of this.marks) m.el.classList.toggle('past', pct >= m.at);
      }
    }
    if (w.squad.tier !== this.lastTier) {
      this.lastTier = w.squad.tier;
      const tier = w.squad.tier;
      const badge = el(this.root, '#hud-weapon');
      badge.style.setProperty('--wc', hex(WEAPONS[tier].color));
      el(badge, '.wb-gun').innerHTML = this.gunImg(tier);
      el(badge, 'b').textContent = WEAPONS[tier].name;
      [...badge.querySelectorAll<HTMLElement>('.wb-pips i')].forEach((p, i) => p.classList.toggle('on', i <= tier));
    }
    const ammo = el(this.root, '#hud-ammo');
    if (ammo.dataset.name !== w.ammo.name) {
      ammo.dataset.name = w.ammo.name;
      ammo.style.display = w.ammo.pierce || w.ammo.splash ? '' : 'none';
      el(ammo, 'span').textContent = w.ammo.name;
      if (w.ammo.color !== null) ammo.style.setProperty('--ammo', `#${w.ammo.color.toString(16).padStart(6, '0')}`);
    }
    const rate = Math.round(w.squad.rate * 100);
    if (rate !== this.lastRate) {
      this.lastRate = rate;
      const chip = el(this.root, '#hud-rate');
      chip.style.display = rate === 100 ? 'none' : '';
      el(chip, 'span').textContent = `射速 ${rate}%`;
    }
    if (w.gems !== this.lastGems) {
      const gained = w.gems > this.lastGems && this.lastGems >= 0;
      this.lastGems = w.gems;
      el(this.root, '#hud-gems').textContent = String(w.gems);
      el(this.root, '#hud-gems-pill').classList.toggle('visible', w.gems > 0);
      if (gained) {
        const pill = el(this.root, '#hud-gems-pill');
        pill.classList.remove('bump');
        void pill.offsetWidth;
        pill.classList.add('bump');
      }
    }
    const shown = Math.floor(w.coins);
    if (shown !== this.lastCoins) {
      const gained = shown > this.lastCoins && this.lastCoins >= 0;
      this.lastCoins = shown;
      el(this.root, '#hud-coins').textContent = formatNumber(Math.floor(w.coins));
      if (gained) {
        const pill = el(this.root, '.hud-coins');
        pill.classList.remove('bump');
        void pill.offsetWidth;
        pill.classList.add('bump');
      }
    }
    this.updateBossBars(w);
    const cue = el(this.root, '#hud-cue');
    const boss = w.bosses.find((b) => b.active && b.alive && b.attacking);
    const released = w.defense && w.gates.some((g) => !g.consumed && g.d > w.squad.d && g.d < 16);
    const danger = w.projectiles.length > 0 || !!boss;
    const text = w.projectiles.length ? '油桶将落地 · 整队移出红圈' : boss ? `${boss.comboStep < 2 ? '蓄力重击' : '快速连击'} ${boss.comboStep + 1}/5 · 移出危险带`
      : released ? '补给已放行 · 回门道接门' : '';
    if (cue.textContent !== text) cue.textContent = text;
    cue.classList.toggle('danger', danger);
    cue.classList.toggle('visible', !!text);
  }

  resumeCountdown(show: boolean) {
    el(this.root, '#resume-count').hidden = !show;
  }

  showPause(practice: boolean, carnage = false) {
    el(this.root, '#btn-restart').textContent = carnage ? '重新挑战狂潮' : practice ? '重新演练（无奖励）' : '保留战利品并重试';
    el(this.root, '#btn-quit').textContent = carnage ? '结束狂潮并记录击杀' : practice ? '结束演练（无奖励）' : '撤退并结算';
    this.show('pause');
  }

  /** 一枚金币从屏幕上某处飞进顶栏的金币框 */
  flyCoin(x: number, y: number, to = '.hud-coins .coin-ico', force = false, icon = ICON.coin) {
    if (this.root.classList.contains('reduced-motion')) return;
    if (this.flying >= 8 && !force) return;
    if (!force && this.current !== 'hud') return;
    const target = el(this.root, to).getBoundingClientRect();
    const tx = target.left + target.width / 2;
    const ty = target.top + target.height / 2;
    const c = document.createElement('div');
    c.className = 'fly-coin';
    c.innerHTML = icon;
    this.root.appendChild(c);
    this.flying++;
    // 先往上一弹，再划弧线飞过去
    const mx = x + (tx - x) * 0.3 + (Math.random() - 0.5) * 60;
    const my = Math.min(y, ty) + (y - ty) * 0.25 - 40;
    const anim = c.animate(
      [
        { transform: `translate(${x}px, ${y}px) scale(0.6)`, opacity: 0.4 },
        { transform: `translate(${mx}px, ${my}px) scale(1.15)`, opacity: 1, offset: 0.35 },
        { transform: `translate(${tx}px, ${ty}px) scale(0.75)`, opacity: 1 },
      ],
      { duration: 620, easing: 'cubic-bezier(0.45, 0, 0.75, 0.6)' },
    );
    anim.onfinish = () => {
      c.remove();
      this.flying--;
    };
  }

  private updateBossBars(w: World) {
    const box = el(this.root, '#boss-bars');
    // 打死的 Boss 血条留 1.5 秒显示“击败！”再收起
    const now = performance.now();
    for (const b of w.bosses) if (!b.alive && !this.bossDead.has(b.id)) this.bossDead.set(b.id, now);
    const active = w.bosses.filter((b) => b.active && (b.alive || now - (this.bossDead.get(b.id) ?? now) < 1500));
    const key = active.map((b) => b.id).join(',');
    if (key !== this.bossKey) {
      this.bossKey = key;
      box.innerHTML = active
        .map(
          (b) => `<div class="boss-bar"><div class="boss-face">${ICON.skull}</div><div class="boss-info">
            <div class="boss-name">${BOSSES[b.kind].name}<small>${BOSSES[b.kind].desc}</small></div>
            <div class="boss-hp"><div class="ghost"></div><div class="fill"></div><div class="seg"></div><span></span></div></div></div>`,
        )
        .join('');
      this.bossBars = [...box.querySelectorAll<HTMLElement>('.boss-bar')].map((n) => ({
        fill: n.querySelector<HTMLElement>('.fill')!,
        ghost: n.querySelector<HTMLElement>('.ghost')!,
        text: n.querySelector<HTMLElement>('span')!,
        shown: 1,
      }));
      box.classList.toggle('visible', active.length > 0);
      // 两个 Boss 时并排放两条窄的，少挡一点画面
      box.classList.toggle('multi', active.length > 1);
    }
    active.forEach((b, i) => {
      const bar = this.bossBars[i];
      if (!bar) return;
      const p = Math.max(0, b.hp / b.maxHp);
      bar.fill.style.width = `${p * 100}%`;
      // 浅色残影慢慢跟上，显得打得很痛
      bar.shown += (p - bar.shown) * 0.08;
      bar.ghost.style.width = `${Math.max(p, bar.shown) * 100}%`;
      bar.text.textContent = b.alive ? formatNumber(Math.ceil(b.hp)) : '击败！';
    });
  }

  banner(text: string, tone: 'info' | 'danger' | 'boss') {
    const b = el(this.root, '#banner');
    b.textContent = text;
    b.className = 'banner';
    void b.offsetWidth;
    b.className = `banner show ${tone}`;
    window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => (b.className = 'banner'), 1800);
  }

  /** 胜利彩带：从屏幕上方撒一把，三秒后清掉 */
  private confetti() {
    const box = el(this.root, '#result');
    if (this.root.classList.contains('reduced-motion')) return;
    box.querySelectorAll('.confetti').forEach((c) => c.remove());
    const colors = ['#ffd34d', '#ff6b6b', '#4da3ff', '#3ddc84', '#c39bff', '#ffffff'];
    for (let i = 0; i < 46; i++) {
      const c = document.createElement('i');
      c.className = 'confetti';
      c.style.left = `${Math.random() * 100}%`;
      c.style.background = colors[i % colors.length];
      c.style.setProperty('--dx', `${(Math.random() - 0.5) * 140}px`);
      c.style.setProperty('--r', `${(Math.random() - 0.5) * 1080}deg`);
      c.style.animationDelay = `${Math.random() * 0.5}s`;
      c.style.animationDuration = `${1.8 + Math.random() * 1.2}s`;
      if (i % 3 === 0) c.style.borderRadius = '50%';
      box.appendChild(c);
    }
    window.setTimeout(() => box.querySelectorAll('.confetti').forEach((c) => c.remove()), 3500);
  }

  showResult(info: ResultInfo) {
    const ribbon = el(this.root, '#result-ribbon');
    ribbon.textContent = info.title;
    ribbon.className = `ribbon ${info.won ? 'win' : 'lose'}`;
    const stars = el(this.root, '#result-stars');
    stars.style.display = info.stars === null ? 'none' : '';
    if (info.stars !== null) {
      stars.innerHTML = [0, 1, 2].map((i) => (i < info.stars! ? ICON.star.replace('<svg', '<svg class="on"') : ICON.starOff)).join('');
    }
    el(this.root, '#result-sub').textContent = info.sub;
    el(this.root, '#result-advice').textContent = info.advice ?? '';
    el(this.root, '#result-detail').textContent = info.detail ?? '';
    for (const sel of ['.reward', '.result-ups-title', '#result-ups']) el(this.root, sel).style.display = info.practice ? 'none' : '';
    el(this.root, '#result').classList.toggle('practice', !!info.practice);
    el(this.root, '#result-stats').innerHTML = info.stats.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
    const next = el(this.root, '#btn-next');
    next.style.display = info.next ? '' : 'none';
    next.textContent = info.next ?? '';
    next.dataset.mode = info.won ? 'next' : 'retry';
    el(this.root, '#btn-home').textContent = info.home;
    this.refreshMenu();
    this.show('result');
    if (info.won) this.confetti();
    // 金币数字滚上去
    const out = el(this.root, '#r-coins');
    const start = performance.now();
    window.clearInterval(this.countTimer);
    this.countTimer = window.setInterval(() => {
      const k = Math.min(1, (performance.now() - start) / 800);
      out.textContent = `+${formatNumber(Math.round(info.coins * (1 - Math.pow(1 - k, 3))))}`;
      if (k >= 1) {
        window.clearInterval(this.countTimer);
        // 数完了金币飞进余额，余额框跳一下
        const from = out.getBoundingClientRect();
        if (info.coins > 0 && from.width > 0) {
          for (let i = 0; i < 6; i++) {
            window.setTimeout(() => this.flyCoin(from.left + from.width / 2 + (Math.random() - 0.5) * 40, from.top + from.height / 2, '#result-balance', true), i * 60);
          }
          window.setTimeout(() => {
            const pill = el(this.root, '#result-balance').parentElement!;
            pill.classList.remove('bump');
            void pill.offsetWidth;
            pill.classList.add('bump');
          }, 600);
        }
      }
    }, 30);
  }
}
