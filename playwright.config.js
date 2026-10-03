import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'tests',testMatch:'ui.spec.js',workers:1,
  outputDir:'artifacts/playwright',
  use:{baseURL:'http://127.0.0.1:5173',channel:'msedge',headless:true,viewport:{width:1440,height:1050}},
  webServer:{command:'npm run dev -- --port 5173',url:'http://127.0.0.1:5173',reuseExistingServer:!process.env.CI},
});
