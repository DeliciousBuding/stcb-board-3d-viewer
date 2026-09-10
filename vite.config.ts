// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from 'vite'

export default defineConfig({
  // Relative assets work both on GitHub Pages project paths and under an iframe.
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 800,
  },
})
