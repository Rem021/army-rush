import { TACTICS, type TacticId } from './game/tactics';
import { MODES, SKINS, type GameMode, type UpgradeId } from './game/config';

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

export function loadSave(): SaveData {
  const base = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const data = JSON.parse(raw) as Partial<SaveData>;
    // 护送、Boss 连战、每日挑战已经合并掉了，老存档停在那些模式的回到防线
    if (!MODES.some((m) => m.id === data.mode)) delete data.mode;
    const cleanInt = (val: unknown, fallback: number, min = 0) =>
      typeof val === 'number' && Number.isFinite(val) ? Math.max(min, Math.floor(val)) : fallback;
    const rawUp = (data.upgrades ?? {}) as Partial<Record<UpgradeId, number>>;
    const upgrades: Record<UpgradeId, number> = {
      soldiers: cleanInt(rawUp.soldiers, 0),
      damage: cleanInt(rawUp.damage, 0),
      rate: cleanInt(rawUp.rate, 0),
      income: cleanInt(rawUp.income, 0),
      agility: cleanInt(rawUp.agility, 0),
    };
    return {
      ...base,
      ...data,
      level: cleanInt(data.level, base.level, 1),
      defenseLevel: cleanInt(data.defenseLevel, base.defenseLevel, 1),
      defenseBest: cleanInt(data.defenseBest, base.defenseBest, 0),
      endlessBest: cleanInt(data.endlessBest, base.endlessBest, 0),
      carnageBest: cleanInt(data.carnageBest, base.carnageBest, 0),
      coins: cleanInt(data.coins, base.coins, 0),
      gems: cleanInt(data.gems, base.gems, 0),
      best: cleanInt(data.best, base.best, 0),
      kills: cleanInt(data.kills, base.kills, 0),
      wins: cleanInt(data.wins, base.wins, 0),
      carnageAdmin: data.carnageAdmin === true,
      tactic: TACTICS.some((t) => t.id === data.tactic) ? data.tactic! : base.tactic,
      motion: ['system', 'reduced', 'full'].includes(data.motion ?? '') ? data.motion! : base.motion,
      sensitivity: [0.75, 1, 1.3].includes(data.sensitivity ?? 0) ? data.sensitivity! : base.sensitivity,
      upgrades,
      skin: typeof data.skin === 'string' && data.skin ? data.skin : base.skin,
      owned: Array.isArray(data.owned) && data.owned.length ? data.owned : base.owned,
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
