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

  /** 每把枪一种枪声：换枪以后耳朵也听得出来，带低频胸腔震感 */
  shot(tier: number) {
    switch (tier) {
      case 0: // 手枪：清脆的单发 + 低频底鼓脉冲
        if (!this.ready('shot', 0.072)) return;
        this.hiss(0.055, 0.14, 'highpass', 2200, 820);
        this.tone('square', 320, 105, 0.045, 0.028);
        this.tone('sine', 135, 52, 0.05, 0.045);
        break;
      case 1: // 冲锋枪：又密又脆的连发脉冲
        if (!this.ready('shot', 0.042)) return;
        this.hiss(0.038, 0.11, 'highpass', 2800, 1250);
        this.tone('square', 380, 145, 0.028, 0.022);
        this.tone('sine', 150, 62, 0.036, 0.035);
        break;
      case 2: // 突击步枪：更沉、更有劲的膛压感
        if (!this.ready('shot', 0.056)) return;
        this.hiss(0.075, 0.17, 'bandpass', 1750, 460);
        this.tone('sawtooth', 210, 58, 0.065, 0.04);
        this.tone('sine', 120, 45, 0.065, 0.055);
        break;
      case 3: // 战术步枪：尖锐高穿透“啪”声 + 重击尾音
        if (!this.ready('shot', 0.066)) return;
        this.hiss(0.05, 0.16, 'highpass', 3600, 1400);
        this.tone('square', 640, 195, 0.052, 0.03);
        this.tone('sine', 140, 48, 0.06, 0.05);
        break;
      case 4: // 加特林：密集金属撕裂连射
        if (!this.ready('shot', 0.036)) return;
        this.hiss(0.034, 0.1, 'bandpass', 2300, 1100);
        this.tone('sawtooth', 165, 85, 0.038, 0.034);
        this.tone('sine', 110, 46, 0.04, 0.042);
        break;
      case 5: // 黄金步枪：厚重轰鸣 + 金属泛音回响
        if (!this.ready('shot', 0.075)) return;
        this.hiss(0.085, 0.18, 'lowpass', 3200, 380);
        this.tone('sine', 135, 42, 0.11, 0.07);
        this.tone('triangle', 1320, 960, 0.09, 0.018);
        break;
      default: // 等离子炮：高频电弧爆裂 + 重低音冲击
        if (!this.ready('shot', 0.075)) return;
        this.tone('sine', 1550, 195, 0.1, 0.045);
        this.tone('square', 780, 110, 0.085, 0.02);
        this.tone('sine', 115, 38, 0.09, 0.06);
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
          // 命中反馈音（Hitmarker）：杂兵清脆噗嗤/骨裂感、铁桶金属闷响、Boss/巨怪厚重受击，带限流防糊
          if (e.target === 'zombie' && this.ready('hitZombie', 0.048)) {
            this.tone('triangle', 520 + Math.random() * 180, 150, 0.032, 0.032);
            this.hiss(0.026, 0.055, 'bandpass', 2100, 900);
          } else if (e.target === 'barrel' && this.ready('hitBarrel', 0.068)) {
            this.tone('square', 165 + Math.random() * 35, 72, 0.055, 0.048);
            this.tone('triangle', 680 + Math.random() * 90, 320, 0.035, 0.025);
          } else if ((e.target === 'boss' || e.target === 'giant') && this.ready('hitBoss', 0.075)) {
            this.hiss(0.065, 0.11, 'lowpass', 1100, 220);
            this.tone('sine', 125 + Math.random() * 25, 48, 0.065, 0.065);
          }
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
          else if (this.ready('pop', 0.032)) {
            this.tone('sine', 460 + Math.random() * 220, 95, 0.095, 0.14);
            this.hiss(0.045, 0.075, 'bandpass', 1800, 520);
          }
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
        case 'carnageBlast':
          if (this.ready('carnage', 0.15)) this.boom(e.nova ? 1.8 : 0.7);
          break;
        case 'explode':
          if (this.ready(`explode-${e.source}`, 0.06)) this.boom(e.source === 'exploder' ? 0.8 : 1.6);
          break;
        case 'giantSmash':
        case 'bossSmash':
          if (this.ready('smash', 0.12)) {
            const quick = e.type === 'bossSmash' && e.combo >= 2;
            const finisher = e.type === 'bossSmash' && e.combo === 4;
            this.hiss(quick ? 0.22 : 0.42, quick ? 0.3 : 0.48, 'lowpass', quick ? 1150 : 900, 60);
            this.tone('sine', quick ? 105 : 80, 30, quick ? 0.24 : 0.46, finisher ? 0.5 : quick ? 0.32 : 0.46);
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
