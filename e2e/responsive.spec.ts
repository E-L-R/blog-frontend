import type { Page } from '@playwright/test';
import { expect, signIn, test } from './fixtures.ts';

/** Runs on a phone viewport (the "mobile" project): nothing may force sideways scrolling. */
const paths = [
  '/',
  '/posts/full-text-search-in-postgresql-before-reaching-for-elasticsearch',
  '/tags',
];

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe('small screens', () => {
  for (const path of paths) {
    test(`no horizontal scrolling on ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoHorizontalScroll(page);
    });
  }

  test('the dashboard table reflows', async ({ page }) => {
    await signIn(page);
    await page.goto('/dashboard');
    await expect(page.getByRole('table', { name: 'Your posts' })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
