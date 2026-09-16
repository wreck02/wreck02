import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Relative base so the built dist/ folder can be opened from any path or served offline.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: 5173, open: false },
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      output: {
        // KaTeX is large and rarely changes: keep it in its own cacheable chunk.
        manualChunks(id: string) {
          if (id.includes('node_modules/katex')) return 'katex';
          if (id.includes('node_modules/react')) return 'react';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    testTimeout: 60000,
  },
});
