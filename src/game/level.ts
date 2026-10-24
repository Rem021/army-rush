import { isBossLevel, isRestLevel } from './economy';
import {
  BOSSES,
  DEFENSE_SPAWN_D,
  DEFENSE_WALL_D,
  EMIT_CAP,
  GATE_GROWTH,
  HALVES,
  LANE_HALF,
  LANES,
  TRACK_HALF,
  WALL_HALF,
  WEAPONS,
  ZOMBIES,
  gateBaseStep,
  soldierDps,
  type BossKind,
  type GameMode,
  type ZombieKind,
} from './config';
import { mulberry32, pickWeighted, randInt, randRange, shuffle, type Rng } from './rng';

export type GateKind = 'add' | 'mul' | 'weapon' | 'rate';

export type Reward =
  | { kind: 'weapon'; tier: number }
  | { kind: 'soldiers'; amount: number }
  | { kind: 'coins'; amount: number }
  | { kind: 'airstrike' }
  | { kind: 'rate'; amount: number };

export interface GateSpec {
  /** 狂潮复刻：固定蓝色 +1 / 黄色 +99 弹药牌。 */
  carnage?: 'recruit' | 'ammo';
  kind: GateKind;
  x0: number;
  x1: number;
  d: number;
  /** add：人数；mul：倍数；weapon：武器等级；rate：射速百分比 */
  value: number;
  /** 同组的门只能穿过一个 */
  group: number;
}

export interface BarrelSpec {
  /** 狂潮专用多管火箭架；数字为剩余耐久。 */
  carnage?: 'battery' | 'pod';
  x: number;
  d: number;
  r: number;
  hp: number;
  reward: Reward;
  look: 'barrel' | 'tires' | 'cage' | 'crate' | 'armor';
  /** 防线门道里的大障碍：停在 stopD 挡住后面的门 */
  block?: boolean;
}

export interface ZombieSpec {
  x: number;
  d: number;
  kind: ZombieKind;
  hp: number;
  /** 巨尸被打死掉落 */
  reward?: Reward;
  /** 一只顶几只：尸潮超过上限时，多出来的折算到每只的血量和杀伤上 */
  weight?: number;
}

export interface BossSpec {
  kind: BossKind;
  x: number;
  hp: number;
}

/** 中间隔离墙，队伍进去后只能待在一侧 */
export interface WallSpec {
  d0: number;
  d1: number;
}

export interface HazardSpec {
  kind: 'spikes' | 'saw';
  x0: number;
  x1: number;
  d0: number;
  d1: number;
}

export interface BannerSpec {
  d: number;
  text: string;
  tone: 'info' | 'danger' | 'boss';
}

/** 防线模式按时间刷的东西 */
export interface SpawnSpec {
  t: number;
  /** 血量由世界在刷出来那一刻按当时火力算 */
  boss?: BossSpec;
  zombie?: ZombieSpec;
  banner?: BannerSpec;
  /** 一大波尸潮的人数，血量按当时的尸潮算 */
  wave?: number;
  /** 门道里窜出几只疾行尸 */
}

export interface DefenseSpec {
  /** 门道队列往前挪的速度 */
  conveyor: number;
  /** 丧尸刷新点 */
  spawnD: number;
  /** 重甲障碍停在这里，后面的门排队等着，打掉了才继续往前 */
  stopD: number;
  /** 门在哪一侧（-1 左，1 右），另一侧是尸潮 */
  gateSide: -1 | 1;
  /** 最终 Boss 出现的时间，进度条按它算 */
  duration: number;
  spawns: SpawnSpec[];
}

export interface LevelSpec {
  mode: GameMode;
  level: number;
  /** 0 白天，1 黄昏，2 傍晚 */
  theme: number;
  /** Boss 所在位置；无尽模式为 Infinity */
  length: number;
  gates: GateSpec[];
  barrels: BarrelSpec[];
  zombies: ZombieSpec[];
  walls: WallSpec[];
  hazards: HazardSpec[];
  banners: BannerSpec[];
  bosses: BossSpec[];
  /** 防线模式的刷新表 */
  defense: DefenseSpec | null;
  /** 生成时估算的到达 Boss 时人数，调试和平衡用 */
  expected: number;
  estimates: { d: number; E: number; tier: number; seg: string }[];
}

/**
 * 平衡参数。生成器一边摆放内容一边估算玩家此时的人数 E、武器等级和射速，
 * 尸潮、桶血量、巨尸和 Boss 血量都按这个估算来定，所以滚雪球的关卡后面也有压力。
 */
export const TUNING = {
  /** 一波尸潮人数占估算人数的比例（人多时按 0.6 次方放缓） */
  hordeFrac: (L: number) => Math.min(1.35, 0.72 + 0.05 * L),
  /** 普通丧尸要挨几发 */
  zombieHits: (L: number) => Math.min(7.5, 2.8 + 0.32 * L),
  /** 估算每波会冲到脸上的比例 */
  leak: (L: number) => Math.min(0.32, 0.1 + 0.018 * L),
  /** 桶血量 = 估算秒伤 × 这个秒数 */
  crateSeconds: (L: number) => Math.min(3.4, 1.1 + 0.16 * L),
  /** 巨尸血量 = 估算秒伤 × 这个秒数 */
  giantSeconds: (L: number) => Math.min(6, 2.2 + 0.3 * L),
  /** Boss 总血量 = 估算秒伤 × 这个秒数 */
  bossSeconds: (L: number) => L === 1 ? 8.5 : Math.min(22, 10 + 0.9 * L),
  addGate: (L: number) => 1 + Math.floor(L / 5),
  badGate: (L: number) => 5 + Math.floor(L * 1.5),
  /** 到 Boss 时的基准兵力（按正常升级的玩家校准） */
  baseline: (L: number) => 17 + 4 * L,
};

/** 人质笼只补少量兵力，避免队伍越大、奖励越滚越多。 */
function cageSoldiers(L: number, count: number): number {
  return Math.max(1, Math.round(1 + L / 3 + count * 0.025));
}

/**
 * 难度曲线：关卡进度 p 处“应该”有的兵力。尸潮、桶、巨尸、Boss 都按它来定规模，
 * 不跟着玩家的实际选择走，所以选得好就比曲线强、选得差就吃力，不会互相放大误差。
 */
export function baselineCount(L: number, p: number, start = 3): number {
  return start + (TUNING.baseline(L) - start) * Math.pow(Math.max(0, Math.min(1, p)), 1.5);
}

export interface Feats {
  runner: boolean;
  exploder: boolean;
  brute: boolean;
  giant: boolean;
  walls: boolean;
  hazards: boolean;
  rateGates: boolean;
  weaponGates: boolean;
}

export function featsFor(L: number): Feats {
  return {
    runner: L >= 2,
    exploder: L >= 3,
    brute: L >= 5,
    giant: L >= 3,
    walls: L >= 2,
    hazards: L >= 4,
    rateGates: L >= 2,
    weaponGates: L >= 3,
  };
}

export function maxWeaponTier(L: number): number {
  return Math.min(WEAPONS.length - 1, 2 + Math.floor((L - 1) / 2));
}

/** 生成器状态，无尽模式会一直沿用 */
export interface Gen {
  spec: LevelSpec;
  rng: Rng;
  L: number;
  E: number;
  tier: number;
  /** 射速加成倍数 */
  rate: number;
  group: number;
  topTier: number;
  feats: Feats;
  /** 尸潮人数额外倍数（无尽模式随距离上涨） */
  hordeMul: number;
  /** 给定位置的基准兵力；无尽模式为 null，由距离预算和生成器维护 */
  base: ((d: number) => number) | null;
  /** 丧尸血量额外倍数（无尽模式随距离上涨） */
  hpMul: number;
}

const HORDE_CAP = 150;

type Template = 'triad' | 'sideHorde' | 'fullHorde' | 'pickLane' | 'crates' | 'ladder' | 'miniBoss' | 'hazards';

function emptySpec(mode: GameMode, level: number, theme: number, length: number): LevelSpec {
  return {
    mode,
    level,
    theme,
    length,
    gates: [],
    barrels: [],
    zombies: [],
    walls: [],
    hazards: [],
    banners: [],
    bosses: [],
    defense: null,
    expected: 0,
    estimates: [],
  };
}

export function createGen(spec: LevelSpec, seed: number, L: number, E: number, tier: number, rate = 1): Gen {
  return {
    spec,
    rng: mulberry32(seed),
    L,
    E,
    tier,
    rate,
    group: 0,
    topTier: maxWeaponTier(Math.ceil(L)),
    feats: featsFor(L),
    hordeMul: 1,
    base: null,
    hpMul: 1,
  };
}

// ---------- 各模式入口 ----------

export function campaignBosses(L: number): BossKind[] {
  const cycle: BossKind[] = ['brute', 'thrower', 'hive'];
  if (L <= 2) return ['brute'];
  const a = cycle[(L - 1) % 3];
  if (L % 5 === 0) return [a, cycle[L % 3]];
  return [a];
}

export function generateLevel(level: number): LevelSpec {
  return generateCampaign(level);
}

export function generateCampaign(level: number, seed?: number): LevelSpec {
  const L = Math.max(1, Math.floor(level));
  const length = 260 + Math.min(L, 16) * 16;
  const spec = emptySpec('campaign', L, (L - 1) % 3, length);
  const startE = 3;
  const g = createGen(spec, seed ?? L * 7919 + 13, L, startE, 0);
  g.base = (d) => baselineCount(L, d / length, startE);

  let d = 22;
  // 开头固定：一组好门 + 几只普通丧尸，然后武器桶和人质笼，让小部队先滚起来
  if (L === 1) spec.banners.push({ d: d - 6, text: '左右拖动，选更大的门', tone: 'info' });
  d = opening(g, d);

  let last: Template | null = null;
  let giants = 0;
  const giantMax = L >= 7 ? 2 : g.feats.giant ? 1 : 0;
  while (d < length - 70) {
    const p = d / length;
    const f = g.feats;
    const weights: [Template, number][] = [
      ['triad', 3.2],
      ['sideHorde', 2.2],
      ['fullHorde', 1.4 + 0.08 * L],
      ['pickLane', f.walls && p > 0.15 ? 1.6 : 0],
      ['crates', g.tier < g.topTier ? 1.8 : 0.9],
      ['ladder', L >= 2 ? 1 : 0],
      ['miniBoss', f.giant && g.E >= 25 && giants < giantMax && p > 0.3 ? 1.6 : 0],
      ['hazards', f.hazards ? 1.2 : 0],
    ];
    // 过了一半还没出过巨尸，就安排一个
    const forceGiant: boolean = giantMax > 0 && giants === 0 && p > 0.55 && last !== 'miniBoss';
    const t: Template = forceGiant ? 'miniBoss' : pickWeighted(g.rng, weights.filter(([s, w]) => s !== last && w > 0));
    last = t;
    if (t === 'miniBoss') giants++;
    d = runTemplate(g, t, d);
    d += randRange(g.rng, 6, 12);
  }
  finale(g, length);
  return finish(g);
}

/** 无尽模式的开头一段；后续内容由 extendEndless 按距离预算续上 */
export function generateEndlessStart(seed: number): { spec: LevelSpec; gen: Gen; until: number } {
  const spec = emptySpec('endless', 1, 0, Infinity);
  const gen = createGen(spec, seed, 1, 3, 0);
  const until = opening(gen, 22);
  sortSpec(spec);
  return { spec, gen, until };
}

/** 每局开头：两扇好门 + 几只普通丧尸，然后武器桶和人质笼 */
function opening(g: Gen, d: number): number {
  const { rng, L } = g;
  if (g.base) g.E = g.base(d);
  const a = Math.max(3, TUNING.addGate(L) + 1);
  const b = Math.max(1, Math.round(a / 3));
  const group = g.group++;
  const [left, right] = rng() < 0.5 ? [a, b] : [b, a];
  g.spec.gates.push({ kind: 'add', x0: -TRACK_HALF, x1: -LANE_HALF, d: d + 18, value: left, group });
  g.spec.gates.push({ kind: 'add', x0: LANE_HALF, x1: TRACK_HALF, d: d + 18, value: right, group });
  horde(g, -LANE_HALF + 0.3, LANE_HALF - 0.3, d + 4, 3, { walker: 1 });
  chooseBest(g, [{ kind: 'add', value: a }, { kind: 'add', value: b }]);
  d += 28;
  const kinds: ('weapon' | 'cage')[] = g.tier < g.topTier ? ['weapon', 'cage'] : ['cage'];
  if (L === 1) kinds.pop();
  crateRow(g, d, kinds);
  return d + 26;
}

/** 无尽模式续生成：同一种子和距离使用同一预算，不读取玩家强度。 */
export function extendEndless(gen: Gen, from: number, to: number) {
  const added = emptySpec('endless', 1, 0, Infinity);
  const prev = gen.spec;
  gen.spec = added;
  let d = from;
  while (d < to) {
    gen.L = 1 + d / 260;
    // 超过关卡难度上限后继续加码：尸潮更大、更耐打
    gen.hordeMul = 1 + d / 900;
    gen.hpMul = 1 + d / 1100;
    gen.feats = featsFor(gen.L);
    gen.topTier = maxWeaponTier(Math.ceil(gen.L));
    // 距离继续加压；枪械和射速预算沿用生成器的预期取门路线，不追涨实际升级。
    gen.E = Math.max(3, 15 * Math.exp(d / 700));
    const giantDue = gen.feats.giant && Math.floor(d / 420) > Math.floor((d - 60) / 420);
    const t: Template = giantDue
      ? 'miniBoss'
      : pickWeighted(gen.rng, [
          ['triad', 3],
          ['sideHorde', 2],
          ['fullHorde', 1.6],
          ['pickLane', gen.feats.walls ? 1.2 : 0],
          ['crates', 1.4],
          ['ladder', 0.8],
          ['hazards', gen.feats.hazards ? 1.2 : 0],
        ] as [Template, number][]);
    d = runTemplate(gen, t, d) + randRange(gen.rng, 5, 10);
  }
  gen.spec = prev;
  sortSpec(added);
  return { added, until: d };
}

// ---------- 防线模式 ----------

export const DEFENSE_TUNING = {
  /** 一关多长（秒）：前几关短一点，输了很快能再来 */
  duration: (L: number) => Math.min(150, 62 + 9 * L),
  /** 门道队列放行后的速度（米/秒）：打掉障碍，后面的门很快冲到脸上 */
  conveyor: 16,
  stopD: 19,
  spacing: 8.5,
  /** 打到最后时的基准兵力，用来算“预期火力” */
  baseline: (L: number) => 44 + 11 * (L - 1),
  /** 持续尸潮要吃掉参考火力的几成（每秒刷出的总血量 / 参考火力）；封顶 0.72，留出打障碍和 Boss 的余量 */
  pressure: (L: number, p: number) => Math.min(0.72, (0.25 + 0.35 * p) * (1 + 0.055 * (L - 1))),
  /** 每秒刷几只 */
  streamRate: (L: number, p: number) => Math.min(6, 2.35 + 2.1 * p + 0.1 * L),
  /** 普通丧尸至少要挨几发手枪（照顾刚开局的小部队） */
  minHits: (L: number) => 2 + 0.3 * Math.min(L, 30),
  /** 大障碍要全力打几秒 */
  blockerSeconds: (L: number) => Math.min(16, 8 + 0.7 * L),
  waveEvery: (L: number) => Math.max(10, 15 - 0.4 * L),
  /** 一大波的总血量 = 这么多秒的持续尸潮（人数多，单只血量相应摊薄） */
  waveSeconds: (L: number, p: number) => 4.5 + 4 * p + 0.15 * L,
  waveSize: (L: number, p: number) => Math.min(100, Math.round(10 + 3 * L + 26 * p)),
  bossSeconds: (L: number) => Math.min(24, 12 + L) * Math.pow(0.85, Math.max(0, L - 7)),
  /** 中途一批批来的 Boss：几只、每只要全力打几秒 */
  midBosses: (L: number) => (L === 1 ? 1 : L <= 4 ? 2 : 3),
  midSeconds: (L: number) => Math.min(18, 9 + 0.6 * L),
  /** 关底的预期火力（每秒伤害）；第 5 关起多涨一截，后面的关要靠永久升级 */
  /** 局外升级有进化、金币倍数；低人数上限下每关参考火力先涨 20%，中段再加一点。 */
  expectedEnd: (L: number) => {
    const early = Math.pow(1.2, Math.min(L - 1, 8));
    const middle = Math.pow(1.15, Math.max(0, Math.min(7, L - 9)));
    // 第 16 关后渐缓，匹配兵力与升级上限，避免无限指数血量墙。
    const late = 1 + 0.25 * (1 - Math.exp(-Math.max(0, L - 16) / 8));
    return 12500 * DEFENSE_TUNING.scale * early * middle * late * (1 + 0.03 * Math.min(L - 1, 8)) * sawtooth(L) * pacing(L);
  },
  /** 整体难度系数；缩小门和障碍的增兵后，按成长模拟重新校准 */
  scale: 0.064,
  /**
   * 第 seg 个大障碍的血量：第一个很好打（开局一个人几秒打掉），之后一个比一个高一大截——
   * 前面每个约是上一个的 3.7 倍，往后慢慢降到约 2.5 倍。门道打得越深越难，后面的障碍要硬拆就得放着尸潮不管
   */
  blockerHp: (L: number, seg: number) => {
    let hp = 40 * DEFENSE_TUNING.blockerScale * Math.pow(1.2, Math.min(19, L - 1)) * (1 + 0.35 * (1 - Math.exp(-Math.max(0, L - 20) / 10))) * pacing(L) * sawtooth(L);
    for (let i = 0; i < seg; i++) hp *= DEFENSE_TUNING.blockerGrowth + 1.2 * Math.exp(-i / 3);
    return hp;
  },
  blockerGrowth: 2.5,
  blockerScale: 0.7,
  /** 开局几秒内不刷尸潮，让一个人先把第一个障碍打掉 */
  streamDelay: 2.5,
  giantSeconds: (L: number) => Math.min(6, 2.5 + 0.3 * L),
};

/**
 * 按成长模拟校准的节奏修正：第 1 关提供零升级通过的机会，
 * 前中段玩家升级来得快（价格低、进化集中），难度跟上去；后段本来就难，往回收一点。
 */
function pacing(L: number): number {
  if (L === 1) return 0.30;
  // 第 2 关单独压低：刚过第 1 关时升级还很少，不能一下子难七成
  if (L === 2) return 0.64;
  return 0.62 + 0.7 * (1 - Math.exp(-(L - 1) / 3)) - 0.4 * Math.max(0, Math.min(1, (L - 10) / 6));
}

/**
 * 锯齿形难度：每 5 关一个 Boss 关，下一关放松 12%。
 * Boss 关的加成看是哪对 Boss：带投弹手的两对（炸弹圈一炸一片）本身就难，加成小一点
 */
const BOSS_LEVEL_HARD = [1.22, 1.1, 1.12];
function sawtooth(L: number): number {
  if (isBossLevel(L)) return BOSS_LEVEL_HARD[(L / 5 - 1) % 3];
  return isRestLevel(L) ? 0.88 : 1;
}

export function defenseBosses(L: number): BossKind[] {
  const cycle: BossKind[] = ['brute', 'hive', 'thrower'];
  // Boss 关（每 5 关）最终是双 Boss
  if (isBossLevel(L)) {
    const pairs: BossKind[][] = [['brute', 'hive'], ['thrower', 'brute'], ['hive', 'thrower']];
    return pairs[(L / 5 - 1) % 3];
  }
  // 单 Boss 关按顺序轮换三种
  return [cycle[(L - Math.floor(L / 3) - 1) % 3]];
}

/** 防线中途第 i 批 Boss 的种类：三种轮换，最后一批和最终 Boss 不重样 */
export function defenseMidBoss(L: number, i: number): BossKind {
  const cycle: BossKind[] = ['brute', 'hive', 'thrower'];
  const finals = defenseBosses(L);
  const n = DEFENSE_TUNING.midBosses(L);
  for (let k = 0; k < 3; k++) {
    const kind = cycle[(L + i + k) % 3];
    if (i < n - 1 || !finals.includes(kind)) return kind;
  }
  return cycle[(L + i) % 3];
}

/** 防线中途 Boss 的出场时间（占整关时长的比例） */
export function defenseMidTimes(L: number): number[] {
  const n = DEFENSE_TUNING.midBosses(L);
  if (n === 1) return [0.5];
  return Array.from({ length: n }, (_, i) => 0.24 + (i * 0.5) / (n - 1));
}

/**
 * 防线：队伍守在桥头不动。
 * 门道是一条排队的队列：几扇数字门，然后一个很耐打的大障碍（武器箱、装甲路障、补给箱），
 * 障碍滑到 stopD 就卡住，后面的门跟着停；打掉它，队列才继续往前，到下一个障碍又卡住。
 * 另一侧源源不断地刷丧尸（血量使用固定关卡预算，见 World），中途有巨尸和精英，最后是 Boss。
 */
export function generateDefense(level: number): LevelSpec {
  const L = Math.max(1, Math.floor(level));
  const T = DEFENSE_TUNING.duration(L);
  const spec = emptySpec('defense', L, (L - 1) % 3, Infinity);
  const g = createGen(spec, L * 104729 + 7, L, 3, 0);
  const rng = g.rng;
  const gateSide: -1 | 1 = rng() < 0.5 ? -1 : 1;
  const spawns: SpawnSpec[] = [];
  spec.defense = { conveyor: DEFENSE_TUNING.conveyor, spawnD: DEFENSE_SPAWN_D, stopD: DEFENSE_TUNING.stopD, gateSide, duration: T, spawns };
  spec.walls.push({ d0: DEFENSE_WALL_D, d1: DEFENSE_SPAWN_D + 60 });

  const gx0 = gateSide < 0 ? -TRACK_HALF : WALL_HALF;
  const gx1 = gateSide < 0 ? -WALL_HALF : TRACK_HALF;
  const gx = (gx0 + gx1) / 2;
  const ex = -gx;

  // 门道队列：每段先是一个大障碍（开局第一个就是），打掉以后冲过来 3–4 扇门
  const gap = DEFENSE_TUNING.spacing;
  // 第一个障碍放在卡住的位置稍后一点，开局一秒后滑过来卡住
  let d = DEFENSE_TUNING.stopD + 3;
  let tier = 0;
  const topTier = maxWeaponTier(L);
  const blockers: ('weapon' | 'armor' | 'strike' | 'rate')[] = [];
  // 奖励门按固定顺序轮换，免得某一关运气好连出几个 ×2、另一关一个都没有
  const bonusCycle: ('rate' | 'mul' | 'weapon')[] = L >= 3 ? ['rate', 'weapon', 'mul', 'rate', 'weapon', 'rate'] : ['rate', 'weapon', 'rate'];
  for (let seg = 0; d < 760; seg++) {
    // 大障碍：先给武器，武器给满后轮换装甲路障（给人）/补给箱（空袭）/射速箱。
    // 血量一个比一个高很多（见 blockerHp），关卡里直接写好，出现时看到的数字之后不变
    let kind: (typeof blockers)[number];
    if (tier < topTier && (seg % 2 === 0 || seg < 2)) kind = 'weapon';
    else kind = (['armor', 'strike', 'armor', 'rate'] as const)[seg % 4];
    blockers.push(kind);
    const r = 2.0;
    const hp = Math.round(DEFENSE_TUNING.blockerHp(L, seg));
    if (kind === 'weapon') {
      tier = Math.min(topTier, tier + 1);
      spec.barrels.push({ x: gx, d, r, hp, reward: { kind: 'weapon', tier }, look: 'tires', block: true });
    } else if (kind === 'armor') {
      spec.barrels.push({ x: gx, d, r, hp, reward: { kind: 'soldiers', amount: Math.round(1 + L / 2 + seg * 0.5) }, look: 'armor', block: true });
    } else if (kind === 'strike') {
      spec.barrels.push({ x: gx, d, r, hp, reward: { kind: 'airstrike' }, look: 'crate', block: true });
    } else {
      spec.barrels.push({ x: gx, d, r, hp, reward: { kind: 'rate', amount: 8 }, look: 'crate', block: true });
    }
    // 障碍后面多留点空，免得它头上的奖励牌挡住后面那扇门的数字
    d += gap + 5;

    const n = 3 + (rng() < 0.4 ? 1 : 0);
    const bonusAt = seg >= 1 ? randInt(rng, 0, n - 1) : -1;
    for (let i = 0; i < n; i++) {
      let gate: GateSpec;
      if (i === bonusAt) {
        const bonus = bonusCycle[(seg - 1) % bonusCycle.length];
        gate =
          bonus === 'mul'
            ? { kind: 'mul', x0: gx0, x1: gx1, d, value: 1.25, group: g.group++ }
            : bonus === 'rate'
              ? { kind: 'rate', x0: gx0, x1: gx1, d, value: randInt(rng, 2, 6) * 2, group: g.group++ }
              : { kind: 'weapon', x0: gx0, x1: gx1, d, value: Math.max(1, tier), group: g.group++ };
      } else {
        // 门道全是正门（越往后数字越大），朝它开枪还能再往上打
        const value = TUNING.addGate(L) + 1 + randInt(rng, 0, 1) + Math.min(3, Math.floor(seg / 5));
        gate = { kind: 'add', x0: gx0, x1: gx1, d, value, group: g.group++ };
      }
      g.spec.gates.push(gate);
      d += gap;
    }
    d += 1.5;
  }

  // 尸潮道的大波（零散的持续刷新由世界按火力实时算）
  let wave = 0;
  for (let t = 12; t < T - 4; t += DEFENSE_TUNING.waveEvery(L)) {
    spawns.push({ t, wave: DEFENSE_TUNING.waveSize(L, t / T) });
    if (wave++ % 2 === 1) spawns.push({ t, banner: { d: 0, text: '尸潮来袭！', tone: 'danger' } });
  }
  // Boss 一批一批来，最后是最终 Boss；中间夹一只巨尸（血量都由世界在刷出时按火力算）
  const mids = defenseMidTimes(L);
  const finals = defenseBosses(L);
  const stages = mids.length + 1;
  mids.forEach((f, i) => {
    const t = T * f;
    spawns.push({ t, banner: { d: 0, text: `BOSS 来袭 ${i + 1}/${stages}`, tone: 'boss' } });
    spawns.push({ t, boss: { kind: defenseMidBoss(L, i), x: ex, hp: 0 } });
  });
  if (L >= 2) {
    const t = T * (mids.length >= 2 ? (mids[0] + mids[1]) / 2 : 0.3);
    spawns.push({ t, banner: { d: 0, text: '巨尸来袭！', tone: 'danger' } });
    spawns.push({ t, zombie: { kind: 'giant', x: ex, d: 0, hp: 0, reward: { kind: 'airstrike' } } });
  }
  spawns.push({ t: T, banner: { d: 0, text: finals.length > 1 ? '最终双 BOSS！' : '最终 BOSS！', tone: 'boss' } });
  finals.forEach((kind, i) => {
    const x = finals.length > 1 ? ex + (i === 0 ? -1 : 1) * 1.2 : ex;
    spawns.push({ t: T + i * 1.5, boss: { kind, x, hp: 0 } });
  });

  spawns.sort((a, b) => a.t - b.t);
  spec.gates.sort((a, b) => a.d - b.d);
  spec.expected = Math.round(baselineDefense(L, 1));
  return spec;
}

/** 防线的“预期兵力”曲线，算参考火力用；开头几秒还是开局兵力 */
export function baselineDefense(L: number, p: number): number {
  const q = Math.max(0, (p - 0.05) / 0.95);
  return 3 + (DEFENSE_TUNING.baseline(L) - 3) * Math.pow(q, 1.2);
}

/** 防线某时刻的参考火力，随关卡和进度增长；具体曲线由成长模拟校准。 */
export function expectedDefenseDps(L: number, p: number): number {
  const end = (globalThis as { __expScale?: number }).__expScale ?? DEFENSE_TUNING.expectedEnd(L);
  return Math.max(60, end * Math.pow(Math.max(0, Math.min(1, p)), 1.8));
}

/** 防线某时刻的预期武器等级 */
export function expectedDefenseTier(L: number, p: number): number {
  return Math.min(maxWeaponTier(L), Math.floor(1 + p * maxWeaponTier(L)));
}

// ---------- 模板 ----------

function runTemplate(g: Gen, t: Template, d: number): number {
  if (g.base) g.E = g.base(d);
  const before = g.E;
  let end = d;
  switch (t) {
    case 'triad':
      end = triad(g, d);
      break;
    case 'sideHorde':
      end = sideHorde(g, d);
      break;
    case 'fullHorde':
      end = fullHorde(g, d);
      break;
    case 'pickLane':
      end = pickLane(g, d);
      break;
    case 'crates':
      end = crateRow(g, d);
      break;
    case 'ladder':
      end = ladder(g, d);
      break;
    case 'miniBoss':
      end = miniBoss(g, d);
      break;
    case 'hazards':
      end = hazardRun(g, d);
      break;
  }
  g.spec.estimates.push({ d, E: Math.round(g.E), tier: g.tier, seg: `${t}${before > g.E ? '-' : '+'}` });
  return end;
}

type GateOpt = { kind: GateKind; value: number };

/** 左右是门、中间是尸潮：先打门还是先清丧尸？ */
function triad(g: Gen, d: number, mood: 'easy' | 'normal' = 'normal'): number {
  const { rng, L, feats } = g;
  const gd = d + 24;
  const good = TUNING.addGate(L) + randInt(rng, 0, 4);
  const bad = -(TUNING.badGate(L) + randInt(rng, 0, 4));
  const patterns: [GateOpt[], number][] = [
    [[{ kind: 'add', value: good }, { kind: 'add', value: bad }], 3],
    [[{ kind: 'add', value: good * 2 }, { kind: 'mul', value: 1.5 }], 1.4],
    [[{ kind: 'add', value: Math.round(bad * 0.6) }, { kind: 'add', value: Math.round(bad * 0.4) }], mood === 'easy' ? 0 : 1],
  ];
  if (feats.weaponGates && g.tier < g.topTier) {
    patterns.push([[{ kind: 'weapon', value: Math.max(1, g.tier) }, { kind: 'add', value: good }], 1.6]);
  }
  if (feats.rateGates) patterns.push([[{ kind: 'rate', value: randInt(rng, 3, 6) * 2 }, { kind: 'add', value: Math.round(bad * 0.5) }], 1.3]);
  const opts = pickWeighted(rng, patterns);
  const [a, b] = rng() < 0.5 ? opts : [opts[1], opts[0]];
  const group = g.group++;
  g.spec.gates.push({ ...a, x0: -TRACK_HALF, x1: -LANE_HALF, d: gd, group });
  g.spec.gates.push({ ...b, x0: LANE_HALF, x1: TRACK_HALF, d: gd, group });
  // 中间道的尸潮
  const count = hordeSize(g, mood === 'easy' ? 0.5 : 1.35);
  const m = mix(g);
  m.runner = (m.runner ?? 0) * 1.5;
  horde(g, -LANE_HALF + 0.2, LANE_HALF - 0.2, d + 4, count, m);
  chooseBest(g, [a, b, { kind: 'add', value: 0 }]);
  loseToHorde(g, count * 0.8);
  return gd + 6;
}

/** 一半是门，一半是尸潮（尸潮后面有人质笼） */
function sideHorde(g: Gen, d: number): number {
  const { rng, L, feats } = g;
  const side = rng() < 0.5 ? -1 : 1;
  const gx0 = side < 0 ? -TRACK_HALF : 0;
  const gd = d + 22;
  const roll = rng();
  let gate: GateOpt;
  if (feats.weaponGates && g.tier < g.topTier && roll < 0.3) gate = { kind: 'weapon', value: Math.max(1, g.tier) };
  else if (roll < 0.55 && L >= 3) gate = { kind: 'mul', value: 1.5 };
  else gate = { kind: 'add', value: TUNING.addGate(L) + randInt(rng, 0, 3) };
  g.spec.gates.push({ ...gate, x0: gx0, x1: gx0 + TRACK_HALF, d: gd, group: g.group++ });
  const hx0 = side < 0 ? 0.2 : -TRACK_HALF + 0.2;
  const count = hordeSize(g, 1);
  horde(g, hx0, hx0 + TRACK_HALF - 0.4, d + 4, count, mix(g));
  const amount = cageSoldiers(L, g.E);
  addBarrel(g, -side * HALVES[1], d + 26, crateHp(g, 0.8), { kind: 'soldiers', amount });
  const gateSide = outcomePower(g, gate);
  const hordeSideE = g.E + amount * 0.8 - count * TUNING.leak(L) * 1.2;
  if (gateSide.P >= hordeSideE * soldierDps(g.tier) * g.rate) applyOutcome(g, gateSide);
  else g.E = hordeSideE;
  loseToHorde(g, count * 0.4);
  return d + 32;
}

/** 整排尸潮，打过去后有一组门 */
function fullHorde(g: Gen, d: number): number {
  const { rng, L } = g;
  const count = hordeSize(g, 1.7);
  const m = mix(g);
  m.exploder = (m.exploder ?? 0) * 1.6;
  m.runner = (m.runner ?? 0) * 1.3;
  horde(g, -TRACK_HALF + 0.3, TRACK_HALF - 0.3, d + 2, count, m);
  loseToHorde(g, count * 0.7);
  const good = TUNING.addGate(L) + randInt(rng, 2, 5);
  pairGates(g, d + 26, { kind: 'add', value: good }, { kind: 'add', value: Math.max(1, Math.round(good / 3)) });
  return d + 32;
}

/** 隔离墙：进去前看清两边，选一边走到底 */
function pickLane(g: Gen, d: number): number {
  const { rng, L, feats } = g;
  const len = 52;
  g.spec.walls.push({ d0: d, d1: d + len });
  g.spec.banners.push({ d: d - 22, text: '选择道路！', tone: 'info' });
  const [safe, risky] = rng() < 0.5 ? [-1, 1] : [1, -1];
  const half = (s: number): [number, number] => (s < 0 ? [-TRACK_HALF, -WALL_HALF] : [WALL_HALF, TRACK_HALF]);
  const start = { E: g.E, tier: g.tier, rate: g.rate };

  // 稳的一边：小门 + 射速/武器门 + 少量丧尸
  const [s0, s1] = half(safe);
  const good = TUNING.addGate(L) + randInt(rng, 0, 3);
  g.spec.gates.push({ kind: 'add', x0: s0, x1: s1, d: d + 18, value: good, group: g.group++ });
  const second: GateOpt =
    feats.weaponGates && g.tier < g.topTier && rng() < 0.6
      ? { kind: 'weapon', value: Math.max(1, g.tier) }
      : { kind: 'rate', value: randInt(rng, 4, 7) * 2 };
  g.spec.gates.push({ ...second, x0: s0, x1: s1, d: d + 40, group: g.group++ });
  const safeCount = hordeSize(g, 0.3);
  horde(g, s0 + 0.3, s1 - 0.3, d + 26, safeCount, mix(g));
  applyOutcome(g, outcomePower(g, { kind: 'add', value: good }));
  const safeOut = outcomePower(g, second);
  const safeLoss = safeCount * TUNING.leak(L);

  // 险的一边：大尸潮（可能有巨尸）+ 人质笼 + 翻倍门
  applyOutcome(g, { ...start, P: 0 });
  const [r0, r1] = half(risky);
  const riskyCount = hordeSize(g, 1.15);
  horde(g, r0 + 0.3, r1 - 0.3, d + 4, riskyCount, mix(g));
  if (feats.giant && g.E >= 25 && rng() < 0.4) addGiant(g, (r0 + r1) / 2, d + 16, 0.6);
  const amount = cageSoldiers(L, g.E);
  addBarrel(g, (r0 + r1) / 2, d + 28, crateHp(g, 0.7), { kind: 'soldiers', amount });
  const mul = L >= 6 && rng() < 0.3 ? 1.5 : 1.25;
  g.spec.gates.push({ kind: 'mul', x0: r0, x1: r1, d: d + 44, value: mul, group: g.group++ });
  const riskyLoss = riskyCount * TUNING.leak(L) * 1.3 * Math.max(0.5, Math.min(2.5, riskyCount / Math.max(1, start.E)));
  const riskyE = Math.max(1, start.E - riskyLoss + amount * 0.7) * mul;

  const safeP = (safeOut.E - safeLoss) * soldierDps(safeOut.tier) * safeOut.rate;
  if (safeP >= riskyE * soldierDps(start.tier) * start.rate) {
    applyOutcome(g, safeOut);
    g.E = Math.max(3, g.E - safeLoss);
  } else {
    applyOutcome(g, { ...start, P: 0 });
    g.E = Math.max(3, riskyE * 0.9);
  }
  return d + len + 6;
}

/** 一排桶：武器、人质笼、空袭箱 */
function crateRow(g: Gen, d: number, force?: ('weapon' | 'cage' | 'airstrike' | 'coins')[]): number {
  const { rng, L } = g;
  const kinds = force ? [...force] : [];
  if (!force) {
    if (g.tier < g.topTier) kinds.push('weapon');
    kinds.push('cage');
    if (rng() < 0.5) kinds.push(rng() < 0.6 ? 'airstrike' : 'coins');
  }
  const lanes = force && kinds.length === 2 ? shuffle(rng, [0, 2]) : shuffle(rng, [0, 1, 2]).slice(0, kinds.length);
  kinds.forEach((k, i) => {
    const x = force && kinds.length === 1 ? HALVES[rng() < 0.5 ? 0 : 1] : LANES[lanes[i]];
    const dd = d + 10 + i * 3;
    if (k === 'weapon') {
      const tier = Math.min(g.topTier, g.tier + 1);
      addBarrel(g, x, dd, crateHp(g, 0.45 + 0.08 * tier), { kind: 'weapon', tier });
      g.tier = tier;
    } else if (k === 'cage') {
      const amount = cageSoldiers(L, g.E);
      addBarrel(g, x, dd, crateHp(g, 0.8), { kind: 'soldiers', amount });
      g.E += amount * 0.5;
    } else if (k === 'airstrike') {
      addBarrel(g, x, dd, crateHp(g, 0.6), { kind: 'airstrike' });
    } else {
      addBarrel(g, x, dd, crateHp(g, 0.5), { kind: 'coins', amount: 10 + Math.round(L * 4) });
    }
  });
  if (!force && L >= 2) {
    const lane = LANES[randInt(rng, 0, 2)];
    const count = hordeSize(g, 0.35);
    horde(g, lane - LANE_HALF + 0.2, lane + LANE_HALF - 0.2, d + 1, count, mix(g));
    loseToHorde(g, count * 0.5);
  }
  return d + 22;
}

/** 一条道连续小加门，旁边一道尸潮，第三道陷阱或坏门 */
function ladder(g: Gen, d: number): number {
  const { rng, L, feats } = g;
  const [gl, hl, xl] = shuffle(rng, [0, 1, 2]);
  const steps = randInt(rng, 3, 5);
  let total = 0;
  for (let i = 0; i < steps; i++) {
    const value = randInt(rng, 1, 2 + Math.floor(L / 4));
    total += value;
    g.spec.gates.push({ kind: 'add', x0: LANES[gl] - LANE_HALF, x1: LANES[gl] + LANE_HALF, d: d + 10 + i * 4.2, value, group: g.group++ });
  }
  const count = hordeSize(g, 0.5);
  horde(g, LANES[hl] - LANE_HALF + 0.2, LANES[hl] + LANE_HALF - 0.2, d + 4, count, mix(g));
  if (feats.hazards && rng() < 0.6) {
    g.spec.hazards.push({ kind: 'spikes', x0: LANES[xl] - LANE_HALF, x1: LANES[xl] + LANE_HALF, d0: d + 12, d1: d + 18 });
  } else {
    g.spec.gates.push({ kind: 'add', x0: LANES[xl] - LANE_HALF, x1: LANES[xl] + LANE_HALF, d: d + 18, value: -TUNING.badGate(L), group: g.group++ });
  }
  g.E += total + shootGain(g, 'add', 1) + (steps - 1) * shootGain(g, 'add', 3, 0.6);
  loseToHorde(g, count * 0.6);
  return d + 14 + steps * 4.2;
}

/** 中间道一只巨尸（打死掉奖励），两边是好门和坏门 */
function miniBoss(g: Gen, d: number): number {
  const { rng, L } = g;
  g.spec.banners.push({ d: d - 8, text: '巨尸来袭！', tone: 'danger' });
  addGiant(g, LANES[1], d + 26, 1);
  const escort = hordeSize(g, 0.6);
  horde(g, -LANE_HALF + 0.2, LANE_HALF - 0.2, d + 16, escort, { walker: 1, runner: g.feats.runner ? 0.5 : 0 });
  const side = rng() < 0.5 ? -1 : 1;
  const good = TUNING.addGate(L) + randInt(rng, 1, 4);
  const group = g.group++;
  const gx = side < 0 ? -TRACK_HALF : LANE_HALF;
  const bx = side < 0 ? LANE_HALF : -TRACK_HALF;
  g.spec.gates.push({ kind: 'add', x0: gx, x1: gx + TRACK_HALF - LANE_HALF, d: d + 20, value: good, group });
  g.spec.gates.push({ kind: 'add', x0: bx, x1: bx + TRACK_HALF - LANE_HALF, d: d + 20, value: -TUNING.badGate(L), group });
  g.E += good * 0.9;
  loseToHorde(g, escort * 0.6 + 3);
  return d + 36;
}

/** 锯片和地刺，躲开它们去拿门 */
function hazardRun(g: Gen, d: number): number {
  const { rng, L } = g;
  const [sawLane, spikeLane, gateLane] = shuffle(rng, [0, 1, 2]);
  g.spec.hazards.push({ kind: 'saw', x0: LANES[sawLane] - LANE_HALF + 0.6, x1: LANES[sawLane] + LANE_HALF - 0.6, d0: d + 12, d1: d + 12 });
  g.spec.hazards.push({ kind: 'spikes', x0: LANES[spikeLane] - LANE_HALF, x1: LANES[spikeLane] + LANE_HALF, d0: d + 8, d1: d + 14 });
  const good = TUNING.addGate(L) + randInt(rng, 2, 5);
  const group = g.group++;
  // 地刺后面是大好门，安全道上是坏门
  g.spec.gates.push({ kind: 'add', x0: LANES[spikeLane] - LANE_HALF, x1: LANES[spikeLane] + LANE_HALF, d: d + 22, value: Math.round(good * 2.5), group });
  g.spec.gates.push({
    kind: 'add',
    x0: LANES[gateLane] - LANE_HALF,
    x1: LANES[gateLane] + LANE_HALF,
    d: d + 22,
    value: -Math.round(TUNING.badGate(L) * 0.6),
    group,
  });
  const count = hordeSize(g, 0.4);
  horde(g, LANES[gateLane] - LANE_HALF + 0.2, LANES[gateLane] + LANE_HALF - 0.2, d + 2, count, mix(g));
  g.E = Math.max(3, g.E * 0.8 + good * 1.2);
  loseToHorde(g, count * 0.5);
  return d + 28;
}

/** 终点：一排桶、一组翻倍门、小兵和 Boss */
function finale(g: Gen, length: number, kinds?: BossKind[], hpMul = 1) {
  const { rng, L } = g;
  const spec = g.spec;
  if (g.tier < g.topTier) crateRow(g, length - 78, ['weapon']);
  // 乘法门与大加门：队伍较大时乘法门更划算
  if (g.base) g.E = g.base(length - 46);
  const mul = L >= 8 ? 1.5 : 1.25;
  const big = Math.max(TUNING.addGate(L) * 2, Math.round(g.E * (mul - 1) * 0.7));
  pairGates(g, length - 46, { kind: 'mul', value: mul }, { kind: 'add', value: big });
  const bossKinds = kinds ?? campaignBosses(L);
  spec.banners.push({ d: length - 30, text: bossKinds.length > 1 ? '双 BOSS！' : 'BOSS！', tone: 'boss' });
  // 小兵
  const minions = Math.max(8, Math.round(hordeSize(g, 0.5)));
  const hp = zombieHp(g) * 1.2;
  const cols = 9;
  for (let i = 0; i < minions; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    spec.zombies.push({
      kind: g.feats.runner && rng() < 0.25 ? 'runner' : 'walker',
      x: -TRACK_HALF + 0.6 + (col + (row % 2) * 0.5) * ((TRACK_HALF * 2 - 1.2) / cols),
      d: length - 3 - row * 0.9,
      hp,
    });
  }
  if (g.base) g.E = g.base(length) * 1.3;
  const dps = ((soldierDps(g.tier) + soldierDps(Math.max(0, g.tier - 1))) / 2) * g.rate;
  const total = g.E * dps * TUNING.bossSeconds(L) * hpMul;
  const xs = bossKinds.length > 1 ? [-2.7, 2.7] : [0];
  bossKinds.forEach((kind, i) => {
    spec.bosses.push({ kind, x: xs[i], hp: roundNice(total * BOSSES[kind].hp * (bossKinds.length > 1 ? 0.62 : 1)) });
  });
}

function finish(g: Gen): LevelSpec {
  const spec = g.spec;
  spec.expected = Math.round(g.E);
  sortSpec(spec);
  return spec;
}

function sortSpec(spec: LevelSpec) {
  spec.gates.sort((a, b) => a.d - b.d);
  spec.barrels.sort((a, b) => a.d - b.d);
  spec.zombies.sort((a, b) => a.d - b.d);
  spec.hazards.sort((a, b) => a.d0 - b.d0);
  spec.walls.sort((a, b) => a.d0 - b.d0);
  spec.banners.sort((a, b) => a.d - b.d);
}

// ---------- 摆放工具 ----------

function pairGates(g: Gen, d: number, a: GateOpt, b: GateOpt, fixed = false) {
  const [left, right] = !fixed && g.rng() < 0.5 ? [b, a] : [a, b];
  const group = g.group++;
  g.spec.gates.push({ ...left, x0: -TRACK_HALF, x1: 0, d, group });
  g.spec.gates.push({ ...right, x0: 0, x1: TRACK_HALF, d, group });
  chooseBest(g, [a, b]);
}

function addBarrel(g: Gen, x: number, d: number, hp: number, reward: Reward) {
  const look: BarrelSpec['look'] =
    reward.kind === 'weapon' ? 'tires' : reward.kind === 'soldiers' ? 'cage' : reward.kind === 'coins' ? 'barrel' : 'crate';
  g.spec.barrels.push({ x, d, r: 1.2, hp: Math.max(5, Math.round(hp)), reward, look });
}

function addGiant(g: Gen, x: number, d: number, scale: number) {
  const hp = g.E * soldierDps(Math.max(0, g.tier - 1)) * g.rate * TUNING.giantSeconds(g.L) * scale;
  const reward: Reward = g.tier < g.topTier ? { kind: 'weapon', tier: Math.min(g.topTier, g.tier + 1) } : { kind: 'airstrike' };
  g.spec.zombies.push({ kind: 'giant', x, d, hp: Math.max(40, Math.round(hp)), reward });
  if (reward.kind === 'weapon') g.tier = Math.max(g.tier, Math.round((g.tier + reward.tier) / 2));
}

type Mix = Partial<Record<ZombieKind, number>>;

/** 尸潮成分：特殊丧尸要等估算兵力够大才出现，小部队不会被一只自爆尸团灭 */
function mix(g: Gen): Mix {
  const f = g.feats;
  return {
    walker: 1,
    runner: f.runner ? 0.35 + Math.min(0.3, g.L * 0.02) : 0,
    exploder: f.exploder && g.E >= 15 ? 0.08 : 0,
    brute: f.brute && g.E >= 20 ? 0.07 : 0,
  };
}

/** 估算兵力下一波尸潮的人数。人多时按 0.6 次方放缓，避免大部队遇到打不完的尸潮 */
function hordeSize(g: Gen, scale: number): number {
  const eff = g.E <= EMIT_CAP ? g.E : EMIT_CAP * Math.pow(g.E / EMIT_CAP, 0.6);
  const n = eff * TUNING.hordeFrac(g.L) * scale * g.hordeMul * randRange(g.rng, 0.85, 1.15);
  // 超过 150 只不再加数量（画面放不下），horde() 会把多出来的折算成血量
  return Math.max(3, Math.round(n));
}

/** 普通丧尸血量：估算的每发伤害 × 要挨的发数 */
function zombieHp(g: Gen): number {
  const perBullet = WEAPONS[Math.max(0, g.tier - 1)].damage * Math.max(1, g.E / EMIT_CAP);
  return Math.max(1, perBullet * TUNING.zombieHits(g.L) * g.hpMul);
}

function horde(g: Gen, x0: number, x1: number, d: number, wanted: number, m: Mix) {
  const { rng } = g;
  const width = x1 - x0;
  const cols = Math.max(2, Math.round(width / 0.8));
  const count = Math.min(HORDE_CAP, wanted);
  const weight = wanted / count;
  const hp = zombieHp(g) * weight;
  const kinds = Object.entries(m).filter(([, w]) => (w ?? 0) > 0) as [ZombieKind, number][];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const kind = pickWeighted(rng, kinds);
    g.spec.zombies.push({
      kind,
      x: x0 + (col + 0.5 + (row % 2) * 0.25) * (width / cols) + randRange(rng, -0.12, 0.12),
      d: d + row * 0.95 + randRange(rng, -0.15, 0.15),
      hp: Math.round(hp * ZOMBIES[kind].hp * 10) / 10,
      weight: weight > 1.01 ? Math.round(weight * 100) / 100 : undefined,
    });
  }
}

function crateHp(g: Gen, scale: number): number {
  return g.E * 0.6 * soldierDps(g.tier) * g.rate * TUNING.crateSeconds(g.L) * scale;
}

// ---------- 兵力估算 ----------

/** 估算对着一扇门打 seconds 秒能涨多少 */
function shootGain(g: Gen, kind: GateKind, from: number, seconds = 3.6): number {
  let hits = Math.min(g.E, EMIT_CAP) * WEAPONS[g.tier].rate * g.rate * seconds * 0.55;
  const base = gateBaseStep(g.L) * (kind === 'rate' ? 4 : 1);
  let v = from;
  while (v < 0 && hits >= base) {
    hits -= base;
    v++;
  }
  if (v >= 0) v += Math.log(1 + ((GATE_GROWTH - 1) * hits) / (base * Math.pow(GATE_GROWTH, v))) / Math.log(GATE_GROWTH);
  return Math.floor(v) - from;
}

interface Outcome {
  E: number;
  tier: number;
  rate: number;
  P: number;
}

function outcomePower(g: Gen, o: GateOpt): Outcome {
  let { E, tier, rate } = g;
  if (o.kind === 'add') E = Math.max(0, E + o.value + shootGain(g, 'add', o.value));
  else if (o.kind === 'mul') E = E * o.value;
  else if (o.kind === 'weapon') tier = Math.min(WEAPONS.length - 1, Math.max(tier, o.value + (g.E > 30 ? 1 : 0)));
  else rate = Math.max(0.4, Math.min(1.8, rate * (1 + Math.min(25, o.value + shootGain(g, 'rate', o.value)) / 100)));
  return { E, tier, rate, P: E * soldierDps(tier) * rate };
}

function applyOutcome(g: Gen, o: Outcome) {
  g.E = Math.max(1, o.E);
  g.tier = o.tier;
  g.rate = o.rate;
}

/** 估计玩家大多选对，偶尔选错 */
function chooseBest(g: Gen, opts: GateOpt[]) {
  const outs = opts.map((o) => outcomePower(g, o)).sort((a, b) => b.P - a.P);
  const best = outs[0];
  const worst = outs[outs.length - 1];
  applyOutcome(g, best);
  g.E = Math.max(1, best.E * 0.88 + worst.E * 0.12);
}

/** 尸潮人数比估算兵力多时，漏过来的比例也更高 */
function loseToHorde(g: Gen, count: number) {
  const ratio = Math.max(0.5, Math.min(2.5, count / Math.max(1, g.E)));
  g.E = Math.max(3, g.E - count * TUNING.leak(g.L) * ratio);
}

function roundNice(v: number): number {
  if (v < 100) return Math.round(v);
  const mag = Math.pow(10, Math.floor(Math.log10(v)) - 1);
  return Math.round(v / mag) * mag;
}

export function laneOf(x: number): number {
  return x < -LANE_HALF ? 0 : x > LANE_HALF ? 2 : 1;
}
