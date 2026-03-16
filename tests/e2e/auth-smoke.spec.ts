import { test, expect } from '@playwright/test'

test.describe('Auth Guard Smoke', () => {
  test('redirects unauthenticated / to /login', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('renders login form', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByText('JHBioFarm')).toBeVisible()
    await expect(page.getByRole('textbox', { name: '아이디' })).toBeVisible()
    await expect(page.getByPlaceholder('admin01 또는 admin@jhbiofarm.co.kr')).toBeVisible()
    await expect(page.getByPlaceholder('비밀번호 입력')).toBeVisible()
    await expect(page.locator('form').getByRole('button', { name: '로그인' })).toBeVisible()
  })
})
