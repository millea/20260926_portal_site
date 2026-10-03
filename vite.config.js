import { defineConfig, loadEnv } from 'vite';
export default defineConfig(({ mode, command }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  if (command === 'build') {
    let config;
    try { config = JSON.parse(env.VITE_FIREBASE_CONFIG || '{}'); } catch { throw new Error('VITE_FIREBASE_CONFIG must be valid JSON'); }
    for (const key of ['apiKey', 'authDomain', 'projectId', 'appId']) {
      if (typeof config[key] !== 'string' || !config[key].trim()) throw new Error(`Firebase configuration missing: ${key}`);
    }
  }
  return { publicDir: false, build: { outDir: 'dist', sourcemap: false } };
});
