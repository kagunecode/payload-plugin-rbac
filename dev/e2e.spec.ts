import type { Page } from '@playwright/test'

import { expect, test } from '@playwright/test'

import { devUser } from './helpers/credentials.js'

const PAGE_READY_TIMEOUT = 90_000

const openRoleForm = async (page: Page, url: string) => {
  await page.goto(url)
  await expect(page.locator('#field-name')).toBeVisible({ timeout: PAGE_READY_TIMEOUT })
}

test.beforeEach(async ({ page }) => {
  await page.goto('/admin/login')
  await page.fill('#field-email', devUser.email)
  await page.fill('#field-password', devUser.password)
  await page.click('.form-submit button')
  await expect(page).toHaveTitle(/Dashboard/, { timeout: PAGE_READY_TIMEOUT })
})

test('super admin role shows full access notice', async ({ page }) => {
  await page.goto('/admin/collections/roles')
  const link = page.getByRole('link', { name: 'Super Admin', exact: true })
  await expect(link).toBeVisible({ timeout: PAGE_READY_TIMEOUT })
  const href = await link.getAttribute('href')

  await openRoleForm(page, href!)
  await expect(page.getByText('This is the Super Admin role')).toBeVisible()
})

test('permissions matrix saves grants for a new role', async ({ page }) => {
  const roleName = `Editor ${Date.now()}`

  await openRoleForm(page, '/admin/collections/roles/create')
  await page.fill('#field-name', roleName)

  await page.getByLabel('Read Posts', { exact: true }).check()
  await page.getByLabel('Update Posts', { exact: true }).check()
  await page.getByLabel('Toggle every permission for Media').check()

  await expect(page.getByLabel('Toggle every permission for Posts')).toHaveJSProperty(
    'indeterminate',
    true,
  )

  await page.click('#action-save')
  await expect(page.getByText(/successfully/i).first()).toBeVisible()
  await page.waitForURL(/\/admin\/collections\/roles\/(?!create)[^/]+$/)

  await page.reload()
  await expect(page.locator('#field-name')).toBeVisible({ timeout: PAGE_READY_TIMEOUT })

  await expect(page.getByLabel('Read Posts', { exact: true })).toBeChecked()
  await expect(page.getByLabel('Update Posts', { exact: true })).toBeChecked()
  await expect(page.getByLabel('Delete Posts', { exact: true })).not.toBeChecked()
  await expect(page.getByLabel('Delete Media', { exact: true })).toBeChecked()
})

test('filter narrows the matrix rows', async ({ page }) => {
  await openRoleForm(page, '/admin/collections/roles/create')
  await page.getByLabel('Filter collections and globals').fill('med')

  await expect(page.getByLabel('Read Media', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Read Posts', { exact: true })).toHaveCount(0)
})
