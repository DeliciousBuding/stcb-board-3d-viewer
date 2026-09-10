# Contributing

Thanks for improving the viewer. Keep changes focused, reproducible, and honest
about what the model does and does not prove.

## Development

1. Install Node.js 22.12+ and pnpm 10.
2. Run `pnpm install`.
3. Make the change under `src/`, `tools/`, or `docs/`.
4. Run `pnpm check`.
5. For visual changes, run the browser regression documented in `README.md`.

## Pull requests

- Explain the user-visible result and the evidence used to verify it.
- Keep source PDFs, reference photos, device logs, credentials, and local paths
  out of commits.
- Do not commit `dist/`, `node_modules/`, screenshots, or generated comparison
  artifacts unless they are intentional documentation assets.
- Preserve the distinction between visual approximation and verified hardware
  geometry in code comments and documentation.
- New runtime dependencies need a clear reason; prefer browser-native APIs and
  the existing Three.js stack.

## License

By contributing, you agree that your contribution is available under the MIT
License in `LICENSE`, except for third-party material described in `NOTICE.md`.
