import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { input, extraction, assessment } from '../fixtures';
import type { EmailRecord } from '../../shared/contracts';

const record: EmailRecord = {
  id: 'E010',
  input,
  extraction,
  assessment,
  status: 'completed',
  error: null,
  model: 'test-fixture',
  promptVersion: 'test',
  createdAt: '2026-06-02T08:14:00Z',
  updatedAt: '2026-06-02T08:14:00Z',
};

test('completed review exposes evidence, structured data and relationships accessibly', async ({
  page,
}) => {
  await page.route('**/api/emails/E010', (route) => route.fulfill({ json: record }));
  await page.goto('/');
  await page.getByRole('button', { name: /anonymous.concern@protonmail.com/ }).click();
  await expect(page.getByRole('heading', { name: 'Risk assessment', exact: true })).toBeVisible();
  await page.getByText('View structured extraction', { exact: true }).click();
  await expect(page.locator('.json-details pre')).toContainText('alex@example.com');
  await page.getByRole('button', { name: /Entities & links/ }).click();
  await page.locator('.entity-card summary').first().click();
  await expect(page.locator('.entity-card .evidence').first()).toContainText('$500');
  await expect(page.locator('.relationship')).toContainText('requests transfer to');
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(result.violations).toEqual([]);
});

test('partial failure retains extraction, warns about coverage and retries the failed stage', async ({
  page,
}) => {
  const failed: EmailRecord = {
    ...record,
    assessment: null,
    status: 'failed',
    input: { ...input, warnings: ['scan.pdf: No readable text.'] },
    error: { stage: 'assessment', code: 'MODEL_TIMEOUT', message: 'The local model timed out.' },
  };
  await page.route('**/api/emails/E010', (route) => route.fulfill({ json: failed }));
  let retries = 0;
  await page.route('**/api/emails/E010/retry', (route) => {
    retries++;
    return route.fulfill({ status: 202, json: { id: 'E010' } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: /anonymous.concern@protonmail.com/ }).click();
  await expect(page.getByText('Partial analysis', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Your completed extraction is saved. Retry resumes the risk assessment.'),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'At a glance' })).toBeVisible();
  await expect(page.getByText('No risk detected', { exact: true })).not.toBeVisible();
  await page.getByRole('button', { name: 'Retry failed stage', exact: true }).click();
  await expect.poll(() => retries).toBe(1);
});

test('graph provides keyboard-accessible source navigation', async ({ page }) => {
  await page.route('**/api/graph', (route) =>
    route.fulfill({
      json: {
        nodes: [
          { id: 'one', type: 'person', name: 'Alex', emailIds: ['E010'] },
          { id: 'two', type: 'organization', name: 'Example Ltd', emailIds: ['E010'] },
        ],
        edges: [
          {
            id: 'edge',
            source: 'one',
            target: 'two',
            type: 'requests_transfer_to',
            emailId: 'E010',
            evidence: extraction.facts[0].evidence,
          },
        ],
      },
    }),
  );
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Knowledge graph' })
    .click();
  await page.getByRole('textbox', { name: 'Find an entity' }).fill('Alex');
  await page.locator('.graph-entity-list button').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Alex', exact: true })).toBeVisible();
  await expect(page.locator('.graph-connection')).toContainText('requests transfer to');
  await page.getByRole('button', { name: 'Message E010', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'concerns about Q2 numbers', level: 2 }),
  ).toBeVisible();
});

test('model outage remains explicit while the inbox and saved analysis work', async ({ page }) => {
  await page.route('**/api/health', (route) =>
    route.fulfill({
      json: {
        model: 'test-model',
        available: false,
        message: 'Ollama is offline. Start it with: ollama serve',
        processing: 0,
        queued: 10,
        autoProcess: false,
      },
    }),
  );
  await page.route('**/api/emails/E010', (route) => route.fulfill({ json: record }));
  await page.goto('/');
  await page.getByRole('button', { name: /anonymous.concern@protonmail.com/ }).click();
  await expect(page.getByText('Local model is not ready.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Risk assessment', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add email', exact: true })).toBeEnabled();
});
