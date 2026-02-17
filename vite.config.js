import { defineConfig } from "vite";
import { rmSync } from "fs";

export default defineConfig({
  root: ".",
  server: { port: 5175, open: true },
  build: {
    outDir: "dist",
    // Disable automatic directory clearing to avoid Windows file locking issues
    // The dist directory will be manually cleared if needed
    emptyOutDir: false,
    rollupOptions: {
      output: {
        // Ensure consistent file names for easier debugging
        entryFileNames: '[name].js',
        chunkFileNames: '[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  },
  // Custom plugin to handle directory clearing with retries (Windows workaround)
  plugins: [
    {
      name: 'clear-dist-with-retry',
      buildStart() {
        // Only clear dist in production builds
        if (process.env.NODE_ENV === 'production') {
          try {
            rmSync('./dist', { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
            console.log('Cleared dist directory');
          } catch (error) {
            console.warn('Could not clear dist directory (files may be in use):', error.message);
          }
        }
      }
    }
  ]
});
