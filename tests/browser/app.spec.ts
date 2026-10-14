import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('desktop inbox, evidence, filters and keyboard dialog', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Clarity in every message.' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: /anonymous.concern@protonmail.com/ }),
  ).toBeVisible();
  await page.getByRole('button', { name: /billing@northgate-suppliers.com.*NS-4471/ }).click();
  await page.getByRole('button', { name: 'Original content', exact: true }).click();
  await expect(
    page.getByText('New payment account: routing 044000037', { exact: false }),
  ).toBeVisible();
  await page.getByRole('textbox', { name: 'Search inbox' }).fill('nonexistent search term');
  await expect(page.getByRole('heading', { name: 'No matching messages' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await page.getByRole('button', { name: 'Add email', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Add email', exact: true })).toBeFocused();
  await page.screenshot({ path: 'work/screenshots/desktop.png', fullPage: true });
});
test('paste a real item and upload a text file through the API-backed UI', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add email', exact: true }).click();
  await page
    .getByLabel('Email content')
    .fill(
      'From: browser-test@example.com\nTo: review@example.com\nSubject: Browser test message\n\nPlease review this new message.',
    );
  await page.getByRole('dialog').getByRole('button', { name: 'Add email', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Browser test message', exact: true, level: 2 }),
  ).toBeVisible();
  await expect(page.getByText('Waiting for analysis', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add email', exact: true }).click();
  await page.getByRole('button', { name: 'Upload a file', exact: true }).click();
  await page.getByLabel('Choose an email or document').setInputFiles({
    name: 'review.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('An uploaded message for browser verification.'),
  });
  await page.getByRole('dialog').getByRole('button', { name: 'Add email', exact: true }).click();
  await page.getByRole('button', { name: 'Original content', exact: true }).click();
  await expect(
    page.locator('.source-section').getByText('An uploaded message for browser verification.'),
  ).toBeVisible();
});
test('mobile navigation, selected message, back and graph have no horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: /security-alert@arclline-portal.com/ }).click();
  await expect(
    page.getByRole('heading', {
      name: 'Action required: your password expires in 24 hours',
      level: 2,
    }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'work/screenshots/mobile.png', fullPage: true });
  await page.locator('.back-button').click();
  await expect(page.getByRole('textbox', { name: 'Search inbox' })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Mobile navigation' })
    .getByRole('button', { name: 'Knowledge graph' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Your network starts with a message.' }),
  ).toBeVisible();
});
test('WCAG A/AA accessibility on desktop and mobile', async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Clarity in every message.' })).toBeVisible();
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({ html: n.html, summary: n.failureSummary })),
      })),
    ).toEqual([]);
  }
});

test('inbox scrolls to the last message at desktop and mobile sizes', async ({ page }) => {
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    const list = page.locator('.message-list');
    await expect(list.locator('.message-row').nth(9)).toBeAttached();
    const metrics = await list.evaluate((el) => ({
      height: el.clientHeight,
      content: el.scrollHeight,
    }));
    expect(metrics.content).toBeGreaterThan(metrics.height);
    await list.hover();
    await page.mouse.wheel(0, 10000);
    await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    const last = list.locator('.message-row').last();
    await expect(last).toBeInViewport();
    await last.click();
    await expect(page.locator('.detail-container h2').first()).toBeVisible();
  }
});

test('filter opens beside its trigger and remains usable on desktop and mobile', async ({
  page,
}) => {
  for (const width of [1440, 440, 390]) {
    await page.setViewportSize({ width, height: 956 });
    await page.goto('/');
    const trigger = page.getByRole('button', { name: /^Filter messages:/ });
    await trigger.click();
    const popup = page.getByRole('dialog', { name: 'Filter messages' });
    await expect(popup).toBeVisible();
    const anchor = (await trigger.boundingBox())!;
    const box = (await popup.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(
      Math.min(Math.abs(box.y - anchor.y - anchor.height), Math.abs(anchor.y - box.y - box.height)),
    ).toBeLessThan(10);
    await expect(popup.getByRole('button', { name: /Analysis failed/ })).toBeInViewport();
    await popup.getByRole('button', { name: /High risk/ }).click();
    await expect(popup).not.toBeVisible();
    await expect(trigger).toContainText('High risk');
    await expect(page.getByRole('heading', { name: 'No matching messages' })).toBeVisible();
    await expect(trigger).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(popup).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(popup).not.toBeVisible();
    await trigger.click();
    await popup.getByRole('button', { name: /All messages/ }).click();
    await expect(page.locator('.message-row').first()).toBeVisible();
    await trigger.click();
    await page.screenshot({ path: `work/screenshots/filter-${width}.png`, fullPage: true });
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(result.violations).toEqual([]);
    await page.getByRole('heading', { name: 'Clarity in every message.' }).click();
    await expect(popup).not.toBeVisible();
  }
});
