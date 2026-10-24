// 界面图标，全部内联 SVG，24×24 网格（少数徽章另行注明）。

const svg = (body: string, view = '0 0 24 24') => `<svg viewBox="${view}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;

export const ICON = {
  coin: svg(
    `<circle cx="12" cy="12" r="10.5" fill="url(#ar-coin)" stroke="#a85d00" stroke-width="1.2"/>
     <circle cx="12" cy="12" r="7" fill="none" stroke="#b86a00" stroke-width="1" opacity=".55"/>
     <path d="M12 7.2l1.45 2.95 3.25.47-2.35 2.3.55 3.23L12 14.62l-2.9 1.53.55-3.23-2.35-2.3 3.25-.47z" fill="#b86a00" opacity=".75"/>`,
  ),
  gear: svg(
    `<path fill="#dfe8ff" d="M13.9 2.5l.5 2.3c.6.2 1.1.5 1.6.9l2.2-.8 1.9 3.3-1.7 1.5c.1.6.1 1.2 0 1.8l1.7 1.5-1.9 3.3-2.2-.8c-.5.4-1 .7-1.6.9l-.5 2.3h-3.8l-.5-2.3c-.6-.2-1.1-.5-1.6-.9l-2.2.8-1.9-3.3 1.7-1.5c-.1-.6-.1-1.2 0-1.8L3.9 8.2l1.9-3.3 2.2.8c.5-.4 1-.7 1.6-.9l.5-2.3z"/><circle cx="12" cy="11.5" r="3.2" fill="#1a2440"/>`,
  ),
  pause: svg(`<rect x="6" y="5" width="4.2" height="14" rx="1.5" fill="#fff"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.5" fill="#fff"/>`),
  close: svg(`<path d="M6 6l12 12M18 6L6 18" stroke="#dfe8ff" stroke-width="2.6" stroke-linecap="round"/>`),
  chevron: svg(`<path d="M9 5l7 7-7 7" stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`),
  lock: svg(`<rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="#c7d2ea"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" stroke="#c7d2ea" stroke-width="2.4" fill="none"/><circle cx="12" cy="15.5" r="1.6" fill="#1a2440"/>`),
  skull: svg(
    `<path d="M12 2.5c-5 0-8.5 3.4-8.5 8 0 2.9 1.4 5 3.5 6.2V20c0 .8.7 1.5 1.5 1.5h7c.8 0 1.5-.7 1.5-1.5v-3.3c2.1-1.2 3.5-3.3 3.5-6.2 0-4.6-3.5-8-8.5-8z" fill="#fff"/>
     <circle cx="8.6" cy="11" r="2.4" fill="#2a0a10"/><circle cx="15.4" cy="11" r="2.4" fill="#2a0a10"/><path d="M12 13.6l-1.4 2.4h2.8z" fill="#2a0a10"/>`,
  ),
  star: svg(`<path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.45L12 17.45 6.2 20.5l1.1-6.45-4.7-4.6 6.5-.95z" fill="#ffd23f" stroke="#a85d00" stroke-width="1.2" stroke-linejoin="round"/>`),
  starOff: svg(`<path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.45L12 17.45 6.2 20.5l1.1-6.45-4.7-4.6 6.5-.95z" fill="#2a3656" stroke="#45557a" stroke-width="1.2" stroke-linejoin="round"/>`),
  soldier: svg(
    `<circle cx="12" cy="9.2" r="3.6" fill="#f2c6a0"/><path d="M7.6 9a4.4 4.4 0 0 1 8.8 0z" fill="currentColor"/><rect x="6.8" y="8.6" width="10.4" height="1.6" rx=".8" fill="currentColor"/>
     <path d="M6 21c0-4 2.7-6.6 6-6.6s6 2.6 6 6.6z" fill="#e9edf7"/>`,
  ),
  zombie: svg(
    `<circle cx="12" cy="10" r="6.5" fill="#8fbf6a"/><path d="M5.6 8.5c1-3.6 3.6-5 6.4-5s5 1.2 6.2 4c-2.4-1.2-3.6-.4-5.2-1.6-1.4 1.6-4.8.6-7.4 2.6z" fill="#3b2f2a"/>
     <circle cx="9.4" cy="10.5" r="1.4" fill="#ff3b2f"/><circle cx="14.6" cy="10.5" r="1.4" fill="#ff3b2f"/><path d="M9.5 14h5" stroke="#3a1a1a" stroke-width="1.4" stroke-linecap="round"/>
     <path d="M7 21c.6-2.6 2.6-4 5-4s4.4 1.4 5 4z" fill="#5f7f99"/>`,
  ),
  gun: svg(`<path d="M2.5 9h13l2-2h3v4h-2.6l-1.4 1H11l-1.6 6.5H5.8L7.3 12H2.5z" fill="currentColor"/>`),
  gem: svg(`<path d="M6.5 3.5h11l4 5.5L12 21 2.5 9z" fill="url(#ar-gem)" stroke="#1d5fb8" stroke-width="1.1" stroke-linejoin="round"/><path d="M2.5 9h19M8.8 3.5 7 9l5 12M15.2 3.5 17 9l-5 12" stroke="#bfe6ff" stroke-width=".9" fill="none" opacity=".85"/>`),
  dash: svg(`<path d="M4 6.5l6 5.5-6 5.5M11 6.5l6 5.5-6 5.5" stroke="#fff" stroke-width="2.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M19.5 7v10" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".6"/>`),
  ammo: svg(`<path d="M8 21V10c0-3 1.6-6 4-7.5C14.4 4 16 7 16 10v11z" fill="#ffd23f" stroke="#a85d00" stroke-width="1.2"/><path d="M8 15h8" stroke="#a85d00" stroke-width="1.2"/>`),
  bolt: svg(`<path d="M13.5 2L5 13.5h6l-1.5 8.5L19 10h-6z" fill="#ffd23f" stroke="#a85d00" stroke-width="1" stroke-linejoin="round"/>`),
  hand: svg(
    `<path d="M10 3.5a1.6 1.6 0 0 1 3.2 0v6.3l.4-.1a1.6 1.6 0 0 1 3 .8 1.6 1.6 0 0 1 2.7 1.2v4.6c0 3.2-2.4 5.7-5.6 5.7h-1.4c-1.8 0-3.4-.9-4.4-2.3l-3.2-4.6a1.6 1.6 0 0 1 2.4-2l1.9 1.6z" fill="#fff" stroke="#1a2440" stroke-width="1"/>`,
  ),
  soundOn: svg(`<path d="M3.5 9h4l5-4v14l-5-4h-4z" fill="#dfe8ff"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" stroke="#dfe8ff" stroke-width="2" fill="none" stroke-linecap="round"/>`),
  vibrate: svg(`<rect x="8" y="3" width="8" height="18" rx="2" fill="#dfe8ff"/><path d="M4.5 8v8M2 10v4M19.5 8v8M22 10v4" stroke="#dfe8ff" stroke-width="1.8" stroke-linecap="round"/>`),
  barracks: svg(
    `<path d="M3.5 13.5a8.5 8.5 0 0 1 17 0z" fill="#7fd36b"/><path d="M2.5 13.5h19v2.2a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1z" fill="#4fa841"/>
     <path d="M7 9.5a6 6 0 0 1 3-3.6" stroke="#c6f2b8" stroke-width="1.6" stroke-linecap="round" fill="none"/><path d="M8 19.5h8" stroke="#4fa841" stroke-width="2" stroke-linecap="round"/>`,
  ),
  shirt: svg(`<path d="M8.5 3.5L3 6.5l2.2 4.2 2.3-1V20.5h9V9.7l2.3 1L21 6.5l-5.5-3c-.6 1.6-2 2.5-3.5 2.5s-2.9-.9-3.5-2.5z" fill="#6fb6ff"/><path d="M12 6v14.5" stroke="#3d7fd6" stroke-width="1.2"/>`),
  modes: svg(
    `<path d="M5 3.5v17" stroke="#ffd23f" stroke-width="2.2" stroke-linecap="round"/><path d="M6 4.5h11.5l-2.5 3.5 2.5 3.5H6z" fill="#ff7a3d"/>
     <circle cx="5" cy="20.5" r="1.5" fill="#ffd23f"/>`,
  ),
  trophy: svg(
    `<path d="M7 3.5h10v5a5 5 0 0 1-10 0z" fill="#ffd23f"/><path d="M7 5H3.8v1.6A3.4 3.4 0 0 0 7.2 10M17 5h3.2v1.6A3.4 3.4 0 0 1 16.8 10" stroke="#ffd23f" stroke-width="1.6" fill="none"/>
     <path d="M10.5 13h3v3.5h-3z" fill="#e0a000"/><rect x="7.5" y="16.5" width="9" height="3.5" rx="1" fill="#e0a000"/>`,
  ),
  // 模式
  defense: svg(
    `<path d="M12 2.5l8 3v6c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10v-6z" fill="#fff" opacity=".95"/><path d="M12 5l5.5 2v4.6c0 3.5-2.3 6.2-5.5 7.4z" fill="#2c63d6"/>
     <path d="M7 12h10" stroke="#2c63d6" stroke-width="1.6"/>`,
  ),
  campaign: svg(
    `<path d="M4 20l9.5-9.5M13.5 10.5L16 4l4 4-6.5 2.5" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
     <path d="M20 20l-9.5-9.5M10.5 10.5L8 4 4 8l6.5 2.5" stroke="#ffe3c2" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  ),
  arrow: svg(`<path d="M3 12h13M11 5.5L18 12l-7 6.5" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`),
  endless: svg(`<path d="M6.5 8.5c-2 0-3.5 1.6-3.5 3.5s1.5 3.5 3.5 3.5c3.2 0 7.8-7 11-7 2 0 3.5 1.6 3.5 3.5s-1.5 3.5-3.5 3.5c-3.2 0-7.8-7-11-7z" stroke="#fff" stroke-width="2.4" fill="none"/>`),
};

/** 军衔盾牌（玩家等级徽章），viewBox 0 0 40 44 */
export const RANK_SHIELD = svg(
  `<path d="M20 1.5l17 5.5v12.5C37 31 29.6 39.2 20 42.5 10.4 39.2 3 31 3 19.5V7z" fill="url(#ar-gold)" stroke="#8a4a00" stroke-width="1.5"/>
   <path d="M20 5.5l13 4.2v9.8c0 9-5.6 15.4-13 18.3-7.4-2.9-13-9.3-13-18.3V9.7z" fill="none" stroke="#fff3c4" stroke-width="1.2" opacity=".7"/>`,
  '0 0 40 44',
);

/** 标题徽记：盾牌 + 交叉步枪 + 星，viewBox 0 0 64 64 */
export const EMBLEM = svg(
  `<path d="M32 3l25 8v18c0 16-10.8 27.6-25 32C17.8 56.6 7 45 7 29V11z" fill="url(#ar-blue)" stroke="url(#ar-gold)" stroke-width="3.5"/>
   <path d="M15 46L47 18M49 46L17 18" stroke="#1a1a22" stroke-width="5" stroke-linecap="round"/>
   <path d="M15 46L47 18M49 46L17 18" stroke="#c9ced6" stroke-width="2.4" stroke-linecap="round"/>
   <path d="M32 14l3.8 7.7 8.5 1.2-6.2 6 1.5 8.5L32 33.4l-7.6 4 1.5-8.5-6.2-6 8.5-1.2z" fill="url(#ar-gold)" stroke="#8a4a00" stroke-width="1.2"/>`,
  '0 0 64 64',
);

export const MODE_STYLE: Record<string, { icon: string; bg: string }> = {
  carnage: { icon: ICON.bolt, bg: 'linear-gradient(145deg,#ffce55,#f05b3b 48%,#a329ef)' },
  defense: { icon: ICON.defense, bg: 'linear-gradient(160deg,#5f9bff,#2448b8)' },
  campaign: { icon: ICON.campaign, bg: 'linear-gradient(160deg,#ff8f52,#d63a1e)' },
  endless: { icon: ICON.endless, bg: 'linear-gradient(160deg,#36d6d8,#0f7f9c)' },
};

/** 所有图标共用的渐变，只放一份，避免隐藏界面里的重复 id 导致渐变失效 */
export const SVG_DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <radialGradient id="ar-coin" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fff6c2"/><stop offset=".45" stop-color="#ffd23f"/><stop offset="1" stop-color="#e08a00"/></radialGradient>
  <linearGradient id="ar-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe58a"/><stop offset=".5" stop-color="#ffc23a"/><stop offset="1" stop-color="#e08a00"/></linearGradient>
  <linearGradient id="ar-blue" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4f7bd8"/><stop offset="1" stop-color="#1b3478"/></linearGradient>
<linearGradient id="ar-gem" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9ff0ff"/><stop offset=".55" stop-color="#47a8ff"/><stop offset="1" stop-color="#2a5fe0"/></linearGradient></defs></svg>`;
