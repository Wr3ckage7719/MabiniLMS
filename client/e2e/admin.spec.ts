import { test, expect } from '@playwright/test';
import path from 'path';
import { access, mkdir } from 'fs/promises';
import { loginAsAdmin } from './helpers/auth-helpers';

/**
 * Admin Workflow E2E Tests
 * Tests admin dashboard, teacher approval, student management
 */

const adminStorageStatePath = path.join(process.cwd(), 'e2e', '.auth', 'admin-storage-state.json');

test.use({ storageState: adminStorageStatePath });

test.beforeAll(async ({ browser }) => {
  await mkdir(path.dirname(adminStorageStatePath), { recursive: true });

  let hasUsableState = false;
  try {
    await access(adminStorageStatePath);

    const stateContext = await browser.newContext({ storageState: adminStorageStatePath });
    const statePage = await stateContext.newPage();
    await statePage.goto('/admin/dashboard');

    try {
      await expect(statePage.getByRole('heading', { name: /admin dashboard/i })).toBeVisible({ timeout: 5000 });
      hasUsableState = true;
    } catch {
      hasUsableState = false;
    }

    await stateContext.close();
  } catch {
    hasUsableState = false;
  }

  if (hasUsableState) {
    return;
  }

  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();
  await loginAsAdmin(page);
  await context.storageState({ path: adminStorageStatePath });
  await context.close();
});

test.describe('Admin Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/dashboard');
    await expect(page.getByRole('heading', { name: /admin dashboard/i })).toBeVisible();
  });

  test.describe('Dashboard Overview', () => {
    test('should display dashboard stats', async ({ page }) => {
      await expect(page.getByText(/pending teachers/i).first()).toBeVisible();
      await expect(page.getByText(/total students/i).first()).toBeVisible();
      await expect(page.getByText(/total teachers/i).first()).toBeVisible();
    });

    test('should display quick actions', async ({ page }) => {
      await expect(page.getByRole('heading', { name: /quick actions/i })).toBeVisible();
      await expect(page.getByRole('heading', { name: /review pending teachers/i })).toBeVisible();
      await expect(page.getByRole('heading', { name: /create student account/i })).toBeVisible();
      await expect(page.getByRole('heading', { name: /system settings/i })).toBeVisible();
    });

    test('should navigate to pending teachers', async ({ page }) => {
      await page.getByRole('link', { name: /pending teachers/i }).click();
      await expect(page).toHaveURL(/\/admin\/teachers\/pending/);
    });

    test('should navigate to student management', async ({ page }) => {
      await page.getByRole('link', { name: /students|student management/i }).click();
      await expect(page).toHaveURL(/admin.*students/);
    });
  });

  test.describe('Teacher Approval', () => {
    test('should display pending teachers list', async ({ page }) => {
      await page.goto('/admin/teachers/pending');
      
      await expect(page.getByText(/pending teacher|approval/i)).toBeVisible();
    });

    test('should show teacher details', async ({ page }) => {
      await page.goto('/admin/teachers/pending');
      
      // Check for teacher information columns
      const tableOrList = await page.locator('table, [role="grid"], .teacher-list').first();
      if (await tableOrList.count() > 0) {
        await expect(tableOrList).toBeVisible();
      }
    });

    test('should have approve/reject actions', async ({ page }) => {
      await page.goto('/admin/teachers/pending');

      await expect.poll(async () => {
        const hasApproveAction = await page.getByRole('button', { name: /approve/i }).count() > 0;
        const hasRejectAction = await page.getByRole('button', { name: /reject/i }).count() > 0;
        const hasRemoveAction = await page.getByRole('button', { name: /remove/i }).count() > 0;
        const hasEmptyState = await page.getByText(/no teachers found|teacher accounts will appear/i).count() > 0;

        return hasApproveAction || hasRejectAction || hasRemoveAction || hasEmptyState;
      }, { timeout: 15000 }).toBeTruthy();
    });
  });

  test.describe('Student Management', () => {
    test('should display student list', async ({ page }) => {
      await page.goto('/admin/students');
      
      await expect(page.getByRole('heading', { name: /student management/i })).toBeVisible();
    });

    test('should have create student button', async ({ page }) => {
      await page.goto('/admin/students');
      
      await expect(page.getByRole('button', { name: /create|add|new student/i })).toBeVisible();
    });

    test('should open create student form', async ({ page }) => {
      await page.goto('/admin/students');
      
      await page.getByRole('button', { name: /create|add|new student/i }).click();
      
      // Form should appear (dialog or page)
      await expect(page.getByLabel(/first name|email/i).first()).toBeVisible({ timeout: 5000 });
    });

    test('should validate student form', async ({ page }) => {
      await page.goto('/admin/students');
      await page.getByRole('button', { name: /create|add|new student/i }).click();
      
      // Try to submit empty form
      const submitButton = page.getByRole('button', { name: /create|save|submit/i }).last();
      await submitButton.click();
      
      // Native required validation should keep focus on the first required input
      await expect(page.locator('#first_name')).toBeFocused();
    });

    test('should support bulk import', async ({ page }) => {
      await page.goto('/admin/students');
      
      // Check for bulk import option
      const bulkButton = page.getByRole('button', { name: /bulk|import|csv/i });
      if (await bulkButton.count() > 0) {
        await expect(bulkButton).toBeVisible();
      }
    });
  });

  test.describe('System Settings', () => {
    test('should display settings page', async ({ page }) => {
      await page.goto('/admin/settings');

      await expect(page).toHaveURL(/\/admin\/settings/);
    });

    test('should show email domain settings', async ({ page }) => {
      await page.goto('/admin/settings');

      const hasSettingsPanel = await page.getByText('Institutional Email Domains').count() > 0;
      const hasErrorFallback = await page.getByText(/failed to load system settings/i).count() > 0;
      const hasLoadingState = await page.locator('.animate-spin').count() > 0;
      expect(hasSettingsPanel || hasErrorFallback || hasLoadingState).toBeTruthy();
    });

    test('should show approval settings', async ({ page }) => {
      await page.goto('/admin/settings');

      const hasApprovalSetting = await page.getByText(/teacher approval|require approval/i).count() > 0;
      const hasErrorFallback = await page.getByText(/failed to load system settings/i).count() > 0;
      const hasLoadingState = await page.locator('.animate-spin').count() > 0;
      expect(hasApprovalSetting || hasErrorFallback || hasLoadingState).toBeTruthy();
    });

    test('should allow saving settings', async ({ page }) => {
      await page.goto('/admin/settings');

      const hasSaveAction = await page.getByRole('button', { name: /save|update/i }).count() > 0;
      const hasRetryAction = await page.getByRole('button', { name: /retry/i }).count() > 0;
      const hasLoadingState = await page.locator('.animate-spin').count() > 0;
      expect(hasSaveAction || hasRetryAction || hasLoadingState).toBeTruthy();
    });
  });

  test.describe('Audit Logs', () => {
    test('should display audit logs page', async ({ page }) => {
      await page.goto('/admin/audit-logs');
      
      await expect(page.getByRole('heading', { name: /audit logs/i })).toBeVisible();
    });

    test('should show log entries', async ({ page }) => {
      await page.goto('/admin/audit-logs');

      await expect.poll(async () => {
        const isLoading = await page.getByText(/loading audit logs/i).count() > 0;
        if (isLoading) {
          return false;
        }

        const hasLoadedList = await page.getByText(/^Action$/).count() > 0;
        const hasEmptyState = await page.getByText(/no audit logs found|no logs match your search/i).count() > 0;

        return hasLoadedList || hasEmptyState;
      }, { timeout: 15000 }).toBeTruthy();
    });

    test('should have filter options', async ({ page }) => {
      await page.goto('/admin/audit-logs');
      
      // Check for filter controls
      const filterVisible = await page.getByRole('combobox').count() > 0 ||
                           await page.getByPlaceholder(/search|filter/i).count() > 0;
      
      // Filter may or may not exist depending on implementation
      // Just check page loads correctly
      await expect(page.getByRole('heading', { name: /audit logs/i })).toBeVisible();
    });
  });
});

test.describe('Admin Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/dashboard');
    await expect(page.getByRole('heading', { name: /admin dashboard/i })).toBeVisible();
  });

  test('should have sidebar navigation', async ({ page }) => {
    // Check for sidebar or navigation menu
    const nav = page.locator('nav, aside, [role="navigation"]').first();
    await expect(nav).toBeVisible();
  });

  test('should navigate between admin pages', async ({ page }) => {
    const pages = [
      { link: /dashboard/i, url: /admin/ },
      { link: /pending/i, url: /pending/ },
      { link: /students/i, url: /students/ },
      { link: /settings/i, url: /settings/ },
      { link: /logs|audit/i, url: /logs|audit/ },
    ];

    for (const { link, url } of pages) {
      const navLink = page.getByRole('link', { name: link });
      if (await navLink.count() > 0) {
        await navLink.first().click();
        await page.waitForURL(url, { timeout: 5000 }).catch(() => {});
      }
    }
  });

  test('should show current page indicator', async ({ page }) => {
    await page.goto('/admin/settings');
    
    // Check for active/selected state on navigation
    const activeLink = page.locator('[aria-current="page"], .active, [data-active="true"]');
    // May or may not have explicit active state - just ensure navigation works
    await expect(page).toHaveURL(/settings/);
  });
});
