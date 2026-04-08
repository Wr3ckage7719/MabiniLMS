import { test, expect, Page } from '@playwright/test';

/**
 * Authentication E2E Tests
 * Tests login, logout, and authentication flows
 */

// Test credentials (use test accounts in development)
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

test.describe('Authentication Flows', () => {
  test.describe('Login Page', () => {
    test('should display login form', async ({ page }) => {
      await page.goto('/login');
      
      // Check for login form elements
      await expect(page.getByRole('heading', { name: /sign in|login/i })).toBeVisible();
      await expect(page.getByLabel(/email/i)).toBeVisible();
      await expect(page.getByLabel(/password/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /sign in|login/i })).toBeVisible();
    });

    test('should show validation errors for empty form', async ({ page }) => {
      await page.goto('/login');
      
      // Click submit without filling form
      await page.getByRole('button', { name: /sign in|login/i }).click();
      
      // Check for validation messages
      await expect(page.getByText(/email is required|please enter/i)).toBeVisible();
    });

    test('should show error for invalid credentials', async ({ page }) => {
      await page.goto('/login');
      
      await page.getByLabel(/email/i).fill('invalid@test.com');
      await page.getByLabel(/password/i).fill('wrongpassword');
      await page.getByRole('button', { name: /sign in|login/i }).click();
      
      // Wait for error message
      await expect(page.getByText(/invalid|incorrect|failed/i)).toBeVisible({ timeout: 10000 });
    });

    test('should navigate to signup page', async ({ page }) => {
      await page.goto('/login');
      
      // Find and click signup link
      await page.getByRole('link', { name: /sign up|register|create account/i }).click();
      
      await expect(page).toHaveURL(/signup|register/);
    });

    test('should navigate to forgot password', async ({ page }) => {
      await page.goto('/login');
      
      // Find and click forgot password link
      await page.getByRole('link', { name: /forgot password/i }).click();
      
      await expect(page).toHaveURL(/forgot-password|reset/);
    });
  });

  test.describe('Admin Login', () => {
    test('should display admin login page', async ({ page }) => {
      await page.goto('/admin/login');
      
      // Check for admin-specific elements
      await expect(page.getByRole('heading', { name: /admin|administrator/i })).toBeVisible();
      await expect(page.getByLabel(/email/i)).toBeVisible();
      await expect(page.getByLabel(/password/i)).toBeVisible();
    });

    test('should login admin successfully', async ({ page }) => {
      await page.goto('/admin/login');
      
      await page.getByLabel(/email/i).fill(TEST_ADMIN.email);
      await page.getByLabel(/password/i).fill(TEST_ADMIN.password);
      await page.getByRole('button', { name: /sign in|login/i }).click();
      
      // Should redirect to admin dashboard
      await expect(page).toHaveURL(/admin/, { timeout: 15000 });
      await expect(page.getByText(/dashboard|welcome/i)).toBeVisible({ timeout: 10000 });
    });

    test('should show admin dashboard after login', async ({ page }) => {
      // Login first
      await loginAsAdmin(page);
      
      // Check dashboard elements
      await expect(page.getByText(/pending teachers|manage|overview/i)).toBeVisible();
    });
  });

  test.describe('Session Management', () => {
    test('should persist session after page reload', async ({ page }) => {
      await loginAsAdmin(page);
      
      // Reload page
      await page.reload();
      
      // Should still be logged in
      await expect(page).toHaveURL(/admin/);
      await expect(page.getByText(/dashboard|welcome/i)).toBeVisible();
    });

    test('should logout successfully', async ({ page }) => {
      await loginAsAdmin(page);
      
      // Find and click logout button/menu
      await page.getByRole('button', { name: /logout|sign out/i }).click();
      
      // Should redirect to login
      await expect(page).toHaveURL(/login/, { timeout: 10000 });
    });
  });

  test.describe('Signup Flow', () => {
    test('should display signup form', async ({ page }) => {
      await page.goto('/signup');
      
      await expect(page.getByRole('heading', { name: /sign up|create account|register/i })).toBeVisible();
      await expect(page.getByLabel(/first name/i)).toBeVisible();
      await expect(page.getByLabel(/last name/i)).toBeVisible();
      await expect(page.getByLabel(/email/i)).toBeVisible();
      await expect(page.getByLabel(/password/i)).toBeVisible();
    });

    test('should show validation errors for weak password', async ({ page }) => {
      await page.goto('/signup');
      
      await page.getByLabel(/first name/i).fill('Test');
      await page.getByLabel(/last name/i).fill('User');
      await page.getByLabel(/email/i).fill('newuser@test.com');
      await page.getByLabel(/^password$/i).fill('123'); // Weak password
      
      await page.getByRole('button', { name: /sign up|register|create/i }).click();
      
      // Should show password requirements error
      await expect(page.getByText(/password|characters|strong/i)).toBeVisible();
    });
  });
});

// Helper functions
async function loginAsAdmin(page: Page) {
  await page.goto('/admin/login');
  await page.getByLabel(/email/i).fill(TEST_ADMIN.email);
  await page.getByLabel(/password/i).fill(TEST_ADMIN.password);
  await page.getByRole('button', { name: /sign in|login/i }).click();
  await expect(page).toHaveURL(/admin/, { timeout: 15000 });
}

async function loginAsTeacher(page: Page) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(TEST_TEACHER.email);
  await page.getByLabel(/password/i).fill(TEST_TEACHER.password);
  await page.getByRole('button', { name: /sign in|login/i }).click();
  await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });
}

async function loginAsStudent(page: Page) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(TEST_STUDENT.email);
  await page.getByLabel(/password/i).fill(TEST_STUDENT.password);
  await page.getByRole('button', { name: /sign in|login/i }).click();
  await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });
}

export { loginAsAdmin, loginAsTeacher, loginAsStudent };
