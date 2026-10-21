import * as THREE from 'three';

export const LABEL_FONT = `900 {size}px "SF Pro Rounded", "Arial Rounded MT Bold", "Arial Black", system-ui, sans-serif`;

export interface LabelStyle {
  fill: string;
  stroke: string;
  /** 胶囊底色，不填就只有描边字 */
  pill?: string;
  size?: number;
  /** 第二行小字 */
  sub?: string;
  /** 文字前的小图标 */
  icon?: 'bolt' | 'skull';
}

/** 画在 canvas 上的文字，数值变了才重画 */
export class Label {
  readonly canvas: HTMLCanvasElement;
  readonly texture: THREE.CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D;
  private text = '';
  private styleKey = '';

  constructor(width = 256, height = 128) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
  }

  set(text: string, style: LabelStyle) {
    const key = `${style.fill}|${style.stroke}|${style.pill ?? ''}|${style.size ?? 0}|${style.sub ?? ''}|${style.icon ?? ''}`;
    if (text === this.text && key === this.styleKey) return;
    this.text = text;
    this.styleKey = key;
    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    let size = style.size ?? H * 0.72;
    if (style.sub) size = Math.min(size, H * 0.5);
    ctx.font = LABEL_FONT.replace('{size}', String(size));
    const iconW = style.icon ? size * 0.75 : 0;
    const maxW = W * (style.pill ? 0.8 : 0.9) - iconW;
    const measured = ctx.measureText(text).width;
    if (measured > maxW) {
      size *= maxW / measured;
      ctx.font = LABEL_FONT.replace('{size}', String(size));
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (style.pill) {
      const tw = Math.min(W - 8, ctx.measureText(text).width + size * 0.9);
      const ph = Math.min(H - 8, size * 1.25);
      const x = (W - tw) / 2;
      const y = (H - ph) / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      roundRect(ctx, x, y + 5, tw, ph, ph / 2);
      ctx.fill();
      ctx.fillStyle = style.pill;
      roundRect(ctx, x, y, tw, ph, ph / 2);
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.stroke();
    }
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.2;
    ctx.strokeStyle = style.stroke;
    const cy = style.sub ? H * 0.36 : H / 2 + size * 0.04;
    const tw = ctx.measureText(text).width;
    const cx = W / 2 + iconW / 2;
    if (style.icon) drawIcon(ctx, style.icon, cx - tw / 2 - iconW * 0.55, cy, size * 0.8, style.fill, style.stroke);
    ctx.strokeText(text, cx, cy);
    ctx.fillStyle = style.fill;
    ctx.fillText(text, cx, cy);
    if (style.sub) {
      const sub = H * 0.26;
      ctx.font = LABEL_FONT.replace('{size}', String(sub));
      ctx.lineWidth = sub * 0.22;
      ctx.strokeText(style.sub, W / 2, H * 0.78);
      ctx.fillText(style.sub, W / 2, H * 0.78);
    }
    this.texture.needsUpdate = true;
  }

  dispose() {
    this.texture.dispose();
  }
}

function drawIcon(ctx: CanvasRenderingContext2D, icon: 'bolt' | 'skull', x: number, y: number, size: number, fill: string, stroke: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 100, size / 100);
  ctx.beginPath();
  if (icon === 'bolt') {
    ctx.moveTo(12, -50);
    ctx.lineTo(-30, 8);
    ctx.lineTo(-2, 8);
    ctx.lineTo(-12, 50);
    ctx.lineTo(32, -12);
    ctx.lineTo(4, -12);
    ctx.closePath();
  } else {
    ctx.arc(0, -6, 34, 0, Math.PI * 2);
    ctx.rect(-18, 18, 36, 26);
  }
  ctx.lineWidth = 14;
  ctx.strokeStyle = stroke;
  ctx.stroke();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function formatNumber(n: number): string {
  const v = Math.round(n);
  const a = Math.abs(v);
  if (a < 10000) return String(v);
  if (a < 1e6) return `${(v / 1000).toFixed(a < 1e5 ? 1 : 0)}K`;
  return `${(v / 1e6).toFixed(1)}M`;
}

/** 平面文字（贴在门上） */
export function labelPlane(label: Label, width: number, height: number): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({ map: label.texture, transparent: true, depthWrite: false, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  mesh.renderOrder = 5;
  return mesh;
}

/** 始终朝向镜头的文字（桶血量、Boss 血量） */
export function labelSprite(label: Label, width: number, height: number, onTop = true): THREE.Sprite {
  const mat = new THREE.SpriteMaterial({ map: label.texture, depthTest: !onTop, depthWrite: false, toneMapped: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(width, height, 1);
  sprite.renderOrder = onTop ? 20 : 5;
  return sprite;
}

/** 血条贴图：深色底 + 彩色填充 + 居中的数字，比例或数字变了才重画 */
export class HpBar {
  readonly canvas: HTMLCanvasElement;
  readonly texture: THREE.CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D;
  private key = '';

  constructor(width = 320, height = 64) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
  }

  set(ratio: number, text: string, fill = '#e3262f', name = '') {
    const r = Math.max(0, Math.min(1, ratio));
    const key = `${Math.round(r * 200)}|${text}|${fill}|${name}`;
    if (key === this.key) return;
    this.key = key;
    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const top = name ? H * 0.42 : 4;
    const h = H - top - 4;
    if (name) {
      ctx.font = LABEL_FONT.replace('{size}', String(Math.round(H * 0.34)));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(20,6,8,0.9)';
      ctx.strokeText(name, W / 2, H * 0.2);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(name, W / 2, H * 0.2);
    }
    roundRect(ctx, 2, top, W - 4, h, h / 2);
    ctx.fillStyle = 'rgba(16,8,12,0.88)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.stroke();
    if (r > 0) {
      const pad = 5;
      roundRect(ctx, 2 + pad, top + pad, Math.max(h - pad * 2, (W - 4 - pad * 2) * r), h - pad * 2, (h - pad * 2) / 2);
      const g = ctx.createLinearGradient(0, top, 0, top + h);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.18, fill);
      g.addColorStop(1, fill);
      ctx.fillStyle = g;
      ctx.fill();
    }
    ctx.font = LABEL_FONT.replace('{size}', String(Math.round(h * 0.72)));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(4, h * 0.14);
    ctx.strokeStyle = 'rgba(20,6,8,0.95)';
    ctx.strokeText(text, W / 2, top + h / 2 + 1);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, W / 2, top + h / 2 + 1);
    this.texture.needsUpdate = true;
  }

  dispose() {
    this.texture.dispose();
  }
}
