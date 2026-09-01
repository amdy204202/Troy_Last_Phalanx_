import { test, expect } from '@playwright/test';

test('installed rich route reloads offline with its central runtime', async ({ page, context }) => {
  await page.goto('/?test=1');
  await expect.poll(() => page.evaluate(() => window.__TROY_BOOT__?.status)).toBe('ready');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => window.__TROY_BOOT__?.status)).toBe('ready');
  await expect(page.locator('#menuOverlay')).toBeVisible();
  await expect(page.locator('#heroSelect')).toBeAttached();
  await page.locator('#prepareBtn').click();
  await page.locator('#startBtn').click();
  for(;;){
    const before=await page.evaluate(()=>window.__TROY_RICH_TEST__.snapshot());if(before.fixedTick>=600)break;
    const choice=page.locator('#choiceCards button:visible:enabled').first();
    if(await choice.count()){await choice.click();continue}
    const step=Math.min(60,600-before.fixedTick);await page.evaluate(count=>window.__TROY_RICH_TEST__.advanceFixedTicks(count),step);
  }
  const snapshot=await page.evaluate(()=>window.__TROY_RICH_TEST__.snapshot());
  expect(snapshot).toMatchObject({fixedTick:600,playerRenderEntities:1,followerEntities:0});
  expect(snapshot.enemies).toBeGreaterThan(0);
  expect(snapshot.audio.uncaughtErrors).toBe(0);
  expect(await page.evaluate(()=>window.__TROY_BOOT__.errors)).toEqual([]);
});
