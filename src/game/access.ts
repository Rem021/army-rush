import { MODES, type GameMode } from './config';
import type { SaveData } from '../save';

export function progressLevel(save: SaveData): number {
  return Math.max(save.level, save.defenseLevel);
}

export function modeUnlocked(save: SaveData, mode: GameMode): boolean {
  if (mode === 'carnage') return save.carnageAdmin || Math.max(save.best, save.defenseBest) >= 30;
  const def = MODES.find((m) => m.id === mode);
  return !!def && progressLevel(save) >= def.unlock;
}
