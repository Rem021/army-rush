import { MODES, SKINS, type GameMode, type UpgradeId } from './game/config';

export interface SaveData {
  /** 冲锋当前关 */
  level: number;
  /** 防线当前关 */
  defenseLevel: number;
  defenseBest: number;
  endlessBest: number;
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
}

const KEY = 'army-rush.save.v1';

function defaults(): SaveData {
  return {
    level: 1,
    defenseLevel: 1,
    defenseBest: 0,
    endlessBest: 0,
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
    return {
      ...base,
      ...data,
      upgrades: { ...base.upgrades, ...(data.upgrades ?? {}) },
      owned: Array.isArray(data.owned) && data.owned.length ? data.owned : base.owned,
    };
  } catch {
    return base;
  }
}

/** 一键重置：进度、金币、钻石、升级、皮肤、战绩全部回到新号状态（音效、振动设置保留） */
export function resetSave(data: SaveData) {
  const { sound, haptics } = data;
  Object.assign(data, defaults(), { sound, haptics });
  writeSave(data);
}

export function writeSave(data: SaveData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // 隐私模式下可能写不进去，忽略
  }
}
