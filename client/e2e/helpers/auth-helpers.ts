import { expect, Page } from '@playwright/test';

const TEST_ADMIN = {
  email: 'admin@mabinicolleges.edu.ph',
  password: 'Admin123!',
};

const TEST_TEACHER = {
  email: 'teacher@test.com',
  password: 'Teacher123!',
};

const TEST_STUDENT = {
  email: 'student@test.com',
  password: 'Student123!',
};

export async function loginAsAdmin(page: Page) {
  await page.goto('/admin/login');
  await page.getByLabel(/email/i).fill(TEST_ADMIN.email);
  await page.getByLabel(/password/i).fill(TEST_ADMIN.password);
  await page.locator('form button[type="submit"]').first().click();
  await expect(page).toHaveURL(/\/admin\/dashboard(?:\?.*)?$/, { timeout: 15000 });
  await expect(page.getByRole('heading', { name: /admin dashboard/i })).toBeVisible({ timeout: 15000 });
}

export async function loginAsTeacher(page: Page) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(TEST_TEACHER.email);
  await page.getByLabel(/password/i).fill(TEST_TEACHER.password);
  await page.locator('form button[type="submit"]').first().click();
  await expect(page).toHaveURL(/teacher|dashboard/, { timeout: 15000 });
}

export async function loginAsStudent(page: Page) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(TEST_STUDENT.email);
  await page.getByLabel(/password/i).fill(TEST_STUDENT.password);
  await page.locator('form button[type="submit"]').first().click();
  await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });
}
