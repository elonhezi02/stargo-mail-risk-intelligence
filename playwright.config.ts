import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3101',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'AUTO_PROCESS=false PORT=3101 DATABASE_PATH=:memory: npm start',
    url: 'http://localhost:3101/api/emails',
    reuseExistingServer: false,
    timeout: 30000,
  },
});
