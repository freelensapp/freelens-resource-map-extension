# Technology Stack

**Analysis Date:** 2026-01-20

## Languages

**Primary:**
- TypeScript 5.8.2 - Main language for both main and renderer processes
- TSX/React 17.0.2 - UI components for visualization layer
- JavaScript (CommonJS) - Webpack configuration and build system

**Secondary:**
- SCSS 1.86.3 - Component styling (loaded via sass-loader)

## Runtime

**Environment:**
- Node.js ≥20.0 (from engines field)
- Electron 35.0.3 - Desktop application runtime
- FreeLens ^1.2.0 - Extension host platform

**Package Manager:**
- pnpm (used in scripts, version via corepack)
- Lockfile: present (pnpm-lock.yaml)

## Frameworks

**Core:**
- React 17.0.2 - UI framework (overridden to 17.0.2 in package.json)
- MobX 6.10.2 - Observable state management
- MobX React 7.6.0 - MobX React integration for @observer decorators

**Graph/Visualization:**
- react-force-graph-2d 1.27.1 - Force-directed graph rendering (⚠️ UNMAINTAINED)
- force-graph ^1.49.5 - Graph data structure library
- d3-force 3.0.0 - Physics simulation for force-directed layouts

**Testing:**
- Jest 29.7.0 - Test runner
- @jest-runner/electron - Electron test environment (testEnvironment configured)

**Build/Dev:**
- Webpack 5.98.0 - Module bundler (old, slow; migration to Vite planned)
- ts-loader 9.5.2 - TypeScript loader for Webpack
- Electron 35.0.3 - Development runtime

## Key Dependencies

**Critical:**
- @freelensapp/extensions ^1.3.0 - FreeLens extension SDK (API 1.3)
- @freelensapp/core ^1.3.0 - Core FreeLens runtime
- @freelensapp/utilities ^1.3.0 - Utility library

**Graph Visualization:**
- react-force-graph-2d 1.27.1 - ⚠️ **NOT MAINTAINED**. Last update ~2023. High risk dependency. Strategic Plan V2 recommends replacement with @xyflow/react
- force-graph ^1.49.5 - Supporting graph library (maintained)
- d3-force 3.0.0 - D3-based physics simulation (maintained by D3)

**Infrastructure:**
- webpack 5.98.0 - Old build system (outdated; Vite 7.2.2 recommended)
- ts-loader 9.5.2 - TypeScript compilation
- sass 1.86.3 - SCSS preprocessing
- style-loader 4.0.0 - CSS injection
- css-loader 6.11.0 - CSS processing

## Configuration

**Environment:**
- No explicit environment file (.env) configuration detected
- Configuration via package.json overrides (react version locked)

**Build:**
- `webpack.config.js` - Dual-target config (main + renderer processes)
- `tsconfig.json` - TypeScript configuration (strict: false, experimentalDecorators: true)
- `package.json` - Main build entry points defined:
  - `main`: dist/main.js
  - `renderer`: dist/renderer.js

## Platform Requirements

**Development:**
- Node.js ≥20.0
- pnpm (via corepack)
- Electron 35.0.3 available globally or via node_modules
- TypeScript compiler (via ts-loader in Webpack)

**Production:**
- FreeLens ^1.2.0 (extension host)
- Runtime dependencies bundled into `dist/main.js` and `dist/renderer.js`
- External dependencies provided by FreeLens runtime:
  - React 17.0.2
  - MobX 6.10.2
  - @freelensapp/extensions API
  - mobx-react 7.6.0

**Build Output:**
- `dist/main.js` - Electron main process bundle (CommonJS)
- `dist/renderer.js` - Electron renderer process bundle (CommonJS)
- `dist/chunks/*.js` - Code-split chunks (if configured)

## Comparison to Modern Stack (freelens-extension-example)

| Component | Current | Modern | Gap |
|-----------|---------|--------|-----|
| **Build System** | Webpack 5 | Vite 7.2.2 + electron-vite | ⚠️ Major |
| **TypeScript** | 5.8.2, strict:false | 5.9.3, strict:true | ⚠️ Type safety |
| **React** | 17.0.2 (overridden) | 17.0.2 (inherited) | ✅ Same |
| **MobX** | 6.10.2 | 6.13.7 | ⚠️ Outdated |
| **Graph Library** | react-force-graph-2d | @xyflow/react ^12.0.0 | ⚠️ Critical |
| **Freelens API** | ^1.3.0 | ^1.6.1 | ⚠️ 3 versions behind |
| **Build Presets** | None | @electron-toolkit/tsconfig | ⚠️ Missing best practices |
| **Linting** | Prettier only | Biome + Prettier + Trunk + Knip | ⚠️ No linting |

## Known Issues & Tech Debt

**High Risk:**
1. **Unmaintained Graph Library**: `react-force-graph-2d` stopped receiving updates (~2023). Strategic Plan V2 identifies this as critical blocker.
2. **Outdated Build System**: Webpack 5 is slow and lacks HMR. Vite migration is recommended.
3. **Type Safety Disabled**: `strict: false` in tsconfig.json allows implicit any and unsafe operations.
4. **Outdated FreeLens API**: Using 1.3.0 instead of 1.6.1 misses new features and patterns.

**Medium Risk:**
1. **MobX 6.10.2**: Minor version behind 6.13.7 (latest). Possible security updates available.
2. **TypeScript 5.8.2**: One minor version behind 5.9.3.
3. **No Linting**: Only Prettier for formatting; missing ESLint/Biome for code quality.

**Low Risk:**
1. **Electron 35.0.3**: Current and maintained.
2. **D3-force 3.0.0**: Actively maintained by D3 project.

## Modernization Path (V2)

Strategic Plan V2 recommends complete modernization:

1. **Vite 7.2.2** + electron-vite 4.0.1 (replaces Webpack)
2. **@xyflow/react ^12.0.0** (replaces react-force-graph-2d)
3. **MobX 6.13.7** (updated from 6.10.2)
4. **TypeScript 5.9.3** with `strict: true`
5. **@freelensapp/extensions ^1.6.1** (updated from 1.3.0)
6. **Biome 2.3.6** for linting (Rust-based, 10-100x faster than ESLint)
7. **Knip 5.70.0** for unused dependency detection

## Build Commands

**Current (Webpack):**
```bash
pnpm start              # webpack --watch (development)
pnpm build              # pnpm run clean && webpack (production)
pnpm clean              # rm -rf ./dist
pnpm test               # jest (configured but no tests exist)
```

**Planned (Vite - V2):**
```bash
pnpm dev                # electron-vite dev (with HMR)
pnpm build              # electron-vite build (fast production)
pnpm preview            # electron-vite preview
pnpm type:check         # tsc --noEmit (pre-build type checking)
pnpm lint:check         # biome + prettier
pnpm lint:fix           # automatic formatting and fixes
pnpm test               # jest with actual tests
```

---

*Stack analysis: 2026-01-20*
