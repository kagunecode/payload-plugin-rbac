import { expect, test } from '@playwright/test'

import { devUser } from './helpers/credentials.js'

test.beforeEach(async ({ page }) => {
  await page.goto('/admin/login')
  await page.fill('#field-email', devUser.email)
  await page.fill('#field-password', devUser.password)
  await page.click('.form-submit button')
  await expect(page).toHaveTitle(/Dashboard/)
})

test('super admin role shows full access notice', async ({ page }) => {
  await page.goto('/admin/collections/roles')
  await page.getByRole('link', { name: 'Super Admin' }).first().click()
  await expect(page.getByText('This is the Super Admin role')).toBeVisible()
})

test('permissions matrix saves grants for a new role', async ({ page }) => {
  const roleName = `Editor ${Date.now()}`

  await page.goto('/admin/collections/roles/create')
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

  await page.reload()

  await expect(page.getByLabel('Read Posts', { exact: true })).toBeChecked()
  await expect(page.getByLabel('Update Posts', { exact: true })).toBeChecked()
  await expect(page.getByLabel('Delete Posts', { exact: true })).not.toBeChecked()
  await expect(page.getByLabel('Delete Media', { exact: true })).toBeChecked()
})

test('filter narrows the matrix rows', async ({ page }) => {
  await page.goto('/admin/collections/roles/create')
  await page.getByLabel('Filter collections and globals').fill('med')

  await expect(page.getByLabel('Read Media', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Read Posts', { exact: true })).toHaveCount(0)
})
