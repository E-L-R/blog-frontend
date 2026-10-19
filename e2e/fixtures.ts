import AxeBuilder from '@axe-core/playwright';
import { test as base, expect, type Page } from '@playwright/test';

/**
 * Every test fails on uncaught exceptions and Content-Security-Policy violations, so a CSP that
 * would break production (or a crash nobody looked at) can't slip through.
 */
export const test = base.extend<{ problems: string[] }>({
  problems: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
      page.on('console', (message) => {
        const text = message.text();
        if (message.type() === 'error' && !text.startsWith('Failed to load resource')) {
          problems.push(`console error: ${text}`); // expected 4xx answers log "Failed to load resource"
        }
        if (/Content Security Policy|Refused to/i.test(text)) {
          problems.push(`CSP: ${text}`);
        }
      });
      await use(problems);
      expect(problems, 'errors or CSP violations in the browser').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export const DEMO = { username: 'demo', password: 'demo-password' };

export async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Username or email').fill(DEMO.username);
  await page.getByLabel('Password').fill(DEMO.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
}

/** WCAG 2.1 AA, as checked by axe-core. Any violation fails the test, with the details. */
export async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const summary = results.violations.map(
    (violation) =>
      `${violation.id} (${violation.impact ?? 'unknown'}): ${violation.help} → ${violation.nodes
        .map((node) => node.target.join(' '))
        .join(', ')}`,
  );
  expect(summary).toEqual([]);
}
