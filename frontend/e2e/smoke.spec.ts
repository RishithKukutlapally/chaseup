import { expect, test, type Page } from '@playwright/test';

// Synthetic personas; passwords come from the e2e-only template set in start-backend.mjs.
const LANDINGS: { user: string; name: string; hash: string; testId: string }[] = [
  { user: 'sarah', name: 'Sarah Jenkins', hash: '#my-cases', testId: 'my-cases' },
  { user: 'daniel', name: 'Daniel Okafor', hash: '#my-cases', testId: 'my-cases' },
  { user: 'priya', name: 'Priya Raman', hash: '#queue', testId: 'queue-table' },
  { user: 'aisha', name: 'Aisha Karim', hash: '#agent-settings', testId: 'agent-config' },
  { user: 'robert', name: 'Robert Hale', hash: '#dashboards', testId: 'dash-overview' },
  { user: 'grace', name: 'Grace Whitfield', hash: '#dash-security', testId: 'dash-security' },
  { user: 'omar', name: '', hash: '#dash-architecture', testId: 'dash-architecture' },
  { user: 'mei', name: '', hash: '#dash-product', testId: 'dash-product' },
  { user: 'lucas', name: '', hash: '#dash-data', testId: 'dash-data' },
];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

async function signIn(page: Page, user: string) {
  await page.goto('/');
  await page.getByTestId('login-username').fill(user);
  await page.getByTestId('login-password').fill(`${cap(user)}@e2e-only`);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('header-user')).toBeVisible();
}

test('wrong password is rejected', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('login-username').fill('sarah');
  await page.getByTestId('login-password').fill('not-the-password');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login-error')).toBeVisible();
});

for (const p of LANDINGS) {
  test(`${p.user} lands on ${p.hash}`, async ({ page }) => {
    await signIn(page, p.user);
    await expect(page).toHaveURL(new RegExp(`${p.hash.replace('#', '#')}$`));
    await expect(page.getByTestId(p.testId)).toBeVisible();
    if (p.name) await expect(page.getByTestId('header-user')).toHaveText(p.name);
  });
}

test('RMs only see their own cases, as simple cards', async ({ page }) => {
  await signIn(page, 'sarah');
  const cards = page.locator('[data-testid^="case-card-"]');
  await expect(cards).toHaveCount(5);
  await expect(page.getByTestId('nav-agent-settings')).toHaveCount(0);
  await expect(page.getByTestId('nav-dashboards')).toHaveCount(0);
});

test('Ops prepares a reminder on case 1 and cannot send it', async ({ page }) => {
  await signIn(page, 'priya');
  await page.getByTestId('queue-row-1').click();
  await page.getByTestId('run-chaser').click();
  await expect(page.getByTestId('preparing')).toBeVisible();
  await expect(page.getByTestId('pending-draft')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('approve-blocked')).toContainText('Sarah Jenkins');
  await expect(page.getByTestId('approve-send')).toHaveCount(0);
  await page.getByTestId('how-made').locator('summary').click();
  await expect(page.getByTestId('trace-steps')).toContainText('MCP');
});

test('the named RM reviews and sends a reminder with an in-page confirm', async ({ page }) => {
  await signIn(page, 'sarah');
  await page.getByTestId('prepare-2').click();
  await expect(page.getByTestId('pending-draft')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('checks-ok')).toBeVisible();
  await page.getByTestId('approve-send').click();
  await expect(page.getByTestId('confirm-send')).toContainText('Sarah Jenkins');
  await page.getByTestId('send-now').click();
  await expect(page.getByTestId('sent-panel')).toContainText('audit trail');
});

test('an edit that breaks the rules blocks sending', async ({ page }) => {
  await signIn(page, 'sarah');
  await page.goto('/#case-1');
  await expect(page.getByTestId('pending-draft')).toBeVisible({ timeout: 30_000 });
  const body = page.getByTestId('draft-body');
  await body.fill((await body.inputValue()) + '\nWe guarantee approval.');
  await expect(page.getByTestId('checks-problems')).toBeVisible();
  await expect(page.getByTestId('approve-send')).toBeDisabled();
});

test('MLRO verifies the audit chain on the live Security dashboard', async ({ page }) => {
  await signIn(page, 'grace');
  await expect(page.getByTestId('live-indicator')).toContainText('Live');
  await page.getByTestId('verify-chain').click();
  await expect(page.getByTestId('verify-result')).toContainText('Chain intact');
});

test('Business sees the overview with all seven dashboards, live', async ({ page }) => {
  await signIn(page, 'robert');
  await expect(page.locator('[data-testid^="vcard-"]')).toHaveCount(7);
  await expect(page.getByTestId('live-indicator')).toBeVisible();
  await page.getByTestId('vcard-operations').click();
  await expect(page.getByTestId('dash-operations')).toBeVisible();
  await expect(page.getByTestId('kpi')).toHaveCount(4);
});

test('Data dashboard shows the not-yet-connected widget', async ({ page }) => {
  await signIn(page, 'lucas');
  await expect(page.getByTestId('dash-data')).toContainText('Not connected yet');
});

test('Agent owner tries a prompt on a sample case', async ({ page }) => {
  await signIn(page, 'aisha');
  await page.getByTestId('agent-test').click();
  await expect(page.getByTestId('agent-test-result')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('agent-test-result')).toContainText('Register of Members');
});
