import { expect, expectAccessible, signIn, test } from './fixtures.ts';

test.describe('accessibility (WCAG 2.1 AA, axe-core)', () => {
  for (const path of [
    '/',
    '/posts/building-a-bpe-tokenizer-from-scratch',
    '/tags',
    '/u/alice',
    '/login',
    '/register',
  ]) {
    test(`public page ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectAccessible(page);
    });
  }

  for (const path of ['/write/notes-on-container-image-layers', '/dashboard', '/settings']) {
    test(`signed-in page ${path}`, async ({ page }) => {
      await signIn(page);
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectAccessible(page);
    });
  }

  test('the keyboard reaches the content first (skip link)', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Latest posts' })).toBeVisible(); // app rendered
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main')).toBeFocused();
  });
});
