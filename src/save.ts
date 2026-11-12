import { TACTICS, type TacticId } from './game/tactics';
import { MODES, SKINS, UPGRADES, type GameMode, type UpgradeId } from './game/config';

export interface SaveData {
  /** 冲锋当前关 */
  level: number;
  /** 防线当前关 */
  defenseLevel: number;
  defenseBest: number;
  endlessBest: number;
  carnageBest: number;
  /** 本浏览器的狂潮试玩通行证，不授予账号或服务器权限。 */
  carnageAdmin: boolean;
  /** 上次选的模式 */
  mode: GameMode;
  coins: number;
  /** 钻石：稀有货币，只能升兵力 */
  gems: number;
  upgrades: Record<UpgradeId, number>;
  skin: string;
  owned: string[];
  best: number;
  kills: number;
  wins: number;
  sound: boolean;
  haptics: boolean;
  tactic: TacticId;
  motion: 'system' | 'reduced' | 'full';
  sensitivity: number;
}

const KEY = 'army-rush.save.v1';

const UPGRADE_MAX: Record<UpgradeId, number> = UPGRADES.reduce(
  (acc, u) => {
    acc[u.id] = u.max;
    return acc;
  },
  {} as Record<UpgradeId, number>,
);

function defaults(): SaveData {
  return {
    level: 1,
    defenseLevel: 1,
    defenseBest: 0,
    endlessBest: 0,
    carnageBest: 0,
    carnageAdmin: false,
    mode: 'defense',
    coins: 0,
    gems: 0,
    upgrades: { soldiers: 0, damage: 0, rate: 0, income: 0, agility: 0 },
    skin: SKINS[0].id,
    owned: [SKINS[0].id],
    best: 0,
    kills: 0,
    wins: 0,
    sound: true,
    haptics: true,
    tactic: 'balanced',
    motion: 'system',
    sensitivity: 1,
  };
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

export function loadSave(): SaveData {
  const base = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const parsed: unknown = JSON.parse(raw);
    if (!isPlainObject(parsed)) return base;
    const data = parsed as Partial<SaveData>;
    const cleanInt = (val: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER) =>
      typeof val === 'number' && Number.isFinite(val) ? Math.min(max, Math.max(min, Math.floor(val))) : fallback;
    const rawUp = isPlainObject(data.upgrades) ? (data.upgrades as Partial<Record<UpgradeId, number>>) : {};
    const upgrades: Record<UpgradeId, number> = {
      soldiers: cleanInt(rawUp.soldiers, 0, 0, UPGRADE_MAX.soldiers),
      damage: cleanInt(rawUp.damage, 0, 0, UPGRADE_MAX.damage),
      rate: cleanInt(rawUp.rate, 0, 0, UPGRADE_MAX.rate),
      income: cleanInt(rawUp.income, 0, 0, UPGRADE_MAX.income),
      agility: cleanInt(rawUp.agility, 0, 0, UPGRADE_MAX.agility),
    };
    const rawOwned = Array.isArray(data.owned)
      ? [...new Set(data.owned.filter((s): s is string => typeof s === 'string' && s.trim().length > 0))]
      : [];
    const owned = rawOwned.length > 0 ? rawOwned : base.owned;
    const rawSkin = typeof data.skin === 'string' && data.skin.trim().length > 0 ? data.skin : '';
    const skin = rawSkin && owned.includes(rawSkin) ? rawSkin : owned[0];
    // 护送、Boss 连战、每日挑战已经合并掉了，老存档停在那些模式的回到防线
    const mode = MODES.some((m) => m.id === data.mode) ? (data.mode as GameMode) : base.mode;
    return {
      level: cleanInt(data.level, base.level, 1, 9999),
      defenseLevel: cleanInt(data.defenseLevel, base.defenseLevel, 1, 9999),
      defenseBest: cleanInt(data.defenseBest, base.defenseBest, 0, 9999),
      endlessBest: cleanInt(data.endlessBest, base.endlessBest, 0),
      carnageBest: cleanInt(data.carnageBest, base.carnageBest, 0),
      carnageAdmin: data.carnageAdmin === true,
      mode,
      coins: cleanInt(data.coins, base.coins, 0),
      gems: cleanInt(data.gems, base.gems, 0),
      upgrades,
      skin,
      owned,
      best: cleanInt(data.best, base.best, 0, 9999),
      kills: cleanInt(data.kills, base.kills, 0),
      wins: cleanInt(data.wins, base.wins, 0),
      sound: typeof data.sound === 'boolean' ? data.sound : base.sound,
      haptics: typeof data.haptics === 'boolean' ? data.haptics : base.haptics,
      tactic: TACTICS.some((t) => t.id === data.tactic) ? (data.tactic as TacticId) : base.tactic,
      motion: data.motion === 'system' || data.motion === 'reduced' || data.motion === 'full' ? data.motion : base.motion,
      sensitivity: data.sensitivity === 0.75 || data.sensitivity === 1 || data.sensitivity === 1.3 ? data.sensitivity : base.sensitivity,
    };
  } catch {
    return base;
  }
}

/** 一键重置：进度、金币、钻石、升级、皮肤、战绩全部回到新号状态（音效、振动、灵敏度与动态偏好保留） */
export function resetSave(data: SaveData) {
  const { sound, haptics, motion, sensitivity } = data;
  Object.assign(data, defaults(), { sound, haptics, motion, sensitivity });
  writeSave(data);
}

export function writeSave(data: SaveData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // 隐私模式下可能写不进去，忽略
  }
}
