# Technology Stack

**Analysis Date:** 2026-01-20

## Languages

**Primary:**
- TypeScript 5.9.3 - Main language for all source code
- JavaScript - Configuration and build tooling

**Secondary:**
- SCSS 1.94.1 - Styling for renderer components

## Runtime

**Environment:**
- Node.js >= 22.16.0 (specified in `.nvmrc` and `engines.node`)
- Electron runtime (via Freelens host)

**Package Manager:**
- pnpm 10.22.0 (locked in `packageManager` field)
- Lockfile: pnpm-lock.yaml (present)

## Frameworks

**Core:**
- React 17.0.2 - UI component framework (devDependency, provided by Freelens host)
- Vite 7.2.2 - Build and development server
- electron-vite 4.0.1 - Electron-specific Vite configuration

**UI/State Management:**
- MobX 6.13.7 - Reactive state management
- mobx-react 7.6.0 - React bindings for MobX

**FreeLens Integration:**
- @freelensapp/extensions 1.6.1 - Official FreeLens extension API

**Build/Dev:**
- electron-vite 4.0.1 - Webpack/Vite for Electron main+renderer
- @vitejs/plugin-react 5.1.1 - JSX support
- vite-plugin-external 6.2.2 - External module configuration
- vite-plugin-sass-dts 1.3.34 - SCSS type definitions
- @babel/plugin-proposal-decorators 7.28.0 - MobX decorator support

## Key Dependencies

**Critical:**
- @freelensapp/extensions 1.6.1 - Provides K8s API access, component registration, extension lifecycle
- mobx 6.13.7 - Dependency tracking and reactive updates essential for extension reactivity
- react 17.0.2 - UI rendering framework (external to extension bundle)

**Infrastructure:**
- electron-vite 4.0.1 - Dual-target build (main + renderer processes)
- vite 7.2.2 - Modern ES module bundler
- sass 1.94.1 - CSS preprocessing
- typescript 5.9.3 - Type checking and compilation

## Configuration

**Environment:**
- No environment variables required
- Configuration via MobX stores (ExtensionStore from @freelensapp/extensions)
- Preferences stored in Freelens app config

**Build:**
- `electron.vite.config.js` - Dual-target Vite configuration
- `tsconfig.json` - TypeScript configuration (extends @electron-toolkit/tsconfig)
- `biome.jsonc` - Code linting/formatting
- `knip.jsonc` - Unused code detection
- `.prettierignore` - Prettier configuration

**Platform Requirements:**

**Development:**
- Node.js 22.16.0
- pnpm 10.22.0
- Git
- Kubernetes cluster (for testing extensions with real resources)

**Production:**
- Freelens >= 1.6.0 (from `engines.freelens`)
- Kubernetes >= 1.24

## Build Output

- Main process: `out/main/index.js` (CommonJS)
- Renderer process: `out/renderer/index.js` (CommonJS with chunks)
- Package format: `.tgz` (tarball) for distribution via npm and Freelens

## Release Process

Uses semantic-release (implied in docs):
- Branch: `master`
- Distribution: npm registry (@freelensapp/example-extension)
- Supported by GitHub Actions CI/CD

---

*Stack analysis: 2026-01-20*
