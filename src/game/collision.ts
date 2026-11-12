/** 线段 p + t*v（t∈[0,1]）第一次进入圆的参数 t，没碰到返回 -1 */
export function segCircle(px: number, pz: number, vx: number, vz: number, cx: number, cz: number, r: number): number {
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

/** 沿纵向 d 分桶的可复用一维空间索引，预热后零数组分配 */
export class SpatialBins<T extends { d: number; r: number; alive: boolean }> {
  readonly bins: T[][] = [];
  lo = 0;
  maxR = 0.5;
  activeCount = 0;

  constructor(readonly binSize = 2) {}

  build(items: readonly T[], lo: number, hi: number) {
    const n = Math.max(1, Math.ceil((hi - lo) / this.binSize) + 1);
    while (this.bins.length < n) this.bins.push([]);
    for (let i = 0; i < n; i++) this.bins[i].length = 0;
    let maxR = 0.5;
    for (let k = 0; k < items.length; k++) {
      const item = items[k];
      if (!item.alive) continue;
      const idx = Math.floor((item.d - lo) / this.binSize);
      if (idx < 0 || idx >= n) continue;
      this.bins[idx].push(item);
      if (item.r > maxR) maxR = item.r;
    }
    this.lo = lo;
    this.maxR = maxR;
    this.activeCount = n;
  }

  range(dmin: number, dmax: number): [number, number] {
    if (this.activeCount === 0) return [1, 0];
    const b0 = Math.max(0, Math.floor((dmin - this.maxR - this.lo) / this.binSize));
    const b1 = Math.min(this.activeCount - 1, Math.floor((dmax + this.maxR - this.lo) / this.binSize));
    return [b0, b1];
  }
}
