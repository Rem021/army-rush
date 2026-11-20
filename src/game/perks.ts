/**
 * 局内肉鸽三选一战术进化卡牌系统（纯逻辑，零渲染依赖）。
 * 每张卡牌支持 Lv.1 -> Lv.3 叠层成长，涵盖链式闪电、冰冻脆化、空投泰坦机甲、
 * 轨道离子炮、扇形弹幕、能量护盾矩阵、超频暴击、高爆集束弹与纳米增援。
 */

export type PerkId =
  | 'chain_lightning'
  | 'cryo_rounds'
  | 'mech_drop'
  | 'orbital_laser'
  | 'fan_volley'
  | 'aegis_matrix'
  | 'overclock'
  | 'cluster_shells'
  | 'nanite_leech';

export type PerkRarity = 'rare' | 'epic' | 'legendary';

export interface PerkDef {
  id: PerkId;
  name: string;
  tag: string;
  rarity: PerkRarity;
  maxLevel: number;
  /** 主题十六进制色（用于卡牌边框、3D 降临光柱与徽章） */
  color: number;
  /** 图标键名（对应 UI 战术图标） */
  icon: 'lightning' | 'cryo' | 'mech' | 'orbital' | 'fan' | 'shield' | 'overclock' | 'cluster' | 'nanite';
  /** 每一级的效果短说明（下标 0 = Lv.1） */
  levels: readonly [string, string, string];
}

export const PERKS: readonly PerkDef[] = [
  {
    id: 'chain_lightning',
    name: '链式电弧',
    tag: '范围电击',
    rarity: 'epic',
    maxLevel: 3,
    color: 0x38bdf8,
    icon: 'lightning',
    levels: [
      '命中 38% 触发高压电弧，在 3 名敌人间弹跳电击',
      '触发率升至 58%，连锁弹跳 5 名敌人且电弧伤害 +45%',
      '触发率升至 78%，连锁弹跳 7 名敌人并附带高压过载',
    ],
  },
  {
    id: 'cryo_rounds',
    name: '极寒冻弹',
    tag: '减速易伤',
    rarity: 'rare',
    maxLevel: 3,
    color: 0x67e8f9,
    icon: 'cryo',
    levels: [
      '子弹冰霜减速敌人 36%，被冻目标受到伤害 +22%',
      '减速强化至 50%，冰霜脆化易伤提升至 +38%',
      '深度冰封减速 62%，目标易伤高达 +55%',
    ],
  },
  {
    id: 'mech_drop',
    name: '泰坦机甲空投',
    tag: '重装友军',
    rarity: 'legendary',
    maxLevel: 3,
    color: 0xf59e0b,
    icon: 'mech',
    levels: [
      '立刻空降 1 台蓝金泰坦机甲入队护航，机炮+追踪导弹齐射',
      '再空降 1 台泰坦机甲（共 2 台），全机甲火力 +35%',
      '满编 3 台泰坦机甲护航阵线，导弹齐射冷却大幅缩短',
    ],
  },
  {
    id: 'orbital_laser',
    name: '轨道离子炮',
    tag: '天基打击',
    rarity: 'legendary',
    maxLevel: 3,
    color: 0xc084fc,
    icon: 'orbital',
    levels: [
      '每 5.4 秒锁定最高血量目标降下轨道离子激光，巨额范围灼烧',
      '冷却缩至 3.9 秒，激光直径与毁灭伤害提升 +50%',
      '冷却缩至 2.7 秒，每次同时轰落双束轨道离子炮！',
    ],
  },
  {
    id: 'fan_volley',
    name: '扇形多重齐射',
    tag: '弹幕扩张',
    rarity: 'epic',
    maxLevel: 3,
    color: 0xe879f9,
    icon: 'fan',
    levels: [
      '全员追加 +1 道扇形齐射弹道，火力覆盖面瞬间翻倍',
      '全员追加 +2 道宽幅扇形弹道，清场效率质变',
      '全员追加 +3 道终极扇形弹幕，横扫整片战场',
    ],
  },
  {
    id: 'aegis_matrix',
    name: '宙斯护盾矩阵',
    tag: '防御反伤',
    rarity: 'rare',
    maxLevel: 3,
    color: 0x22d3ee,
    icon: 'shield',
    levels: [
      '立刻获得 +14 层 3D 能量护盾，且每 6 秒自动再生 +2 层',
      '立刻获得 +20 层护盾，每 5 秒再生 +3 层，格挡震荡波伤害翻倍',
      '立刻获得 +28 层护盾，每 4 秒再生 +4 层，全场高能反伤护体',
    ],
  },
  {
    id: 'overclock',
    name: '超频暴击芯片',
    tag: '攻速暴击',
    rarity: 'rare',
    maxLevel: 3,
    color: 0xfacc15,
    icon: 'overclock',
    levels: [
      '全队射速 +24%，暴击率 +26%（暴击造成 2.2× 致命伤害）',
      '全队射速 +44%，暴击率 +42%（暴击倍率升至 2.5×）',
      '全队射速 +68%，暴击率 +58%（暴击倍率升至 2.8×）',
    ],
  },
  {
    id: 'cluster_shells',
    name: '高爆集束弹',
    tag: '火焰爆破',
    rarity: 'epic',
    maxLevel: 3,
    color: 0xf97316,
    icon: 'cluster',
    levels: [
      '子弹命中 30% 引爆火焰集束冲击波，清怪爽感拉满',
      '触发率升至 48%，爆炸半径与溅射威力大幅提升',
      '触发率升至 68%，密集连环烈焰轰平尸潮',
    ],
  },
  {
    id: 'nanite_leech',
    name: '纳米战地增援',
    tag: '越战越勇',
    rarity: 'rare',
    maxLevel: 3,
    color: 0x4ade80,
    icon: 'nanite',
    levels: [
      '每击杀 16 名敌人自动增援 +1 士兵并回复 +1 层护盾',
      '每击杀 11 名敌人自动增援 +1 士兵并回复 +2 层护盾',
      '每击杀 7 名敌人自动增援 +2 士兵并回复 +2 层护盾',
    ],
  },
] as const;

export const PERK_MAP: Record<PerkId, PerkDef> = Object.fromEntries(PERKS.map((p) => [p.id, p])) as Record<PerkId, PerkDef>;

const RARITY_WEIGHT: Record<PerkRarity, number> = {
  rare: 1.0,
  epic: 0.9,
  legendary: 0.78,
};

/** 抽取 3 张互不重复、未满级的战术进化卡；保证至少有高品阶亮点卡 */
export function rollPerkChoices(levels: Partial<Record<PerkId, number>>, rng: () => number, count = 3): PerkDef[] {
  const pool = PERKS.filter((p) => (levels[p.id] ?? 0) < p.maxLevel);
  if (pool.length <= count) return [...pool];

  const picked: PerkDef[] = [];
  const remaining = [...pool];

  // 优先抽一张史诗或传说卡作为核心爽点
  const highPool = remaining.filter((p) => p.rarity === 'epic' || p.rarity === 'legendary');
  if (highPool.length > 0) {
    const first = pickWeighted(highPool, levels, rng);
    picked.push(first);
    const idx = remaining.indexOf(first);
    if (idx >= 0) remaining.splice(idx, 1);
  }

  while (picked.length < count && remaining.length > 0) {
    const choice = pickWeighted(remaining, levels, rng);
    picked.push(choice);
    const idx = remaining.indexOf(choice);
    if (idx >= 0) remaining.splice(idx, 1);
  }

  // 打乱顺序避免传说卡总在第一格
  for (let i = picked.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [picked[i], picked[j]] = [picked[j], picked[i]];
  }
  return picked;
}

function pickWeighted(list: PerkDef[], levels: Partial<Record<PerkId, number>>, rng: () => number): PerkDef {
  let total = 0;
  const weights = list.map((p) => {
    const lvl = levels[p.id] ?? 0;
    // 已选过的卡略微提高权重，方便玩家叠到满级质变；同时新卡也有高曝光
    const w = RARITY_WEIGHT[p.rarity] * (lvl > 0 ? 1.15 : 1.0);
    total += w;
    return w;
  });
  let r = rng() * total;
  for (let i = 0; i < list.length; i++) {
    r -= weights[i];
    if (r <= 0) return list[i];
  }
  return list[list.length - 1];
}

/** 升到下一级所需的局内经验值（难度逐级加重，每局 2~4 次关键进化，避免频繁打断战斗） */
export function xpForNextDraft(level: number): number {
  return Math.round(105 + level * 185 + level * level * 115 + level * level * level * 32);
}

/** AI / 自动托管选卡优先级 */
const AUTO_PRIORITY: readonly PerkId[] = [
  'mech_drop',
  'orbital_laser',
  'chain_lightning',
  'fan_volley',
  'cluster_shells',
  'overclock',
  'aegis_matrix',
  'cryo_rounds',
  'nanite_leech',
];

export function pickBestPerk(choices: readonly PerkDef[], levels: Partial<Record<PerkId, number>>): PerkDef | null {
  if (choices.length === 0) return null;
  let best = choices[0];
  let bestScore = -1;
  for (const c of choices) {
    const prio = AUTO_PRIORITY.indexOf(c.id);
    const score = (AUTO_PRIORITY.length - (prio < 0 ? AUTO_PRIORITY.length : prio)) * 10 + (levels[c.id] ?? 0) * 3;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}
