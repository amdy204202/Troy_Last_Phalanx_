import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { serveStatic } from '../tools/validate-v15-frozen.mjs';

let v16Server;
test.beforeAll(() => { v16Server = serveStatic(resolve(import.meta.dirname, '..'), 4176); });
test.afterAll(() => { v16Server.close(); v16Server.closeAllConnections(); v16Server.unref(); });

test('V16 keyboard tutorial proves movement, parry and dodge outcomes with one hero entity', async ({ page }) => {
  await page.goto('/index-v16.html?test=1');
  await expect.poll(() => page.evaluate(() => !!window.__TROY_V16_TEST__)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__TROY_V16_TEST__.entitySnapshot())).toEqual({ rosterHeroes: 3, activeHero: 'hoplite', playerRender: 1, hitTarget: 1, followerHero: 0 });
  await expect.poll(() => page.evaluate(() => document.querySelector('img')?.complete ?? true)).toBe(true);

  await page.keyboard.down('KeyD');
  await expect.poll(() => page.evaluate(() => window.__TROY_V16_TEST__.tutorialSnapshot().step)).toBe('parry');
  await page.keyboard.up('KeyD');
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => window.__TROY_V16_TEST__.tutorialSnapshot().step)).toBe('dodge');
  await expect.poll(() => page.evaluate(() => window.__TROY_V16_TEST__.combatSnapshot().defensePhase)).toBe('ready');
  await page.keyboard.down('KeyD');
  await page.keyboard.press('ShiftLeft');
  await expect.poll(() => page.evaluate(() => window.__TROY_V16_TEST__.tutorialSnapshot().step)).toBe('complete');
  await page.keyboard.up('KeyD');
  expect(await page.evaluate(() => window.__TROY_V16_BOOT__.errors)).toEqual([]);
});

test('V16 gamepad left stick, LB and B complete the same logical tutorial', async ({ page }) => {
  await page.addInitScript(() => {
    const state = { axes: [0, 0], buttons: Array.from({ length: 8 }, () => ({ pressed: false })) };
    Object.defineProperty(window, '__testPad', { value: state });
    Object.defineProperty(navigator, 'getGamepads', { value: () => [state] });
  });
  await page.goto('/index-v16.html?test=1');
  await expect.poll(() => page.evaluate(() => !!window.__TROY_V16_TEST__)).toBe(true);
  await page.evaluate(() => { window.__testPad.axes[0] = 1; });
  await expect.poll(() => page.evaluate(() => window.__TROY_V16_TEST__.tutorialSnapshot().step)).toBe('parry');
  await page.evaluate(() => { window.__testPad.axes[0] = 0; window.__testPad.buttons[4].pressed = true; });
  await expect.poll(() => page.evaluate(() => window.__TROY_V16_TEST__.combatSnapshot().defensePhase)).not.toBe('ready');
  await page.evaluate(() => { window.__testPad.buttons[4].pressed = false; });
  await expect.poll(() => page.evaluate(() => window.__TROY_V16_TEST__.tutorialSnapshot().step)).toBe('dodge');
  await expect.poll(() => page.evaluate(() => window.__TROY_V16_TEST__.combatSnapshot().defensePhase)).toBe('ready');
  await page.evaluate(() => { window.__testPad.axes[0] = 1; window.__testPad.buttons[1].pressed = true; });
  await expect.poll(() => page.evaluate(() => window.__TROY_V16_TEST__.tutorialSnapshot().step)).toBe('complete');
  await page.evaluate(() => { window.__testPad.axes[0] = 0; window.__testPad.buttons[1].pressed = false; });
});
