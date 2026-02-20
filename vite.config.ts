/// <reference types="vitest/config" />
/**
 * vite.config.ts — Build and dev-server configuration.
 *
 * Plugins:
 *   - react()        — JSX transform + fast refresh
 *   - tailwindcss()  — Tailwind v4 integrated as a Vite plugin
 *
 * Headers (server + preview):
 *   Both the dev server and the `vite preview` server send the
 *   Cross-Origin-Embedder-Policy (COEP) and Cross-Origin-Opener-Policy
 *   (COOP) headers. These are REQUIRED for `SharedArrayBuffer`,
 *   which FFmpeg WASM multi-threading depends on.
 *
 *   Without these headers the browser blocks SharedArrayBuffer
 *   and FFmpeg falls back to single-threaded mode (slower).
 *
 * optimizeDeps.exclude:
 *   Vite's dependency pre-bundling would try to bundle the FFmpeg
 *   WASM packages, which breaks them. Excluding @ffmpeg/* tells
 *   Vite to leave them alone and let the browser load them as-is.
 */

import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import svgr from 'vite-plugin-svgr'
import path from 'path'
import { readFileSync } from 'fs'

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string }

function buildCsp(isDevServer: boolean): string {
  const connectSrc = isDevServer
    ? "'self' blob: ws: wss: http://localhost:* http://127.0.0.1:*"
    : "'self' blob:"
  const scriptSrc = isDevServer
    ? "'self' blob: 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'"
    : "'self' blob: 'wasm-unsafe-eval'"

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "worker-src 'self' blob:",
    `connect-src ${connectSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "media-src 'self' blob: data:",
    "font-src 'self' data:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
}

/** Vite plugin to add CORP header to resources loaded under COEP */
function corpHeaderPlugin() {
  return {
    name: 'corp-header-plugin',
    apply: 'serve',
    configureServer(server: any) {
      // Register middleware to add CORP header
      server.middlewares.use((req: any, res: any, next: any) => {
        if (req.url && (req.url.endsWith('.wasm') || req.url.includes('/node_modules/@ffmpeg/'))) {
          res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
        }
        next()
      })
    },
  } as Plugin
}

export default defineConfig(({ mode }) => ({
  // Serve from /wasmux on production builds for GitHub Pages subpath hosting.
  base: mode === 'production' ? '/wasmux/' : '/',
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  plugins: [corpHeaderPlugin(), react(), svgr(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    allowedHosts: true,
    headers: {
      'Content-Security-Policy': buildCsp(true),
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
    },
  },
  preview: {
    headers: {
      'Content-Security-Policy': buildCsp(false),
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
    },
  },
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util', '@ffmpeg/core', '@ffmpeg/core-mt'],
  },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    setupFiles: ['tests/setup-dom.ts'],
    environmentMatchGlobs: [
      ['tests/dom/**/*.test.tsx', 'jsdom'],
    ],
  },
}))
