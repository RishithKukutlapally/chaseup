import { expect, test, type Page } from '@playwright/test';

// Synthetic personas; passwords come from the e2e-only template set in start-backend.mjs.
const PERSONAS = [
  { user: 'sarah', name: 'Sarah Jenkins', landing: 'queue-table', has: ['chase-queue'], lacks: ['audit-log', 'ai-cost', 'agent-workbench'] },
  { user: 'priya', name: 'Priya Raman', landing: 'queue-table', has: ['chase-queue', 'measure'], lacks: ['audit-log', 'agent-workbench'] },
  { user: 'tomas', name: 'Tomas Lindqvist', landing: 'queue-table', has: ['chase-queue'], lacks: ['ai-cost', 'audit-log'] },
  { user: 'grace', name: 'Grace Whitfield', landing: 'audit-table', has: ['audit-log', 'traces', 'agent-workbench'], lacks: [] },
  { user: 'robert', name: 'Robert Hale', landing: 'stage-analytics-title', has: ['stage-analytics', 'ai-cost'], lacks: ['chase-queue', 'audit-log'] },
  { user: 'aisha', name: 'Aisha Karim', landing: 'agent-config', has: ['agent-workbench', 'ai-cost'], lacks: ['chase-queue', 'audit-log'] },
  { user: 'elena', name: 'Elena Brooks', landing: 'ai-cost', has: ['ai-cost'], lacks: ['chase-queue', 'agent-workbench', 'audit-log'] },
];

async function signIn(page: Page, user: string, first: string) {
  await page.goto('/');
  await page.getByTestId('login-username').fill(user);
  await page.getByTestId('login-password').fill(`${first}@e2e-only`);
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

for (const p of PERSONAS) {
  test(`${p.user} signs in and lands on their own screens`, async ({ page }) => {
    await signIn(page, p.user, p.name.split(' ')[0]);
    await expect(page.getByTestId('header-user')).toHaveText(p.name);
    if (p.landing === 'stage-analytics-title') {
      await expect(page.getByRole('heading', { name: 'Stage analytics' })).toBeVisible();
    } else {
      await expect(page.getByTestId(p.landing)).toBeVisible();
    }
    for (const v of p.has) await expect(page.getByTestId(`nav-${v}`)).toBeVisible();
    for (const v of p.lacks) await expect(page.getByTestId(`nav-${v}`)).toHaveCount(0);
    await page.getByTestId('open-access').click();
    await expect(page.getByTestId('access-matrix')).toBeVisible();
  });
}

test('ops runs the chaser, sees the MCP-sourced trace, and cannot approve', async ({ page }) => {
  await signIn(page, 'priya', 'Priya');
  await page.getByTestId('run-chaser-1').click();
  await expect(page.getByTestId('pending-draft')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('approve-blocked')).toContainText('Sarah Jenkins');
  await expect(page.getByTestId('approve-send')).toHaveCount(0);
  await page.getByTestId('view-trace').first().click();
  await expect(page.getByTestId('trace-steps')).toBeVisible();
  await expect(page.getByTestId('trace-data-source').first()).toContainText(/mcp/i);
  await expect(page.getByTestId('trace-steps')).toContainText(/Redacted/);
  await expect(page.getByTestId('trace-steps')).toContainText(/PENDING APPROVAL/);
});

test('named RM approves and sends the pending draft', async ({ page }) => {
  await signIn(page, 'sarah', 'Sarah');
  await page.getByTestId('run-chaser-2').click();
  await expect(page.getByTestId('pending-draft')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('draft-body')).not.toHaveValue('');
  page.once('dialog', (d) => d.accept()); // "Send this e-mail ... ?" confirmation
  await page.getByTestId('approve-send').click();
  await expect(page.getByTestId('dispatch-result')).toBeVisible({ timeout: 15_000 });
});

test('MLRO verifies the audit hash chain', async ({ page }) => {
  await signIn(page, 'grace', 'Grace');
  await page.getByTestId('verify-chain').click();
  await expect(page.getByTestId('verify-result')).toContainText(/valid|intact/i);
});

test('agent owner runs a prompt test on the synthetic case', async ({ page }) => {
  await signIn(page, 'aisha', 'Aisha');
  await page.getByTestId('agent-test').click();
  await expect(page.getByTestId('agent-test-result')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('agent-test-result')).toContainText('Register of Members');
});
