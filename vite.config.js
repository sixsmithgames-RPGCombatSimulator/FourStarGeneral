import { defineConfig } from "vite";
import { rmSync } from "fs";

function featureChunk(id) {
  const moduleId = id.replace(/\\/g, "/");

  if (moduleId.includes("/node_modules/")) return "vendor";
  if (!moduleId.includes("/src/")) return undefined;

  if (moduleId.includes("/src/data/canon/")) return "combat-data";
  if (moduleId.includes("/src/data/unitSystem/")) return "unit-data";
  if (moduleId.includes("/src/data/")) return "scenario-data";

  if (moduleId.includes("/src/game/campaign/")) return "campaign-engine";
  if (moduleId.includes("/src/game/bot/")) return "tactical-ai";
  if (moduleId.includes("/src/game/")) return "tactical-engine";

  if (moduleId.includes("/src/ui/screens/CampaignScreen") || moduleId.includes("/src/ui/campaign/")) {
    return "campaign-ui";
  }
  if (moduleId.includes("/src/ui/screens/BattleScreen") || moduleId.includes("/src/ui/screens/PrecombatScreen")) {
    return "battle-screens";
  }
  if (moduleId.includes("/src/ui/airshow/")) return "airshow";
  if (moduleId.includes("/src/ui/components/")) return "battle-components";
  if (moduleId.includes("/src/ui/")) return "ui-shell";

  if (moduleId.includes("/src/rendering/")) return "rendering";
  if (moduleId.includes("/src/state/Campaign") || moduleId.includes("/src/state/UnlockState")) {
    return "campaign-state";
  }
  if (moduleId.includes("/src/state/")) return "tactical-state";
  if (moduleId.includes("/src/core/")) return "core";
  if (moduleId.includes("/src/audio/")) return "audio";

  return undefined;
}

export default defineConfig({
  root: ".",
  server: { 
    port: 5175, 
    open: true,
    headers: {
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://*.clerk.accounts.dev https://*.clerk.com blob:; worker-src 'self' blob:; connect-src 'self' https://*.clerk.accounts.dev https://*.clerk.com https://clerk.sixsmithgames.com https://api.clerk.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; frame-src 'self' https://*.clerk.accounts.dev https://*.clerk.com;"
    }
  },
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
        assetFileNames: 'assets/[name]-[hash][extname]',
        // Keep the initial payload cacheable and below Vite's warning threshold by
        // separating stable game systems along the same feature boundaries used in src/.
        manualChunks: featureChunk
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
