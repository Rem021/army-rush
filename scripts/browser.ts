import { existsSync } from 'node:fs';
import { chromium, type Browser } from 'playwright-core';

const CANDIDATE_PATHS = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter((p): p is string => Boolean(p));

export async function launchHeadlessBrowser(): Promise<Browser> {
  const args = ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  try {
    return await chromium.launch({ channel: 'chrome', headless: true, args });
  } catch {
    for (const executablePath of CANDIDATE_PATHS) {
      if (existsSync(executablePath)) {
        return await chromium.launch({ executablePath, headless: true, args });
      }
    }
    return await chromium.launch({ headless: true, args });
  }
}
