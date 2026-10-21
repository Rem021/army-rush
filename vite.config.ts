import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/army-rush/' : './',
  server: { host: true },
  build: {
    // 用到顶层 await 加载模型，iOS 15+ / 现代浏览器都支持
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // three.js 单独一个包：游戏代码改了以后，玩家浏览器里的引擎缓存还能用
        manualChunks: (id) => (id.includes('node_modules/three') ? 'three' : undefined),
      },
    },
  },
});
