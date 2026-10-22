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
  MAX_COUNT,
  MAX_DEFENSE_COUNT,
  MAX_SOLDIERS_SIM,
  SQUAD_SPEED,
  SQUAD_STEER,
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
  type LevelSpec,
  type Reward,
  type WallSpec,
  type ZombieSpec,
} from './level';
import { GEMS, bossBounty, bossGems, killCoins } from './economy';
import { mulberry32, randRange, type Rng } from './rng';

/** 每秒最多生成的子弹数，超出时把伤害合并到少量子弹上 */
const MAX_SHOTS_PER_SEC = 600;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const STEP = 1 / 60;
/** 子弹碰撞时丧尸纵向分桶的宽度（米） */
const Z_BIN = 2;
/** 地刺：在上面待够这么久的士兵，有一半会死 */
const SPIKE_EXPOSURE = 0.12;
const SPIKE_LETHALITY = 0.3;
const SAW_RADIUS = 0.8;
const STRIKE_RADIUS = 2.8;
/** 射速门叠加上限 */
/** 本局射速加成（射速门、射速箱）最多到 180%，不会一局就翻好几倍 */
const MAX_RATE_BONUS = 1.8;
/** 防线门道堵车时，前后两样东西之间至少隔多远 */
const JAM_GAP = 7;
/** 防线里丧尸的速度倍数 */
const DEFENSE_ZOMBIE_SPEED = 1.7;

export interface Soldier {
  /** 相对队伍中心的偏移，向阵位平滑移动 */
  ox: number;
  oz: number;
  phase: number;
  /** 0→1 出生弹出动画 */
  spawn: number;
  /** 0..1，过地刺时决定生死 */
  luck: number;
  spike: number;
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
}

export interface Gate extends GateSpec {
  id: number;
  hits: number;
  consumed: boolean;
  /** 被选中穿过 */
  taken: boolean;
  /** 被打中时的跳动，渲染用 */
  bump: number;
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
  /** 已经从队伍身边漏过去（护送模式会去追大巴） */
  /** 一只顶几只（超大尸潮折算），影响杀伤 */
  weight: number;
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

export type HitTarget = 'zombie' | 'giant' | 'barrel' | 'gate' | 'boss';

export type GameEvent =
  | { type: 'hit'; x: number; d: number; y: number; target: HitTarget; color: number; dmg: number; id: number }
  /** 掉钻石 */
  | { type: 'gem'; x: number; d: number; amount: number }
  /** Boss 半血狂暴 */
  | { type: 'bossEnrage'; boss: Boss }
  /** 爆裂弹/电磁弹溅射 */
  | { type: 'splash'; x: number; d: number; r: number }
  | { type: 'gateUp'; gate: Gate }
  | { type: 'gatePass'; gate: Gate; before: number; after: number }
  | { type: 'zombieDie'; x: number; d: number; kind: ZombieKind; coins: number; look: number }
  | { type: 'soldierDie'; x: number; d: number }
  | { type: 'barrelBreak'; barrel: Barrel }
  | { type: 'reward'; reward: Reward; x: number; d: number; upgraded: boolean }
  | { type: 'explode'; x: number; d: number; r: number; source: 'exploder' | 'impact' | 'strike'; killed: number }
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
  | { type: 'won' }
  | { type: 'lost' };

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
  seed?: number;
  /** 无尽模式：继续生成内容的生成器 */
  endless?: { gen: Gen; until: number };
}

export type WorldState = 'run' | 'boss' | 'won' | 'lost';

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
  private form = { sx: 0, sz: 1, shift: 0, gap: FORMATION_SPACING };
  /** 当前队伍中心可去的范围 */
  lo = -TRACK_HALF;
  hi = TRACK_HALF;

  private readonly opts: WorldOptions;
  /** 子弹碰撞的预筛：这一步射程内的门和桶、按纵向 2 米分桶的丧尸 */
  private hitGates: Gate[] = [];
  private hitBarrels: Barrel[] = [];
  private zBins: Zombie[][] = [];
  private zBinLo = 0;
  private zMaxR = 1;
  /** 用完的子弹对象，下次开枪直接复用，少给垃圾回收添活 */
  private readonly bulletPool: Bullet[] = [];
  /** 子弹种类（局外射速升级进化） */
  readonly ammo: AmmoDef;
  private readonly rng: Rng;
  private shotAcc = 0;
  private nextId = 1;
  private bannerIdx = 0;
  private near: Zombie[] = [];
  private pruneT = 0;
  private readonly zombieSpeed: number;
  private damage: number;
  private readonly endless: { gen: Gen; until: number } | null;
  /** 防线模式：刷新表和进度 */
  readonly defense: DefenseSpec | null;
  private spawnIdx = 0;
  private dpsSmooth = 0;
  /** 门道队列当前速度：放行后从 0 加速到 conveyor */
  private queueV = 0;
  private streamAcc = 0;
  constructor(spec: LevelSpec, opts: WorldOptions) {
    this.spec = spec;
    this.opts = opts;
    this.rng = mulberry32(opts.seed ?? spec.level * 31 + 7);
    // 防线里丧尸跑得快得多，直接冲到脸上
    this.zombieSpeed = spec.defense ? DEFENSE_ZOMBIE_SPEED : 1;
    this.damage = opts.damageMult;
    this.ammo = AMMO[Math.max(0, Math.min(AMMO.length - 1, opts.ammo ?? 0))];
    this.endless = opts.endless ?? null;
    this.defense = spec.defense;
    this.gates = [];
    this.barrels = [];
    this.zombies = [];
    this.hazards = [];
    this.walls = [];
    this.addContent(spec);
    for (const b of spec.bosses) this.bosses.push(this.makeBoss(b, spec.length + 6));
    if (this.bosses.length > 1) for (const b of this.bosses) b.pair = true;
    // 防线开局站在门道上，第一组门直接吃到
    if (spec.defense) this.squad.x = this.squad.targetX = spec.defense.gateSide * (TRACK_HALF / 2);
    this.squad.count = Math.max(1, Math.min(this.countCap, Math.round(opts.startSoldiers)));
    this.squad.tier = opts.startTier ?? 0;
    this.squad.rate = opts.rateBonus ?? 1;
    this.syncSoldiers(false);
    for (const s of this.soldiers) s.spawn = 1;
    this.layout(1);
  }

  /** 把一段关卡内容加进世界（开局和无尽模式续生成都用） */
  private addContent(spec: Pick<LevelSpec, 'gates' | 'barrels' | 'zombies' | 'hazards' | 'walls' | 'banners'>) {
    // 局外升级：加人门按兵力进化放大；开局枪已经比武器箱给的好，这个箱子改成给兵（不白打，也不越过本关的武器上限）
    const bonus = this.opts.gateBonus ?? 1;
    const start = this.opts.startTier ?? 0;
    for (const g of spec.gates) {
      const value = g.kind === 'add' && g.value > 0 ? Math.round(g.value * bonus) : g.kind === 'weapon' ? Math.max(g.value, start) : g.value;
      this.gates.push({ ...g, value, id: this.nextId++, hits: 0, consumed: false, taken: false, bump: 0 });
    }
    for (const b of spec.barrels) {
      const reward: Reward = b.reward.kind === 'weapon' && b.reward.tier <= start ? { kind: 'soldiers', amount: 1 + Math.ceil(this.spec.level / 3) } : b.reward;
      const look = reward !== b.reward && b.look === 'tires' ? 'armor' : b.look;
      this.barrels.push({ ...b, reward, look, id: this.nextId++, maxHp: b.hp, alive: true, bump: 0, armed: false, priced: false });
    }
    for (const z of spec.zombies) this.zombies.push(this.makeZombie(z));
    for (const h of spec.hazards) this.hazards.push({ ...h, id: this.nextId++, phase: this.rng() * 6, x: (h.x0 + h.x1) / 2 });
    for (const w of spec.walls) this.walls.push({ ...w, id: this.nextId++ });
    if (spec !== this.spec) {
      this.spec.banners.push(...spec.banners);
      this.spec.banners.sort((a, b) => a.d - b.d);
    }
    this.version++;
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
      active: owner > 0,
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
    return this.defense ? MAX_DEFENSE_COUNT : MAX_COUNT;
  }

  get fireRate(): number {
    return this.weapon.rate * this.opts.rateMult * this.squad.rate;
  }

  setTarget(x: number) {
    this.squad.targetX = x;
  }

  /** 当前每秒总伤害，UI 和平衡脚本用 */
  dps(): number {
    return this.squad.count * this.fireRate * this.weapon.damage * this.damage;
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
    this.time += dt;
    const sq = this.squad;
    if (this.state !== 'run' && this.state !== 'boss') {
      this.endTime += dt;
      sq.moving = false;
      this.updateBullets(dt);
      this.layout(dt);
      this.updateProjectiles(dt);
      this.updateStrikes(dt);
      this.decay(dt);
      return;
    }

    const prevD = sq.d;
    if (this.defense) {
      sq.moving = false;
      this.runDefense(dt);
    } else if (this.state === 'run') {
      sq.d += SQUAD_SPEED * dt;
      const stop = this.spec.length - BOSS_STOP;
      if (sq.d >= stop) {
        sq.d = stop;
        this.startBoss();
      }
    }
    if (this.endless && sq.d + 170 > this.endless.until) this.extend();
    while (this.bannerIdx < this.spec.banners.length && this.spec.banners[this.bannerIdx].d <= sq.d) {
      const b = this.spec.banners[this.bannerIdx++];
      this.events.push({ type: 'banner', text: b.text, tone: b.tone });
    }

    this.updateBounds();
    const limLo = this.lo + this.halfWidth;
    const limHi = this.hi - this.halfWidth;
    const tx = limLo <= limHi ? Math.max(limLo, Math.min(limHi, sq.targetX)) : (this.lo + this.hi) / 2;
    sq.x += (tx - sq.x) * Math.min(1, SQUAD_STEER * (this.opts.steerMult ?? 1) * dt);

    this.layout(dt);
    this.passGates(prevD);
    this.collectNear();
    this.fire(dt);
    this.updateBullets(dt);
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
      // 最终 Boss 都倒下就赢，剩下的丧尸一起清掉
      if (this.bosses.length > 0 && this.bosses.every((b) => !b.alive)) this.win();
    }
  }

  // ---------- 防线 ----------

  /** 参考火力：主要看这关的预期火力，也跟一点玩家实际火力（0.45 次方）；升级和拿门是真的有用的 */
  private refDps(at?: number): number {
    const def = this.defense!;
    const L = this.spec.level;
    const p = at ?? Math.min(1, this.time / def.duration);
    const expected = expectedDefenseDps(L, p);
    return Math.pow(Math.max(1, expected), 0.85) * Math.pow(Math.max(1, this.dpsSmooth), 0.15);
  }

  private runDefense(dt: number) {
    const def = this.defense!;
    const L = this.spec.level;
    const p = Math.min(1, this.time / def.duration);
    const dps = this.dps();
    this.dpsSmooth = this.dpsSmooth > 0 ? this.dpsSmooth + (dps - this.dpsSmooth) * Math.min(1, dt / 4) : dps;
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
          const z = this.makeZombie({ kind, x: w0 + (col + 0.5 + (row % 2) * 0.3) * ((w1 - w0) / cols), d: d + row * 0.9, hp: hp * ZOMBIES[kind].hp });
          z.active = true;
          this.zombies.push(z);
        }
      }
      if (sp.boss) {
        // 落在刷新点前面一截，从天而降时镜头看得见（不被顶上的血条挡住）
        const b = this.makeBoss(sp.boss, d - 22);
        const final = sp.t >= def.duration - 0.01;
        const pair = spawns.filter((x) => x.boss && Math.abs(x.t - sp.t) <= 2).length > 1;
        b.final = final;
        b.pair = pair;
        const pairFactor = pair ? Math.max(0.3, 0.6 - 0.06 * Math.max(0, L - 5)) : 1;
        const seconds = final ? DEFENSE_TUNING.bossSeconds(L) * pairFactor : DEFENSE_TUNING.midSeconds(L);
        // 防线里巨尸王会冲到脸上，尸巢母体站得远，血量按种类修正一下
        const kindHp = b.kind === 'brute' ? 0.75 : b.kind === 'hive' ? 1.35 : 1;
        b.maxHp = b.hp = Math.max(300 * L, Math.round(ref * seconds * kindHp));
        b.active = true;
        this.bosses.push(b);
        this.events.push({ type: 'bossStart', bosses: [b] });
      }
      if (sp.banner) this.events.push({ type: 'banner', text: sp.banner.text, tone: sp.banner.tone });
      added = true;
    }

    // 尸潮道：源源不断。每秒刷出的总血量 = 压力 × 参考火力，Boss 在场时减弱一些
    const bossAlive = this.bosses.some((b) => b.alive);
    const finalBossAlive = this.bosses.some((b) => b.alive && b.final);
    if (this.time > DEFENSE_TUNING.streamDelay && !(this.time > def.duration && !bossAlive)) {
      const rate = DEFENSE_TUNING.streamRate(L, p);
      this.streamAcc += rate * dt;
      const hp = this.streamHp(ref, p) * (finalBossAlive ? 0.35 : bossAlive ? 0.55 : 1);
      while (this.streamAcc >= 1) {
        this.streamAcc -= 1;
        const kind = this.streamKind(p);
        const z = this.makeZombie({ kind, x: ex + randRange(this.rng, -TRACK_HALF / 2 + 0.6, TRACK_HALF / 2 - 0.6), d: def.spawnD + randRange(this.rng, 0, 2), hp: hp * ZOMBIES[kind].hp });
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
    for (const b of this.barrels) {
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
      for (const g of this.gates) g.d -= v;
      for (const b of this.barrels) if (b.alive) b.d -= v;
      return;
    }
    // 障碍前面的东西照常往前；后面的继续滑，挤到障碍身后排成一串（像堵车），放行时一起冲过来
    const queue: { d: number; r: number; item: Gate | Barrel }[] = [];
    for (const g of this.gates) {
      if (g.d < blocker.d) g.d -= v;
      else queue.push({ d: g.d, r: 0, item: g });
    }
    for (const b of this.barrels) {
      if (!b.alive || b === blocker) continue;
      if (b.d < blocker.d) b.d -= v;
      else queue.push({ d: b.d, r: b.r, item: b });
    }
    queue.sort((a, b) => a.d - b.d);
    let floor = blocker.d + blocker.r + JAM_GAP;
    for (const q of queue) {
      const d = Math.max(floor + q.r, q.d - v);
      q.item.d = d;
      floor = d + q.r + JAM_GAP;
    }
  }

  private lose() {
    if (this.state === 'lost' || this.state === 'won') return;
    this.state = 'lost';
    this.events.push({ type: 'lost' });
  }

  private startBoss() {
    this.state = 'boss';
    this.squad.moving = false;
    // 兵力滚雪球滚得太大时，Boss 至少也要打这么多秒，保证 Boss 战有看头
    const minSeconds = Math.min(14, 7 + 0.5 * this.spec.level);
    const total = this.bosses.reduce((s, b) => s + b.maxHp, 0);
    const floor = this.dps() * minSeconds;
    if (total > 0 && floor > total) {
      for (const b of this.bosses) {
        b.maxHp = Math.round((b.maxHp / total) * floor);
        b.hp = b.maxHp;
      }
    }
    for (const b of this.bosses) b.active = true;
    this.events.push({ type: 'bossStart', bosses: this.bosses });
    if (this.bosses.length === 0) this.win();
  }

  // ---------- 无尽 ----------

  private extend() {
    const e = this.endless!;
    const { added, until } = extendEndless(e.gen, e.until, e.until + 220, { count: this.squad.count, tier: this.squad.tier, rate: this.squad.rate });
    e.until = until;
    this.addContent(added);
  }

  private prune(dt: number) {
    this.pruneT += dt;
    if (this.pruneT < 2) return;
    this.pruneT = 0;
    const cut = this.squad.d - 40;
    const n = this.gates.length + this.barrels.length + this.zombies.length + this.hazards.length + this.walls.length;
    this.gates = this.gates.filter((g) => g.d > cut);
    this.barrels = this.barrels.filter((b) => b.d > cut);
    this.zombies = this.zombies.filter((z) => z.alive || z.d > cut);
    this.zombies = this.zombies.filter((z) => z.d > cut - 20);
    this.hazards = this.hazards.filter((h) => h.d1 > cut);
    this.walls = this.walls.filter((w) => w.d1 > cut);
    if (n !== this.gates.length + this.barrels.length + this.zombies.length + this.hazards.length + this.walls.length) this.version++;
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
    for (const w of this.walls) if (w.d0 <= d1 && w.d1 >= d0) return w;
    return null;
  }

  private syncSoldiers(emitLoss = true) {
    const target = Math.min(this.squad.count, MAX_SOLDIERS_SIM);
    const form = this.formation(target);
    while (this.soldiers.length < target) {
      // 新兵直接出现在自己的位置上（原地冒出来），不从中间飞出去
      const slot = this.slot(this.soldiers.length, form);
      this.soldiers.push({
        ox: slot.x,
        oz: slot.z,
        phase: this.rng() * Math.PI * 2,
        spawn: 0,
        luck: this.rng(),
        spike: 0,
      });
    }
    let emitted = 0;
    while (this.soldiers.length > target) {
      const s = this.soldiers.pop()!;
      if (emitLoss && emitted++ < 30) this.events.push({ type: 'soldierDie', x: this.squad.x + s.ox, d: this.squad.d + s.oz });
    }
  }

  /** 阵型参数：n 个人时的横向压缩、纵向拉长和整体后移 */
  private formation(n: number): { sx: number; sz: number; shift: number; gap: number } {
    // 防线里人多时站得更密，不然一条道上的纵队会拉到几十米长
    const gap = FORMATION_SPACING * (this.defense ? Math.max(0.78, 1 - n / 900) : 1);
    const R = gap * Math.sqrt(Math.max(1, n));
    // 防线里阵型最宽只占一条道：人再多也是往后排，站哪条道就只打哪条道
    const laneCap = this.defense ? TRACK_HALF / 2 - 0.25 : 2.0;
    const maxR = Math.max(0.6, Math.min(laneCap, (this.hi - this.lo) / 2 - 0.35));
    const sx = R > maxR ? maxR / R : 1;
    const sz = 1 / sx;
    // 防线里队伍往后排，最前排始终在桥头
    return { sx, sz, shift: this.defense ? -R * sz + 0.6 : 0, gap };
  }

  /** 第 i 个人在阵型里的位置（向日葵排法：编号越大越靠外，加人不会挪动里面的人） */
  private slot(i: number, f: { sx: number; sz: number; shift: number; gap: number }): { x: number; z: number } {
    const r = f.gap * Math.sqrt(i + 0.5);
    const a = i * GOLDEN_ANGLE;
    return { x: Math.cos(a) * r * f.sx, z: Math.sin(a) * r * f.sz + f.shift };
  }

  private layout(dt: number) {
    const n = this.soldiers.length;
    // 人数变化时阵型的整体缩放和后移慢慢跟上，不要一下子跳
    const f = this.formation(n);
    const smooth = Math.min(1, 4 * dt);
    if (this.form.sx === 0) this.form = f;
    else {
      this.form.sx += (f.sx - this.form.sx) * smooth;
      this.form.sz += (f.sz - this.form.sz) * smooth;
      this.form.shift += (f.shift - this.form.shift) * smooth;
      this.form.gap += (f.gap - this.form.gap) * smooth;
    }
    const k = Math.min(1, 9 * dt);
    let front = 0;
    let back = 0;
    let half = 0;
    const walk = this.squad.moving ? 11 : 0;
    const cx = this.squad.x;
    const formationHalf = this.defense ? TRACK_HALF / 2 - 0.25 : 2.0;
    for (let i = 0; i < n; i++) {
      const s = this.soldiers[i];
      const t = this.slot(i, this.form);
      // 补位的人走过去（限速），其余的人只做很小的调整
      const dx = t.x - s.ox;
      const dz = t.z - s.oz;
      const dist = Math.hypot(dx, dz);
      const step = Math.min(dist * k, Math.max(0.02, 7 * dt));
      if (dist > 1e-4) {
        s.ox += (dx / dist) * step;
        s.oz += (dz / dist) * step;
      }
      // 乘法门瞬间加人时，平滑中的阵型也不能暂时撑满桥面，否则整队无法横移躲 Boss。
      s.ox = Math.max(-formationHalf, Math.min(formationHalf, s.ox));
      // 不穿墙、不出桥
      const ax = cx + s.ox;
      if (ax < this.lo + 0.2) s.ox = this.lo + 0.2 - cx;
      else if (ax > this.hi - 0.2) s.ox = this.hi - 0.2 - cx;
      s.spawn = Math.min(1, s.spawn + dt * 4);
      s.phase += dt * walk;
      if (s.oz > front) front = s.oz;
      if (s.oz < back) back = s.oz;
      const aox = Math.abs(s.ox);
      if (aox > half) half = aox;
    }
    this.front = front;
    this.back = back;
    this.halfWidth = Math.min(half + 0.25, (this.hi - this.lo) / 2);
  }

  private killSoldier(index: number) {
    const s = this.soldiers[index];
    if (!s) return;
    this.events.push({ type: 'soldierDie', x: this.squad.x + s.ox, d: this.squad.d + s.oz });
    // 用最后一个人补这个空位：阵型按编号排，从中间删会让后面所有人换位置（看起来整队抽搐）
    const last = this.soldiers.pop()!;
    if (index < this.soldiers.length) this.soldiers[index] = last;
    this.squad.count = Math.max(0, this.squad.count - 1);
    if (this.squad.count > this.soldiers.length) this.syncSoldiers(false);
  }

  /** 杀掉离某点最近的 n 个士兵，返回实际杀了几个 */
  private killNear(x: number, d: number, radius: number, max: number): number {
    let killed = 0;
    while (killed < max && this.squad.count > 0) {
      const idx = this.nearestSoldier(x, d, radius);
      if (idx < 0) break;
      this.killSoldier(idx);
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
      this.killSoldier(idx);
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
    const groups = new Map<number, Gate[]>();
    for (const g of this.gates) {
      if (g.consumed) continue;
      // 冲锋：队伍走过门；防线：门滑到队伍脚下
      if (this.defense ? g.d > sq.d : g.d <= prevD || g.d > sq.d) continue;
      const list = groups.get(g.group);
      if (list) list.push(g);
      else groups.set(g.group, [g]);
    }
    for (const list of groups.values()) {
      let chosen: Gate | null = null;
      let bestDist = Infinity;
      let bestOverlap = 0;
      let wide: Gate | null = null;
      for (const g of list) {
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
      if (!chosen) continue;
      chosen.taken = true;
      this.applyGate(chosen);
    }
  }

  private applyGate(g: Gate) {
    const sq = this.squad;
    if (g.kind === 'add' || g.kind === 'mul') {
      const before = sq.count;
      sq.count = g.kind === 'add' ? before + g.value : Math.round(before * g.value);
      sq.count = Math.max(0, Math.min(this.countCap, sq.count));
      this.syncSoldiers();
      this.events.push({ type: 'gatePass', gate: g, before, after: sq.count });
    } else if (g.kind === 'weapon') {
      const before = sq.tier;
      sq.tier = Math.max(sq.tier, Math.min(WEAPONS.length - 1, g.value));
      this.events.push({ type: 'gatePass', gate: g, before, after: sq.tier });
    } else {
      const before = Math.round(sq.rate * 100);
      sq.rate = Math.max(0.4, Math.min(MAX_RATE_BONUS, sq.rate * (1 + g.value / 100)));
      this.events.push({ type: 'gatePass', gate: g, before, after: Math.round(sq.rate * 100) });
    }
  }

  private gateHit(g: Gate) {
    g.hits += 1;
    g.bump = 1;
    const L = this.spec.level;
    if (g.kind === 'weapon') {
      // 最多打到本关武器上限 +1
      if (g.value >= Math.min(WEAPONS.length - 1, maxWeaponTier(L) + 1)) return;
      const step = weaponGateStep(L, g.value);
      if (g.hits >= step) {
        g.hits -= step;
        g.value += 1;
        this.events.push({ type: 'gateUp', gate: g });
      }
      return;
    }
    if (g.kind === 'rate' && g.value >= RATE_GATE_MAX) return;
    const step = g.kind === 'rate' ? rateGateStep(L, g.value) : gateStep(L, g.value);
    if (g.hits >= step) {
      g.hits -= step;
      g.value += 1;
      this.events.push({ type: 'gateUp', gate: g });
    }
  }

  // ---------- 射击 ----------

  private collectNear() {
    const lo = this.squad.d + this.back - (this.defense ? 14 : 4);
    const hi = this.defense ? this.defense.spawnD + 12 : this.squad.d + BULLET_RANGE + 10;
    const near: Zombie[] = [];
    for (const z of this.zombies) {
      if (z.alive && z.d > lo && z.d < hi) near.push(z);
    }
    this.near = near;
  }

  private fire(dt: number) {
    const sq = this.squad;
    if (sq.count <= 0 || this.soldiers.length === 0) return;
    const w = this.weapon;
    const emitters = Math.min(sq.count, EMIT_CAP);
    let shotsPerSec = emitters * this.fireRate;
    let dmg = w.damage * this.damage * (sq.count / emitters);
    if (shotsPerSec > MAX_SHOTS_PER_SEC) {
      dmg *= shotsPerSec / MAX_SHOTS_PER_SEC;
      shotsPerSec = MAX_SHOTS_PER_SEC;
    }
    this.shotAcc += shotsPerSec * dt;
    // 只有冲锋终点的 Boss 战，正对着 Boss 的那几列兵会把子弹稍微偏过去；
    // 防线里不偏——以前所有子弹都被 Boss 吸过去，旁边的小怪就没人打了
    const aim = this.state === 'boss';
    while (this.shotAcc >= 1) {
      this.shotAcc -= 1;
      const s = this.soldiers[Math.floor(this.rng() * this.soldiers.length)];
      const x = sq.x + s.ox + 0.12;
      const d = sq.d + s.oz + 0.35;
      // 每种枪的弹道不一样：冲锋枪、加特林泼得开，战术步枪又快又准，等离子炮慢而大
      let vx = randRange(this.rng, -w.spread, w.spread);
      let vd = BULLET_SPEED * w.speed;
      if (aim) {
        let target: Boss | null = null;
        let best = Infinity;
        for (const b of this.bosses) {
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
    this.hitGates.length = 0;
    for (const g of this.gates) if (!g.consumed && g.kind !== 'mul' && g.d >= lo && g.d <= hi) this.hitGates.push(g);
    this.hitBarrels.length = 0;
    for (const br of this.barrels) if (br.alive && br.d + br.r >= lo && br.d - br.r <= hi) this.hitBarrels.push(br);
    const n = Math.ceil((hi - lo) / Z_BIN) + 1;
    while (this.zBins.length < n) this.zBins.push([]);
    for (let i = 0; i < n; i++) this.zBins[i].length = 0;
    let maxR = 0.5;
    for (const z of this.near) {
      if (!z.alive) continue;
      const i = Math.floor((z.d - lo) / Z_BIN);
      if (i < 0 || i >= n) continue;
      this.zBins[i].push(z);
      if (z.r > maxR) maxR = z.r;
    }
    this.zBinLo = lo;
    this.zMaxR = maxR;
  }

  private updateBullets(dt: number) {
    const bullets = this.bullets;
    const fighting = this.state === 'run' || this.state === 'boss';
    if (fighting && bullets.length) this.prepareHits();
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
    for (const g of this.hitGates) {
      if (g.consumed) continue;
      if (g.d <= b.d || g.d > nd) continue;
      const t = (g.d - b.d) / dd;
      const x = b.x + dx * t;
      if (x >= g.x0 && x <= g.x1 && t < bestT) {
        bestT = t;
        kind = 1;
        target = g;
      }
    }
    for (const br of this.hitBarrels) {
      if (!br.alive || br.d + br.r < dmin || br.d - br.r > dmax) continue;
      const t = segCircle(b.x, b.d, dx, dd, br.x, br.d, br.r);
      if (t >= 0 && t < bestT) {
        bestT = t;
        kind = 2;
        target = br;
      }
    }
    // 只看子弹这一步路径附近的几个桶
    const b0 = Math.max(0, Math.floor((dmin - this.zMaxR - this.zBinLo) / Z_BIN));
    const b1 = Math.min(this.zBins.length - 1, Math.floor((dmax + this.zMaxR - this.zBinLo) / Z_BIN));
    for (let bi = b0; bi <= b1; bi++) {
      for (const z of this.zBins[bi]) {
        if (!z.alive || z.id === b.lastHit || z.d + z.r < dmin || z.d - z.r > dmax) continue;
        const t = segCircle(b.x, b.d, dx, dd, z.x, z.d, z.r);
        if (t >= 0 && t < bestT) {
          bestT = t;
          kind = 3;
          target = z;
        }
      }
    }
    for (const boss of this.bosses) {
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
      this.gateHit(target as Gate);
      this.events.push({ type: 'hit', x: hx, d: hd, y: 1.2, target: 'gate', color, dmg: 0, id: (target as Gate).id });
    } else if (kind === 2) {
      const br = target as Barrel;
      br.hp -= b.dmg;
      br.bump = 1;
      this.events.push({ type: 'hit', x: hx, d: hd, y: 0.9, target: 'barrel', color, dmg: b.dmg, id: br.id });
      if (br.hp <= 0) this.breakBarrel(br);
    } else if (kind === 3) {
      const z = target as Zombie;
      this.damageZombie(z, b.dmg);
      this.events.push({ type: 'hit', x: hx, d: hd, y: z.kind === 'giant' ? 2 : 0.7, target: z.kind === 'giant' ? 'giant' : 'zombie', color, dmg: b.dmg, id: z.id });
      this.splash(hx, hd, b.dmg, z.id);
      // 穿甲：打穿这只接着飞，伤害打七折
      if (b.pierce > 0 && z.kind !== 'giant') {
        b.pierce--;
        b.dmg *= 0.7;
        b.lastHit = z.id;
        return false;
      }
    } else {
      const boss = target as Boss;
      this.damageBoss(boss, b.dmg);
      this.events.push({ type: 'hit', x: hx, d: hd, y: 2.4, target: 'boss', color, dmg: b.dmg, id: boss.id });
      this.splash(hx, hd, b.dmg, -1);
    }
    return true;
  }

  /** 爆裂弹/电磁弹：打中处一圈的丧尸也掉血 */
  private splash(x: number, d: number, dmg: number, skip: number) {
    const a = this.ammo;
    if (a.splash <= 0) return;
    const r2 = a.splash * a.splash;
    let hit = false;
    for (const z of this.near) {
      if (!z.alive || z.id === skip) continue;
      const dx = z.x - x;
      const dd = z.d - d;
      if (dx * dx + dd * dd > r2 + z.r * z.r) continue;
      this.damageZombie(z, dmg * a.splashDmg);
      hit = true;
    }
    if (hit && this.rng() < 0.4) this.events.push({ type: 'splash', x, d, r: a.splash });
  }

  // ---------- 桶 ----------

  private breakBarrel(br: Barrel) {
    if (!br.alive) return;
    br.alive = false;
    br.hp = 0;
    // 卡住的大障碍被打掉：队列重新起步
    if (br.block && br.armed) this.queueV = 0;
    this.events.push({ type: 'barrelBreak', barrel: br });
    this.applyReward(br.reward, br.x, br.d);
  }

  private applyReward(reward: Reward, x: number, d: number) {
    let upgraded = true;
    const sq = this.squad;
    if (reward.kind === 'weapon') {
      upgraded = reward.tier > sq.tier;
      if (upgraded) sq.tier = reward.tier;
    } else if (reward.kind === 'soldiers') {
      sq.count = Math.min(this.countCap, sq.count + reward.amount);
      this.syncSoldiers();
    } else if (reward.kind === 'coins') {
      this.coins += reward.amount;
    } else if (reward.kind === 'rate') {
      sq.rate = Math.min(MAX_RATE_BONUS, sq.rate * (1 + reward.amount / 100));
    } else {
      this.launchAirstrike();
    }
    this.events.push({ type: 'reward', reward, x, d, upgraded });
  }

  private collideBarrels() {
    const sq = this.squad;
    for (const br of this.barrels) {
      if (!br.alive) continue;
      if (br.d - br.r > sq.d + this.front + 0.4 || br.d + br.r < sq.d + this.back - 0.4) continue;
      const rr = (br.r + 0.25) * (br.r + 0.25);
      for (let i = this.soldiers.length - 1; i >= 0; i--) {
        const s = this.soldiers[i];
        const dx = sq.x + s.ox - br.x;
        const dd = sq.d + s.oz - br.d;
        if (dx * dx + dd * dd < rr) {
          this.killSoldier(i);
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
    const coins = byPlayer ? killCoins(z.kind, this.spec.level) * (this.opts.coinMult ?? 1) : 0;
    if (byPlayer) {
      this.kills += 1;
      this.coins += coins;
      if (this.rng() < GEMS.drop[z.kind]) this.addGems(1, z.x, z.d);
    }
    this.events.push({ type: 'zombieDie', x: z.x, d: z.d, kind: z.kind, coins, look: z.look });
    if (z.kind === 'exploder' && chain) this.explode(z.x, z.d, EXPLODE_RADIUS, 'exploder');
    if (z.kind === 'giant' && byPlayer && z.reward) this.applyReward(z.reward, z.x, z.d);
  }

  /** 爆炸：自爆尸、投弹、空袭。连锁引爆用队列，避免递归太深 */
  private explode(x: number, d: number, radius: number, source: 'exploder' | 'impact' | 'strike') {
    const event: GameEvent = { type: 'explode', x, d, r: radius, source, killed: 0 };
    this.events.push(event);
    const rr = radius * radius;
    for (const z of this.near) {
      if (!z.alive) continue;
      const dx = z.x - x;
      const dd = z.d - d;
      if (dx * dx + dd * dd > rr + z.r * z.r) continue;
      if (z.kind === 'giant') this.damageZombie(z, z.maxHp * (source === 'strike' ? 0.15 : 0.08));
      else if (z.kind === 'brute') this.damageZombie(z, z.maxHp * 0.6);
      else this.killZombie(z);
    }
    for (const b of this.bosses) {
      if (!b.alive || !b.active) continue;
      const dx = b.x - x;
      const dd = b.d - d;
      if (dx * dx + dd * dd < (radius + b.r) * (radius + b.r)) this.damageBoss(b, b.maxHp * (source === 'strike' ? 0.04 : 0.01));
    }
    if (source === 'impact') {
      // 投弹：红圈里的士兵全部炸死——看到红圈就得躲。
      // 人数超过模拟上限时，场上每个兵代表好几个人，按比例一起算
      const per = this.squad.count / Math.max(1, this.soldiers.length);
      const bodies = this.killNear(x, d, radius, Infinity);
      const extra = Math.round(bodies * (per - 1));
      if (extra > 0) {
        this.squad.count = Math.max(0, this.squad.count - extra);
        this.syncSoldiers(false);
      }
      event.killed = bodies + extra;
    } else if (source === 'exploder') {
      // 自爆：至少带走 3 人，大部队每只最多 6%
      this.killNear(x, d, radius, Math.max(3, Math.ceil(this.squad.count * 0.06)));
    }
  }

  private updateZombies(dt: number) {
    const sq = this.squad;
    const front = sq.d + this.front;
    const back = sq.d + this.back;
    const left = sq.x - this.halfWidth;
    const right = sq.x + this.halfWidth;
    for (const z of this.near) {
      if (!z.alive) continue;
      const def = ZOMBIES[z.kind];
      if (!z.active && z.d - sq.d < ENEMY_ACTIVATE) z.active = true;
      if (!z.active) continue;
      z.phase += dt * (z.kind === 'runner' ? 16 : z.kind === 'giant' ? 6 : 11);

      z.d -= def.speed * this.zombieSpeed * dt;
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
              this.killNear(z.x, z.d, z.r + CONTACT_PAD + 0.4 + Math.min(2, z.weight * 0.05), Math.round(def.kills * z.weight));
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
      this.killSoldier(idx);
      z.grind -= 1;
    }
    z.atk += dt;
    if (z.atk >= GIANT_SMASH_INTERVAL && this.nearestSoldier(z.x, z.d, z.r + 1.6) >= 0) {
      z.atk = 0;
      const killed = this.killNear(z.x, z.d, z.r + 1.4, Math.max(3, Math.ceil(this.squad.count * (this.defense ? 0.03 : 0.05))));
      this.events.push({ type: 'giantSmash', x: z.x, d: z.d, killed });
    }
  }

  // ---------- 陷阱 ----------

  private updateHazards(dt: number) {
    const sq = this.squad;
    for (const h of this.hazards) {
      h.phase += dt;
      if (h.kind === 'saw') {
        const mid = (h.x0 + h.x1) / 2;
        const amp = (h.x1 - h.x0) / 2;
        h.x = mid + Math.sin(h.phase * 1.8) * amp;
      }
      const near = h.d1 + 1.5 >= sq.d + this.back && h.d0 - 1.5 <= sq.d + this.front;
      if (!near) continue;
      for (let i = this.soldiers.length - 1; i >= 0; i--) {
        const s = this.soldiers[i];
        const x = sq.x + s.ox;
        const d = sq.d + s.oz;
        if (h.kind === 'saw') {
          const dx = x - h.x;
          const dd = d - h.d0;
          if (dx * dx + dd * dd < SAW_RADIUS * SAW_RADIUS) {
            this.events.push({ type: 'trap', x, d });
            this.killSoldier(i);
          }
        } else if (x >= h.x0 && x <= h.x1 && d >= h.d0 && d <= h.d1) {
          s.spike += dt;
          if (s.spike >= SPIKE_EXPOSURE && s.luck < SPIKE_LETHALITY) {
            this.events.push({ type: 'trap', x, d });
            this.killSoldier(i);
          }
        }
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
      const bounty = bossBounty(this.spec.level, b.final, b.pair) * (this.opts.coinMult ?? 1);
      this.coins += bounty;
      this.addGems(bossGems(b.final, this.rng()), b.x, b.d);
      this.events.push({ type: 'bossDie', boss: b, bounty });
      // 防线中途 Boss 只补少量援军，避免多轮 Boss 后兵力滚雪球。
      if (this.defense && !b.final) this.applyReward({ kind: 'soldiers', amount: Math.max(2, Math.round(this.squad.count * 0.025)) }, b.x, b.d);
      for (const z of this.zombies) if (z.alive && z.owner === b.id) this.killZombie(z);
      // 防线模式要等全部刷完、清干净才算赢（在 step 里判断）
      if (!this.defense && this.bosses.every((x) => !x.alive)) this.win();
    }
  }

  private addGems(n: number, x: number, d: number) {
    if (n <= 0) return;
    this.gems += n;
    this.events.push({ type: 'gem', x, d, amount: n });
  }

  private win() {
    if (this.state === 'won') return;
    this.state = 'won';
    for (const z of this.near) if (z.alive && z.active) this.killZombie(z, false, false);
    this.projectiles.length = 0;
    this.events.push({ type: 'won' });
  }

  private updateBosses(dt: number) {
    if (this.state !== 'boss' && !(this.defense && this.state === 'run')) return;
    const sq = this.squad;
    const front = sq.d + this.front;
    const double = this.bosses.length > 1;
    for (const b of this.bosses) {
      if (!b.alive || !b.active) continue;
      const def = BOSSES[b.kind];
      b.fightTime += dt;
      if (!b.enraged && b.hp < b.maxHp * 0.5) {
        // 半血狂暴：出手快三成、走得快三成，吼一声变红
        b.enraged = true;
        this.events.push({ type: 'bossEnrage', boss: b });
      }
      const rage = b.enraged ? 1.3 : 1;
      // 横向跟着队伍，双 Boss 时各守一边
      // 防线：还在隔离墙那一段时守在自己的道上
      const inLane = this.defense && b.d > DEFENSE_WALL_D + b.r;
      const lim = inLane ? 0.8 : double && !this.defense ? 0.9 : 4.5;
      const tx = Math.max(b.homeX - lim, Math.min(b.homeX + lim, sq.x));
      // 蓄力和挥击时站稳，别在锁定危险带后横滑。
      if (!b.attacking) b.x += Math.max(-1, Math.min(1, tx - b.x)) * 0.9 * dt;
      const reach = front + b.r + 0.5;

      if (b.kind === 'thrower' && b.fightTime < 22) {
        // 远程：停在 15 外扔油桶，22 秒后狂暴冲过来
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
          // 每一下起手时锁定队伍站位，红色危险带留在原地。
          b.attacking = true;
          b.windup = 0;
          b.attackX = sq.x;
          b.attackD = sq.d + (this.front + this.back) / 2;
          b.attackLength = Math.max(2.4, this.front - this.back + 1.2);
        }
        const step = BOSS_COMBO[b.comboStep];
        b.windup += (dt * rage) / step.windup;
        if (b.windup >= 1) {
          b.windup = 0;
          b.slam = 1;
          b.smashes++;
          const frac = b.kind === 'hive' ? 0.05 : this.defense ? Math.min(0.28, 0.06 + 0.012 * b.smashes) : Math.min(0.38, 0.08 + 0.015 * b.smashes);
          const killed = this.killBossLane(b.attackX, b.attackD, BOSS_STRIKE_HALF, b.attackLength, Math.max(2, Math.ceil(sq.count * frac * step.damage)));
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
    for (const z of this.zombies) {
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
        this.projectiles.splice(i, 1);
        // 冲锋的 Boss 战和防线里都会炸（以前防线里油桶落地不炸，是个 bug）
        if (this.state === 'boss' || (this.state === 'run' && this.defense)) this.explode(p.tx, p.td, THROW_RADIUS, 'impact');
      }
    }
  }

  // ---------- 空袭 ----------

  private launchAirstrike() {
    const sq = this.squad;
    const targets: { x: number; d: number }[] = [];
    const ahead = this.zombies
      .filter((z) => z.alive && z.d > sq.d + 4 && z.d < sq.d + 48)
      .sort((a, b) => (b.kind === 'giant' ? 1 : 0) - (a.kind === 'giant' ? 1 : 0) || a.d - b.d);
    for (const z of ahead) {
      if (targets.length >= 8) break;
      if (targets.every((t) => Math.hypot(t.x - z.x, t.d - z.d) > 2.2)) targets.push({ x: z.x, d: z.d });
    }
    while (targets.length < 6) targets.push({ x: randRange(this.rng, -TRACK_HALF + 1, TRACK_HALF - 1), d: sq.d + randRange(this.rng, 12, 40) });
    targets.forEach((t, i) => {
      const s: Strike = { id: this.nextId++, x: t.x, d: t.d, t: -i * 0.12, T: 0.75 };
      this.strikes.push(s);
      this.events.push({ type: 'strike', strike: s });
    });
  }

  private updateStrikes(dt: number) {
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const s = this.strikes[i];
      s.t += dt;
      if (s.t >= s.T) {
        this.strikes.splice(i, 1);
        // 目标在这段时间里往前走了，按落点附近炸
        this.collectNear();
        this.explode(s.x, s.d - 1.5, STRIKE_RADIUS, 'strike');
      }
    }
  }

  private decay(dt: number) {
    for (const g of this.gates) g.bump = Math.max(0, g.bump - dt * 6);
    for (const b of this.barrels) b.bump = Math.max(0, b.bump - dt * 6);
    for (const z of this.near) z.flash = Math.max(0, z.flash - dt * 8);
    for (const b of this.bosses) {
      b.flash = Math.max(0, b.flash - dt * 8);
      b.slam = Math.max(0, b.slam - dt * 2.5);
    }
  }

  drainEvents(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
}

/** 线段 p + t*v（t∈[0,1]）第一次进入圆的参数 t，没碰到返回 -1 */
function segCircle(px: number, pz: number, vx: number, vz: number, cx: number, cz: number, r: number): number {
  const fx = px - cx;
  const fz = pz - cz;
  const c = fx * fx + fz * fz - r * r;
  if (c <= 0) return 0;
  const a = vx * vx + vz * vz;
  if (a < 1e-9) return -1;
  const b = 2 * (fx * vx + fz * vz);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : -1;
}
