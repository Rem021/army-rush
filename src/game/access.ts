import { BLITZ_STAGES, MODES, type BlitzStage, type GameMode } from './config';
import type { SaveData } from '../save';

export function progressLevel(save: SaveData): number {
  return Math.max(save.level, save.defenseLevel);
}

export function clearedStages(save: SaveData): number {
  return Math.max(save.best, save.defenseBest);
}

export function blitzStageUnlocked(save: SaveData, stage: BlitzStage): boolean {
  if (save.blitzAdmin) return true;
  const def = BLITZ_STAGES.find((s) => s.stage === stage);
  return !!def && clearedStages(save) >= def.unlock;
}

export function modeUnlocked(save: SaveData, mode: GameMode): boolean {
  if (mode === 'carnage') return save.carnageAdmin || clearedStages(save) >= 30;
  if (mode === 'blitz') return save.blitzAdmin || clearedStages(save) >= 5;
  const def = MODES.find((m) => m.id === mode);
  return !!def && progressLevel(save) >= def.unlock;
}
