import {
  BOSSES,
  BOSS_COMBO,
  BOSS_STRIKE_HALF,
  DEFENSE_VIEW_D,
  DEFENSE_WALL_D,
  BOSS_STOP,
  BULLET_RANGE,
  BULLET_SPEED,
  CONTACT_PAD,
  EMIT_CAP,
  ENEMY_ACTIVATE,
  EXPLODE_RADIUS,
  FORMATION_SPACING,
  GIANT_SMASH_INTERVAL,
  HIVE_INTERVAL,
  MAX_BLITZ_COUNT,
  MAX_COUNT,
  MAX_DEFENSE_COUNT,
  MAX_SOLDIERS_SIM,
  SQUAD_SPEED,
  SQUAD_STEER,
  THROWER_MELEE_TIME,
  THROW_FLIGHT,
  THROW_INTERVAL,
  THROW_RADIUS,
  TRACK_HALF,
  WALL_HALF,
  WEAPONS,
  ZOMBIES,
  AMMO,
  gateStep,
  rateGateStep,
  RATE_GATE_MAX,
  weaponGateStep,
  type AmmoDef,
  type BossKind,
  type ZombieKind,
} from './config';
import { BLITZ_LANES } from './blitz';
import { segCircle, SpatialBins } from './collision';
import { computeFormation, formationLaneCap, slotX, slotZ, type FormationParams } from './formation';
import {
  DEFENSE_TUNING,
  expectedDefenseDps,
  extendEndless,
  maxWeaponTier,
  type BannerSpec,
  type BarrelSpec,
  type BossSpec,
  type DefenseSpec,
  type Gen,
  type GateSpec,
  type HazardSpec,
  type HeroKind,
  type LevelSpec,
  type Reward,
  type WallSpec,
  type ZombieSpec,
} from './level';
import { CombatStats, type LossCause } from './feedback';
import { GEMS, bossBounty, bossGems, killCoins } from './economy';
import { PERK_MAP, pickBestPerk, rollPerkChoices, xpForNextDraft, type PerkDef, type PerkId } from './perks';
import { mulberry32, randRange, type Rng } from './rng';

/** 每秒最多生成的子弹数，超出时把伤害合并到少量子弹上 */
const MAX_SHOTS_PER_SEC = 600;
const STEP = 1 / 60;
/** 子弹碰撞时丧尸纵向分桶的宽度（米） */
const Z_BIN = 2;
/** 地刺：在上面待够这么久的士兵，按概率判定伤亡；每块地刺每名士兵独立判定一次 */
const SPIKE_EXPOSURE = 0.12;
const SPIKE_LETHALITY = 0.3;
const SAW_RADIUS = 0.8;
const STRIKE_RADIUS = 2.8;
/** 本局射速加成（射速门、射速箱）最多到 180%，不会一局就翻好几倍 */
const MAX_RATE_BONUS = 1.8;
/** 广告奇袭模式允许更高射速叠加，爽感更强 */
const MAX_BLITZ_RATE_BONUS = 2.8;
/** 防线门道堵车时，前后两样东西之间至少隔多远 */
const JAM_GAP = 7;
/** 防线里丧尸的速度倍数 */
const DEFENSE_ZOMBIE_SPEED = 1.7;

export interface CarnageRocket {
  x0: number;
  d0: number;
  x: number;
  d: number;
  t: number;
  T: number;
  damage: number;
}

export interface Soldier {
  /** 相对队伍中心的偏移，向阵位平滑移动 */
  ox: number;
  oz: number;
  phase: number;
  /** 0→1 出生弹出动画 */
  spawn: number;
  /** 0..1，随机种子特征 */
  luck: number;
  spike: number;
  /** 上一次触发判定的地刺 id，防止首块地刺幸存者在后续地刺上永久免疫 */
  lastSpikeId?: number;
}

export interface Bullet {
  x: number;
  d: number;
  vx: number;
  vd: number;
  dmg: number;
  travel: number;
  /** 还能穿透几个丧尸 */
  pierce: number;
  /** 上一个打中的丧尸（穿透时不重复打） */
  lastHit: number;
  /** 合并弹丸代表的逻辑命中数，防止性能上限吞掉射门收益。 */
  gateHits?: number;
}

export interface Gate extends GateSpec {
  id: number;
  hits: number;
  consumed: boolean;
  /** 被选中穿过 */
  taken: boolean;
  /** 被打中时的跳动，渲染用 */
  bump: number;
  /** 横移门的基准左右边界与相位 */
  baseX0?: number;
  baseX1?: number;
  slidePhase?: number;
  /** 是否已完成红转蓝大反转（每扇门只触发一次反转奖励） */
  flipped?: boolean;
}

export interface Barrel extends BarrelSpec {
  id: number;
  maxHp: number;
  alive: boolean;
  bump: number;
  /** 防线大障碍已经卡住、血量已定 */
  armed: boolean;
  /** 防线：血量已经定好（进视野那一刻定，之后不再变） */
  priced: boolean;
  /** 广告奇袭：重装坦克开火倒计时与炮管后坐力 */
  fireTimer: number;
  recoil: number;
  /** 黄金武装补给车的横向机动基准与相位 */
  truckBaseX?: number;
  truckPhase?: number;
}

export interface Zombie {
  id: number;
  kind: ZombieKind;
  x: number;
  d: number;
  hp: number;
  maxHp: number;
  r: number;
  active: boolean;
  alive: boolean;
  phase: number;
  flash: number;
  /** 巨尸砸地计时 */
  atk: number;
  /** 巨尸身体碾压的累计 */
  grind: number;
  /** 渲染用的随机外观 0..1 */
  look: number;
  reward?: Reward;
  /** 尸巢孵出来的，记录母体 id */
  owner: number;
  /** 一只顶几只（超大尸潮折算），影响杀伤 */
  weight: number;
  /** 电磁弹减速计时（秒） */
  slow?: number;
  /** 极寒冻弹 / 液氮冰冻桶脆化计时（秒）与等级（4 表示液氮深冻） */
  cryo?: number;
  cryoLvl?: number;
}

export interface Boss {
  id: number;
  kind: BossKind;
  x: number;
  d: number;
  homeX: number;
  hp: number;
  maxHp: number;
  r: number;
  active: boolean;
  alive: boolean;
  phase: number;
  /** 当前蓄力进度 0..1 */
  windup: number;
  /** 砸地/扔东西后的余震 1→0 */
  slam: number;
  flash: number;
  attacking: boolean;
  /** 近战锁定的危险带；蓄力中玩家可横向撤出。 */
  attackX: number;
  attackD: number;
  attackLength: number;
  comboStep: number;
  /** 已贴近队伍后保持连招，不因减员引起的阵型长度变化重新进入追赶阶段。 */
  engaged: boolean;
  recover: number;
  smashes: number;
  timer: number;
  fightTime: number;
  /** 最终 Boss（冲锋终点的、防线关底的） */
  final: boolean;
  /** 双 Boss 中的一个 */
  pair: boolean;
  /** 半血以后狂暴：出手更快、走得更快 */
  enraged: boolean;
  /** 投弹屠夫切近战是否已弹提示 */
  meleeWarned?: boolean;
  /** 冰冻脆化计时 */
  cryo?: number;
  cryoLvl?: number;
}

export interface Projectile {
  id: number;
  x0: number;
  d0: number;
  tx: number;
  td: number;
  t: number;
  T: number;
}

export interface Hazard extends HazardSpec {
  id: number;
  phase: number;
  /** 锯片当前 x */
  x: number;
}

export interface Wall extends WallSpec {
  id: number;
}

export interface Strike {
  id: number;
  x: number;
  d: number;
  t: number;
  T: number;
}

export const HERO_INFO: Record<HeroKind, { name: string; title: string; color: number; pill: string }> = {
  pyro: { name: '烈焰先锋', title: '火焰喷射横扫', color: 0xf97316, pill: '#ea580c' },
  railgun: { name: '雷霆狙击', title: '电磁穿甲光束', color: 0x38bdf8, pill: '#0284c7' },
  commander: { name: '战地指挥官', title: '增兵补盾号令', color: 0xfacc15, pill: '#b45309' },
};

/** 营救入队的传奇英雄：独特 3D 装甲造型 + 周期招牌大招 */
export interface AllyHero {
  id: number;
  kind: HeroKind;
  name: string;
  slot: number;
  x: number;
  d: number;
  yaw: number;
  fireTimer: number;
  skillTimer: number;
  recoil: number;
  phase: number;
  skillFlash: number;
}

/** 桥面空降双管自动加特林炮台：旋转索敌持续倾泻弹雨 */
export interface AllyTurret {
  id: number;
  slot: number;
  x: number;
  d: number;
  yaw: number;
  fireTimer: number;
  spin: number;
  recoil: number;
  life: number;
  maxLife: number;
}

export type HitTarget = 'zombie' | 'giant' | 'barrel' | 'gate' | 'boss';

export type GameEvent =
  | { type: 'hit'; x: number; d: number; y: number; target: HitTarget; color: number; dmg: number; id: number }
  /** 掉钻石 */
  | { type: 'gem'; x: number; d: number; amount: number }
  /** Boss 半血狂暴 */
  | { type: 'bossEnrage'; boss: Boss }
  /** 狂潮火箭/超载轰炸 */
  | { type: 'carnageBlast'; x: number; d: number; r: number; nova: boolean }
  /** 爆裂弹/电磁弹溅射 */
  | { type: 'splash'; x: number; d: number; r: number }
  | { type: 'gateUp'; gate: Gate }
  /** 红门射穿 0 反转为绿门的大反转奖励事件 */
  | { type: 'gateFlip'; gate: Gate; bonus: number }
  | { type: 'gatePass'; gate: Gate; before: number; after: number }
  | { type: 'zombieDie'; x: number; d: number; kind: ZombieKind; coins: number; look: number }
  | { type: 'soldierDie'; x: number; d: number }
  | { type: 'barrelBreak'; barrel: Barrel }
  | { type: 'reward'; reward: Reward; x: number; d: number; upgraded: boolean }
  | { type: 'explode'; x: number; d: number; r: number; source: 'exploder' | 'impact' | 'strike'; killed: number }
  /** 液氮冰冻桶引爆：冰封全场 + 碎冰脆化 */
  | { type: 'cryoNova'; x: number; d: number; r: number; count: number }
  /** 黄金盲盒 / ? 命运门开奖 */
  | { type: 'mysteryRoll'; x: number; d: number; label: string; color: number }
  /** 英雄救援舱破开：传奇英雄入队 */
  | { type: 'heroJoin'; hero: AllyHero; x: number; d: number }
  /** 传奇英雄释放招牌大招 */
  | { type: 'heroSkill'; hero: AllyHero; kind: HeroKind; x: number; d: number; tx: number; td: number }
  /** 自动加特林机枪炮台部署落地 */
  | { type: 'turretDeploy'; turret: AllyTurret; x: number; d: number }
  /** 连击狂热 FEVER 时刻开启 */
  | { type: 'feverStart'; duration: number; combo: number }
  /** 击毁黄金武装补给车爆发金币大奖 */
  | { type: 'truckBreak'; x: number; d: number; coins: number }
  | { type: 'giantSmash'; x: number; d: number; killed: number }
  | { type: 'bossStart'; bosses: Boss[] }
  | { type: 'bossSmash'; boss: Boss; x: number; d: number; killed: number; combo: number }
  | { type: 'throw'; boss: Boss; proj: Projectile }
  | { type: 'hiveSpawn'; boss: Boss; count: number }
  | { type: 'bossDie'; boss: Boss; bounty: number }
  | { type: 'strike'; strike: Strike }
  | { type: 'banner'; text: string; tone: BannerSpec['tone'] }
  | { type: 'trap'; x: number; d: number }
  | { type: 'blocked'; barrel: Barrel }
  | { type: 'shieldBlock'; x: number; d: number; remaining: number }
  | { type: 'tankFire'; barrel: Barrel; proj: Projectile }
  | { type: 'tankCapture'; tank: AllyTank; fromX: number; fromD: number }
  | { type: 'allyTankFire'; tank: AllyTank; shell: AllyShell }
  | { type: 'allyShellHit'; x: number; d: number; r: number; tier: 1 | 2 | 3 | 4 }
  | { type: 'airstrikeLaunch'; x: number; d: number }
  | { type: 'draftOffer'; choices: PerkDef[]; level: number }
  | { type: 'perkChosen'; perk: PerkDef; level: number }
  | { type: 'lightningArc'; points: { x: number; d: number; y: number }[] }
  | { type: 'orbitalLaser'; x: number; d: number; r: number; level: number }
  | { type: 'mechDrop'; mech: AllyMech }
  | { type: 'mechLand'; mech: AllyMech }
  | { type: 'critHit'; x: number; d: number; y: number; dmg: number }
  | { type: 'overdriveStart'; duration: number }
  | { type: 'won' }
  | { type: 'lost' };

/** 空降入队护航的蓝金重装泰坦机甲 */
export interface AllyMech {
  id: number;
  slot: number;
  x: number;
  d: number;
  /** 0 -> 1 空降着陆进度，>=1 表示已着陆投入战斗 */
  dropT: number;
  yaw: number;
  fireTimer: number;
  missileTimer: number;
  recoil: number;
  phase: number;
}

/** 被玩家击毁收编后开上前线与小队并肩作战的友军重装坦克 */
export interface AllyTank {
  id: number;
  tier: 1 | 2 | 3 | 4;
  name: string;
  twin: boolean;
  r: number;
  x: number;
  d: number;
  /** joining: 从右路收编点开上前线入队；fighting: 随小队协同作战 */
  phase: 'joining' | 'fighting';
  slot: number;
  hullYaw: number;
  turretYaw: number;
  fireTimer: number;
  fireInterval: number;
  recoil: number;
  captureGlow: number;
}

/** 友军重装坦克射出的高爆重炮弹 */
export interface AllyShell {
  id: number;
  x0: number;
  d0: number;
  x: number;
  d: number;
  t: number;
  T: number;
  damage: number;
  radius: number;
  tier: 1 | 2 | 3 | 4;
}

export interface WorldOptions {
  startSoldiers: number;
  damageMult: number;
  rateMult: number;
  startTier?: number;
  /** 射速加成倍数（Boss 连战跨轮继承） */
  rateBonus?: number;
  /** 子弹种类（局外射速升级进化出来的，AMMO 下标） */
  ammo?: number;
  /** 加人门的倍数（局外兵力升级进化） */
  gateBonus?: number;
  /** 左右挪动速度倍数（局外机动升级） */
  steerMult?: number;
  /** 投弹预警时间倍数（局外机动升级进化） */
  warnMult?: number;
  /** 金币倍数（局外金币升级） */
  coinMult?: number;
  /** 战术对装甲目标的额外倍率，不影响数字门。 */
  armorMult?: number;
  seed?: number;
  /** 无尽模式：继续生成内容的生成器 */
  endless?: { gen: Gen; until: number };
  /** 是否启用局内肉鸽三选一进化（默认除 carnage 外全模式开启） */
  roguelike?: boolean;
}

export type WorldState = 'run' | 'boss' | 'won' | 'lost';

interface QueueEntry {
  d: number;
  r: number;
  item: Gate | Barrel;
}

export class World {
  readonly spec: LevelSpec;
  state: WorldState = 'run';
  time = 0;
  /** 结束后经过的时间 */
  endTime = 0;
  readonly squad = { x: 0, targetX: 0, d: 0, count: 0, tier: 0, moving: true, rate: 1, side: 0 };
  readonly soldiers: Soldier[] = [];
  readonly bullets: Bullet[] = [];
  gates: Gate[];
  barrels: Barrel[];
  zombies: Zombie[];
  hazards: Hazard[];
  walls: Wall[];
  readonly bosses: Boss[] = [];
  readonly projectiles: Projectile[] = [];
  readonly strikes: Strike[] = [];
  events: GameEvent[] = [];
  readonly stats = new CombatStats();
  kills = 0;
  coins = 0;
  /** 本局拿到的钻石（打 Boss 一定给，打丧尸碰运气） */
  gems = 0;
  /** 实体增删时加一，渲染层据此同步 */
  version = 0;
  /** 阵型的半宽、最前和最后（相对中心） */
  halfWidth = 0;
  front = 0;
  back = 0;
  /** 平滑后的阵型参数 */
  private form: FormationParams = { sx: 0, sz: 1, shift: 0, gap: FORMATION_SPACING };
  private readonly formScratch: FormationParams = { sx: 0, sz: 1, shift: 0, gap: FORMATION_SPACING };
  /** 当前队伍中心可去的范围 */
  lo = -TRACK_HALF;
  hi = TRACK_HALF;

  private readonly opts: WorldOptions;
  /** 子弹碰撞的预筛：这一步射程内的门和桶、按纵向 2 米分桶的丧尸 */
  private readonly hitGates: Gate[] = [];
  private readonly hitBarrels: Barrel[] = [];
  private readonly zSpatial = new SpatialBins<Zombie>(Z_BIN);
  /** 用完的子弹对象，下次开枪直接复用，少给垃圾回收添活 */
  private readonly bulletPool: Bullet[] = [];
  /** 子弹种类（局外射速升级进化，广告奇袭中亦可局内捡拾升级） */
  ammo: AmmoDef;
  private readonly rng: Rng;
  private shotAcc = 0;
  private nextId = 1;
  private readonly banners: BannerSpec[] = [];
  private bannerIdx = 0;
  private readonly near: Zombie[] = [];
  private readonly nearHazards: Hazard[] = [];
  private readonly gateGroups = new Map<number, Gate[]>();
  private readonly gateListPool: Gate[][] = [];
  private readonly queuePool: QueueEntry[] = [];
  private readonly queueScratch: QueueEntry[] = [];
  private readonly carnageTargets: Zombie[] = [];
  private pruneT = 0;
  private readonly zombieSpeed: number;
  private damage: number;
  private readonly endless: { gen: Gen; until: number } | null;
  /** 防线模式：刷新表和进度 */
  readonly defense: DefenseSpec | null;
  private spawnIdx = 0;
  /** 门道队列当前速度：放行后从 0 加速到 conveyor */
  private queueV = 0;
  private streamAcc = 0;
  readonly rockets: CarnageRocket[] = [];
  readonly carnage = {
    shells: 120,
    batteries: 0,
    recruits: 0,
    ammoPickups: 0,
    charge: 0,
    combo: 0,
    bestCombo: 0,
    lastKill: -10,
    burstUntil: 0,
    clears: 0,
  };
  readonly allyTanks: AllyTank[] = [];
  readonly allyShells: AllyShell[] = [];
  readonly allyMechs: AllyMech[] = [];
  readonly allyHeroes: AllyHero[] = [];
  readonly allyTurrets: AllyTurret[] = [];
  /** 连击狂热 FEVER 时刻：高连击自动触发，射速 +25%、金币 2× */
  readonly fever = {
    active: 0,
    duration: 6.0,
    nextCombo: 30,
    triggers: 0,
  };
  /** 局内通用能量护盾（Blitz 护盾补给 + 肉鸽「宙斯护盾矩阵」统一共用） */
  shield = 0;
  readonly roguelike = {
    enabled: true,
    level: 0,
    xp: 0,
    nextXp: xpForNextDraft(0),
    perks: {} as Partial<Record<PerkId, number>>,
    order: [] as PerkId[],
    draftChoices: null as PerkDef[] | null,
    totalDrafts: 0,
  };
  readonly overdrive = {
    combo: 0,
    bestCombo: 0,
    comboTimer: 0,
    charge: 0,
    active: 0,
    duration: 6.5,
  };
  private orbitalTimer = 2.4;
  private shieldRegenTimer = 5;
  private naniteKills = 0;
  readonly blitz = {
    stage: 1 as 1 | 2,
    drones: 0,
    multishot: 1,
    shield: 0,
    damageBonus: 0,
    tanksDestroyed: 0,
    totalTanks: 0,
    allyTanks: 0,
    buffsCollected: 0,
    combo: 0,
    bestCombo: 0,
    lastKill: -10,
  };
  private droneAt = 1.6;
  private rocketAt = 3;
  private novaActive = false;
  private carnageStage = 0;

  constructor(spec: LevelSpec, opts: WorldOptions) {
    this.spec = spec;
    this.opts = opts;
    this.rng = mulberry32(opts.seed ?? spec.level * 31 + 7);
    this.roguelike.enabled = opts.roguelike ?? spec.mode !== 'carnage';
    // 防线里丧尸跑得快得多，直接冲到脸上；广告奇袭三路节奏偏稳，方便左右拉扯
    this.zombieSpeed = spec.mode === 'carnage' ? 0.72 : spec.mode === 'blitz' ? 1.15 : spec.defense ? DEFENSE_ZOMBIE_SPEED : 1;
    this.damage = opts.damageMult;
    this.ammo =
      spec.mode === 'carnage'
        ? { name: '黄金穿透弹', pierce: 4, splash: 1.6, splashDmg: 0.8, color: 0xffcd3e }
        : AMMO[Math.max(0, Math.min(AMMO.length - 1, opts.ammo ?? 0))];
    this.endless = opts.endless ?? null;
    this.defense = spec.defense;
    this.blitz.stage = spec.level === 2 ? 2 : 1;
    this.gates = [];
    this.barrels = [];
    this.zombies = [];
    this.hazards = [];
    this.walls = [];
    this.addContent(spec);
    if (spec.mode === 'blitz') {
      let total = 0;
      for (let i = 0; i < this.barrels.length; i++) if (this.barrels[i].tank) total++;
      this.blitz.totalTanks = total;
    }
    for (const b of spec.bosses) this.bosses.push(this.makeBoss(b, spec.length + 6));
    if (this.bosses.length > 1) for (const b of this.bosses) b.pair = true;
    // 防线开局站在门道上，第一组门直接吃到；广告奇袭开局站左路立刻打 +1 门
    if (spec.defense) {
      this.squad.x = this.squad.targetX =
        spec.mode === 'carnage' ? 1.55 : spec.mode === 'blitz' ? BLITZ_LANES.left : spec.defense.gateSide * (TRACK_HALF / 2);
    }
    this.squad.count = Math.max(1, Math.min(this.countCap, Math.round(opts.startSoldiers)));
    this.squad.tier = opts.startTier ?? 0;
    this.squad.rate = opts.rateBonus ?? 1;
    this.syncSoldiers(false);
    for (const s of this.soldiers) s.spawn = 1;
    this.layout(1);
  }

  /** 把一段关卡内容加进世界（开局和无尽模式续生成都用），不污染传入的 LevelSpec */
  private addContent(spec: Pick<LevelSpec, 'gates' | 'barrels' | 'zombies' | 'hazards' | 'walls' | 'banners'>) {
    // 局外升级：加人门按兵力进化放大；开局枪已经比武器箱给的好，这个箱子改成给兵（不白打，也不越过本关的武器上限）
    const bonus = this.opts.gateBonus ?? 1;
    const start = this.opts.startTier ?? 0;
    for (const g of spec.gates) {
      const value = g.kind === 'add' && g.value > 0 ? Math.round(g.value * bonus) : g.kind === 'weapon' ? Math.max(g.value, start) : g.value;
      this.gates.push({
        ...g,
        value,
        id: this.nextId++,
        hits: 0,
        consumed: false,
        taken: false,
        bump: 0,
        baseX0: g.x0,
        baseX1: g.x1,
        slidePhase: this.rng() * Math.PI * 2,
      });
    }
    for (const b of spec.barrels) {
      const reward: Reward =
        b.reward.kind === 'weapon' && b.reward.tier <= start ? { kind: 'soldiers', amount: 1 + Math.ceil(this.spec.level / 3) } : b.reward;
      const look = reward !== b.reward && b.look === 'tires' ? 'armor' : b.look;
      this.barrels.push({
        ...b,
        reward,
        look,
        id: this.nextId++,
        maxHp: b.hp,
        alive: true,
        bump: 0,
        armed: false,
        priced: false,
        fireTimer: b.tank ? b.tank.fireInterval * 0.7 : 0,
        recoil: 0,
        truckBaseX: b.truck ? b.x : undefined,
        truckPhase: b.truck ? this.rng() * Math.PI * 2 : undefined,
      });
    }
    for (const z of spec.zombies) this.zombies.push(this.makeZombie(z));
    for (const h of spec.hazards) this.hazards.push({ ...h, id: this.nextId++, phase: this.rng() * 6, x: (h.x0 + h.x1) / 2 });
    for (const w of spec.walls) this.walls.push({ ...w, id: this.nextId++ });
    if (spec.banners.length > 0) {
      this.banners.push(...spec.banners);
      this.banners.sort((a, b) => a.d - b.d);
    }
    this.version++;
  }

  private carnageBlast(x: number, d: number, r: number, damage: number, nova = false) {
    this.events.push({ type: 'carnageBlast', x, d, r, nova });
    for (let i = 0; i < this.zombies.length; i++) {
      const z = this.zombies[i];
      if (!z.alive) continue;
      const dx = z.x - x;
      const dd = z.d - d;
      const lim = r + z.r;
      if (dx * dx + dd * dd < lim * lim) this.damageZombie(z, damage);
    }
    for (let i = 0; i < this.bosses.length; i++) {
      const b = this.bosses[i];
      if (!b.alive) continue;
      const dx = b.x - x;
      const dd = b.d - d;
      const lim = r + b.r;
      if (dx * dx + dd * dd < lim * lim) this.damageBoss(b, damage * 2);
    }
  }

  /** 蓄满后手动释放，不能在结算中刷连击或重复释放。 */
  releaseNova(): boolean {
    if (this.spec.mode !== 'carnage' || (this.state !== 'run' && this.state !== 'boss') || this.carnage.charge < 100) return false;
    this.carnage.charge = 0;
    this.carnage.clears++;
    this.carnage.burstUntil = this.time + 6;
    this.novaActive = true;
    this.carnageBlast(0, 24, 50, 4500, true);
    this.novaActive = false;
    this.events.push({ type: 'banner', text: '超载 6 秒 · 双倍弹幕！', tone: 'info' });
    return true;
  }

  private spawnCarnageWave(count: number, stage: number, alive: number): number {
    const def = this.defense!;
    const n = Math.min(count, Math.max(0, 650 - alive));
    if (n <= 0) return alive;
    const hp = (9 + stage * 5) * ZOMBIES.walker.hp;
    for (let i = 0; i < n; i++) {
      const z = this.makeZombie({
        kind: 'walker',
        x: -3.7 + (i % 10) * 0.35,
        d: def.spawnD + Math.floor(i / 10) * 0.54,
        hp,
      });
      z.active = true;
      this.zombies.push(z);
    }
    this.version++;
    return alive + n;
  }

  private runCarnage(dt: number) {
    const def = this.defense!;
    const stage = Math.min(2, Math.floor(this.time / 30));
    if (stage > this.carnageStage) {
      this.carnageStage = stage;
      this.squad.tier = 4;
      if (stage === 2) this.carnage.shells = Math.min(9999, this.carnage.shells + 99);
      this.events.push({ type: 'banner', text: stage === 1 ? '重炮增援 · 火箭连发' : '红潮压境 · 全弹装填', tone: 'boss' });
    }
    let alive = 0;
    for (let i = 0; i < this.zombies.length; i++) if (this.zombies[i].alive) alive++;

    while (this.spawnIdx < def.spawns.length && def.spawns[this.spawnIdx].t <= this.time) {
      const sp = def.spawns[this.spawnIdx++];
      if (sp.wave) alive = this.spawnCarnageWave(sp.wave, stage, alive);
      if (sp.boss) {
        const b = this.makeBoss(sp.boss, sp.t === 0 ? 28 : 30);
        b.final = sp.t >= def.duration;
        b.active = true;
        this.bosses.push(b);
        this.events.push({ type: 'bossStart', bosses: [b] });
        this.version++;
      }
    }
    if (this.time < def.duration) {
      this.streamAcc += dt * (10 + stage * 4);
      if (this.streamAcc >= 8) {
        alive = this.spawnCarnageWave(8, stage, alive);
        this.streamAcc -= 8;
      }
    }
    if (this.time > this.carnage.lastKill + 2.5) this.carnage.combo = 0;
    // 弹药来自黄色 +99 牌和多管炮架；实体火箭飞行后才结算爆炸。
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const rocket = this.rockets[i];
      rocket.t += dt;
      if (rocket.t >= rocket.T) {
        this.carnageBlast(rocket.x, rocket.d, 4, rocket.damage);
        this.rockets[i] = this.rockets[this.rockets.length - 1];
        this.rockets.pop();
      }
    }
    if (this.time >= this.rocketAt && this.carnage.shells > 0) {
      this.rocketAt = this.time + (this.time < this.carnage.burstUntil ? 0.32 : 1.5);
      let boss: Boss | null = null;
      for (let i = 0; i < this.bosses.length; i++) {
        if (this.bosses[i].alive) {
          boss = this.bosses[i];
          break;
        }
      }
      const targets = this.carnageTargets;
      targets.length = 0;
      for (let i = 0; i < this.zombies.length; i++) {
        const z = this.zombies[i];
        if (z.alive && z.d < 43) targets.push(z);
      }
      const count = Math.min(3 + Math.min(3, this.carnage.batteries), this.carnage.shells);
      if (targets.length > 0 || boss) {
        for (let i = 0; i < count; i++) {
          const target = i === 0 && boss ? boss : targets.length > 0 ? targets[Math.floor(this.rng() * targets.length)] : boss!;
          this.rockets.push({
            x0: this.squad.x + (i - count / 2) * 0.18,
            d0: this.squad.d + this.front,
            x: target.x,
            d: target.d,
            t: 0,
            T: 0.55 + i * 0.04,
            damage: 280 + stage * 140,
          });
          this.carnage.shells--;
        }
      }
    }
    this.moveCarnageQueue(dt);
  }

  private moveCarnageQueue(dt: number) {
    const step = dt * 3.4;
    // 右列炮架在桥头排队，前一个打碎后下一个补位；同时记录中央 504 炮组位置。
    let battery: Barrel | null = null;
    let podFloor = 18;
    for (let i = 0; i < this.barrels.length; i++) {
      const b = this.barrels[i];
      if (!b.alive) continue;
      if (b.carnage === 'battery') {
        b.d = Math.max(18, b.d - step);
        if (!battery) battery = b;
      } else {
        b.d = Math.max(podFloor, b.d - step);
        if (b.carnage === 'pod') podFloor = b.d + 3;
      }
    }
    // 蓝色增兵门独立流动；黄色弹药牌由中央 504 炮组挡住（gates 按 d 递增生成，单趟遍历零分配）。
    let floor = battery ? battery.d + 3.4 : -Infinity;
    for (let i = 0; i < this.gates.length; i++) {
      const g = this.gates[i];
      if (g.consumed) continue;
      if (g.carnage === 'ammo') {
        g.d = Math.max(floor, g.d - step);
        floor = g.d + 3.4;
      } else if (g.carnage === 'recruit') {
        g.d -= step;
      }
    }
  }

  private makeBoss(b: BossSpec, d: number): Boss {
    const def = BOSSES[b.kind];
    return {
      id: this.nextId++,
      kind: b.kind,
      x: b.x,
      homeX: b.x,
      d,
      hp: b.hp,
      maxHp: b.hp,
      r: def.radius,
      active: false,
      alive: true,
      phase: this.rng() * 6,
      windup: 0,
      slam: 0,
      flash: 0,
      attacking: false,
      attackX: b.x,
      attackD: 0,
      attackLength: 0,
      comboStep: 0,
      engaged: false,
      recover: 0,
      smashes: 0,
      timer: this.rng() * 1.2,
      fightTime: 0,
      // 冲锋的 Boss 都在终点，是最终 Boss；防线的在刷出来时再标
      final: !this.defense,
      pair: false,
      enraged: false,
      meleeWarned: false,
    };
  }

  private makeZombie(z: ZombieSpec, owner = 0): Zombie {
    const def = ZOMBIES[z.kind];
    return {
      id: this.nextId++,
      kind: z.kind,
      x: z.x,
      d: z.d,
      hp: z.hp,
      maxHp: z.hp,
      r: def.radius,
      active: owner > 0 || this.spec.mode === 'carnage',
      alive: true,
      phase: this.rng() * Math.PI * 2,
      flash: 0,
      atk: 0,
      grind: 0,
      look: this.rng(),
      reward: z.reward,
      owner,
      weight: z.weight ?? 1,
    };
  }

  get progress(): number {
    if (this.defense) return Math.min(1, this.time / this.defense.duration);
    if (!Number.isFinite(this.spec.length)) return 0;
    return Math.min(1, this.squad.d / (this.spec.length - BOSS_STOP));
  }

  get weapon() {
    return WEAPONS[this.squad.tier];
  }

  private get countCap(): number {
    return this.spec.mode === 'carnage' ? 240 : this.spec.mode === 'blitz' ? MAX_BLITZ_COUNT : this.defense ? MAX_DEFENSE_COUNT : MAX_COUNT;
  }

  perkLevel(id: PerkId): number {
    return this.roguelike.perks[id] ?? 0;
  }

  private get totalStreams(): number {
    const base = this.spec.mode === 'blitz' ? this.blitz.multishot : 1;
    return Math.min(5, base + this.perkLevel('fan_volley'));
  }

  get fireRate(): number {
    const oc = this.perkLevel('overclock');
    const ocMult = oc === 0 ? 1 : oc === 1 ? 1.24 : oc === 2 ? 1.44 : 1.68;
    const odMult = this.overdrive.active > 0 ? 1.45 : 1;
    const feverMult = this.fever.active > 0 ? 1.25 : 1;
    return this.weapon.rate * this.opts.rateMult * this.squad.rate * ocMult * odMult * feverMult * (this.spec.mode === 'carnage' && this.time < this.carnage.burstUntil ? 2 : 1);
  }

  setTarget(x: number) {
    this.squad.targetX = x;
  }

  /** 当前每秒总伤害，UI 和平衡脚本用 */
  dps(): number {
    const odDmg = this.overdrive.active > 0 ? 1.4 : 1;
    return this.squad.count * this.fireRate * this.weapon.damage * this.damage * odDmg * this.totalStreams;
  }

  /** 触发局内肉鸽三选一结果 */
  choosePerk(id: PerkId): boolean {
    const choices = this.roguelike.draftChoices;
    if (!choices || !choices.some((c) => c.id === id)) return false;
    const def = PERK_MAP[id];
    const nextLvl = Math.min(def.maxLevel, (this.roguelike.perks[id] ?? 0) + 1);
    this.roguelike.perks[id] = nextLvl;
    if (!this.roguelike.order.includes(id)) this.roguelike.order.push(id);
    this.roguelike.draftChoices = null;
    this.roguelike.totalDrafts++;

    if (id === 'mech_drop') {
      this.spawnAllyMech();
    } else if (id === 'aegis_matrix') {
      const bonus = nextLvl === 1 ? 14 : nextLvl === 2 ? 20 : 28;
      this.addShield(bonus);
    } else if (id === 'orbital_laser') {
      this.orbitalTimer = 0.25;
    }

    this.events.push({ type: 'perkChosen', perk: def, level: nextLvl });
    this.events.push({ type: 'banner', text: `战术进化 · 【${def.name} Lv.${nextLvl}】已激活！`, tone: 'info' });
    return true;
  }

  /** 自动挑选最强肉鸽进化卡（用于 autoplay 演示与自动化测试） */
  autoPickPerk(): PerkDef | null {
    const choices = this.roguelike.draftChoices;
    if (!choices || choices.length === 0) return null;
    const best = pickBestPerk(choices, this.roguelike.perks);
    if (!best) return null;
    this.choosePerk(best.id);
    return best;
  }

  /** 启动战术过载（连击蓄能满 100 后可由玩家主动释放） */
  activateOverdrive(): boolean {
    if (this.state !== 'run' && this.state !== 'boss') return false;
    if (this.spec.mode === 'carnage') return false;
    if (this.overdrive.charge < 100 || this.overdrive.active > 0) return false;
    this.overdrive.charge = 0;
    this.overdrive.active = this.overdrive.duration;
    this.events.push({ type: 'overdriveStart', duration: this.overdrive.duration });
    this.events.push({ type: 'banner', text: '战术过载启动！全军火力 ×1.4 · 射速 ×1.45！', tone: 'info' });
    return true;
  }

  private addShield(amount: number) {
    this.shield = Math.min(45, this.shield + amount);
    this.blitz.shield = this.shield;
  }

  private addXp(amount: number) {
    if (!this.roguelike.enabled || amount <= 0) return;
    if (this.state !== 'run' && this.state !== 'boss') return;
    this.roguelike.xp += amount;
    if (!this.roguelike.draftChoices && this.roguelike.xp >= this.roguelike.nextXp) {
      const choices = rollPerkChoices(this.roguelike.perks, this.rng, 3);
      if (choices.length > 0) {
        this.roguelike.xp -= this.roguelike.nextXp;
        this.roguelike.level++;
        this.roguelike.nextXp = xpForNextDraft(this.roguelike.level);
        this.roguelike.draftChoices = choices;
        this.events.push({ type: 'draftOffer', choices, level: this.roguelike.level });
      }
    }
  }

  private spawnAllyMech() {
    const sq = this.squad;
    const slot = this.allyMechs.length;
    const side = slot % 2 === 0 ? -1 : 1;
    const row = Math.floor(slot / 2);
    const x = Math.max(-TRACK_HALF + 1.1, Math.min(TRACK_HALF - 1.1, sq.x + side * (Math.max(1.5, this.halfWidth + 0.85) + row * 0.45)));
    const d = sq.d + 1.1 + row * 1.9;
    const mech: AllyMech = {
      id: this.nextId++,
      slot,
      x,
      d,
      dropT: 0,
      yaw: 0,
      fireTimer: 0.25,
      missileTimer: 1.4,
      recoil: 0,
      phase: slot * 1.7,
    };
    this.allyMechs.push(mech);
    this.version++;
    this.events.push({ type: 'mechDrop', mech });
  }

  /** 营救传奇英雄入队：最多 4 位英雄在前锋领阵作战 */
  private spawnAllyHero(kind: HeroKind, fromX: number, fromD: number) {
    const info = HERO_INFO[kind];
    if (this.allyHeroes.length >= 4) {
      // 满编时强化火力并补充 6 名精锐士兵
      this.squad.count = Math.min(this.countCap, this.squad.count + 6);
      this.syncSoldiers(false);
      this.damage *= 1.12;
      this.events.push({ type: 'banner', text: `【${info.name}】满编晋升！全军 +6 精锐 · 火力 +12%！`, tone: 'info' });
      return;
    }
    const slot = this.allyHeroes.length;
    const sq = this.squad;
    const hero: AllyHero = {
      id: this.nextId++,
      kind,
      name: info.name,
      slot,
      x: sq.x,
      d: sq.d + 1.35,
      yaw: 0,
      fireTimer: 0.2,
      skillTimer: 0.9,
      recoil: 0,
      phase: slot * 1.3,
      skillFlash: 1,
    };
    this.allyHeroes.push(hero);
    this.version++;
    this.events.push({ type: 'heroJoin', hero, x: fromX, d: fromD });
    this.events.push({ type: 'banner', text: `传奇英雄【${info.name}】营救入队！（${info.title}）`, tone: 'info' });
  }

  /** 在队伍侧翼空降部署双管自动加特林炮台 */
  private deployAllyTurret(duration: number, fromX: number, fromD: number) {
    const sq = this.squad;
    if (this.allyTurrets.length >= 3) {
      // 炮台满编时刷新剩余最短炮台的持续时间并加满火力
      let oldest = this.allyTurrets[0];
      for (let i = 1; i < this.allyTurrets.length; i++) {
        if (this.allyTurrets[i].life < oldest.life) oldest = this.allyTurrets[i];
      }
      oldest.life = Math.max(oldest.life, duration);
      oldest.maxLife = Math.max(oldest.maxLife, duration);
      this.events.push({ type: 'turretDeploy', turret: oldest, x: fromX, d: fromD });
      return;
    }
    const slot = this.allyTurrets.length;
    const side = slot % 2 === 0 ? -1 : 1;
    const turret: AllyTurret = {
      id: this.nextId++,
      slot,
      x: Math.max(-TRACK_HALF + 0.9, Math.min(TRACK_HALF - 0.9, sq.x + side * (Math.max(1.3, this.halfWidth + 0.7)))),
      d: sq.d + 0.55 + Math.floor(slot / 2) * 1.2,
      yaw: 0,
      fireTimer: 0.15,
      spin: 0,
      recoil: 0,
      life: duration,
      maxLife: duration,
    };
    this.allyTurrets.push(turret);
    this.version++;
    this.events.push({ type: 'turretDeploy', turret, x: fromX, d: fromD });
  }

  /** 液氮冰冻桶 / 极寒急冻爆发：大范围深度冰封 + 碎冰脆化（0.18× 移速、1.65× 易伤） */
  private cryoNova(x: number, d: number, radius: number) {
    const rr = radius * radius;
    const shatterDmg = (95 + this.squad.tier * 55) * this.damage;
    let frozen = 0;
    for (let i = 0; i < this.near.length; i++) {
      const z = this.near[i];
      if (!z.alive) continue;
      const dx = z.x - x;
      const dd = z.d - d;
      if (dx * dx + dd * dd > rr + z.r * z.r) continue;
      z.cryo = 4.5;
      z.cryoLvl = 4;
      this.damageZombie(z, shatterDmg);
      frozen++;
    }
    for (let i = 0; i < this.bosses.length; i++) {
      const b = this.bosses[i];
      if (!b.alive || !b.active) continue;
      const dx = b.x - x;
      const dd = b.d - d;
      if (dx * dx + dd * dd <= (radius + b.r) * (radius + b.r)) {
        b.cryo = 4.2;
        b.cryoLvl = 4;
        this.damageBoss(b, shatterDmg * 1.35);
        frozen++;
      }
    }
    this.events.push({ type: 'cryoNova', x, d, r: radius, count: frozen });
  }

  /** 黄金盲盒 / ? 命运门随机爆大奖 */
  private rollMystery(x: number, d: number) {
    const sq = this.squad;
    const roll = this.rng();
    const heroes: HeroKind[] = ['pyro', 'railgun', 'commander'];
    if (roll < 0.22) {
      const missing = heroes.filter((h) => !this.allyHeroes.some((a) => a.kind === h));
      const pick = missing.length > 0 ? missing[Math.floor(this.rng() * missing.length)] : heroes[Math.floor(this.rng() * heroes.length)];
      this.spawnAllyHero(pick, x, d);
      this.events.push({ type: 'mysteryRoll', x, d, label: `SSR · ${HERO_INFO[pick].name}！`, color: HERO_INFO[pick].color });
    } else if (roll < 0.42) {
      this.deployAllyTurret(24, x, d);
      this.events.push({ type: 'mysteryRoll', x, d, label: '空降双管机枪炮台！', color: 0x38bdf8 });
    } else if (roll < 0.62) {
      const bonus = Math.max(8, Math.round(sq.count * 0.25));
      sq.count = Math.min(this.countCap, sq.count + bonus);
      this.syncSoldiers();
      this.events.push({ type: 'mysteryRoll', x, d, label: `兵力暴涨 +${bonus}！`, color: 0x22c55e });
    } else if (roll < 0.78) {
      if (sq.tier < WEAPONS.length - 1) {
        sq.tier++;
        this.events.push({ type: 'mysteryRoll', x, d, label: `武器跃迁 · ${WEAPONS[sq.tier].name}！`, color: 0xfacc15 });
      } else {
        this.damage *= 1.25;
        this.blitz.damageBonus += 25;
        this.events.push({ type: 'mysteryRoll', x, d, label: '终极超频 · 火力 +25%！', color: 0xf97316 });
      }
    } else if (roll < 0.9) {
      this.launchAirstrike();
      this.events.push({ type: 'mysteryRoll', x, d, label: '地毯式战机空袭！', color: 0xef4444 });
    } else {
      this.cryoNova(sq.x, sq.d + 16, 13);
      this.addShield(10);
      this.coins += 120;
      this.events.push({ type: 'mysteryRoll', x, d, label: '极寒全屏冰冻 + 10 护盾！', color: 0x22d3ee });
    }
  }

  /** 生成沿桥面疾驰的黄金武装军火补给车 */
  private spawnLootTruck(cfg: { hp: number; speed: number; sway: number; coins: number; reward: Reward }, startD: number) {
    const startX = (this.rng() < 0.5 ? -1 : 1) * 1.1;
    this.barrels.push({
      id: this.nextId++,
      x: startX,
      d: startD,
      r: 1.45,
      hp: cfg.hp,
      maxHp: cfg.hp,
      reward: cfg.reward,
      look: 'truck',
      truck: { speed: cfg.speed, sway: cfg.sway, swaySpeed: 1.75, coins: cfg.coins },
      alive: true,
      bump: 0,
      armed: false,
      priced: true,
      fireTimer: 0,
      recoil: 0,
      truckBaseX: 0,
      truckPhase: this.rng() * Math.PI * 2,
    });
    this.version++;
  }

  private updateSlidingGates(dt: number) {
    for (let i = 0; i < this.gates.length; i++) {
      const g = this.gates[i];
      if (g.consumed || !g.slideAmp || !g.slideSpeed) continue;
      g.slidePhase = (g.slidePhase ?? 0) + g.slideSpeed * dt;
      const bx0 = g.baseX0 ?? g.x0;
      const bx1 = g.baseX1 ?? g.x1;
      const halfW = (bx1 - bx0) * 0.5;
      const baseMid = (bx0 + bx1) * 0.5;
      const rawMid = baseMid + Math.sin(g.slidePhase) * g.slideAmp;
      const clampedMid = Math.max(-TRACK_HALF + halfW, Math.min(TRACK_HALF - halfW, rawMid));
      g.x0 = clampedMid - halfW;
      g.x1 = clampedMid + halfW;
    }
  }

  private updateLootTrucks(dt: number) {
    const sq = this.squad;
    for (let i = 0; i < this.barrels.length; i++) {
      const b = this.barrels[i];
      if (!b.alive || !b.truck) continue;
      b.d -= b.truck.speed * dt;
      b.truckPhase = (b.truckPhase ?? 0) + b.truck.swaySpeed * dt;
      const base = b.truckBaseX ?? 0;
      b.x = Math.max(-TRACK_HALF + 1.4, Math.min(TRACK_HALF - 1.4, base + Math.sin(b.truckPhase) * b.truck.sway));
      if (b.d < sq.d - 2.6) {
        b.alive = false;
      }
    }
  }

  private updateAllyHeroes(dt: number) {
    if (this.allyHeroes.length === 0 || this.squad.count <= 0) return;
    const sq = this.squad;
    const frontTank = this.frontBlitzTank();
    const count = this.allyHeroes.length;
    for (let i = 0; i < count; i++) {
      const h = this.allyHeroes[i];
      h.phase += dt * (sq.moving ? 10.5 : 5.5);
      h.recoil = Math.max(0, h.recoil - dt * 6);
      h.skillFlash = Math.max(0, h.skillFlash - dt * 2.2);

      // 在小队正前方排成锋矢阵型领衔冲锋
      const spread = count === 1 ? 0 : (i - (count - 1) * 0.5) * 1.15;
      const tx = Math.max(this.lo + 0.65, Math.min(this.hi - 0.65, sq.x + spread));
      const td = sq.d + this.front + 0.72 + (i % 2) * 0.25;
      h.x += (tx - h.x) * Math.min(1, dt * 10);
      h.d += (td - h.d) * Math.min(1, dt * 12);

      // 自动锁敌（Boss / 敌坦 / 补给车 / 丧尸）
      let aimX = h.x;
      let aimD = h.d + 22;
      let hasTarget = false;
      let bestScore = -1;
      for (let bi = 0; bi < this.bosses.length; bi++) {
        const b = this.bosses[bi];
        if (!b.alive || !b.active || b.d <= h.d + 0.5 || b.d > h.d + 46) continue;
        const sc = 500 + (50 - (b.d - h.d));
        if (sc > bestScore) {
          bestScore = sc;
          aimX = b.x;
          aimD = b.d;
          hasTarget = true;
        }
      }
      if (!hasTarget && frontTank && frontTank.d > h.d + 1 && frontTank.d < h.d + 40) {
        aimX = frontTank.x;
        aimD = frontTank.d;
        hasTarget = true;
      }
      if (!hasTarget) {
        for (let zi = 0; zi < this.near.length; zi++) {
          const z = this.near[zi];
          if (!z.alive || z.d <= h.d + 0.5 || z.d > h.d + 40) continue;
          const sc = (z.kind === 'giant' ? 120 : z.kind === 'brute' ? 40 : 12) + Math.max(0, 38 - (z.d - h.d));
          if (sc > bestScore) {
            bestScore = sc;
            aimX = z.x;
            aimD = z.d;
            hasTarget = true;
          }
        }
      }

      const desiredYaw = hasTarget ? Math.max(-0.8, Math.min(0.8, Math.atan2(aimX - h.x, Math.max(2, aimD - h.d)))) : 0;
      h.yaw += (desiredYaw - h.yaw) * Math.min(1, dt * 10);

      // 主武器持续射击
      if (hasTarget) {
        h.fireTimer -= dt;
        if (h.fireTimer <= 0) {
          h.fireTimer = h.kind === 'pyro' ? 0.24 : h.kind === 'railgun' ? 0.42 : 0.28;
          h.recoil = 0.85;
          const dx = aimX - h.x;
          const dd = Math.max(2, aimD - h.d);
          const len = Math.hypot(dx, dd);
          const spd = BULLET_SPEED * 1.3;
          const dmg = (26 + this.squad.tier * 16 + this.squad.count * 0.45) * this.damage;
          this.bullets.push({
            x: h.x,
            d: h.d + 0.45,
            vx: (dx / len) * spd,
            vd: (dd / len) * spd,
            dmg,
            travel: 0,
            pierce: h.kind === 'railgun' ? 3 : 1,
            lastHit: -1,
            gateHits: 0,
          });
        }
      }

      // 传奇英雄招牌大招
      h.skillTimer -= dt;
      if (h.skillTimer <= 0 && (hasTarget || h.kind === 'commander')) {
        h.skillFlash = 1;
        h.recoil = 1;
        if (h.kind === 'pyro') {
          h.skillTimer = 2.2;
          const flameDmg = (135 + this.squad.tier * 70 + this.squad.count * 2.5) * this.damage;
          for (let zi = 0; zi < this.near.length; zi++) {
            const z = this.near[zi];
            if (!z.alive) continue;
            const dd = z.d - h.d;
            if (dd > 0 && dd < 19 && Math.abs(z.x - h.x) <= 3.6) {
              this.damageZombie(z, flameDmg);
            }
          }
          for (let bi = 0; bi < this.bosses.length; bi++) {
            const b = this.bosses[bi];
            if (!b.alive || !b.active) continue;
            const dd = b.d - h.d;
            if (dd > 0 && dd < 21 && Math.abs(b.x - h.x) <= 3.8 + b.r) {
              this.damageBoss(b, flameDmg * 1.15);
            }
          }
          this.events.push({ type: 'heroSkill', hero: h, kind: 'pyro', x: h.x, d: h.d, tx: h.x, td: h.d + 16 });
        } else if (h.kind === 'railgun') {
          h.skillTimer = 2.6;
          const railDmg = (220 + this.squad.tier * 110 + this.squad.count * 4.2) * this.damage;
          const beamX = aimX;
          for (let zi = 0; zi < this.near.length; zi++) {
            const z = this.near[zi];
            if (!z.alive || z.d <= h.d || z.d > h.d + 46) continue;
            if (Math.abs(z.x - beamX) <= 1.45 + z.r) this.damageZombie(z, railDmg);
          }
          for (let bi = 0; bi < this.bosses.length; bi++) {
            const b = this.bosses[bi];
            if (!b.alive || !b.active || b.d <= h.d) continue;
            if (Math.abs(b.x - beamX) <= 1.55 + b.r) this.damageBoss(b, railDmg * 1.45);
          }
          for (let k = 0; k < this.barrels.length; k++) {
            const br = this.barrels[k];
            if (!br.alive || (!br.tank && !br.truck) || br.d <= h.d) continue;
            if (Math.abs(br.x - beamX) <= 1.5 + br.r) {
              br.hp -= railDmg * 1.3;
              br.bump = 1;
              if (br.hp <= 0) this.breakBarrel(br);
            }
          }
          this.events.push({ type: 'heroSkill', hero: h, kind: 'railgun', x: h.x, d: h.d, tx: beamX, td: Math.max(h.d + 18, aimD) });
        } else {
          h.skillTimer = 4.8;
          this.squad.count = Math.min(this.countCap, this.squad.count + 2);
          this.syncSoldiers(false);
          this.addShield(2);
          this.events.push({ type: 'heroSkill', hero: h, kind: 'commander', x: h.x, d: h.d, tx: sq.x, td: sq.d });
        }
      }
    }
  }

  private updateAllyTurrets(dt: number) {
    if (this.allyTurrets.length === 0) return;
    const sq = this.squad;
    const frontTank = this.frontBlitzTank();
    let removed = false;
    for (let i = this.allyTurrets.length - 1; i >= 0; i--) {
      const tu = this.allyTurrets[i];
      tu.life -= dt;
      if (tu.life <= 0) {
        this.allyTurrets.splice(i, 1);
        removed = true;
        continue;
      }
      tu.recoil = Math.max(0, tu.recoil - dt * 8);
      // 悬浮战术炮台在队伍侧翼伴随机动，确保冲锋/无尽/防线/突袭全模式可用
      const side = tu.slot % 2 === 0 ? -1 : 1;
      const row = Math.floor(tu.slot / 2);
      const tx = Math.max(-TRACK_HALF + 0.85, Math.min(TRACK_HALF - 0.85, sq.x + side * (Math.max(1.35, this.halfWidth + 0.65) + row * 0.45)));
      const td = sq.d + 0.45 + row * 1.35;
      tu.x += (tx - tu.x) * Math.min(1, dt * 8);
      tu.d += (td - tu.d) * Math.min(1, dt * 10);

      let aimX = tu.x;
      let aimD = tu.d + 20;
      let hasTarget = false;
      let bestDist = Infinity;
      for (let bi = 0; bi < this.bosses.length; bi++) {
        const b = this.bosses[bi];
        if (!b.alive || !b.active) continue;
        const dd = b.d - tu.d;
        if (dd > 0.5 && dd < 44 && dd < bestDist) {
          bestDist = dd;
          aimX = b.x;
          aimD = b.d;
          hasTarget = true;
        }
      }
      if (!hasTarget) {
        for (let zi = 0; zi < this.near.length; zi++) {
          const z = this.near[zi];
          if (!z.alive || z.d <= tu.d + 0.5 || z.d > tu.d + 40) continue;
          const dist = Math.hypot(z.x - tu.x, z.d - tu.d);
          if (dist < bestDist) {
            bestDist = dist;
            aimX = z.x;
            aimD = z.d;
            hasTarget = true;
          }
        }
      }
      if (!hasTarget && frontTank && frontTank.d > tu.d + 1 && frontTank.d < tu.d + 38) {
        aimX = frontTank.x;
        aimD = frontTank.d;
        hasTarget = true;
      }

      const desiredYaw = hasTarget ? Math.max(-1.0, Math.min(1.0, Math.atan2(aimX - tu.x, Math.max(2, aimD - tu.d)))) : 0;
      tu.yaw += (desiredYaw - tu.yaw) * Math.min(1, dt * 12);

      if (hasTarget && sq.count > 0) {
        tu.spin += dt * 22;
        tu.fireTimer -= dt;
        if (tu.fireTimer <= 0) {
          tu.fireTimer = 0.13;
          tu.recoil = 0.9;
          const dx = aimX - tu.x;
          const dd = Math.max(2, aimD - tu.d);
          const len = Math.hypot(dx, dd);
          const spd = BULLET_SPEED * 1.25;
          const dmg = (20 + this.squad.tier * 13 + this.squad.count * 0.35) * this.damage;
          for (const barrelOff of [-0.14, 0.14]) {
            this.bullets.push({
              x: tu.x + barrelOff,
              d: tu.d + 0.55,
              vx: (dx / len) * spd + (this.rng() - 0.5) * 1.2,
              vd: (dd / len) * spd,
              dmg,
              travel: 0,
              pierce: 1,
              lastHit: -1,
              gateHits: 0,
            });
          }
        }
      } else {
        tu.spin += dt * 2.5;
      }
    }
    if (removed) this.version++;
  }

  update(dt: number) {
    let left = Math.min(dt, 0.1);
    while (left > 1e-6) {
      const h = Math.min(STEP, left);
      this.step(h);
      left -= h;
    }
  }

  private step(dt: number) {
    const sq = this.squad;
    if (this.state !== 'run' && this.state !== 'boss') {
      this.endTime += dt;
      sq.moving = false;
      this.layout(dt);
      this.decay(dt);
      return;
    }
    this.time += dt;

    const prevD = sq.d;
    if (this.defense) {
      sq.moving = false;
      if (this.spec.mode === 'carnage') this.runCarnage(dt);
      else if (this.spec.mode === 'blitz') this.runBlitz(dt);
      else this.runDefense(dt);
    } else if (this.state === 'run') {
      sq.d += SQUAD_SPEED * dt;
      const stop = this.spec.length - BOSS_STOP;
      if (sq.d >= stop) {
        sq.d = stop;
        this.startBoss();
      }
    }
    if (this.endless && sq.d + 170 > this.endless.until) this.extend();
    while (this.bannerIdx < this.banners.length && this.banners[this.bannerIdx].d <= sq.d) {
      const b = this.banners[this.bannerIdx++];
      this.events.push({ type: 'banner', text: b.text, tone: b.tone });
    }

    this.updateBounds();
    const limLo = this.lo + this.halfWidth;
    const limHi = this.hi - this.halfWidth;
    const tx = limLo <= limHi ? Math.max(limLo, Math.min(limHi, sq.targetX)) : (this.lo + this.hi) / 2;
    sq.x += (tx - sq.x) * Math.min(1, SQUAD_STEER * (this.opts.steerMult ?? 1) * (this.overdrive.active > 0 ? 1.15 : 1) * dt);

    this.updateSlidingGates(dt);
    this.updateLootTrucks(dt);
    this.layout(dt);
    this.passGates(prevD);
    this.collectNear();
    this.fire(dt);
    this.updateBullets(dt);
    this.updateRoguelikeSystems(dt);
    this.updateAllyMechs(dt);
    this.updateAllyHeroes(dt);
    this.updateAllyTurrets(dt);
    this.updateZombies(dt);
    this.collideBarrels();
    this.updateHazards(dt);
    this.updateBosses(dt);
    this.updateProjectiles(dt);
    this.updateStrikes(dt);
    this.decay(dt);
    if (this.endless || this.defense) this.prune(dt);

    if (sq.count <= 0) this.lose();
    else if (this.defense && this.spawnIdx >= this.defense.spawns.length && this.state === 'run') {
      if (this.spec.mode === 'blitz') {
        const bossesDone = this.bosses.length > 0 && this.bosses.every((b) => !b.alive);
        const tanksDone = this.blitz.tanksDestroyed >= this.blitz.totalTanks;
        if (bossesDone && tanksDone) this.win();
      } else if (this.bosses.length > 0 && this.bosses.every((b) => !b.alive)) {
        // 最终 Boss 都倒下就赢，剩下的丧尸一起清掉
        this.win();
      }
    }
  }

  /** 局内肉鸽主动周期系统：轨道离子炮、护盾再生、连击过载/FEVER衰减与追踪导弹更新 */
  private updateRoguelikeSystems(dt: number) {
    if (this.overdrive.active > 0) {
      this.overdrive.active = Math.max(0, this.overdrive.active - dt);
    }
    if (this.fever.active > 0) {
      this.fever.active = Math.max(0, this.fever.active - dt);
    }
    if (this.overdrive.comboTimer > 0) {
      this.overdrive.comboTimer = Math.max(0, this.overdrive.comboTimer - dt);
      if (this.overdrive.comboTimer <= 0) {
        this.overdrive.combo = 0;
        this.fever.nextCombo = 30;
      }
    }

    // 宙斯护盾矩阵：周期再生能量护盾
    const aegisLvl = this.perkLevel('aegis_matrix');
    if (aegisLvl > 0 && this.squad.count > 0) {
      this.shieldRegenTimer -= dt;
      if (this.shieldRegenTimer <= 0) {
        this.shieldRegenTimer = aegisLvl === 1 ? 6.0 : aegisLvl === 2 ? 5.0 : 4.0;
        const regen = aegisLvl === 1 ? 2 : aegisLvl === 2 ? 3 : 4;
        this.addShield(regen);
      }
    }

    // 轨道离子炮：周期锁定最高血量目标降下天基激光
    const orbLvl = this.perkLevel('orbital_laser');
    if (orbLvl > 0 && this.squad.count > 0) {
      this.orbitalTimer -= dt;
      if (this.orbitalTimer <= 0) {
        const fired = this.fireOrbitalLaser(orbLvl);
        this.orbitalTimer = fired ? (orbLvl === 1 ? 5.4 : orbLvl === 2 ? 3.9 : 2.7) : 0.6;
      }
    }

    // 非 Blitz / Carnage 模式下若泰坦机甲发射了追踪导弹，同样推进并结算导弹
    if (this.spec.mode !== 'blitz' && this.spec.mode !== 'carnage' && this.rockets.length > 0) {
      for (let i = this.rockets.length - 1; i >= 0; i--) {
        const r = this.rockets[i];
        r.t += dt;
        if (r.t >= r.T) {
          this.mechMissileBlast(r.x, r.d, r.damage);
          this.rockets[i] = this.rockets[this.rockets.length - 1];
          this.rockets.pop();
        }
      }
    }
  }

  private fireOrbitalLaser(level: number): boolean {
    const beams = level >= 3 ? 2 : 1;
    const radius = level === 1 ? 3.2 : level === 2 ? 4.0 : 4.4;
    const baseDmg = (260 + this.squad.tier * 140 + this.squad.count * 6) * this.damage * (level === 1 ? 1 : level === 2 ? 1.5 : 1.75);
    const usedIds = new Set<number>();
    let fired = false;

    for (let k = 0; k < beams; k++) {
      let tx = 0;
      let td = 0;
      let found = false;
      let bestScore = -1;
      let chosenId = -1;

      for (let i = 0; i < this.bosses.length; i++) {
        const b = this.bosses[i];
        if (!b.alive || !b.active || usedIds.has(b.id)) continue;
        const sc = 10000 + b.hp;
        if (sc > bestScore) {
          bestScore = sc;
          tx = b.x;
          td = b.d;
          chosenId = b.id;
          found = true;
        }
      }
      if (!found) {
        for (let i = 0; i < this.barrels.length; i++) {
          const br = this.barrels[i];
          if (!br.alive || !br.tank || br.d > this.squad.d + 46 || usedIds.has(br.id)) continue;
          const sc = 5000 + br.hp;
          if (sc > bestScore) {
            bestScore = sc;
            tx = br.x;
            td = br.d;
            chosenId = br.id;
            found = true;
          }
        }
      }
      if (!found) {
        for (let i = 0; i < this.near.length; i++) {
          const z = this.near[i];
          if (!z.alive || z.d < this.squad.d + 3 || z.d > this.squad.d + 46 || usedIds.has(z.id)) continue;
          const sc = z.hp + (z.kind === 'giant' ? 800 : z.kind === 'brute' ? 120 : 10) + Math.max(0, 35 - (z.d - this.squad.d));
          if (sc > bestScore) {
            bestScore = sc;
            tx = z.x;
            td = z.d;
            chosenId = z.id;
            found = true;
          }
        }
      }
      if (!found) break;
      usedIds.add(chosenId);
      fired = true;

      this.events.push({ type: 'orbitalLaser', x: tx, d: td, r: radius, level });
      const rr = radius * radius;
      for (let i = 0; i < this.near.length; i++) {
        const z = this.near[i];
        if (!z.alive) continue;
        const dx = z.x - tx;
        const dd = z.d - td;
        if (dx * dx + dd * dd <= (radius + z.r) * (radius + z.r)) {
          this.damageZombie(z, baseDmg);
        }
      }
      for (let i = 0; i < this.bosses.length; i++) {
        const b = this.bosses[i];
        if (!b.alive || !b.active) continue;
        const dx = b.x - tx;
        const dd = b.d - td;
        if (dx * dx + dd * dd <= (radius + b.r) * (radius + b.r)) {
          this.damageBoss(b, baseDmg * 1.45);
        }
      }
      for (let i = 0; i < this.barrels.length; i++) {
        const br = this.barrels[i];
        if (!br.alive || !br.tank) continue;
        const dx = br.x - tx;
        const dd = br.d - td;
        if (dx * dx + dd * dd <= rr + br.r * br.r) {
          br.hp -= baseDmg * 1.2;
          br.bump = 1;
          if (br.hp <= 0) this.breakBarrel(br);
        }
      }
    }
    return fired;
  }

  private updateAllyMechs(dt: number) {
    if (this.allyMechs.length === 0 || this.squad.count <= 0) return;
    const sq = this.squad;
    const lvl = Math.max(1, this.perkLevel('mech_drop'));
    const dmgScale = lvl === 1 ? 1 : lvl === 2 ? 1.35 : 1.65;
    const missileInterval = lvl >= 3 ? 1.6 : 2.5;

    for (let i = 0; i < this.allyMechs.length; i++) {
      const m = this.allyMechs[i];
      m.phase += dt * 7.5;
      m.recoil = Math.max(0, m.recoil - dt * 6);
      const side = m.slot % 2 === 0 ? -1 : 1;
      const row = Math.floor(m.slot / 2);
      const tx = Math.max(-TRACK_HALF + 1.0, Math.min(TRACK_HALF - 1.0, sq.x + side * (Math.max(1.45, this.halfWidth + 0.8) + row * 0.45)));
      const td = sq.d + 1.05 + row * 1.8;

      if (m.dropT < 1) {
        m.dropT = Math.min(1, m.dropT + dt * 2.2);
        m.x += (tx - m.x) * Math.min(1, dt * 8);
        m.d += (td - m.d) * Math.min(1, dt * 8);
        if (m.dropT >= 1) {
          // 落地重装震荡波，震碎周围丧尸
          this.events.push({ type: 'mechLand', mech: m });
          const slamDmg = (180 + this.squad.tier * 80) * this.damage;
          for (let zi = 0; zi < this.near.length; zi++) {
            const z = this.near[zi];
            if (!z.alive) continue;
            const dx = z.x - m.x;
            const dd = z.d - m.d;
            if (dx * dx + dd * dd < 25) this.damageZombie(z, slamDmg);
          }
        }
        continue;
      }

      m.x += (tx - m.x) * Math.min(1, dt * 7.5);
      m.d += (td - m.d) * Math.min(1, dt * 9);

      // 自动锁敌（优先 Boss / 敌方坦克 / 近处丧尸）
      let aimX = m.x;
      let aimD = m.d + 20;
      let targetFound = false;
      let bestDist = Infinity;
      for (let bi = 0; bi < this.bosses.length; bi++) {
        const b = this.bosses[bi];
        if (!b.alive || !b.active) continue;
        const dd = b.d - m.d;
        if (dd > 1 && dd < 46 && dd < bestDist) {
          bestDist = dd;
          aimX = b.x;
          aimD = b.d;
          targetFound = true;
        }
      }
      if (!targetFound) {
        for (let zi = 0; zi < this.near.length; zi++) {
          const z = this.near[zi];
          if (!z.alive || z.d <= m.d + 1.5 || z.d > m.d + 44) continue;
          const dist = Math.hypot(z.x - m.x, z.d - m.d);
          if (dist < bestDist) {
            bestDist = dist;
            aimX = z.x;
            aimD = z.d;
            targetFound = true;
          }
        }
      }

      const desiredYaw = targetFound ? Math.max(-0.85, Math.min(0.85, Math.atan2(aimX - m.x, Math.max(2, aimD - m.d)))) : 0;
      m.yaw += (desiredYaw - m.yaw) * Math.min(1, dt * 10);

      if (!targetFound) continue;
      // 双臂旋转机炮高速扫射（真实发射穿透高威子弹）
      m.fireTimer -= dt;
      if (m.fireTimer <= 0) {
        m.fireTimer = 0.14;
        m.recoil = 1;
        const speed = BULLET_SPEED * 1.2;
        const dx = aimX - m.x;
        const dd = Math.max(2, aimD - m.d);
        const len = Math.hypot(dx, dd);
        const vx = (dx / len) * speed + randRange(this.rng, -1.2, 1.2);
        const vd = (dd / len) * speed;
        const dmg = (14 + this.squad.tier * 7) * this.damage * dmgScale;
        for (const arm of [-0.36, 0.36]) {
          const nb = this.bulletPool.pop() ?? ({} as Bullet);
          nb.x = m.x + arm;
          nb.d = m.d + 0.5;
          nb.vx = vx;
          nb.vd = vd;
          nb.dmg = dmg;
          nb.gateHits = 0;
          nb.travel = 0;
          nb.pierce = Math.max(1, this.ammo.pierce);
          nb.lastHit = -1;
          this.bullets.push(nb);
        }
      }

      // 肩部追踪导弹齐射
      m.missileTimer -= dt;
      if (m.missileTimer <= 0) {
        m.missileTimer = missileInterval;
        const mdmg = (95 + this.squad.tier * 55) * this.damage * dmgScale;
        this.rockets.push({
          x0: m.x,
          d0: m.d,
          x: aimX,
          d: aimD,
          t: 0,
          T: 0.42,
          damage: mdmg,
        });
      }
    }
  }

  private mechMissileBlast(x: number, d: number, damage: number) {
    this.events.push({ type: 'carnageBlast', x, d, r: 2.8, nova: false });
    for (let i = 0; i < this.near.length; i++) {
      const z = this.near[i];
      if (!z.alive) continue;
      const dx = z.x - x;
      const dd = z.d - d;
      if (dx * dx + dd * dd <= (2.8 + z.r) * (2.8 + z.r)) this.damageZombie(z, damage);
    }
    for (let i = 0; i < this.bosses.length; i++) {
      const b = this.bosses[i];
      if (!b.alive || !b.active) continue;
      const dx = b.x - x;
      const dd = b.d - d;
      if (dx * dx + dd * dd <= (2.8 + b.r) * (2.8 + b.r)) this.damageBoss(b, damage * 1.3);
    }
  }

  private triggerChainLightning(sx: number, sd: number, sy: number, baseDmg: number, skipId: number) {
    const lvl = this.perkLevel('chain_lightning');
    if (lvl <= 0) return;
    const chance = lvl === 1 ? 0.38 : lvl === 2 ? 0.58 : 0.78;
    if (this.rng() > chance) return;
    const bounces = lvl === 1 ? 3 : lvl === 2 ? 5 : 7;
    const arcDmg = baseDmg * (lvl === 1 ? 0.85 : lvl === 2 ? 1.25 : 1.55);
    const hitIds = new Set<number>([skipId]);
    const pts: { x: number; d: number; y: number }[] = [{ x: sx, d: sd, y: sy }];
    let cx = sx;
    let cd = sd;

    for (let b = 0; b < bounces; b++) {
      let bestZ: Zombie | null = null;
      let bestD2 = 34; // 约 5.8m 跳跃半径
      const [b0, b1] = this.zSpatial.range(cd - 6, cd + 6);
      const bins = this.zSpatial.bins;
      for (let bi = b0; bi <= b1; bi++) {
        const bin = bins[bi];
        for (let k = 0; k < bin.length; k++) {
          const z = bin[k];
          if (!z.alive || hitIds.has(z.id)) continue;
          const dx = z.x - cx;
          const dd = z.d - cd;
          const d2 = dx * dx + dd * dd;
          if (d2 < bestD2) {
            bestD2 = d2;
            bestZ = z;
          }
        }
      }
      if (!bestZ) break;
      hitIds.add(bestZ.id);
      this.damageZombie(bestZ, arcDmg);
      pts.push({ x: bestZ.x, d: bestZ.d, y: bestZ.kind === 'giant' ? 1.8 : 0.85 });
      cx = bestZ.x;
      cd = bestZ.d;
    }
    if (pts.length >= 2) {
      this.events.push({ type: 'lightningArc', points: pts });
    }
  }

  private triggerClusterBlast(x: number, d: number, baseDmg: number, skipId: number) {
    const lvl = this.perkLevel('cluster_shells');
    if (lvl <= 0) return;
    const chance = lvl === 1 ? 0.3 : lvl === 2 ? 0.48 : 0.68;
    if (this.rng() > chance) return;
    const radius = lvl === 1 ? 2.1 : lvl === 2 ? 2.7 : 3.2;
    const blastDmg = baseDmg * (lvl === 1 ? 0.9 : lvl === 2 ? 1.25 : 1.55);
    const [b0, b1] = this.zSpatial.range(d - radius - 1, d + radius + 1);
    const bins = this.zSpatial.bins;
    for (let bi = b0; bi <= b1; bi++) {
      const bin = bins[bi];
      for (let k = 0; k < bin.length; k++) {
        const z = bin[k];
        if (!z.alive || z.id === skipId) continue;
        const dx = z.x - x;
        const dd = z.d - d;
        if (dx * dx + dd * dd <= (radius + z.r) * (radius + z.r)) {
          this.damageZombie(z, blastDmg);
        }
      }
    }
    this.events.push({ type: 'splash', x, d, r: radius });
  }

  // ---------- 广告奇袭三路模式 ----------

  private blitzEnemyKind(p: number): ZombieKind {
    const r = this.rng();
    const s2 = this.blitz.stage === 2;
    if (p > 0.45 && r < (s2 ? 0.1 : 0.06)) return 'brute';
    if (p > 0.3 && r < (s2 ? 0.2 : 0.13)) return 'exploder';
    if (p > 0.15 && r < (s2 ? 0.48 : 0.36)) return 'runner';
    return 'walker';
  }

  private runBlitz(dt: number) {
    const def = this.defense!;
    const p = Math.min(1, this.time / def.duration);
    const s2 = this.blitz.stage === 2;
    const zombieCap = 210;
    let alive = 0;
    for (let i = 0; i < this.zombies.length; i++) if (this.zombies[i].alive) alive++;

    let added = false;
    while (this.spawnIdx < def.spawns.length && def.spawns[this.spawnIdx].t <= this.time) {
      const sp = def.spawns[this.spawnIdx++];
      if (sp.banner) this.events.push({ type: 'banner', text: sp.banner.text, tone: sp.banner.tone });
      if (sp.zombie) {
        const z = this.makeZombie({ ...sp.zombie, d: def.spawnD - 8 + sp.zombie.d });
        z.active = true;
        this.zombies.push(z);
        alive++;
        added = true;
      }
      if (sp.wave) {
        const n = Math.min(sp.wave, Math.max(0, zombieCap - alive));
        const baseHp = s2 ? 7.5 + p * 52 : 6.5 + p * 32;
        const cols = 6;
        for (let i = 0; i < n; i++) {
          const row = Math.floor(i / cols);
          const col = i % cols;
          const kind = this.blitzEnemyKind(p);
          const z = this.makeZombie({
            kind,
            x: -1.6 + col * 0.64 + (row % 2 ? 0.16 : -0.12),
            d: def.spawnD - 7 + row * 0.85,
            hp: baseHp * ZOMBIES[kind].hp,
          });
          z.active = true;
          this.zombies.push(z);
          alive++;
        }
        if (n > 0) added = true;
      }
      if (sp.boss) {
        const b = this.makeBoss(sp.boss, def.spawnD - 18);
        b.final = sp.t >= def.duration - 0.01;
        b.pair = b.final || Math.abs(sp.boss.x) > 0.4;
        b.active = true;
        this.bosses.push(b);
        this.events.push({ type: 'bossStart', bosses: [b] });
        added = true;
      }
      if (sp.truck) {
        this.spawnLootTruck(sp.truck, def.spawnD - 6);
        added = true;
      }
    }

    // 中路高密度持续敌军洪流
    let bossAlive = false;
    for (let i = 0; i < this.bosses.length; i++) if (this.bosses[i].alive) bossAlive = true;
    const tanksRemain = this.blitz.tanksDestroyed < this.blitz.totalTanks;
    if (this.time > 0.8 && (this.time < def.duration || bossAlive || tanksRemain) && alive < zombieCap) {
      const rate = (s2 ? 6.2 + p * 7.4 : 4.8 + p * 5.8) * (this.time > def.duration ? 0.55 : 1);
      this.streamAcc += rate * dt;
      const baseHp = (s2 ? 7.5 + p * 48 : 6.5 + p * 28) * (bossAlive ? 0.72 : 1);
      while (this.streamAcc >= 1 && alive < zombieCap) {
        this.streamAcc -= 1;
        const kind = this.blitzEnemyKind(p);
        const z = this.makeZombie({
          kind,
          x: randRange(this.rng, -1.72, 1.72),
          d: def.spawnD - 5 + randRange(this.rng, 0, 2.4),
          hp: baseHp * ZOMBIES[kind].hp,
        });
        z.active = true;
        this.zombies.push(z);
        alive++;
        added = true;
      }
    }
    if (added) this.version++;

    if (this.time > this.blitz.lastKill + 2.5) this.blitz.combo = 0;

    // 无人机追踪火箭飞行与爆破
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const rocket = this.rockets[i];
      rocket.t += dt;
      if (rocket.t >= rocket.T) {
        this.blitzRocketBlast(rocket.x, rocket.d, 3.0, rocket.damage);
        this.rockets[i] = this.rockets[this.rockets.length - 1];
        this.rockets.pop();
      }
    }
    if (this.blitz.drones > 0 && this.time >= this.droneAt && this.squad.count > 0) {
      this.droneAt = this.time + Math.max(0.45, 1.35 - this.blitz.drones * 0.14);
      const frontTank = this.frontBlitzTank();
      let boss: Boss | null = null;
      for (let i = 0; i < this.bosses.length; i++) {
        if (this.bosses[i].alive && this.bosses[i].active) {
          boss = this.bosses[i];
          break;
        }
      }
      const targets = this.carnageTargets;
      targets.length = 0;
      for (let i = 0; i < this.zombies.length; i++) {
        const z = this.zombies[i];
        if (z.alive && z.d > 2 && z.d < 46) targets.push(z);
      }
      if ((frontTank && frontTank.d < 36) || boss || targets.length > 0) {
        const dmg = (115 + this.squad.tier * 55) * this.damage;
        for (let i = 0; i < this.blitz.drones; i++) {
          let tx = 0;
          let td = 24;
          if (boss && (i % 2 === 0 || !frontTank)) {
            tx = boss.x;
            td = boss.d;
          } else if (frontTank && frontTank.d < 36 && i % 2 === 1) {
            tx = frontTank.x;
            td = frontTank.d;
          } else if (targets.length > 0) {
            const pick = targets[Math.floor(this.rng() * targets.length)];
            tx = pick.x;
            td = pick.d;
          } else if (frontTank) {
            tx = frontTank.x;
            td = frontTank.d;
          } else if (boss) {
            tx = boss.x;
            td = boss.d;
          }
          const side = i % 2 === 0 ? -1 : 1;
          const ring = Math.floor(i / 2) + 1;
          this.rockets.push({
            x0: this.squad.x + side * (0.9 + ring * 0.45),
            d0: this.squad.d + 0.5,
            x: tx,
            d: td,
            t: 0,
            T: 0.45 + i * 0.04,
            damage: dmg,
          });
        }
      }
    }

    // 友军收编坦克进场、伴随走位与重炮协同轰炸
    this.updateAllyTanks(dt);
    this.moveBlitzQueue(dt);
  }

  /** 将刚击毁的敌方坦克收编为友军重坦，立即掉头开上前线与小队并肩作战！ */
  private captureTank(br: Barrel) {
    if (!br.tank) return;
    const tier = br.tank.tier;
    const slot = this.allyTanks.length;
    const tank: AllyTank = {
      id: this.nextId++,
      tier,
      name: br.tank.name,
      twin: !!br.tank.twin,
      r: br.r * 0.72,
      x: br.x,
      d: br.d,
      phase: 'joining',
      slot,
      hullYaw: Math.PI,
      turretYaw: 0,
      fireTimer: 0.4,
      fireInterval: tier >= 4 ? 0.72 : tier === 3 ? 0.82 : tier === 2 ? 0.95 : 1.1,
      recoil: 0,
      captureGlow: 1,
    };
    this.allyTanks.push(tank);
    this.blitz.allyTanks = this.allyTanks.length;
    this.version++;
    this.events.push({ type: 'tankCapture', tank, fromX: br.x, fromD: br.d });
  }

  private updateAllyTanks(dt: number) {
    const sq = this.squad;
    // 更新飞行中的友军重炮弹
    for (let i = this.allyShells.length - 1; i >= 0; i--) {
      const sh = this.allyShells[i];
      sh.t += dt;
      if (sh.t >= sh.T) {
        this.allyShellBlast(sh);
        this.allyShells[i] = this.allyShells[this.allyShells.length - 1];
        this.allyShells.pop();
      }
    }
    if (this.allyTanks.length === 0 || sq.count <= 0) return;

    const frontTank = this.frontBlitzTank();
    for (let i = 0; i < this.allyTanks.length; i++) {
      const tank = this.allyTanks[i];
      tank.recoil = Math.max(0, tank.recoil - dt * 3.8);
      tank.captureGlow = Math.max(0, tank.captureGlow - dt * 1.4);

      // 计算伴随编队站位（右翼、左翼、前右翼、前左翼）
      const side = tank.slot % 2 === 0 ? 1 : -1;
      const row = Math.floor(tank.slot / 2);
      const flankOff = Math.max(1.85, this.halfWidth + 0.95) + row * 0.35;
      const rawTx = sq.x + side * flankOff;
      const tx = Math.max(-TRACK_HALF + 1.15, Math.min(TRACK_HALF - 1.15, rawTx));
      const td = sq.d + 0.8 + row * 2.55;

      if (tank.phase === 'joining') {
        const dx = tx - tank.x;
        const dd = td - tank.d;
        const dist = Math.hypot(dx, dd);
        const speed = 15.5;
        if (dist <= 0.85) {
          tank.x = tx;
          tank.d = td;
          tank.phase = 'fighting';
        } else {
          const step = Math.min(dist, speed * dt);
          tank.x += (dx / dist) * step;
          tank.d += (dd / dist) * step;
        }
        // 收编掉头动画：车体从朝向玩家 (PI) 平滑转向朝向前方敌阵 (0)
        const targetYaw = dist > 1.2 ? Math.atan2(dx, Math.max(1, -dd)) * 0.3 : 0;
        tank.hullYaw += (targetYaw - tank.hullYaw) * Math.min(1, dt * 6.5);
      } else {
        const dx = tx - tank.x;
        const dd = td - tank.d;
        tank.x += dx * Math.min(1, dt * 5.2);
        tank.d += dd * Math.min(1, dt * 6.5);
        const steerYaw = Math.max(-0.32, Math.min(0.32, dx * 0.14));
        tank.hullYaw += (steerYaw - tank.hullYaw) * Math.min(1, dt * 8);
      }

      // 寻找最佳轰炸目标（优先前排活跃 Boss，其次密集近敌，最后前方敌方坦克）
      let aimX = 0;
      let aimD = 22;
      let hasTarget = false;
      let bestBoss: Boss | null = null;
      for (let bi = 0; bi < this.bosses.length; bi++) {
        const b = this.bosses[bi];
        if (b.alive && b.active && b.d > tank.d + 2 && (!bestBoss || b.d < bestBoss.d)) bestBoss = b;
      }
      let bestZombie: Zombie | null = null;
      let bestZScore = -1;
      for (let zi = 0; zi < this.near.length; zi++) {
        const z = this.near[zi];
        if (!z.alive || z.d <= tank.d + 2.5 || z.d > 46) continue;
        const sc = (z.kind === 'giant' ? 60 : z.kind === 'brute' ? 24 : 10) + Math.max(0, 32 - z.d);
        if (sc > bestZScore) {
          bestZScore = sc;
          bestZombie = z;
        }
      }

      if (bestBoss && (i % 2 === 0 || !bestZombie || bestBoss.d < 26)) {
        aimX = bestBoss.x;
        aimD = bestBoss.d;
        hasTarget = true;
      } else if (bestZombie) {
        aimX = bestZombie.x;
        aimD = bestZombie.d;
        hasTarget = true;
      } else if (frontTank && frontTank.d < 36) {
        aimX = frontTank.x;
        aimD = frontTank.d;
        hasTarget = true;
      } else if (bestBoss) {
        aimX = bestBoss.x;
        aimD = bestBoss.d;
        hasTarget = true;
      }

      const worldAim = hasTarget ? Math.atan2(aimX - tank.x, Math.max(2, aimD - tank.d)) : 0;
      const desiredTurret = Math.max(-1.05, Math.min(1.05, worldAim - tank.hullYaw));
      tank.turretYaw += (desiredTurret - tank.turretYaw) * Math.min(1, dt * 8);

      // 进场接近前线或已就位后，持续向敌军倾泻重炮！
      if (hasTarget && (tank.phase === 'fighting' || tank.d < 15)) {
        tank.fireTimer -= dt;
        if (tank.fireTimer <= 0) {
          tank.fireTimer = tank.fireInterval;
          this.fireAllyTank(tank, aimX, aimD);
        }
      }
    }
  }

  private fireAllyTank(tank: AllyTank, aimX: number, aimD: number) {
    tank.recoil = 1;
    const shots = tank.twin ? 2 : 1;
    const dmg = (175 + tank.tier * 130 + this.squad.tier * 55) * this.damage;
    const radius = 3.1 + tank.tier * 0.35;
    for (let s = 0; s < shots; s++) {
      const jitterX = shots > 1 ? (s === 0 ? -0.65 : 0.65) : 0;
      const tx = Math.max(-TRACK_HALF + 0.6, Math.min(TRACK_HALF - 0.6, aimX + jitterX));
      const td = Math.max(tank.d + 3, aimD + (shots > 1 ? s * 0.8 : 0));
      const dist = Math.hypot(tx - tank.x, td - tank.d);
      const shell: AllyShell = {
        id: this.nextId++,
        x0: tank.x + (shots > 1 ? (s === 0 ? -0.25 : 0.25) : 0),
        d0: tank.d + tank.r * 1.1,
        x: tx,
        d: td,
        t: 0,
        T: Math.max(0.24, Math.min(0.56, dist / 52)),
        damage: dmg,
        radius,
        tier: tank.tier,
      };
      this.allyShells.push(shell);
      this.events.push({ type: 'allyTankFire', tank, shell });
    }
  }

  private allyShellBlast(sh: AllyShell) {
    this.events.push({ type: 'allyShellHit', x: sh.x, d: sh.d, r: sh.radius, tier: sh.tier });
    const r = sh.radius;
    for (let i = 0; i < this.near.length; i++) {
      const z = this.near[i];
      if (!z.alive) continue;
      const dx = z.x - sh.x;
      const dd = z.d - sh.d;
      const lim = r + z.r;
      if (dx * dx + dd * dd < lim * lim) this.damageZombie(z, sh.damage);
    }
    for (let i = 0; i < this.bosses.length; i++) {
      const b = this.bosses[i];
      if (!b.alive || !b.active) continue;
      const dx = b.x - sh.x;
      const dd = b.d - sh.d;
      const lim = r + b.r;
      if (dx * dx + dd * dd < lim * lim) this.damageBoss(b, sh.damage * 1.55);
    }
    for (let i = 0; i < this.barrels.length; i++) {
      const br = this.barrels[i];
      if (!br.alive || !br.tank) continue;
      const dx = br.x - sh.x;
      const dd = br.d - sh.d;
      const lim = r + br.r;
      if (dx * dx + dd * dd < lim * lim) {
        const tdmg = sh.damage * 1.25;
        br.hp -= tdmg;
        br.bump = 1;
        this.events.push({ type: 'hit', x: br.x, d: br.d, y: 1.3, target: 'barrel', color: 0x38bdf8, dmg: tdmg, id: br.id });
        if (br.hp <= 0) this.breakBarrel(br);
      }
    }
  }

  private frontBlitzTank(): Barrel | null {
    let front: Barrel | null = null;
    for (let i = 0; i < this.barrels.length; i++) {
      const b = this.barrels[i];
      if (!b.alive || !b.tank) continue;
      if (!front || b.d < front.d) front = b;
    }
    return front;
  }

  private moveBlitzQueue(dt: number) {
    const def = this.defense!;
    // 左路：固定 +1 数字门高速传送带涌来（不可射击增长，吃得飞快！）
    const leftStep = 7.8 * dt;
    for (let i = 0; i < this.gates.length; i++) {
      const g = this.gates[i];
      if (!g.consumed && g.blitzLane === 'left') g.d -= leftStep;
    }

    // 中路：爆裂红油桶随密集敌潮快速推进
    const midStep = 3.8 * dt;
    for (let i = 0; i < this.barrels.length; i++) {
      const b = this.barrels[i];
      if (!b.alive || b.blitzLane !== 'mid') continue;
      b.d -= midStep;
      if (b.d < -4) b.alive = false;
    }

    // 右路：重装坦克推进至 stopD 驻停开炮，身后奖励紧紧排成一列，击毁坦克瞬间收编入队并全线放行奖励！
    if (this.time > 0.6) this.queueV += (def.conveyor - this.queueV) * Math.min(1, dt * 6);
    const frontTank = this.frontBlitzTank();
    const surgeStep = 9.4 * dt;
    const queueStep = this.queueV * dt;

    if (frontTank) {
      if (!frontTank.priced && frontTank.d < DEFENSE_VIEW_D) frontTank.priced = true;
      const brake = Math.max(3, (frontTank.d - def.stopD) * 3);
      frontTank.d = Math.max(def.stopD, frontTank.d - Math.min(this.queueV, brake) * dt);
      if (!frontTank.armed && frontTank.d <= def.stopD + 0.05) {
        frontTank.armed = true;
        frontTank.bump = 1;
        this.events.push({ type: 'blocked', barrel: frontTank });
      }
      if (frontTank.armed && frontTank.tank) {
        frontTank.fireTimer -= dt;
        if (frontTank.fireTimer <= 0) {
          frontTank.fireTimer = frontTank.tank.fireInterval;
          this.fireTank(frontTank);
        }
      }
    }

    const queue = this.queueScratch;
    queue.length = 0;
    let poolIdx = 0;
    for (let i = 0; i < this.gates.length; i++) {
      const g = this.gates[i];
      if (g.consumed || g.blitzLane !== 'right') continue;
      if (!frontTank || g.d < frontTank.d) {
        g.d -= surgeStep;
      } else {
        const entry = this.queuePool[poolIdx] ?? (this.queuePool[poolIdx] = { d: 0, r: 0, item: g });
        entry.d = g.d;
        entry.r = 0.6;
        entry.item = g;
        queue.push(entry);
        poolIdx++;
      }
    }
    for (let i = 0; i < this.barrels.length; i++) {
      const b = this.barrels[i];
      if (!b.alive || b.blitzLane !== 'right' || b === frontTank) continue;
      if (!frontTank || b.d < frontTank.d) {
        b.d -= surgeStep;
        if (b.d < -2.5) b.alive = false;
      } else {
        const entry = this.queuePool[poolIdx] ?? (this.queuePool[poolIdx] = { d: 0, r: 0, item: b });
        entry.d = b.d;
        entry.r = b.r;
        entry.item = b;
        queue.push(entry);
        poolIdx++;
      }
    }
    if (frontTank && queue.length > 0) {
      queue.sort((a, b) => a.d - b.d);
      let floor = frontTank.d + frontTank.r + 2.1;
      for (let i = 0; i < queue.length; i++) {
        const q = queue[i];
        const d = Math.max(floor + q.r, q.d - queueStep);
        q.item.d = d;
        floor = d + q.r + 2.1;
      }
    }
  }

  private fireTank(tank: Barrel) {
    const sq = this.squad;
    if (sq.count <= 0) return;
    tank.recoil = 1;
    tank.bump = 0.85;
    const shots = tank.tank?.twin ? 2 : 1;
    for (let i = 0; i < shots; i++) {
      const spread = i === 0 ? randRange(this.rng, -0.8, 0.8) : sq.x < 0 ? 3.8 : -3.8;
      const tx = Math.max(this.lo + 1.1, Math.min(this.hi - 1.1, sq.x + spread));
      const td = sq.d + randRange(this.rng, Math.max(-1.2, this.back * 0.5), this.front * 0.5 + 0.4);
      const proj: Projectile = {
        id: this.nextId++,
        x0: tank.x,
        d0: tank.d - tank.r,
        tx,
        td,
        t: 0,
        T: 1.95 * (this.opts.warnMult ?? 1),
      };
      this.projectiles.push(proj);
      this.events.push({ type: 'tankFire', barrel: tank, proj });
    }
  }

  private blitzRocketBlast(x: number, d: number, r: number, damage: number) {
    this.events.push({ type: 'carnageBlast', x, d, r, nova: false });
    for (let i = 0; i < this.near.length; i++) {
      const z = this.near[i];
      if (!z.alive) continue;
      const dx = z.x - x;
      const dd = z.d - d;
      const lim = r + z.r;
      if (dx * dx + dd * dd < lim * lim) this.damageZombie(z, damage);
    }
    for (let i = 0; i < this.bosses.length; i++) {
      const b = this.bosses[i];
      if (!b.alive || !b.active) continue;
      const dx = b.x - x;
      const dd = b.d - d;
      const lim = r + b.r;
      if (dx * dx + dd * dd < lim * lim) this.damageBoss(b, damage * 1.45);
    }
    for (let i = 0; i < this.barrels.length; i++) {
      const br = this.barrels[i];
      if (!br.alive || !br.tank) continue;
      const dx = br.x - x;
      const dd = br.d - d;
      const lim = r + br.r;
      if (dx * dx + dd * dd < lim * lim) {
        br.hp -= damage * 1.65;
        br.bump = 1;
        this.events.push({ type: 'hit', x: br.x, d: br.d, y: 1.2, target: 'barrel', color: 0x38bdf8, dmg: damage * 1.65, id: br.id });
        if (br.hp <= 0) this.breakBarrel(br);
      }
    }
  }

  /** 广告奇袭中路红油桶爆破：高伤清敌且绝不误伤己方士兵 */
  private blitzBombExplode(x: number, d: number, radius: number) {
    this.events.push({ type: 'explode', x, d, r: radius, source: 'strike', killed: 0 });
    const rr = radius * radius;
    for (let i = 0; i < this.near.length; i++) {
      const z = this.near[i];
      if (!z.alive) continue;
      const dx = z.x - x;
      const dd = z.d - d;
      if (dx * dx + dd * dd > rr + z.r * z.r) continue;
      if (z.kind === 'giant') this.damageZombie(z, z.maxHp * 0.38);
      else if (z.kind === 'brute') this.damageZombie(z, z.maxHp * 0.85);
      else this.killZombie(z, true);
    }
    for (let i = 0; i < this.bosses.length; i++) {
      const b = this.bosses[i];
      if (!b.alive || !b.active) continue;
      const dx = b.x - x;
      const dd = b.d - d;
      if (dx * dx + dd * dd < (radius + b.r) * (radius + b.r)) this.damageBoss(b, b.maxHp * 0.08);
    }
  }

  // ---------- 防线 ----------

  /** 固定关卡预算：升级、临场拿门或损兵都不会反向改变敌人血量。 */
  private refDps(at?: number): number {
    const def = this.defense!;
    const L = this.spec.level;
    const p = at ?? Math.min(1, this.time / def.duration);
    return expectedDefenseDps(L, p);
  }

  private runDefense(dt: number) {
    const def = this.defense!;
    const L = this.spec.level;
    const p = Math.min(1, this.time / def.duration);
    const ref = this.refDps();
    const spawns = def.spawns;
    const ex = -def.gateSide * (TRACK_HALF / 2);
    let added = false;

    while (this.spawnIdx < spawns.length && spawns[this.spawnIdx].t <= this.time) {
      const sp = spawns[this.spawnIdx++];
      const d = def.spawnD;
      if (sp.zombie) {
        const z = this.makeZombie({ ...sp.zombie, d: d + sp.zombie.d });
        z.active = true;
        if (z.kind === 'giant') z.hp = z.maxHp = Math.round(ref * DEFENSE_TUNING.giantSeconds(L));
        this.zombies.push(z);
      }
      if (sp.wave) {
        // 一大波：人数固定，血量和持续尸潮一样按火力算
        const each = this.streamHp(ref, p);
        const share = (DEFENSE_TUNING.streamRate(L, p) * DEFENSE_TUNING.waveSeconds(L, p)) / sp.wave;
        const hp = Math.max(DEFENSE_TUNING.minHits(L), each * Math.min(1, share));
        const cols = 6;
        const w0 = ex - TRACK_HALF / 2 + 0.6;
        const w1 = ex + TRACK_HALF / 2 - 0.6;
        for (let i = 0; i < sp.wave; i++) {
          const row = Math.floor(i / cols);
          const col = i % cols;
          const kind = this.streamKind(p);
          const z = this.makeZombie({
            kind,
            x: w0 + (col + 0.5 + (row % 2) * 0.3) * ((w1 - w0) / cols),
            d: d + row * 0.9,
            hp: hp * ZOMBIES[kind].hp,
          });
          z.active = true;
          this.zombies.push(z);
        }
      }
      if (sp.boss) {
        // 落在刷新点前面一截，从天而降时镜头看得见（不被顶上的血条挡住）
        const b = this.makeBoss(sp.boss, d - 22);
        const final = sp.t >= def.duration - 0.01;
        let bossSiblings = 0;
        for (let i = 0; i < spawns.length; i++) {
          if (spawns[i].boss && Math.abs(spawns[i].t - sp.t) <= 2) bossSiblings++;
        }
        const pair = bossSiblings > 1;
        b.final = final;
        b.pair = pair;
        const pairFactor = pair ? Math.max(0.3, 0.6 - 0.06 * Math.max(0, L - 5)) : 1;
        const seconds = final ? DEFENSE_TUNING.bossSeconds(L) * pairFactor : DEFENSE_TUNING.midSeconds(L);
        // 防线里巨尸王会冲到脸上，尸巢母体站得远，血量按种类修正一下
        const kindHp = b.kind === 'brute' ? 0.75 : b.kind === 'hive' ? 1.35 : 1;
        b.maxHp = b.hp = Math.max(300 * Math.min(L, 30), Math.round(ref * seconds * kindHp));
        b.active = true;
        this.bosses.push(b);
        this.events.push({ type: 'bossStart', bosses: [b] });
      }
      if (sp.truck) {
        this.spawnLootTruck(sp.truck, d);
      }
      if (sp.banner) this.events.push({ type: 'banner', text: sp.banner.text, tone: sp.banner.tone });
      added = true;
    }

    // 尸潮道：源源不断。每秒刷出的总血量 = 压力 × 参考火力，Boss 在场时减弱一些
    let bossAlive = false;
    let finalBossAlive = false;
    for (let i = 0; i < this.bosses.length; i++) {
      if (this.bosses[i].alive) {
        bossAlive = true;
        if (this.bosses[i].final) finalBossAlive = true;
      }
    }
    if (this.time > DEFENSE_TUNING.streamDelay && !(this.time > def.duration && !bossAlive)) {
      const rate = DEFENSE_TUNING.streamRate(L, p);
      this.streamAcc += rate * dt;
      const hp = this.streamHp(ref, p) * (finalBossAlive ? 0.35 : bossAlive ? 0.55 : 1);
      while (this.streamAcc >= 1) {
        this.streamAcc -= 1;
        const kind = this.streamKind(p);
        const z = this.makeZombie({
          kind,
          x: ex + randRange(this.rng, -TRACK_HALF / 2 + 0.6, TRACK_HALF / 2 - 0.6),
          d: def.spawnD + randRange(this.rng, 0, 2),
          hp: hp * ZOMBIES[kind].hp,
        });
        z.active = true;
        this.zombies.push(z);
        added = true;
      }
    }
    if (added) this.version++;
    this.moveQueue(dt);
  }

  /** 尸潮里一只普通丧尸的血量 */
  private streamHp(ref: number, p: number): number {
    const L = this.spec.level;
    const flow = DEFENSE_TUNING.pressure(L, p) * ref;
    const perZombie = flow / DEFENSE_TUNING.streamRate(L, p);
    return Math.max(DEFENSE_TUNING.minHits(L), perZombie);
  }

  private streamKind(p: number): ZombieKind {
    const L = this.spec.level;
    const r = this.rng();
    if (L >= 4 && p > 0.3 && r < 0.05) return 'brute';
    if (L >= 3 && p > 0.25 && r < 0.11) return 'exploder';
    if (L >= 2 && p > 0.15 && r < 0.34) return 'runner';
    return 'walker';
  }

  /**
   * 门道队列：最前面那个没打掉的大障碍滑到 stopD 就卡住，它后面的东西跟着停。
   * 打掉以后队列从 0 猛加速，后面的门很快冲到桥头，下一个障碍减速“哐”地停住。
   */
  private moveQueue(dt: number) {
    const def = this.defense!;
    // 开局停一秒让玩家看清队列
    if (this.time > 1) this.queueV += (def.conveyor - this.queueV) * Math.min(1, dt * 6);
    const v = this.queueV * dt;
    let blocker: Barrel | null = null;
    for (let i = 0; i < this.barrels.length; i++) {
      const b = this.barrels[i];
      if (!b.alive || !b.block) continue;
      if (!blocker || b.d < blocker.d) blocker = b;
      // 血量在关卡里已经写好（一个比一个高很多），出现时看到的数字之后不会再跳
      if (!b.priced && b.d < DEFENSE_VIEW_D) b.priced = true;
    }
    if (blocker) {
      const brake = Math.max(3, (blocker.d - def.stopD) * 3);
      blocker.d = Math.max(def.stopD, blocker.d - Math.min(this.queueV, brake) * dt);
      if (!blocker.armed && blocker.d <= def.stopD + 0.01) {
        blocker.armed = true;
        blocker.bump = 1;
        this.events.push({ type: 'blocked', barrel: blocker });
      }
    }
    if (!blocker) {
      for (let i = 0; i < this.gates.length; i++) this.gates[i].d -= v;
      for (let i = 0; i < this.barrels.length; i++) {
        const b = this.barrels[i];
        if (b.alive && !b.truck) b.d -= v;
      }
      return;
    }
    // 障碍前面的东西照常往前；后面的继续滑，挤到障碍身后排成一串（像堵车），复用池对象零分配
    const queue = this.queueScratch;
    queue.length = 0;
    let poolIdx = 0;
    for (let i = 0; i < this.gates.length; i++) {
      const g = this.gates[i];
      if (g.d < blocker.d) g.d -= v;
      else {
        const entry = this.queuePool[poolIdx] ?? (this.queuePool[poolIdx] = { d: 0, r: 0, item: g });
        entry.d = g.d;
        entry.r = 0;
        entry.item = g;
        queue.push(entry);
        poolIdx++;
      }
    }
    for (let i = 0; i < this.barrels.length; i++) {
      const b = this.barrels[i];
      if (!b.alive || b === blocker || b.truck) continue;
      if (b.d < blocker.d) b.d -= v;
      else {
        const entry = this.queuePool[poolIdx] ?? (this.queuePool[poolIdx] = { d: 0, r: 0, item: b });
        entry.d = b.d;
        entry.r = b.r;
        entry.item = b;
        queue.push(entry);
        poolIdx++;
      }
    }
    queue.sort((a, b) => a.d - b.d);
    let floor = blocker.d + blocker.r + JAM_GAP;
    for (let i = 0; i < queue.length; i++) {
      const q = queue[i];
      const d = Math.max(floor + q.r, q.d - v);
      q.item.d = d;
      floor = d + q.r + JAM_GAP;
    }
  }

  private lose() {
    if (this.state === 'lost' || this.state === 'won') return;
    this.state = 'lost';
    this.rockets.length = 0;
    this.events.push({ type: 'lost' });
  }

  private startBoss() {
    this.state = 'boss';
    this.squad.moving = false;
    // Boss 使用生成时的固定血量，优秀站位和局外升级可以真正缩短战斗。
    for (const b of this.bosses) b.active = true;
    this.events.push({ type: 'bossStart', bosses: this.bosses });
    if (this.bosses.length === 0) this.win();
  }

  // ---------- 无尽 ----------

  private extend() {
    const e = this.endless!;
    const { added, until } = extendEndless(e.gen, e.until, e.until + 220);
    e.until = until;
    this.addContent(added);
  }

  private prune(dt: number) {
    this.pruneT += dt;
    if (this.pruneT < 2) return;
    this.pruneT = 0;
    const cut = this.squad.d - 40;
    const beforeTotal = this.gates.length + this.barrels.length + this.zombies.length + this.hazards.length + this.walls.length;
    const stationary = !!this.defense || this.spec.mode === 'carnage';

    // O(N) 原地压缩：保留最新死亡动画实体的同时零 splice 搬移
    let totalConsumedGates = 0;
    if (stationary) {
      for (let i = 0; i < this.gates.length; i++) if (this.gates[i].consumed && this.gates[i].d > cut) totalConsumedGates++;
    }
    let dropGates = Math.max(0, totalConsumedGates - 6);
    let gw = 0;
    for (let i = 0; i < this.gates.length; i++) {
      const g = this.gates[i];
      if (g.d <= cut) continue;
      if (stationary && g.consumed && dropGates > 0) {
        dropGates--;
        continue;
      }
      this.gates[gw++] = g;
    }
    this.gates.length = gw;

    let totalDeadBarrels = 0;
    if (stationary) {
      for (let i = 0; i < this.barrels.length; i++) if (!this.barrels[i].alive && this.barrels[i].d > cut) totalDeadBarrels++;
    }
    let dropBarrels = Math.max(0, totalDeadBarrels - 6);
    let bw = 0;
    for (let i = 0; i < this.barrels.length; i++) {
      const b = this.barrels[i];
      if (b.d <= cut) continue;
      if (stationary && !b.alive && dropBarrels > 0) {
        dropBarrels--;
        continue;
      }
      this.barrels[bw++] = b;
    }
    this.barrels.length = bw;

    if (this.defense) {
      let totalDeadZombies = 0;
      for (let i = 0; i < this.zombies.length; i++) if (!this.zombies[i].alive) totalDeadZombies++;
      let dropZombies = Math.max(0, totalDeadZombies - 24);
      let zw = 0;
      for (let i = 0; i < this.zombies.length; i++) {
        const z = this.zombies[i];
        if (!z.alive && dropZombies > 0) {
          dropZombies--;
          continue;
        }
        this.zombies[zw++] = z;
      }
      this.zombies.length = zw;
    } else {
      let zw = 0;
      for (let i = 0; i < this.zombies.length; i++) {
        const z = this.zombies[i];
        if (z.d <= cut - 20) continue;
        if (!z.alive && (this.spec.mode === 'carnage' || z.d <= cut)) continue;
        this.zombies[zw++] = z;
      }
      this.zombies.length = zw;
    }

    let hw = 0;
    for (let i = 0; i < this.hazards.length; i++) {
      if (this.hazards[i].d1 > cut) this.hazards[hw++] = this.hazards[i];
    }
    this.hazards.length = hw;

    let ww = 0;
    for (let i = 0; i < this.walls.length; i++) {
      if (this.walls[i].d1 > cut) this.walls[ww++] = this.walls[i];
    }
    this.walls.length = ww;

    const afterTotal = this.gates.length + this.barrels.length + this.zombies.length + this.hazards.length + this.walls.length;
    if (beforeTotal !== afterTotal) this.version++;
  }

  // ---------- 队伍 ----------

  /** 隔离墙段里只能待在一侧 */
  private updateBounds() {
    const sq = this.squad;
    const wall = this.wallAt(sq.d + this.back - 0.5, sq.d + this.front + 1);
    if (!wall) {
      sq.side = 0;
      this.lo = -TRACK_HALF;
      this.hi = TRACK_HALF;
      return;
    }
    if (sq.side === 0) sq.side = sq.x < -0.01 ? -1 : sq.x > 0.01 ? 1 : sq.targetX < 0 ? -1 : 1;
    this.lo = sq.side < 0 ? -TRACK_HALF : WALL_HALF;
    this.hi = sq.side < 0 ? -WALL_HALF : TRACK_HALF;
  }

  wallAt(d0: number, d1: number): Wall | null {
    for (let i = 0; i < this.walls.length; i++) {
      const w = this.walls[i];
      if (w.d0 <= d1 && w.d1 >= d0) return w;
    }
    return null;
  }

  private syncSoldiers(emitLoss = true) {
    const target = Math.min(this.squad.count, MAX_SOLDIERS_SIM);
    const form = computeFormation(target, this.spec.mode, !!this.defense, this.lo, this.hi, this.formScratch);
    while (this.soldiers.length < target) {
      const idx = this.soldiers.length;
      // 新兵直接出现在自己的位置上（原地冒出来），不从中间飞出去
      this.soldiers.push({
        ox: slotX(idx, form),
        oz: slotZ(idx, form),
        phase: this.rng() * Math.PI * 2,
        spawn: 0,
        luck: this.rng(),
        spike: 0,
        lastSpikeId: -1,
      });
    }
    let emitted = 0;
    while (this.soldiers.length > target) {
      const s = this.soldiers.pop()!;
      if (emitLoss && emitted++ < 30) this.events.push({ type: 'soldierDie', x: this.squad.x + s.ox, d: this.squad.d + s.oz });
    }
  }

  private layout(dt: number) {
    const n = this.soldiers.length;
    // 人数变化时阵型的整体缩放和后移慢慢跟上，不要一下子跳（零对象分配 + 预计算极坐标表）
    const f = computeFormation(n, this.spec.mode, !!this.defense, this.lo, this.hi, this.formScratch);
    const smooth = Math.min(1, 4 * dt);
    if (this.form.sx === 0) {
      this.form.sx = f.sx;
      this.form.sz = f.sz;
      this.form.shift = f.shift;
      this.form.gap = f.gap;
    } else {
      this.form.sx += (f.sx - this.form.sx) * smooth;
      this.form.sz += (f.sz - this.form.sz) * smooth;
      this.form.shift += (f.shift - this.form.shift) * smooth;
      this.form.gap += (f.gap - this.form.gap) * smooth;
    }
    const k = Math.min(1, 9 * dt);
    const maxStep = Math.max(0.02, 7 * dt);
    let front = 0;
    let back = 0;
    let half = 0;
    const walk = this.squad.moving ? 11 : 0;
    const cx = this.squad.x;
    const formationHalf = formationLaneCap(this.spec.mode, !!this.defense);
    const loLim = this.lo + 0.2 - cx;
    const hiLim = this.hi - 0.2 - cx;
    for (let i = 0; i < n; i++) {
      const s = this.soldiers[i];
      const tx = slotX(i, this.form);
      const tz = slotZ(i, this.form);
      // 补位的人走过去（限速），其余的人只做很小的调整
      const dx = tx - s.ox;
      const dz = tz - s.oz;
      const d2 = dx * dx + dz * dz;
      if (d2 > 1e-8) {
        const dist = Math.sqrt(d2);
        const step = Math.min(dist * k, maxStep);
        const inv = step / dist;
        s.ox += dx * inv;
        s.oz += dz * inv;
      }
      // 乘法门瞬间加人时，平滑中的阵型也不能暂时撑满桥面，否则整队无法横移躲 Boss。
      if (s.ox < -formationHalf) s.ox = -formationHalf;
      else if (s.ox > formationHalf) s.ox = formationHalf;
      // 不穿墙、不出桥
      if (s.ox < loLim) s.ox = loLim;
      else if (s.ox > hiLim) s.ox = hiLim;
      if (s.spawn < 1) s.spawn = Math.min(1, s.spawn + dt * 4);
      if (walk > 0) s.phase += dt * walk;
      if (s.oz > front) front = s.oz;
      if (s.oz < back) back = s.oz;
      const aox = Math.abs(s.ox);
      if (aox > half) half = aox;
    }
    this.front = front;
    this.back = back;
    this.halfWidth = Math.min(half + 0.25, (this.hi - this.lo) / 2);
  }

  private killSoldier(index: number, cause: LossCause) {
    const s = this.soldiers[index];
    if (!s) return;
    if (this.shield > 0) {
      this.shield--;
      this.blitz.shield = this.shield;
      const bx = this.squad.x + s.ox;
      const bd = this.squad.d + s.oz;
      this.events.push({ type: 'shieldBlock', x: bx, d: bd, remaining: this.shield });
      // 真实护盾反震冲击波：震伤并击退贴脸尸潮（宙斯护盾矩阵 Lv.2+ 伤害翻倍）
      const aegisMult = this.perkLevel('aegis_matrix') >= 2 ? 2.0 : 1.0;
      const repulseDmg = (42 + this.squad.tier * 24) * this.damage * aegisMult;
      for (let i = 0; i < this.near.length; i++) {
        const z = this.near[i];
        if (!z.alive) continue;
        const dx = z.x - bx;
        const dd = z.d - bd;
        if (dx * dx + dd * dd < 6.25) {
          this.damageZombie(z, repulseDmg);
          if (z.alive && z.kind !== 'giant') z.d += 0.9;
        }
      }
      return;
    }
    this.stats.lose(cause, 1);
    this.events.push({ type: 'soldierDie', x: this.squad.x + s.ox, d: this.squad.d + s.oz });
    // 用最后一个人补这个空位：阵型按编号排，从中间删会让后面所有人换位置（看起来整队抽搐）
    const last = this.soldiers.pop()!;
    if (index < this.soldiers.length) this.soldiers[index] = last;
    this.squad.count = Math.max(0, this.squad.count - 1);
    if (this.squad.count > this.soldiers.length) this.syncSoldiers(false);
  }

  /** 杀掉离某点最近的 n 个士兵，返回实际杀了几个 */
  private killNear(x: number, d: number, radius: number, max: number, cause: LossCause): number {
    let killed = 0;
    while (killed < max && this.squad.count > 0) {
      const idx = this.nearestSoldier(x, d, radius);
      if (idx < 0) break;
      this.killSoldier(idx, cause);
      killed++;
    }
    return killed;
  }

  /** Boss 砸击只伤预警的横向区域；整队移出危险带就能避开。 */
  private killBossLane(x: number, d: number, half: number, length: number, max: number): number {
    let killed = 0;
    while (killed < max && this.squad.count > 0) {
      let idx = -1;
      let nearest = half;
      for (let i = 0; i < this.soldiers.length; i++) {
        if (Math.abs(this.squad.d + this.soldiers[i].oz - d) > length / 2) continue;
        const dx = Math.abs(this.squad.x + this.soldiers[i].ox - x);
        if (dx < nearest) {
          nearest = dx;
          idx = i;
        }
      }
      if (idx < 0) break;
      this.killSoldier(idx, 'boss');
      killed++;
    }
    return killed;
  }

  private nearestSoldier(x: number, d: number, maxDist: number): number {
    let best = -1;
    let bestD2 = maxDist * maxDist;
    const sx = this.squad.x;
    const sd = this.squad.d;
    for (let i = 0; i < this.soldiers.length; i++) {
      const s = this.soldiers[i];
      const dx = sx + s.ox - x;
      const dd = sd + s.oz - d;
      const d2 = dx * dx + dd * dd;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = i;
      }
    }
    return best;
  }

  // ---------- 门 ----------

  private passGates(prevD: number) {
    const sq = this.squad;
    if (!this.defense && sq.d <= prevD) return;
    let hasCrossed = false;
    for (let i = 0; i < this.gates.length; i++) {
      const g = this.gates[i];
      if (g.consumed) continue;
      if (this.defense ? g.d <= sq.d : g.d > prevD && g.d <= sq.d) {
        hasCrossed = true;
        break;
      }
    }
    if (!hasCrossed) return;

    const groups = this.gateGroups;
    groups.clear();
    let poolIdx = 0;
    for (let i = 0; i < this.gates.length; i++) {
      const g = this.gates[i];
      if (g.consumed) continue;
      // 冲锋：队伍走过门；防线：门滑到队伍脚下
      if (this.defense ? g.d > sq.d : g.d <= prevD || g.d > sq.d) continue;
      let list = groups.get(g.group);
      if (!list) {
        list = this.gateListPool[poolIdx] ?? (this.gateListPool[poolIdx] = []);
        list.length = 0;
        poolIdx++;
        groups.set(g.group, list);
      }
      list.push(g);
    }

    for (const list of groups.values()) {
      let chosen: Gate | null = null;
      let bestDist = Infinity;
      let bestOverlap = 0;
      let wide: Gate | null = null;
      for (let i = 0; i < list.length; i++) {
        const g = list[i];
        g.consumed = true;
        if (sq.x >= g.x0 - 0.01 && sq.x <= g.x1 + 0.01) {
          const dist = Math.abs((g.x0 + g.x1) / 2 - sq.x);
          if (dist < bestDist) {
            bestDist = dist;
            chosen = g;
          }
        }
        // 大部队横跨整条路时中心挪不动，按覆盖面积算它走的是哪扇门
        const overlap = Math.min(g.x1, sq.x + this.halfWidth) - Math.max(g.x0, sq.x - this.halfWidth);
        if (overlap > bestOverlap) {
          bestOverlap = overlap;
          wide = g;
        }
      }
      if (!chosen && wide && bestOverlap >= Math.min(this.halfWidth, (wide.x1 - wide.x0) / 2) * 0.9) chosen = wide;
      if (!chosen) {
        let hadGood = false;
        for (let i = 0; i < list.length; i++) {
          if (list[i].kind !== 'add' || list[i].value > 0) {
            hadGood = true;
            break;
          }
        }
        if (hadGood) this.stats.gatesMissed++;
        continue;
      }
      this.stats.gatesTaken++;
      chosen.taken = true;
      this.applyGate(chosen);
    }
  }

  private applyGate(g: Gate) {
    const sq = this.squad;
    if (g.carnage === 'ammo') {
      this.carnage.ammoPickups++;
      const before = this.carnage.shells;
      this.carnage.shells = Math.min(9999, before + 99);
      this.events.push({ type: 'gatePass', gate: g, before, after: this.carnage.shells });
      return;
    }
    if (g.carnage === 'recruit') this.carnage.recruits++;

    if (g.kind === 'mystery') {
      this.rollMystery(sq.x, sq.d);
      this.events.push({ type: 'gatePass', gate: g, before: 0, after: 1 });
      return;
    }

    if (g.kind === 'add' || g.kind === 'mul') {
      const before = sq.count;
      sq.count = g.kind === 'add' ? before + g.value : Math.round(before * g.value);
      sq.count = Math.max(0, Math.min(this.countCap, sq.count));
      this.stats.lose('gate', Math.max(0, before - sq.count));
      this.syncSoldiers();
      this.events.push({ type: 'gatePass', gate: g, before, after: sq.count });
    } else if (g.kind === 'weapon') {
      const before = sq.tier;
      sq.tier = Math.max(sq.tier, Math.min(WEAPONS.length - 1, g.value));
      this.events.push({ type: 'gatePass', gate: g, before, after: sq.tier });
    } else {
      const before = Math.round(sq.rate * 100);
      const maxRate = this.spec.mode === 'blitz' ? MAX_BLITZ_RATE_BONUS : MAX_RATE_BONUS;
      sq.rate = Math.max(0.4, Math.min(maxRate, sq.rate * (1 + g.value / 100)));
      this.events.push({ type: 'gatePass', gate: g, before, after: Math.round(sq.rate * 100) });
    }
  }

  private gateHit(g: Gate, hits = 1) {
    if (g.carnage || g.kind === 'mystery') {
      g.bump = 1;
      return;
    }
    // 广告奇袭模式：数字门固定数值，射击不会增加数字
    if (this.spec.mode === 'blitz') return;
    g.hits += hits;
    g.bump = 1;
    const L = this.spec.level;
    let changed = false;
    let flippedBonus = 0;
    for (;;) {
      if (g.kind === 'weapon' && g.value >= Math.min(WEAPONS.length - 1, maxWeaponTier(L) + 1)) break;
      if (g.kind === 'rate' && g.value >= RATE_GATE_MAX) break;
      const step =
        g.kind === 'weapon'
          ? weaponGateStep(L, g.value)
          : g.kind === 'rate'
            ? rateGateStep(L, g.value)
            : gateStep(L, g.value);
      if (g.hits < step) break;
      g.hits -= step;
      const wasNeg = g.value <= 0;
      g.value++;
      changed = true;
      // 经典广告红转蓝大反转：将负数门打穿 0 翻红为绿时，直接奖励额外爆发加成！
      if (wasNeg && g.value >= 1 && !g.flipped && (g.kind === 'add' || g.kind === 'rate')) {
        g.flipped = true;
        const bonus = g.kind === 'add' ? 2 : 6;
        g.value = g.kind === 'rate' ? Math.min(RATE_GATE_MAX, g.value + bonus) : g.value + bonus;
        flippedBonus = bonus;
      }
    }
    if (flippedBonus > 0) this.events.push({ type: 'gateFlip', gate: g, bonus: flippedBonus });
    else if (changed) this.events.push({ type: 'gateUp', gate: g });
  }

  // ---------- 射击 ----------

  private collectNear() {
    const lo = this.squad.d + this.back - (this.defense ? 14 : 4);
    const hi = this.defense ? this.defense.spawnD + 12 : this.squad.d + BULLET_RANGE + 10;
    const near = this.near;
    near.length = 0;
    for (let i = 0; i < this.zombies.length; i++) {
      const z = this.zombies[i];
      if (z.alive && z.d > lo && z.d < hi) near.push(z);
    }
  }

  private fire(dt: number) {
    const sq = this.squad;
    if (sq.count <= 0 || this.soldiers.length === 0) return;
    const w = this.weapon;
    const emitters = Math.min(sq.count, EMIT_CAP);
    const streams = this.totalStreams;
    const odDmg = this.overdrive.active > 0 ? 1.4 : 1;
    let shotsPerSec = emitters * this.fireRate * streams;
    let dmg = w.damage * this.damage * odDmg * (sq.count / emitters);
    if (shotsPerSec > MAX_SHOTS_PER_SEC) {
      dmg *= shotsPerSec / MAX_SHOTS_PER_SEC;
      shotsPerSec = MAX_SHOTS_PER_SEC;
    }
    const gateHits = (sq.count * this.fireRate * streams) / Math.max(0.001, shotsPerSec);
    this.shotAcc += shotsPerSec * dt;
    // 只有冲锋终点的 Boss 战，正对着 Boss 的那几列兵会把子弹稍微偏过去；
    // 防线里不偏——以前所有子弹都被 Boss 吸过去，旁边的小怪就没人打了
    const aim = this.state === 'boss';
    while (this.shotAcc >= 1) {
      this.shotAcc -= 1;
      const s = this.soldiers[Math.floor(this.rng() * this.soldiers.length)];
      const fanSlot = streams > 1 ? Math.floor(this.rng() * streams) - (streams - 1) * 0.5 : 0;
      const laneJitter = fanSlot * 0.28;
      const x = sq.x + s.ox + 0.12 + laneJitter;
      const d = sq.d + s.oz + 0.35;
      // 每种枪的弹道不一样：冲锋枪、加特林泼得开，战术步枪又快又准，等离子炮慢而大；多重弹道呈明显扇形扫射！
      let vx = randRange(this.rng, -w.spread, w.spread) + fanSlot * 3.1;
      let vd = BULLET_SPEED * w.speed;
      if (aim) {
        let target: Boss | null = null;
        let best = Infinity;
        for (let i = 0; i < this.bosses.length; i++) {
          const b = this.bosses[i];
          if (!b.alive || !b.active) continue;
          const dx = Math.abs(b.x - x);
          if (dx < b.r + 2.5 && dx < best) {
            best = dx;
            target = b;
          }
        }
        if (target) {
          const slope = Math.max(-0.3, Math.min(0.3, (target.x - x) / Math.max(4, target.d - d)));
          const speed = BULLET_SPEED * w.speed;
          vx = slope * speed + randRange(this.rng, -0.6, 0.6);
          vd = Math.sqrt(Math.max(1, speed * speed - vx * vx));
        }
      }
      const nb = this.bulletPool.pop() ?? ({} as Bullet);
      nb.x = x;
      nb.d = d;
      nb.vx = vx;
      nb.vd = vd;
      nb.dmg = dmg;
      nb.gateHits = gateHits;
      nb.travel = 0;
      nb.pierce = this.ammo.pierce;
      nb.lastHit = -1;
      this.bullets.push(nb);
    }
  }

  /** 每步一次：挑出子弹可能打到的门、桶，把附近丧尸按纵向分桶 */
  private prepareHits() {
    const lo = this.squad.d + this.back - 3;
    const hi = this.squad.d + BULLET_RANGE + 6;
    const isBlitz = this.spec.mode === 'blitz';
    const frontTank = isBlitz ? this.frontBlitzTank() : null;
    this.hitGates.length = 0;
    if (!isBlitz) {
      for (let i = 0; i < this.gates.length; i++) {
        const g = this.gates[i];
        if (!g.consumed && g.kind !== 'mul' && g.kind !== 'mystery' && g.d >= lo && g.d <= hi) this.hitGates.push(g);
      }
    }
    this.hitBarrels.length = 0;
    for (let i = 0; i < this.barrels.length; i++) {
      const br = this.barrels[i];
      if (!br.alive || br.d + br.r < lo || br.d - br.r > hi) continue;
      // 广告奇袭：未击毁前排重装坦克前，身后的右路奖励受坦克护甲掩护不可隔山打牛
      if (frontTank && br.blitzLane === 'right' && !br.tank && br.d > frontTank.d) continue;
      this.hitBarrels.push(br);
    }
    this.zSpatial.build(this.near, lo, hi);
  }

  private updateBullets(dt: number) {
    const bullets = this.bullets;
    const fighting = this.state === 'run' || this.state === 'boss';
    if (fighting && bullets.length > 0) this.prepareHits();
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      const nx = b.x + b.vx * dt;
      const nd = b.d + b.vd * dt;
      let hit = false;
      if (fighting) hit = this.bulletHit(b, nx, nd);
      if (!hit) {
        b.x = nx;
        b.d = nd;
        b.travel += Math.abs(b.vd) * dt;
        if (b.travel > BULLET_RANGE || Math.abs(b.x) > TRACK_HALF + 3) hit = true;
      }
      if (hit) {
        this.bulletPool.push(b);
        bullets[i] = bullets[bullets.length - 1];
        bullets.pop();
      }
    }
  }

  /** 找出子弹这一帧路径上最先碰到的目标 */
  private bulletHit(b: Bullet, nx: number, nd: number): boolean {
    const dx = nx - b.x;
    const dd = nd - b.d;
    let bestT = 2;
    let kind: 0 | 1 | 2 | 3 | 4 = 0;
    let target: Gate | Barrel | Zombie | Boss | null = null;
    const dmin = Math.min(b.d, nd);
    const dmax = Math.max(b.d, nd);

    // 乘法门是玻璃，子弹穿过；其他门会挡子弹并被抬高（hitGates 已经去掉了乘法门和射程外的门）
    for (let i = 0; i < this.hitGates.length; i++) {
      const g = this.hitGates[i];
      if (g.consumed || g.d <= b.d || g.d > nd) continue;
      const t = (g.d - b.d) / dd;
      const x = b.x + dx * t;
      if (x >= g.x0 && x <= g.x1 && t < bestT) {
        bestT = t;
        kind = 1;
        target = g;
      }
    }
    for (let i = 0; i < this.hitBarrels.length; i++) {
      const br = this.hitBarrels[i];
      if (!br.alive || br.d + br.r < dmin || br.d - br.r > dmax) continue;
      const t = segCircle(b.x, b.d, dx, dd, br.x, br.d, br.r);
      if (t >= 0 && t < bestT) {
        bestT = t;
        kind = 2;
        target = br;
      }
    }
    // 只看子弹这一步路径附近的几个桶
    const [b0, b1] = this.zSpatial.range(dmin, dmax);
    const bins = this.zSpatial.bins;
    for (let bi = b0; bi <= b1; bi++) {
      const bin = bins[bi];
      for (let k = 0; k < bin.length; k++) {
        const z = bin[k];
        if (!z.alive || z.id === b.lastHit || z.d + z.r < dmin || z.d - z.r > dmax) continue;
        const t = segCircle(b.x, b.d, dx, dd, z.x, z.d, z.r);
        if (t >= 0 && t < bestT) {
          bestT = t;
          kind = 3;
          target = z;
        }
      }
    }
    for (let i = 0; i < this.bosses.length; i++) {
      const boss = this.bosses[i];
      if (!boss.alive || !boss.active) continue;
      const t = segCircle(b.x, b.d, dx, dd, boss.x, boss.d, boss.r);
      if (t >= 0 && t < bestT) {
        bestT = t;
        kind = 4;
        target = boss;
      }
    }
    if (bestT > 1 || !target) return false;

    const hx = b.x + dx * bestT;
    const hd = b.d + dd * bestT;
    const color = this.weapon.color;
    if (kind === 1) {
      this.gateHit(target as Gate, b.gateHits ?? 1);
      this.events.push({ type: 'hit', x: hx, d: hd, y: 1.2, target: 'gate', color, dmg: 0, id: (target as Gate).id });
    } else if (kind === 2) {
      const br = target as Barrel;
      const damage = br.carnage ? (b.gateHits ?? 1) * 0.2 : b.dmg * (this.opts.armorMult ?? 1);
      br.hp -= damage;
      br.bump = 1;
      this.events.push({ type: 'hit', x: hx, d: hd, y: 0.9, target: 'barrel', color, dmg: damage, id: br.id });
      if (br.hp <= 0) this.breakBarrel(br);
    } else if (kind === 3) {
      const z = target as Zombie;
      const ocLvl = this.perkLevel('overclock');
      const odOn = this.overdrive.active > 0;
      const critChance = odOn ? 1 : ocLvl === 0 ? 0 : ocLvl === 1 ? 0.26 : ocLvl === 2 ? 0.42 : 0.58;
      const isCrit = critChance > 0 && this.rng() < critChance;
      const critMult = !isCrit ? 1 : ocLvl >= 3 ? 2.8 : ocLvl === 2 ? 2.5 : 2.2;
      const cryoLvl = this.perkLevel('cryo_rounds');
      if (cryoLvl > 0) {
        if (!z.cryo || z.cryo <= 0 || (z.cryoLvl ?? 0) <= cryoLvl) {
          z.cryo = Math.max(z.cryo ?? 0, 2.6);
          z.cryoLvl = cryoLvl;
        }
      }
      const brittle = z.cryo && z.cryo > 0 ? 1 + (z.cryoLvl === 4 ? 0.65 : z.cryoLvl === 3 ? 0.55 : z.cryoLvl === 2 ? 0.38 : 0.22) : 1;
      const damage = b.dmg * critMult * brittle * (z.kind === 'giant' ? this.opts.armorMult ?? 1 : 1);
      this.damageZombie(z, damage);
      const hitY = z.kind === 'giant' ? 2 : 0.7;
      this.events.push({ type: 'hit', x: hx, d: hd, y: hitY, target: z.kind === 'giant' ? 'giant' : 'zombie', color: cryoLvl > 0 || z.cryoLvl === 4 ? 0x67e8f9 : color, dmg: damage, id: z.id });
      if (isCrit && this.rng() < 0.45) this.events.push({ type: 'critHit', x: hx, d: hd, y: hitY + 0.5, dmg: damage });
      this.splash(hx, hd, b.dmg, z.id);
      this.triggerChainLightning(hx, hd, hitY, damage, z.id);
      this.triggerClusterBlast(hx, hd, damage, z.id);
      // 穿甲：打穿这只接着飞，伤害打七折
      if (b.pierce > 0 && z.kind !== 'giant') {
        b.pierce--;
        b.dmg *= 0.7;
        b.lastHit = z.id;
        return false;
      }
    } else {
      const boss = target as Boss;
      const ocLvl = this.perkLevel('overclock');
      const odOn = this.overdrive.active > 0;
      const critChance = odOn ? 1 : ocLvl === 0 ? 0 : ocLvl === 1 ? 0.26 : ocLvl === 2 ? 0.42 : 0.58;
      const isCrit = critChance > 0 && this.rng() < critChance;
      const critMult = !isCrit ? 1 : ocLvl >= 3 ? 2.8 : ocLvl === 2 ? 2.5 : 2.2;
      const cryoLvl = this.perkLevel('cryo_rounds');
      if (cryoLvl > 0) {
        if (!boss.cryo || boss.cryo <= 0 || (boss.cryoLvl ?? 0) <= cryoLvl) {
          boss.cryo = Math.max(boss.cryo ?? 0, 2.4);
          boss.cryoLvl = cryoLvl;
        }
      }
      const brittle = boss.cryo && boss.cryo > 0 ? 1 + (boss.cryoLvl === 4 ? 0.65 : boss.cryoLvl === 3 ? 0.55 : boss.cryoLvl === 2 ? 0.38 : 0.22) : 1;
      const damage = b.dmg * critMult * brittle * (this.opts.armorMult ?? 1);
      this.damageBoss(boss, damage);
      this.events.push({ type: 'hit', x: hx, d: hd, y: 2.4, target: 'boss', color: cryoLvl > 0 || boss.cryoLvl === 4 ? 0x67e8f9 : color, dmg: damage, id: boss.id });
      if (isCrit && this.rng() < 0.35) this.events.push({ type: 'critHit', x: hx, d: hd, y: 2.9, dmg: damage });
      this.splash(hx, hd, b.dmg, -1);
      this.triggerChainLightning(hx, hd, 2.2, damage * 0.65, -1);
      this.triggerClusterBlast(hx, hd, damage * 0.65, -1);
    }
    return true;
  }

  /** 爆裂弹/电磁弹：打中处一圈的丧尸也掉血（复用已构建的纵向空间分桶，避免全表扫描 near） */
  private splash(x: number, d: number, dmg: number, skip: number) {
    const a = this.ammo;
    if (a.splash <= 0) return;
    const isEmp = a.name === '电磁弹';
    const r2 = a.splash * a.splash;
    let hit = false;
    const [b0, b1] = this.zSpatial.range(d - a.splash - 1.2, d + a.splash + 1.2);
    const bins = this.zSpatial.bins;
    for (let bi = b0; bi <= b1; bi++) {
      const bin = bins[bi];
      for (let k = 0; k < bin.length; k++) {
        const z = bin[k];
        if (!z.alive || z.id === skip) continue;
        const dx = z.x - x;
        const dd = z.d - d;
        if (dx * dx + dd * dd > r2 + z.r * z.r) continue;
        this.damageZombie(z, dmg * a.splashDmg * (z.kind === 'giant' ? this.opts.armorMult ?? 1 : 1));
        if (isEmp && z.alive) z.slow = 1.6;
        hit = true;
      }
    }
    const visChance = this.spec.mode === 'blitz' ? 0.72 : 0.4;
    if (hit && this.rng() < visChance) this.events.push({ type: 'splash', x, d, r: a.splash });
  }

  // ---------- 桶 ----------

  private breakBarrel(br: Barrel) {
    if (!br.alive) return;
    br.alive = false;
    br.hp = 0;
    this.stats.supplies++;
    // 卡住的大障碍被打掉：队列重新起步
    if (br.block && br.armed) this.queueV = 0;
    if (br.tank) {
      this.blitz.tanksDestroyed++;
      this.addGems(1, br.x, br.d);
      this.addXp(45);
      if (this.overdrive.active <= 0) this.overdrive.charge = Math.min(100, this.overdrive.charge + 15);
      this.captureTank(br);
      this.events.push({ type: 'banner', text: `已收编【${br.tank.name}】！开上前线协同开火，右路奖励全线释放！`, tone: 'info' });
    }
    if (br.truck) {
      const truckCoins = Math.round(br.truck.coins * (this.opts.coinMult ?? 1) * (this.fever.active > 0 ? 2 : 1));
      this.coins += truckCoins;
      this.addGems(1, br.x, br.d);
      this.addXp(40);
      this.events.push({ type: 'truckBreak', x: br.x, d: br.d, coins: truckCoins });
      this.events.push({ type: 'banner', text: `黄金武装补给车拦截成功！+${truckCoins} 金币 · +1 钻石！`, tone: 'info' });
    }
    this.events.push({ type: 'barrelBreak', barrel: br });
    if (br.carnage) {
      this.carnage.shells = Math.min(9999, this.carnage.shells + (br.carnage === 'battery' ? 99 : 20));
      this.carnage.batteries++;
    } else this.applyReward(br.reward, br.x, br.d);
  }

  private applyReward(reward: Reward, x: number, d: number) {
    let upgraded = true;
    const sq = this.squad;
    const isBlitz = this.spec.mode === 'blitz';
    if (reward.kind === 'weapon') {
      upgraded = reward.tier > sq.tier;
      if (upgraded) sq.tier = reward.tier;
      if (isBlitz) this.blitz.buffsCollected++;
    } else if (reward.kind === 'soldiers') {
      sq.count = Math.min(this.countCap, sq.count + reward.amount);
      this.syncSoldiers();
    } else if (reward.kind === 'coins') {
      this.coins += reward.amount;
    } else if (reward.kind === 'rate') {
      const maxRate = isBlitz ? MAX_BLITZ_RATE_BONUS : MAX_RATE_BONUS;
      sq.rate = Math.min(maxRate, sq.rate * (1 + reward.amount / 100));
      if (isBlitz) this.blitz.buffsCollected++;
    } else if (reward.kind === 'drone') {
      this.blitz.drones = Math.min(6, this.blitz.drones + reward.amount);
      this.blitz.buffsCollected++;
    } else if (reward.kind === 'multishot') {
      upgraded = this.blitz.multishot < 3;
      this.blitz.multishot = Math.min(3, this.blitz.multishot + reward.amount);
      this.blitz.buffsCollected++;
    } else if (reward.kind === 'ammo') {
      const targetIdx = Math.max(0, Math.min(AMMO.length - 1, reward.level));
      const curIdx = AMMO.indexOf(this.ammo);
      upgraded = targetIdx > curIdx;
      if (upgraded) this.ammo = AMMO[targetIdx];
      this.blitz.buffsCollected++;
    } else if (reward.kind === 'damage') {
      this.damage *= 1 + reward.amount / 100;
      this.blitz.damageBonus += reward.amount;
      this.blitz.buffsCollected++;
    } else if (reward.kind === 'shield') {
      this.addShield(reward.amount);
      this.blitz.buffsCollected++;
    } else if (reward.kind === 'boom') {
      this.blitzBombExplode(x, d, reward.radius);
    } else if (reward.kind === 'freeze') {
      this.cryoNova(x, d, reward.radius);
    } else if (reward.kind === 'hero') {
      this.spawnAllyHero(reward.hero, x, d);
      if (isBlitz) this.blitz.buffsCollected++;
    } else if (reward.kind === 'turret') {
      this.deployAllyTurret(reward.duration ?? 24, x, d);
      if (isBlitz) this.blitz.buffsCollected++;
    } else if (reward.kind === 'mystery') {
      this.rollMystery(x, d);
      if (isBlitz) this.blitz.buffsCollected++;
    } else {
      this.launchAirstrike();
      if (isBlitz) this.blitz.buffsCollected++;
    }
    this.events.push({ type: 'reward', reward, x, d, upgraded });
  }

  private collideBarrels() {
    const sq = this.squad;
    for (let k = 0; k < this.barrels.length; k++) {
      const br = this.barrels[k];
      if (!br.alive || br.truck) continue;
      if (br.d - br.r > sq.d + this.front + 0.4 || br.d + br.r < sq.d + this.back - 0.4) continue;
      // 广告奇袭：右路已放行的奖励舱、中路友军安全爆破油桶/液氮急冻桶碰到队伍立刻触发，不误伤己方士兵！
      if ((br.blitzLane === 'right' && !br.tank) || br.look === 'bomb' || br.look === 'cryo') {
        if (Math.abs(sq.x - br.x) <= this.halfWidth + br.r + 0.35) {
          this.breakBarrel(br);
        }
        continue;
      }
      const rr = (br.r + 0.25) * (br.r + 0.25);
      for (let i = this.soldiers.length - 1; i >= 0; i--) {
        const s = this.soldiers[i];
        const dx = sq.x + s.ox - br.x;
        const dd = sq.d + s.oz - br.d;
        if (dx * dx + dd * dd < rr) {
          this.killSoldier(i, 'barrel');
          br.hp -= Math.max(2, br.maxHp * 0.035);
          br.bump = 1;
          if (br.hp <= 0) {
            this.breakBarrel(br);
            break;
          }
        }
      }
    }
  }

  // ---------- 丧尸 ----------

  private damageZombie(z: Zombie, dmg: number) {
    if (!z.alive) return;
    z.hp -= dmg;
    z.flash = 1;
    if (z.hp <= 0) this.killZombie(z);
  }

  private killZombie(z: Zombie, byPlayer = true, chain = true) {
    if (!z.alive) return;
    z.alive = false;
    const feverCoins = this.fever.active > 0 ? 2 : 1;
    const coins = byPlayer && this.spec.mode !== 'carnage' ? killCoins(z.kind, this.spec.level) * (this.opts.coinMult ?? 1) * feverCoins : 0;
    if (byPlayer) {
      this.kills += 1;
      if (this.spec.mode === 'carnage') {
        this.carnage.combo = this.time - this.carnage.lastKill < 2.5 ? this.carnage.combo + 1 : 1;
        this.carnage.lastKill = this.time;
        this.carnage.bestCombo = Math.max(this.carnage.bestCombo, this.carnage.combo);
        if (!this.novaActive) this.carnage.charge = Math.min(100, this.carnage.charge + 0.85);
      } else {
        if (this.spec.mode === 'blitz') {
          this.blitz.combo = this.time - this.blitz.lastKill < 2.5 ? this.blitz.combo + 1 : 1;
          this.blitz.lastKill = this.time;
          this.blitz.bestCombo = Math.max(this.blitz.bestCombo, this.blitz.combo);
        }
        // 全模式连击与过载充能
        this.overdrive.combo++;
        this.overdrive.comboTimer = 3.2;
        if (this.overdrive.combo > this.overdrive.bestCombo) this.overdrive.bestCombo = this.overdrive.combo;
        // 经典广告连击狂热 FEVER 时刻：30 连击自动引爆 6 秒射速 +25% · 金币 2×
        if (this.overdrive.combo >= this.fever.nextCombo && this.fever.active <= 0) {
          this.fever.active = this.fever.duration;
          this.fever.nextCombo = this.overdrive.combo + 35;
          this.fever.triggers++;
          this.events.push({ type: 'feverStart', duration: this.fever.duration, combo: this.overdrive.combo });
          this.events.push({ type: 'banner', text: `🔥 ${this.overdrive.combo} 连击 · FEVER 狂热时刻！射速 +25% · 2× 金币！`, tone: 'info' });
        }
        const chargeGain = z.kind === 'giant' ? 14 : z.kind === 'brute' ? 5 : z.kind === 'exploder' ? 3 : 1.6;
        if (this.overdrive.active <= 0) this.overdrive.charge = Math.min(100, this.overdrive.charge + chargeGain);
        // 局内肉鸽经验值
        const xpGain = z.kind === 'giant' ? 35 : z.kind === 'brute' ? 14 : z.kind === 'exploder' ? 6 : 4;
        this.addXp(xpGain);
        // 纳米收割协议：累计击杀自动增兵+补盾
        const leechLvl = this.perkLevel('nanite_leech');
        if (leechLvl > 0 && this.squad.count > 0) {
          this.naniteKills++;
          const need = leechLvl === 1 ? 16 : leechLvl === 2 ? 11 : 7;
          if (this.naniteKills >= need) {
            this.naniteKills = 0;
            const addSoldiers = leechLvl >= 3 ? 2 : 1;
            const addSh = leechLvl >= 2 ? 2 : 1;
            this.squad.count = Math.min(this.countCap, this.squad.count + addSoldiers);
            this.syncSoldiers(false);
            this.addShield(addSh);
            this.events.push({ type: 'reward', reward: { kind: 'soldiers', amount: addSoldiers }, x: z.x, d: z.d, upgraded: true });
          }
        }
      }
      this.coins += coins;
      if (this.rng() < GEMS.drop[z.kind]) this.addGems(1, z.x, z.d);
    }
    this.events.push({ type: 'zombieDie', x: z.x, d: z.d, kind: z.kind, coins, look: z.look });
    if (z.kind === 'exploder' && chain) this.explode(z.x, z.d, EXPLODE_RADIUS, 'exploder', byPlayer);
    if (z.kind === 'giant' && byPlayer && z.reward) this.applyReward(z.reward, z.x, z.d);
  }

  /** 爆炸：自爆尸、投弹、空袭。远程点爆自爆尸可清周围丧尸且大幅减小对己方士兵的波及半径 */
  private explode(x: number, d: number, radius: number, source: 'exploder' | 'impact' | 'strike', byPlayer = false) {
    const event: GameEvent = { type: 'explode', x, d, r: radius, source, killed: 0 };
    this.events.push(event);
    const rr = radius * radius;
    for (let i = 0; i < this.near.length; i++) {
      const z = this.near[i];
      if (!z.alive) continue;
      const dx = z.x - x;
      const dd = z.d - d;
      if (dx * dx + dd * dd > rr + z.r * z.r) continue;
      if (z.kind === 'giant') this.damageZombie(z, z.maxHp * (source === 'strike' ? 0.15 : 0.08));
      else if (z.kind === 'brute') this.damageZombie(z, z.maxHp * 0.6);
      else this.killZombie(z);
    }
    for (let i = 0; i < this.bosses.length; i++) {
      const b = this.bosses[i];
      if (!b.alive || !b.active) continue;
      const dx = b.x - x;
      const dd = b.d - d;
      if (dx * dx + dd * dd < (radius + b.r) * (radius + b.r)) {
        const pct = source === 'strike' ? (this.spec.mode === 'blitz' ? 0.08 : 0.04) : 0.01;
        this.damageBoss(b, b.maxHp * pct);
      }
    }
    if (source === 'strike') {
      for (let i = 0; i < this.barrels.length; i++) {
        const br = this.barrels[i];
        if (!br.alive || !br.tank) continue;
        const dx = br.x - x;
        const dd = br.d - d;
        if (dx * dx + dd * dd < (radius + br.r) * (radius + br.r)) {
          br.hp -= br.maxHp * 0.18;
          br.bump = 1;
          if (br.hp <= 0) this.breakBarrel(br);
        }
      }
    }
    if (source === 'impact') {
      // 投弹/坦克炮击：红圈里的士兵先由护盾抵挡，剩余全部炸死——看到红圈就得躲。
      // 单趟扫描避免边杀边 syncSoldiers 把溢出兵补进来重复炸死。
      const beforeSim = Math.max(1, this.soldiers.length);
      const per = this.squad.count / beforeSim;
      let bodies = 0;
      const sx = this.squad.x;
      const sd = this.squad.d;
      for (let i = this.soldiers.length - 1; i >= 0; i--) {
        const s = this.soldiers[i];
        const dx = sx + s.ox - x;
        const dd = sd + s.oz - d;
        if (dx * dx + dd * dd < rr) {
          if (this.shield > 0) {
            this.shield--;
            this.blitz.shield = this.shield;
            this.events.push({ type: 'shieldBlock', x: sx + s.ox, d: sd + s.oz, remaining: this.shield });
            continue;
          }
          this.events.push({ type: 'soldierDie', x: sx + s.ox, d: sd + s.oz });
          const last = this.soldiers.pop()!;
          if (i < this.soldiers.length) this.soldiers[i] = last;
          bodies++;
        }
      }
      const totalKilled = Math.min(this.squad.count, Math.round(bodies * per));
      if (totalKilled > 0) {
        this.stats.lose('bomb', totalKilled);
        this.squad.count = Math.max(0, this.squad.count - totalKilled);
        if (this.squad.count > this.soldiers.length) this.syncSoldiers(false);
      }
      event.killed = totalKilled;
    } else if (source === 'exploder') {
      // 自爆：贴脸引爆至少带走 3 人（最多 6%）；被玩家远程点爆时波及半径缩至 55%、伤亡减半
      const friendRadius = byPlayer ? radius * 0.55 : radius;
      const maxKill = byPlayer ? Math.max(1, Math.ceil(this.squad.count * 0.03)) : Math.max(3, Math.ceil(this.squad.count * 0.06));
      this.killNear(x, d, friendRadius, maxKill, 'explosion');
    }
  }

  private updateZombies(dt: number) {
    const sq = this.squad;
    const front = sq.d + this.front;
    const back = sq.d + this.back;
    const left = sq.x - this.halfWidth;
    const right = sq.x + this.halfWidth;
    for (let i = 0; i < this.near.length; i++) {
      const z = this.near[i];
      if (!z.alive) continue;
      const def = ZOMBIES[z.kind];
      if (!z.active && z.d - sq.d < ENEMY_ACTIVATE) z.active = true;
      if (!z.active) continue;
      let slowMult = 1;
      if (z.slow && z.slow > 0) {
        z.slow = Math.max(0, z.slow - dt);
        slowMult = 0.56;
      }
      if (z.cryo && z.cryo > 0) {
        z.cryo = Math.max(0, z.cryo - dt);
        const cMult = z.cryoLvl === 4 ? 0.18 : z.cryoLvl === 3 ? 0.38 : z.cryoLvl === 2 ? 0.5 : 0.64;
        if (cMult < slowMult) slowMult = cMult;
      }
      z.phase += dt * slowMult * (z.kind === 'runner' ? 16 : z.kind === 'giant' ? 6 : 11);

      z.d -= def.speed * this.zombieSpeed * slowMult * dt;
      // 横向追踪：离阵型边缘够近才拐过来，所以隔得远的道可以躲开。
      // 防线模式下，冲进交战区的丧尸会横穿过来找你
      const engage = this.defense ? z.d < DEFENSE_WALL_D + 1 : z.d - front < 16;
      if (engage) {
        const gap = z.x < left ? left - z.x : z.x > right ? z.x - right : 0;
        if (gap > 0 && gap < (this.defense ? 14 : def.seek)) {
          const lat = (z.kind === 'runner' ? 2.4 : z.kind === 'giant' ? 1.9 : 1.7) * (this.defense ? 1.8 : 1) * dt;
          z.x += (z.x < left ? 1 : -1) * Math.min(gap, lat);
        }
      }
      // 隔离墙两边互不相通
      const wall = this.wallAt(z.d - z.r, z.d + z.r);
      if (wall) {
        if (z.x < 0 && z.x > -WALL_HALF - z.r) z.x = -WALL_HALF - z.r;
        else if (z.x >= 0 && z.x < WALL_HALF + z.r) z.x = WALL_HALF + z.r;
      }
      z.x = Math.max(-TRACK_HALF + 0.2, Math.min(TRACK_HALF - 0.2, z.x));

      // 接触
      if (this.soldiers.length > 0 && z.d < front + z.r + CONTACT_PAD && z.d > back - z.r - CONTACT_PAD) {
        if (z.kind === 'giant') {
          this.giantContact(z, dt);
        } else {
          const idx = this.nearestSoldier(z.x, z.d, z.r + CONTACT_PAD);
          if (idx >= 0) {
            if (z.kind === 'exploder') {
              this.killZombie(z, false);
            } else {
              this.killNear(z.x, z.d, z.r + CONTACT_PAD + 0.4 + Math.min(2, z.weight * 0.05), Math.round(def.kills * z.weight), 'zombie');
              this.killZombie(z, false);
            }
          }
        }
      }
      if (z.alive && z.d < back - 8) z.alive = false;
    }
  }

  /** 巨尸：身体挡路，贴着的士兵每秒死 8 个左右；还会周期性砸地 */
  private giantContact(z: Zombie, dt: number) {
    // 防线里阵型挤在一条道上，巨尸碾得慢一点
    z.grind += dt * (this.defense ? 5 : 8);
    while (z.grind >= 1) {
      const idx = this.nearestSoldier(z.x, z.d, z.r + CONTACT_PAD);
      if (idx < 0) {
        z.grind = Math.min(z.grind, 1);
        break;
      }
      this.killSoldier(idx, 'giant');
      z.grind -= 1;
    }
    z.atk += dt;
    if (z.atk >= GIANT_SMASH_INTERVAL && this.nearestSoldier(z.x, z.d, z.r + 1.6) >= 0) {
      z.atk = 0;
      const killed = this.killNear(z.x, z.d, z.r + 1.4, Math.max(3, Math.ceil(this.squad.count * (this.defense ? 0.03 : 0.05))), 'giant');
      this.events.push({ type: 'giantSmash', x: z.x, d: z.d, killed });
    }
  }

  // ---------- 陷阱 ----------

  private updateHazards(dt: number) {
    const sq = this.squad;
    const nearH = this.nearHazards;
    nearH.length = 0;
    const loD = sq.d + this.back - 1.5;
    const hiD = sq.d + this.front + 1.5;
    for (let i = 0; i < this.hazards.length; i++) {
      const h = this.hazards[i];
      h.phase += dt;
      if (h.kind === 'saw') {
        const mid = (h.x0 + h.x1) / 2;
        const amp = (h.x1 - h.x0) / 2;
        h.x = mid + Math.sin(h.phase * 1.8) * amp;
      }
      if (h.d1 >= loD && h.d0 <= hiD) nearH.push(h);
    }
    if (nearH.length === 0) {
      for (let i = 0; i < this.soldiers.length; i++) {
        const s = this.soldiers[i];
        if (s.spike > 0) s.spike = Math.max(0, s.spike - dt * 2);
      }
      return;
    }

    for (let i = this.soldiers.length - 1; i >= 0; i--) {
      const s = this.soldiers[i];
      const x = sq.x + s.ox;
      const d = sq.d + s.oz;
      let inSpike = false;
      let killed = false;
      for (let k = 0; k < nearH.length; k++) {
        const h = nearH[k];
        if (h.kind === 'saw') {
          const dx = x - h.x;
          const dd = d - h.d0;
          if (dx * dx + dd * dd < SAW_RADIUS * SAW_RADIUS) {
            this.events.push({ type: 'trap', x, d });
            this.killSoldier(i, 'hazard');
            killed = true;
            break;
          }
        } else if (x >= h.x0 && x <= h.x1 && d >= h.d0 && d <= h.d1) {
          inSpike = true;
          if (s.lastSpikeId !== h.id) {
            s.spike += dt;
            if (s.spike >= SPIKE_EXPOSURE) {
              s.lastSpikeId = h.id;
              s.spike = 0;
              if (this.rng() < SPIKE_LETHALITY) {
                this.events.push({ type: 'trap', x, d });
                this.killSoldier(i, 'hazard');
                killed = true;
                break;
              }
            }
          }
        }
      }
      if (!killed && !inSpike && s.spike > 0) {
        s.spike = Math.max(0, s.spike - dt * 2);
      }
    }
  }

  // ---------- Boss ----------

  private damageBoss(b: Boss, dmg: number) {
    if (!b.alive) return;
    b.hp -= dmg;
    b.flash = 1;
    if (b.hp <= 0) {
      b.hp = 0;
      b.alive = false;
      const bounty = this.spec.mode === 'carnage' ? 0 : bossBounty(this.spec.level, b.final, b.pair) * (this.opts.coinMult ?? 1);
      this.coins += bounty;
      this.addGems(bossGems(b.final, this.rng()), b.x, b.d);
      this.addXp(90);
      if (this.overdrive.active <= 0) this.overdrive.charge = Math.min(100, this.overdrive.charge + 25);
      this.events.push({ type: 'bossDie', boss: b, bounty });
      // 防线中途 Boss 只补少量援军（狂潮模式为独立兵备，不发主线防线援军奖励）。
      if (this.defense && this.spec.mode !== 'carnage' && !b.final) {
        this.applyReward({ kind: 'soldiers', amount: Math.max(2, Math.round(this.squad.count * 0.025)) }, b.x, b.d);
      }
      for (let i = 0; i < this.zombies.length; i++) {
        const z = this.zombies[i];
        if (z.alive && z.owner === b.id) this.killZombie(z);
      }
      // 防线模式要等全部刷完、清干净才算赢（在 step 里判断）
      if (!this.defense && this.bosses.every((x) => !x.alive)) this.win();
    }
  }

  private addGems(n: number, x: number, d: number) {
    if (n <= 0 || this.spec.mode === 'carnage') return;
    this.gems += n;
    this.events.push({ type: 'gem', x, d, amount: n });
  }

  private win() {
    if (this.state === 'won' || this.state === 'lost') return;
    this.state = 'won';
    for (let i = 0; i < this.zombies.length; i++) {
      const z = this.zombies[i];
      if (z.alive) this.killZombie(z, false, false);
    }
    this.projectiles.length = 0;
    this.rockets.length = 0;
    this.events.push({ type: 'won' });
  }

  private updateBosses(dt: number) {
    if (this.state !== 'boss' && !(this.defense && this.state === 'run')) return;
    const sq = this.squad;
    const front = sq.d + this.front;
    const double = this.bosses.length > 1;
    for (let idx = 0; idx < this.bosses.length; idx++) {
      const b = this.bosses[idx];
      if (!b.alive || !b.active) continue;
      const def = BOSSES[b.kind];
      b.fightTime += dt;
      if (!b.enraged && b.hp < b.maxHp * 0.5) {
        // 半血狂暴：出手快三成、走得快三成；投弹手同步缩放当前蓄力秒数，避免瞬间零前摇连丢两桶
        b.enraged = true;
        if (b.kind === 'thrower' && b.fightTime < THROWER_MELEE_TIME) b.timer *= 0.7;
        this.events.push({ type: 'bossEnrage', boss: b });
      }
      let cryoSlow = 1;
      if (b.cryo && b.cryo > 0) {
        b.cryo = Math.max(0, b.cryo - dt);
        cryoSlow = b.cryoLvl === 4 ? 0.45 : b.cryoLvl === 3 ? 0.72 : b.cryoLvl === 2 ? 0.8 : 0.88;
      }
      const rage = (b.enraged ? 1.3 : 1) * cryoSlow;
      // 横向跟着队伍，双 Boss 时各守一边；防线还在隔离墙那一段时守在自己的道上
      const inLane = this.defense && b.d > DEFENSE_WALL_D + b.r;
      const lim = this.spec.mode === 'blitz' ? 1.45 : inLane ? 0.8 : double && !this.defense ? 0.9 : 4.5;
      const tx = Math.max(b.homeX - lim, Math.min(b.homeX + lim, sq.x));
      // 蓄力和挥击时站稳，别在锁定危险带后横滑。
      if (!b.attacking) b.x += Math.max(-1, Math.min(1, tx - b.x)) * 0.9 * dt;
      const reach = front + b.r + 0.5;

      if (b.kind === 'thrower' && b.fightTime < THROWER_MELEE_TIME) {
        // 远程：停在 15 外扔油桶，超时后弃桶冲锋近战
        const keep = front + 15;
        if (b.d > keep) {
          b.d = Math.max(keep, b.d - def.speed * (this.defense ? 2.2 : 1) * dt);
          b.phase += dt * 4;
        }
        b.attacking = false;
        b.timer += dt;
        const interval = b.enraged ? THROW_INTERVAL * 0.7 : THROW_INTERVAL;
        b.windup = Math.min(1, b.timer / interval);
        if (b.timer >= interval) {
          b.timer = 0;
          b.slam = 1;
          const n = b.enraged ? 2 : 1;
          for (let i = 0; i < n; i++) this.throwAt(b, i);
        }
        continue;
      }
      if (b.kind === 'thrower' && !b.meleeWarned) {
        b.meleeWarned = true;
        b.windup = 0;
        this.events.push({ type: 'banner', text: `${def.name} 逼近肉搏！`, tone: 'danger' });
      }

      if (b.kind === 'hive') {
        b.timer += dt;
        if (b.timer >= (HIVE_INTERVAL * (this.defense ? 1.3 : 1)) / rage) {
          b.timer = 0;
          const count = Math.min(this.defense ? 6 : 10, 3 + Math.floor(this.spec.level / (this.defense ? 4 : 2))) + (b.enraged ? 2 : 0);
          const hp = Math.max(1, this.zombieHpHint() * 0.6);
          for (let i = 0; i < count; i++) {
            const z = this.makeZombie({ kind: 'runner', x: b.x + randRange(this.rng, -1.6, 1.6), d: b.d - b.r - 0.4 - this.rng() * 1.2, hp }, b.id);
            this.zombies.push(z);
          }
          this.version++;
          this.events.push({ type: 'hiveSpawn', boss: b, count });
        }
      }

      if (b.d <= reach) b.engaged = true;
      if (b.d > reach && !b.engaged) {
        // 防线里 Boss 从 60 多米外走过来，走快一点才有压迫感
        const pace = (b.kind === 'thrower' ? 2 : 1) * (this.defense ? (b.kind === 'brute' ? 1.5 : 2.2) : 1);
        b.d = Math.max(reach, b.d - def.speed * pace * rage * dt);
        b.phase += dt * 4.5 * rage;
        b.attacking = false;
        b.windup = Math.max(0, b.windup - dt * 2);
      } else {
        // 阵型缩短时向前补位，但不打断已开始的五连击。
        if (b.d > reach) b.d = Math.max(reach, b.d - def.speed * rage * dt);
        if (b.recover > 0) {
          b.recover = Math.max(0, b.recover - dt * rage);
          b.attacking = false;
          b.windup = 0;
          continue;
        }
        if (!b.attacking) {
          // 每一下起手时锁定近身可达范围内的危险带，防止 Boss 隔着半座桥凭空落锤。
          b.attacking = true;
          b.windup = 0;
          b.attackX = this.spec.mode === 'carnage' ? b.x : Math.max(b.x - 2.2, Math.min(b.x + 2.2, sq.x));
          b.attackD = this.spec.mode === 'carnage' ? b.d - b.r - 2.4 : sq.d + (this.front + this.back) / 2;
          b.attackLength = this.spec.mode === 'carnage' ? 4.8 : Math.max(2.4, this.front - this.back + 1.2);
        }
        const step = BOSS_COMBO[b.comboStep];
        b.windup += (dt * rage) / step.windup;
        if (b.windup >= 1) {
          b.windup = 0;
          b.slam = 1;
          b.smashes++;
          const frac =
            b.kind === 'hive' ? 0.05 : this.defense ? Math.min(0.28, 0.06 + 0.012 * b.smashes) : Math.min(0.38, 0.08 + 0.015 * b.smashes);
          const killed = this.killBossLane(
            b.attackX,
            b.attackD,
            BOSS_STRIKE_HALF,
            b.attackLength,
            Math.max(2, Math.ceil(sq.count * frac * step.damage)),
          );
          if (
            killed === 0 &&
            b.d <= reach + 3 &&
            Math.abs(sq.x - b.attackX) <= BOSS_STRIKE_HALF + this.halfWidth + 2.5
          ) {
            this.stats.dodges++;
          }
          this.events.push({ type: 'bossSmash', boss: b, x: b.attackX, d: b.attackD, killed, combo: b.comboStep });
          b.attacking = false;
          b.recover = step.recover;
          b.comboStep = (b.comboStep + 1) % BOSS_COMBO.length;
        }
      }
    }
  }

  /** 当前关普通丧尸的大概血量，给尸巢孵化用 */
  private zombieHpHint(): number {
    let sum = 0;
    let n = 0;
    for (let i = 0; i < this.zombies.length; i++) {
      const z = this.zombies[i];
      if (z.kind === 'walker') {
        sum += z.maxHp;
        if (++n > 20) break;
      }
    }
    return n ? sum / n : 3;
  }

  private throwAt(b: Boss, i: number) {
    const sq = this.squad;
    // 第二桶（狂暴后）落在更远的一侧，两个红圈之间留出躲的空当
    const tx = Math.max(this.lo + 1, Math.min(this.hi - 1, sq.x + randRange(this.rng, -1.8, 1.8) + (i ? (this.rng() < 0.5 ? -4.6 : 4.6) : 0)));
    const td = sq.d + randRange(this.rng, this.back * 0.6, this.front * 0.6 + 0.5);
    const proj: Projectile = { id: this.nextId++, x0: b.x, d0: b.d - b.r, tx, td, t: 0, T: THROW_FLIGHT * (this.opts.warnMult ?? 1) };
    this.projectiles.push(proj);
    this.events.push({ type: 'throw', boss: b, proj });
  }

  private updateProjectiles(dt: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.t += dt;
      if (p.t >= p.T) {
        this.projectiles[i] = this.projectiles[this.projectiles.length - 1];
        this.projectiles.pop();
        // 冲锋的 Boss 战和防线里都会炸
        if (this.state === 'boss' || (this.state === 'run' && this.defense)) this.explode(p.tx, p.td, THROW_RADIUS, 'impact');
      }
    }
  }

  // ---------- 空袭 ----------

  private launchAirstrike() {
    const sq = this.squad;
    this.events.push({ type: 'airstrikeLaunch', x: sq.x, d: sq.d });
    const targets: { x: number; d: number }[] = [];
    for (let i = 0; i < this.bosses.length; i++) {
      const b = this.bosses[i];
      if (b.alive && b.active && targets.length < 4) targets.push({ x: b.x, d: b.d + 1.5 });
    }
    if (this.spec.mode === 'blitz') {
      const tank = this.frontBlitzTank();
      if (tank && tank.d < sq.d + 46) targets.push({ x: tank.x, d: tank.d + 1.5 });
    }
    const ahead: Zombie[] = [];
    for (let i = 0; i < this.zombies.length; i++) {
      const z = this.zombies[i];
      if (z.alive && z.d > sq.d + 4 && z.d < sq.d + 48) ahead.push(z);
    }
    ahead.sort((a, b) => (b.kind === 'giant' ? 1 : 0) - (a.kind === 'giant' ? 1 : 0) || a.d - b.d);
    for (let i = 0; i < ahead.length; i++) {
      if (targets.length >= 8) break;
      const z = ahead[i];
      let farEnough = true;
      for (let k = 0; k < targets.length; k++) {
        const dx = targets[k].x - z.x;
        const dd = targets[k].d - z.d;
        if (dx * dx + dd * dd <= 4.84) {
          farEnough = false;
          break;
        }
      }
      if (farEnough) targets.push({ x: z.x, d: z.d });
    }
    const minCount = this.spec.mode === 'blitz' ? 8 : 6;
    while (targets.length < minCount) targets.push({ x: randRange(this.rng, -TRACK_HALF + 1, TRACK_HALF - 1), d: sq.d + randRange(this.rng, 10, 40) });
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      const s: Strike = { id: this.nextId++, x: t.x, d: t.d, t: -i * 0.11, T: 0.72 };
      this.strikes.push(s);
      this.events.push({ type: 'strike', strike: s });
    }
  }

  private updateStrikes(dt: number) {
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const s = this.strikes[i];
      s.t += dt;
      if (s.t >= s.T) {
        this.strikes[i] = this.strikes[this.strikes.length - 1];
        this.strikes.pop();
        // step() 已经刚跑过 collectNear，直接复用避免重复遍历全部丧尸
        this.explode(s.x, s.d - 1.5, STRIKE_RADIUS, 'strike');
      }
    }
  }

  private decay(dt: number) {
    const gStep = dt * 6;
    const rStep = dt * 4;
    for (let i = 0; i < this.gates.length; i++) {
      const g = this.gates[i];
      if (g.bump > 0) g.bump = Math.max(0, g.bump - gStep);
    }
    for (let i = 0; i < this.barrels.length; i++) {
      const b = this.barrels[i];
      if (b.bump > 0) b.bump = Math.max(0, b.bump - gStep);
      if (b.recoil > 0) b.recoil = Math.max(0, b.recoil - rStep);
    }
    const zStep = dt * 8;
    for (let i = 0; i < this.near.length; i++) {
      const z = this.near[i];
      if (z.flash > 0) z.flash = Math.max(0, z.flash - zStep);
    }
    for (let i = 0; i < this.bosses.length; i++) {
      const b = this.bosses[i];
      if (b.flash > 0) b.flash = Math.max(0, b.flash - zStep);
      if (b.slam > 0) b.slam = Math.max(0, b.slam - dt * 2.5);
    }
  }

  drainEvents(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
}
