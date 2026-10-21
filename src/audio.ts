import type { GameEvent } from './game/world';

/** 全部音效用 WebAudio 现场合成，不需要音频文件 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private last = new Map<string, number>();
  enabled = true;

  /** iOS 必须在用户手势里创建/恢复 AudioContext */
  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private ready(name: string, minGap: number): AudioContext | null {
    if (!this.enabled || !this.ctx || !this.master || this.ctx.state !== 'running') return null;
    const now = this.ctx.currentTime;
    const prev = this.last.get(name) ?? -1;
    if (now - prev < minGap) return null;
    this.last.set(name, now);
    return this.ctx;
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private hiss(dur: number, vol: number, filter: BiquadFilterType, f0: number, f1: number, delay = 0) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const biq = ctx.createBiquadFilter();
    biq.type = filter;
    biq.frequency.setValueAtTime(f0, t);
    biq.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(biq).connect(g).connect(this.master!);
    src.start(t, Math.random() * 0.3);
    src.stop(t + dur + 0.02);
  }

  /** 每把枪一种枪声：换枪以后耳朵也听得出来 */
  shot(tier: number) {
    switch (tier) {
      case 0: // 手枪：清脆的单发
        if (!this.ready('shot', 0.075)) return;
        this.hiss(0.05, 0.12, 'highpass', 2400, 900);
        this.tone('square', 300, 110, 0.04, 0.02);
        break;
      case 1: // 冲锋枪：又轻又密的哒哒声
        if (!this.ready('shot', 0.045)) return;
        this.hiss(0.035, 0.09, 'highpass', 3000, 1400);
        this.tone('square', 360, 160, 0.025, 0.015);
        break;
      case 2: // 突击步枪：更沉、更有劲
        if (!this.ready('shot', 0.06)) return;
        this.hiss(0.07, 0.15, 'bandpass', 1800, 500);
        this.tone('sawtooth', 190, 60, 0.06, 0.03);
        break;
      case 3: // 战术步枪：尖利的“啪”
        if (!this.ready('shot', 0.07)) return;
        this.hiss(0.045, 0.14, 'highpass', 3800, 1600);
        this.tone('square', 620, 220, 0.05, 0.022);
        break;
      case 4: // 加特林：嗡嗡的连射
        if (!this.ready('shot', 0.04)) return;
        this.hiss(0.03, 0.08, 'bandpass', 2200, 1200);
        this.tone('sawtooth', 150, 95, 0.035, 0.025);
        break;
      case 5: // 黄金步枪：厚重的一枪，带一点金属回响
        if (!this.ready('shot', 0.08)) return;
        this.hiss(0.08, 0.16, 'lowpass', 3200, 400);
        this.tone('sine', 130, 50, 0.1, 0.05);
        this.tone('triangle', 1320, 990, 0.09, 0.012);
        break;
      default: // 等离子炮：电流“咻”
        if (!this.ready('shot', 0.08)) return;
        this.tone('sine', 1500, 220, 0.1, 0.035);
        this.tone('square', 760, 120, 0.08, 0.012);
        break;
    }
  }

  /** 换了更好的枪（或者局外武器进化）：上膛 + 低音一锤 + 往上走的和弦，档位越高越亮 */
  weaponUp(tier: number) {
    if (!this.ready('weaponUp', 0.3)) return;
    this.hiss(0.04, 0.3, 'highpass', 3000, 2000);
    this.hiss(0.05, 0.3, 'bandpass', 1600, 900, 0.09);
    this.tone('sine', 90, 40, 0.35, 0.3, 0.05);
    const base = 392 * Math.pow(2, Math.min(6, tier) / 12);
    [1, 1.26, 1.5, 2].forEach((m, i) => this.tone('square', base * m, base * m, i === 3 ? 0.35 : 0.11, 0.07, 0.14 + i * 0.07));
    this.tone('triangle', base * 4, base * 4, 0.4, 0.05, 0.42);
  }

  click() {
    if (!this.ready('click', 0.03)) return;
    this.tone('triangle', 900, 1200, 0.06, 0.12);
  }

  coin() {
    if (!this.ready('coin', 0.04)) return;
    this.tone('square', 1320, 1320, 0.06, 0.05);
    this.tone('square', 1760, 1760, 0.12, 0.05, 0.06);
  }

  private boom(size: number) {
    this.hiss(0.3 + size * 0.15, Math.min(0.55, 0.25 + size * 0.1), 'lowpass', 2400, 90);
    this.tone('sine', 110, 35, 0.25 + size * 0.1, Math.min(0.5, 0.22 + size * 0.1));
  }

  handle(events: GameEvent[], tier: number, firing: boolean) {
    if (!this.ctx || !this.enabled) return;
    if (firing) this.shot(tier);
    for (const e of events) {
      switch (e.type) {
        case 'hit':
          // 打中的声音：障碍“咚”、Boss“噗”，限流免得糊成一片
          if (e.target === 'barrel' && this.ready('hitBarrel', 0.075)) this.tone('square', 140 + Math.random() * 30, 70, 0.05, 0.035);
          else if ((e.target === 'boss' || e.target === 'giant') && this.ready('hitBoss', 0.09)) this.hiss(0.06, 0.08, 'lowpass', 900, 200);
          break;
        case 'gateUp':
          if (this.ready('gateUp', 0.07)) this.tone('triangle', 700 + Math.min(600, Math.abs(e.gate.value) * 18), 900, 0.06, 0.07);
          break;
        case 'gatePass':
          if (e.after >= e.before) {
            if (this.ready('gateGood', 0.1)) {
              this.tone('triangle', 784, 784, 0.1, 0.16);
              this.tone('triangle', 988, 988, 0.1, 0.16, 0.07);
              this.tone('triangle', 1319, 1319, 0.18, 0.16, 0.14);
            }
          } else if (this.ready('gateBad', 0.1)) {
            this.tone('sawtooth', 320, 110, 0.35, 0.12);
          }
          break;
        case 'zombieDie':
          if (e.kind === 'giant') this.boom(2);
          else if (this.ready('pop', 0.035)) this.tone('sine', 420 + Math.random() * 200, 110, 0.09, 0.12);
          break;
        case 'soldierDie':
          if (this.ready('ouch', 0.06)) this.tone('square', 220, 90, 0.08, 0.05);
          break;
        case 'barrelBreak':
          if (this.ready('boom', 0.05)) this.boom(1);
          // 门道放行：一声往上扬的呼啸
          if (e.barrel.block) {
            this.hiss(0.55, 0.22, 'bandpass', 300, 2600, 0.08);
            this.tone('sawtooth', 180, 520, 0.4, 0.05, 0.08);
          }
          break;
        case 'bossStart':
          // 低吼，0.45 秒后落地一声闷响（和画面里从天而降对上）
          if (this.ready('roar', 0.4)) {
            this.tone('sawtooth', 70, 48, 0.8, 0.14);
            this.hiss(0.7, 0.18, 'lowpass', 700, 120);
            this.hiss(0.45, 0.5, 'lowpass', 900, 50, 0.45);
            this.tone('sine', 90, 28, 0.5, 0.5, 0.45);
          }
          break;
        case 'explode':
          if (this.ready(`explode-${e.source}`, 0.06)) this.boom(e.source === 'exploder' ? 0.8 : 1.6);
          break;
        case 'giantSmash':
        case 'bossSmash':
          if (this.ready('smash', 0.2)) {
            this.hiss(0.5, 0.5, 'lowpass', 900, 60);
            this.tone('sine', 80, 30, 0.5, 0.5);
          }
          break;
        case 'throw':
          // 扔出来先“嘀嘀”两声警报：红圈里的兵会全死
          if (this.ready('throw', 0.1)) {
            this.hiss(0.5, 0.16, 'bandpass', 600, 2200);
            this.tone('square', 1180, 1180, 0.07, 0.07);
            this.tone('square', 1180, 1180, 0.07, 0.07, 0.14);
          }
          break;
        case 'strike':
          if (this.ready('strike', 0.15)) this.tone('sine', 1800, 500, 0.7, 0.08);
          break;
        case 'hiveSpawn':
          this.hiss(0.3, 0.2, 'bandpass', 300, 900);
          this.tone('sawtooth', 90, 140, 0.3, 0.08);
          break;
        case 'gem':
          // 钻石：一串清脆的高音
          [1568, 2093, 2637].forEach((f, i) => this.tone('triangle', f, f, 0.12, 0.08, i * 0.06));
          break;
        case 'bossEnrage':
          // 狂暴：一声更高更长的怒吼
          this.tone('sawtooth', 120, 60, 1.1, 0.18);
          this.tone('sawtooth', 180, 90, 1.0, 0.1, 0.05);
          this.hiss(0.9, 0.22, 'bandpass', 400, 1600);
          break;
        case 'bossDie':
          this.boom(3);
          this.tone('sawtooth', 160, 40, 1.0, 0.18);
          break;
        case 'trap':
          if (this.ready('trap', 0.08)) this.tone('square', 900, 300, 0.06, 0.05);
          break;
        case 'banner':
          if (e.tone === 'boss') {
            this.tone('sawtooth', 98, 92, 0.9, 0.16);
            this.tone('sawtooth', 147, 139, 0.9, 0.1);
          } else if (e.tone === 'danger') {
            [660, 520, 660, 520].forEach((f, i) => this.tone('square', f, f, 0.1, 0.06, i * 0.12));
          } else {
            this.tone('triangle', 660, 880, 0.15, 0.1);
          }
          break;
        case 'reward':
          // 换枪的声音由 weaponUp 统一放
          if (e.reward.kind !== 'weapon') this.coin();
          break;
        case 'blocked':
          // 大障碍卡住：一声沉重的金属撞击
          if (this.ready('blocked', 0.3)) {
            this.tone('square', 150, 70, 0.22, 0.12);
            this.hiss(0.25, 0.25, 'lowpass', 1200, 120);
          }
          break;
        case 'won':
          this.hiss(0.8, 0.4, 'lowpass', 3000, 100);
          [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone('triangle', f, f, i === 4 ? 0.5 : 0.14, 0.18, 0.25 + i * 0.11));
          break;
        case 'lost':
          [392, 330, 262, 196].forEach((f, i) => this.tone('triangle', f, f * 0.98, 0.25, 0.16, i * 0.16));
          break;
        default:
          break;
      }
    }
  }
}

/** 振动。iOS Safari 不支持 navigator.vibrate，会静默跳过 */
export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // ignore
  }
}
