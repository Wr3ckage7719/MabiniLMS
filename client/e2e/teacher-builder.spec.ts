import { test, expect } from '@playwright/test';

const TEST_TEACHER = {
  email: 'teacher@test.com',
  password: 'Teacher123!',
};

test.describe('Teacher Builder Routing', () => {
  test('dropdown selection opens full-page builder route and browser back exits builder', async ({ page }) => {
    await page.goto('/login');

    const emailInput = page.locator('input[type="email"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    const loginFormVisible = await emailInput
      .isVisible({ timeout: 10000 })
      .catch(() => false);

    if (!loginFormVisible) {
      test.skip(true, 'Login form is unavailable in this environment.');
    }

    await emailInput.fill(TEST_TEACHER.email);
    await passwordInput.fill(TEST_TEACHER.password);
    await page.locator('form button[type="submit"]').first().click();
    await expect(page).toHaveURL(/teacher|dashboard/, { timeout: 15000 });

    await page.goto('/teacher');

    const classesNavButton = page.getByRole('button', { name: /^Classes$/i }).first();
    await expect(classesNavButton).toBeVisible();
    await classesNavButton.click();

    const noClassesState = page.getByText(/No classes found/i);
    if ((await noClassesState.count()) > 0) {
      test.skip(true, 'Teacher account needs at least one class for builder e2e flow.');
    }

    const firstClassTitle = page.locator('div.cursor-pointer h3').first();
    await expect(firstClassTitle).toBeVisible({ timeout: 10000 });
    await firstClassTitle.click();

    const classworkTab = page.getByRole('button', { name: /^Classwork$/i }).first();
    await expect(classworkTab).toBeVisible({ timeout: 10000 });
    await classworkTab.click();

    const createTaskButton = page.getByTestId('create-task-button');
    await expect(createTaskButton).toBeVisible();
    await createTaskButton.click();

    await page.getByTestId('create-task-option-quiz').click();

    await expect(page.getByRole('heading', { name: /Create Quiz/i })).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get('tab')).toBe('classwork');
    await expect.poll(() => new URL(page.url()).searchParams.get('builder')).toBe('quiz');

    await page.goBack();

    await expect(createTaskButton).toBeVisible();
    await expect(page.getByRole('button', { name: /Back to classwork/i })).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).searchParams.get('builder')).toBeNull();
  });
});
