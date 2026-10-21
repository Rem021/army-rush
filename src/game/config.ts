// 玩法常量。距离单位约等于一个士兵身高。

/** 桥面可走区域的半宽，x ∈ [-TRACK_HALF, TRACK_HALF] */
export const TRACK_HALF = 5.4;
/** 三条道的中心和半宽 */
export const LANE_HALF = TRACK_HALF / 3;
export const LANES = [-LANE_HALF * 2, 0, LANE_HALF * 2] as const;
/** 左右两半的中心 */
export const HALVES = [-TRACK_HALF / 2, TRACK_HALF / 2] as const;
/** 中间隔离墙的半厚 */
export const WALL_HALF = 0.3;

/** 队伍前进速度（单位/秒） */
export const SQUAD_SPEED = 9;
/** 队伍横向跟手速度（越大越跟手） */
export const SQUAD_STEER = 14;
/** 阵型间距系数：第 i 个士兵离中心 SPACING * sqrt(i) */
export const FORMATION_SPACING = 0.36;
/** 最多真正渲染和模拟的士兵数，超出部分只计数 */
export const MAX_SOLDIERS_SIM = 320;
/** 人数上限 */
export const MAX_COUNT = 9999;

export const BULLET_SPEED = 62;
export const BULLET_RANGE = 44;
/** 同时发射子弹的士兵数上限。人更多时，每颗子弹的伤害按比例放大 */
export const EMIT_CAP = 48;

/** 门被打一次加 1 需要的命中数：负数时恒定，正数时按指数变难，所以射门收益是对数增长 */
export const GATE_GROWTH = 1.15;
export function gateBaseStep(level: number): number {
  return 2.5 + 0.12 * (level - 1);
}
export function gateStep(level: number, value: number): number {
  return gateBaseStep(level) * (value > 0 ? Math.pow(GATE_GROWTH, value) : 1);
}
/** 射速门每次只 +1%，要打的发数比加人门多得多，越往上越难打 */
export function rateGateStep(level: number, value: number): number {
  return gateBaseStep(level) * 4 * (value > 0 ? Math.pow(1.1, value) : 1);
}
/** 射速门最多打到 +25% */
export const RATE_GATE_MAX = 25;
/** 武器门升一级需要的命中数 */
export function weaponGateStep(level: number, tier: number): number {
  return 22 * (tier + 1) * (tier + 1) * (1 + 0.12 * (level - 1));
}

/** 丧尸在多远时开始冲锋 */
export const ENEMY_ACTIVATE = 38;
/** 士兵和丧尸接触判定（加在丧尸半径上） */
export const CONTACT_PAD = 0.24;

export type ZombieKind = 'walker' | 'runner' | 'brute' | 'exploder' | 'giant';

export interface ZombieDef {
  name: string;
  /** 血量倍数（相对普通丧尸） */
  hp: number;
  speed: number;
  radius: number;
  /** 模型缩放 */
  scale: number;
  /** 撞上后带走几名士兵（自爆尸和巨尸另算） */
  kills: number;
  coins: number;
  /** 横向追踪范围：离队伍边缘多近才会拐过来 */
  seek: number;
}

export const ZOMBIES: Record<ZombieKind, ZombieDef> = {
  walker: { name: '丧尸', hp: 1, speed: 3.2, radius: 0.36, scale: 1, kills: 1, coins: 1, seek: 3.2 },
  runner: { name: '疾行尸', hp: 0.6, speed: 6.4, radius: 0.32, scale: 0.92, kills: 1, coins: 1, seek: 4.2 },
  brute: { name: '胖尸', hp: 7, speed: 2.4, radius: 0.62, scale: 1.55, kills: 4, coins: 4, seek: 3.2 },
  exploder: { name: '自爆尸', hp: 2, speed: 3, radius: 0.46, scale: 1.18, kills: 0, coins: 2, seek: 3.8 },
  giant: { name: '巨尸', hp: 80, speed: 2.1, radius: 1.05, scale: 2.5, kills: 0, coins: 25, seek: 6.5 },
};

/** 自爆尸爆炸半径（伤士兵和伤丧尸） */
export const EXPLODE_RADIUS = 1.9;
/** 巨尸每次砸地的间隔 */
export const GIANT_SMASH_INTERVAL = 0.65;

/** 进入 Boss 战时队伍停在 Boss 前方多远 */
export const BOSS_STOP = 24;

export type BossKind = 'brute' | 'thrower' | 'hive';

export interface BossDef {
  name: string;
  radius: number;
  scale: number;
  speed: number;
  /** 血量占 Boss 总血量预算的比例 */
  hp: number;
  desc: string;
}

export const BOSSES: Record<BossKind, BossDef> = {
  brute: { name: '巨尸王', radius: 1.7, scale: 3, speed: 2, hp: 1, desc: '冲到跟前砸地' },
  thrower: { name: '投弹屠夫', radius: 1.6, scale: 2.7, speed: 1.3, hp: 0.8, desc: '远处扔油桶，看准红圈躲开' },
  hive: { name: '尸巢母体', radius: 1.9, scale: 2.6, speed: 0.9, hp: 0.85, desc: '不停孵出疾行尸，打死它小怪全灭' },
};

export const BOSS_SMASH_INTERVAL = 1.05;
export const THROW_INTERVAL = 2.3;
export const THROW_FLIGHT = 1.35;
export const THROW_RADIUS = 2.1;
export const HIVE_INTERVAL = 3.2;

export interface WeaponDef {
  name: string;
  /** 每名士兵每秒发射数 */
  rate: number;
  damage: number;
  /** 子弹颜色 */
  color: number;
  /** 枪模型的长度 */
  length: number;
  /** 弹道：横向散布（米/秒，越大越“泼”）和弹速倍数 */
  spread: number;
  speed: number;
  /** 弹道特点（换枪时的提示） */
  trait: string;
}

export const WEAPONS: WeaponDef[] = [
  { name: '手枪', rate: 3, damage: 1, color: 0xfff1b0, length: 0.22, spread: 0.35, speed: 0.9, trait: '单发点射' },
  { name: '冲锋枪', rate: 5, damage: 1, color: 0xffd27a, length: 0.32, spread: 1.1, speed: 1, trait: '扇形连射' },
  { name: '突击步枪', rate: 5, damage: 1.4, color: 0xffb347, length: 0.46, spread: 0.5, speed: 1.1, trait: '橙色曳光弹' },
  { name: '战术步枪', rate: 6, damage: 1.5, color: 0x8fd3ff, length: 0.5, spread: 0.12, speed: 1.45, trait: '高速精准光线' },
  { name: '加特林', rate: 9, damage: 1.25, color: 0x7fffd4, length: 0.52, spread: 1.5, speed: 1.15, trait: '超高射速弹幕' },
  { name: '黄金步枪', rate: 6, damage: 2.2, color: 0xffd700, length: 0.5, spread: 0.3, speed: 1.25, trait: '黄金重弹' },
  { name: '等离子炮', rate: 8, damage: 2, color: 0xd59bff, length: 0.56, spread: 0.4, speed: 0.75, trait: '等离子光球' },
];

export function soldierDps(tier: number): number {
  return WEAPONS[tier].rate * WEAPONS[tier].damage;
}


/** 防线模式：东西从多远处刷出来 */
export const DEFENSE_SPAWN_D = 62;
/** 防线门道队列在多远以内看得见（再远的先不画）；障碍一进这个范围就定好血量，之后不再变 */
export const DEFENSE_VIEW_D = DEFENSE_SPAWN_D + 14;
/** 防线模式：两条道之间的隔离墙从这里开始，下面是交战区，丧尸会拐过来 */
export const DEFENSE_WALL_D = 13;

export type GameMode = 'defense' | 'campaign' | 'endless';

export interface ModeDef {
  id: GameMode;
  name: string;
  desc: string;
  /** 战役第几关解锁 */
  unlock: number;
}

export const MODES: ModeDef[] = [
  { id: 'defense', name: '防线', desc: '原地死守：一边数字门和重甲补给滑过来，一边尸潮和 Boss 涌过来', unlock: 1 },
  { id: 'campaign', name: '冲锋', desc: '一路冲到底，终点有 Boss，第 5 关起双 Boss', unlock: 1 },
  { id: 'endless', name: '无尽', desc: '一直跑下去，越来越难，看能跑多远', unlock: 2 },
];

export interface SkinDef {
  id: string;
  name: string;
  /** 头盔和裤子 */
  team: number;
  /** 上衣 */
  shirt: number;
  price: number;
}

export const SKINS: SkinDef[] = [
  { id: 'green', name: '丛林绿', team: 0x2fd14a, shirt: 0xeae6f2, price: 0 },
  { id: 'blue', name: '海军蓝', team: 0x2f8cf0, shirt: 0xdfe5ea, price: 300 },
  { id: 'yellow', name: '沙漠黄', team: 0xf5c518, shirt: 0xf1ecf4, price: 600 },
  { id: 'purple', name: '暗影紫', team: 0x9b5cf6, shirt: 0xe9e3f5, price: 1000 },
  { id: 'black', name: '黑金', team: 0x2b2b33, shirt: 0xf3d36b, price: 2000 },
];

export type UpgradeId = 'soldiers' | 'damage' | 'rate' | 'income' | 'agility';

/** 一条升级线上的“进化”：到这一级时解锁的东西 */
export interface Evolution {
  at: number;
  name: string;
}

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  /** 用什么买：金币，或者稀有的钻石（兵力） */
  currency: 'coins' | 'gems';
  /** 当前等级的效果说明（短） */
  value: (lvl: number) => string;
  max: number;
  cost: (lvl: number) => number;
  /** 进化节点：火力换开局枪械，射速换子弹，兵力加数字门 */
  evolutions: Evolution[];
}

/** 火力线：到这些等级开局就换更好的枪（对应 WEAPONS 下标 1、2、3、4） */
export const WEAPON_EVOLVE = [6, 13, 21, 30];

/** 射速线的子弹：穿透几个丧尸、溅射半径和溅射伤害比例 */
export interface AmmoDef {
  name: string;
  pierce: number;
  splash: number;
  splashDmg: number;
  /** 子弹颜色（覆盖枪的颜色），null 表示用枪的颜色 */
  color: number | null;
}
export const AMMO: AmmoDef[] = [
  { name: '普通弹', pierce: 0, splash: 0, splashDmg: 0, color: null },
  { name: '穿甲弹', pierce: 1, splash: 0, splashDmg: 0, color: 0x7fe7ff },
  { name: '爆裂弹', pierce: 1, splash: 0.9, splashDmg: 0.4, color: 0xff9a3c },
  { name: '电磁弹', pierce: 2, splash: 1.2, splashDmg: 0.5, color: 0xb98cff },
];
export const AMMO_EVOLVE = [8, 16, 25];

/** 兵力线：到这些等级数字门各加 10%（三条线的进化节点错开，每段时间都有一条线“最划算”） */
export const GATE_EVOLVE = [3, 6, 10, 15, 20];

const tierAt = (lvl: number, steps: number[]) => steps.filter((s) => lvl >= s).length;

export const UPGRADES: UpgradeDef[] = [
  {
    id: 'soldiers',
    name: '兵力',
    currency: 'gems',
    value: (l) => `${startSoldiers(l)} 人`,
    max: 25,
    // 兵力最直接，只能用钻石买（只有最终 Boss 稳定给），越往后越贵
    cost: (l) => 3 + l + Math.floor((l * l) / 5),
    evolutions: GATE_EVOLVE.map((at, i) => ({ at, name: `数字门 +${(i + 1) * 10}%` })),
  },
  {
    id: 'damage',
    name: '火力',
    currency: 'coins',
    value: (l) => `+${l * 12}%`,
    max: 40,
    cost: (l) => Math.round(50 * Math.pow(1.26, l)),
    evolutions: WEAPON_EVOLVE.map((at, i) => ({ at, name: WEAPONS[i + 1].name })),
  },
  {
    id: 'rate',
    name: '射速',
    currency: 'coins',
    value: (l) => `+${l * 8}%`,
    max: 25,
    cost: (l) => Math.round(60 * Math.pow(1.28, l)),
    evolutions: AMMO_EVOLVE.map((at, i) => ({ at, name: AMMO[i + 1].name })),
  },
  {
    id: 'income',
    name: '金币',
    currency: 'coins',
    value: (l) => `×${(1 + l * 0.08).toFixed(2)}`,
    // 金币倍数会滚雪球：封顶约 ×2，价格涨得比战斗升级陡
    max: 12,
    cost: (l) => Math.round(90 * Math.pow(1.42, l)),
    evolutions: [],
  },
  {
    id: 'agility',
    name: '机动',
    currency: 'coins',
    value: (l) => `+${l * 10}%`,
    max: 15,
    cost: (l) => Math.round(45 * Math.pow(1.3, l)),
    evolutions: [{ at: 5, name: '炸弹预警更长' }, { at: 10, name: '炸弹预警再长' }],
  },
];

/** 开局就一个人，兵力升级每级 +2 */
export function startSoldiers(lvl: number): number {
  return 1 + lvl * 2;
}

export function damageMult(lvl: number): number {
  return 1 + lvl * 0.12;
}

export function rateMult(lvl: number): number {
  return 1 + lvl * 0.08;
}

/** 全部局外升级折算成开局参数（游戏、测试、平衡脚本共用） */
export interface UpgradeEffects {
  startSoldiers: number;
  damageMult: number;
  rateMult: number;
  /** 开局武器 */
  startTier: number;
  /** 子弹种类（AMMO 下标） */
  ammo: number;
  /** 数字门（加人门）倍数 */
  gateBonus: number;
  /** 结算金币倍数 */
  coinMult: number;
  /** 左右挪动速度倍数 */
  steerMult: number;
  /** 投弹落地前的预警时间倍数 */
  warnMult: number;
}

export function upgradeEffects(up: Partial<Record<UpgradeId, number>>): UpgradeEffects {
  const lv = (id: UpgradeId) => up[id] ?? 0;
  return {
    startSoldiers: startSoldiers(lv('soldiers')),
    damageMult: damageMult(lv('damage')),
    rateMult: rateMult(lv('rate')),
    startTier: tierAt(lv('damage'), WEAPON_EVOLVE),
    ammo: tierAt(lv('rate'), AMMO_EVOLVE),
    gateBonus: 1 + 0.1 * tierAt(lv('soldiers'), GATE_EVOLVE),
    coinMult: 1 + 0.08 * lv('income'),
    steerMult: 1 + 0.1 * lv('agility'),
    warnMult: 1 + 0.12 * tierAt(lv('agility'), [5, 10]),
  };
}
