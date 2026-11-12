import { FORMATION_SPACING, MAX_SOLDIERS_SIM, TRACK_HALF, type GameMode } from './config';

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** 预计算向日葵阵型单位圆极坐标查找表，避免每帧对每个士兵做 sqrt / cos / sin */
const SUNFLOWER_X = new Float32Array(MAX_SOLDIERS_SIM);
const SUNFLOWER_Z = new Float32Array(MAX_SOLDIERS_SIM);

for (let i = 0; i < MAX_SOLDIERS_SIM; i++) {
  const r = Math.sqrt(i + 0.5);
  const a = i * GOLDEN_ANGLE;
  SUNFLOWER_X[i] = Math.cos(a) * r;
  SUNFLOWER_Z[i] = Math.sin(a) * r;
}

export interface FormationParams {
  sx: number;
  sz: number;
  shift: number;
  gap: number;
}

/** 阵型横向半径上限：狂潮模式有四条窄道，需收紧半宽以便大部队能贴到最左/最右补给道 */
export function formationLaneCap(mode: GameMode, defense: boolean): number {
  if (mode === 'carnage') return 1.2;
  return defense ? TRACK_HALF / 2 - 0.25 : 2.0;
}

/** 原地写入阵型参数（横向压缩、纵向拉伸、整体后移与间距），零堆分配 */
export function computeFormation(
  n: number,
  mode: GameMode,
  defense: boolean,
  lo: number,
  hi: number,
  out: FormationParams = { sx: 0, sz: 1, shift: 0, gap: FORMATION_SPACING },
): FormationParams {
  const gap = mode === 'carnage' ? 0.25 : FORMATION_SPACING * (defense ? Math.max(0.78, 1 - n / 900) : 1);
  const R = gap * Math.sqrt(Math.max(1, n));
  const laneCap = formationLaneCap(mode, defense);
  const maxR = Math.max(0.6, Math.min(laneCap, (hi - lo) / 2 - 0.35));
  const sx = R > maxR ? maxR / R : 1;
  const sz = mode === 'carnage' ? Math.min(1.15, 1 / sx) : 1 / sx;
  out.sx = sx;
  out.sz = sz;
  out.shift = defense ? -R * sz + 0.6 : 0;
  out.gap = gap;
  return out;
}

export function slotX(i: number, f: FormationParams): number {
  if (i >= 0 && i < MAX_SOLDIERS_SIM) return SUNFLOWER_X[i] * f.gap * f.sx;
  return Math.cos(i * GOLDEN_ANGLE) * Math.sqrt(i + 0.5) * f.gap * f.sx;
}

export function slotZ(i: number, f: FormationParams): number {
  if (i >= 0 && i < MAX_SOLDIERS_SIM) return SUNFLOWER_Z[i] * f.gap * f.sz + f.shift;
  return Math.sin(i * GOLDEN_ANGLE) * Math.sqrt(i + 0.5) * f.gap * f.sz + f.shift;
}
