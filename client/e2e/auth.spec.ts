import { test, expect } from '@playwright/test';

/**
 * Authentication E2E Tests
 * Tests login, logout, and authentication flows
 */

test.describe('Authentication Flows', () => {
  test.describe('Login Page', () => {
    test('should display login form', async ({ page }) => {
      await page.goto('/login');

      await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
      await expect(page.getByPlaceholder(/email address/i)).toBeVisible();
      await expect(page.getByPlaceholder(/^password$/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /^sign in$/i })).toBeVisible();
    });

    test('should show validation errors for empty form', async ({ page }) => {
      await page.goto('/login');

      await page.getByRole('button', { name: /^sign in$/i }).click();
      await expect(page.locator('form').getByText(/email and password are required/i)).toBeVisible();
    });

    test('should show error for invalid credentials', async ({ page }) => {
      await page.goto('/login');

      await page.getByPlaceholder(/email address/i).fill('invalid@test.com');
      await page.getByPlaceholder(/^password$/i).fill('wrongpassword');
      await page.getByRole('button', { name: /^sign in$/i }).click();

      await expect(page.locator('form').getByText(/invalid email or password|too many login attempts/i)).toBeVisible({ timeout: 15000 });
    });

    test('should open signup dialog', async ({ page }) => {
      await page.goto('/login');

      await page.getByRole('button', { name: /sign up/i }).click();
      await expect(page.getByRole('heading', { name: /student sign-up/i })).toBeVisible();
    });

    test('should open forgot password dialog', async ({ page }) => {
      await page.goto('/login');

      await page.getByRole('button', { name: /forgot password/i }).click();
      await expect(page.getByRole('heading', { name: /reset your password/i })).toBeVisible();
    });
  });

  test.describe('Admin Login', () => {
    test('should display admin login page', async ({ page }) => {
      await page.goto('/admin/login');

      await expect(page.getByRole('heading', { name: /admin|administrator/i })).toBeVisible();
      await expect(page.getByLabel(/email/i)).toBeVisible();
      await expect(page.getByLabel(/password/i)).toBeVisible();
    });

    test('should validate empty admin login form', async ({ page }) => {
      await page.goto('/admin/login');

      await page.getByRole('button', { name: /sign in as administrator|verify and sign in/i }).click();
      await expect(page.getByText(/email is required/i)).toBeVisible();
      await expect(page.getByText(/password is required/i)).toBeVisible();
    });

  });

  test.describe('Session Management', () => {
    test('should redirect unauthenticated admin route to login', async ({ page }) => {
      await page.goto('/admin/dashboard');
      await expect(page).toHaveURL(/\/admin\/login/);
    });

    test('should keep login page after refresh', async ({ page }) => {
      await page.goto('/login');
      await page.reload();
      await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
    });
  });

  test.describe('Signup Flow', () => {
    test('should display student signup dialog', async ({ page }) => {
      await page.goto('/login');

      await page.getByRole('button', { name: /sign up/i }).click();
      await expect(page.getByRole('heading', { name: /student sign-up/i })).toBeVisible();
      await expect(page.getByPlaceholder(/name@mabinicolleges.edu.ph/i)).toBeVisible();
    });

    test('should show validation errors for weak password', async ({ page }) => {
      await page.goto('/login');

      await page.getByRole('button', { name: /switch to teacher/i }).click();
      await page.getByRole('button', { name: /sign up/i }).click();

      await page.getByPlaceholder(/^Email$/i).fill('teacher-test@mabinicolleges.edu.ph');
      await page.getByPlaceholder(/full name/i).fill('Teacher Test');
      await page.getByPlaceholder(/password \(min 8 characters\)/i).fill('123');
      await page.getByPlaceholder(/confirm password/i).fill('123');
      await page.getByRole('button', { name: /create account/i }).click();

      await expect(page.getByText(/password must be at least 8 characters/i)).toBeVisible();
    });
  });
});

