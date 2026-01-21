# Codebase Structure

**Analysis Date:** 2026-01-20

## Directory Layout

```
freelens-resource-map-extension/
├── src/                                # Main v2 extension source code
│   ├── main/                          # Electron main process entry
│   │   └── index.ts                   # Extension main class (lifecycle hooks)
│   ├── renderer/                      # Electron renderer process UI
│   │   ├── index.tsx                  # Extension renderer class (view registration)
│   │   ├── pages/                     # Cluster page components
│   │   │   ├── examples-page-v1alpha1.tsx
│   │   │   └── examples-page-v1alpha2.tsx
│   │   ├── details/                   # Resource detail drawer components
│   │   │   ├── example-details-v1alpha1.tsx
│   │   │   └── example-details-v1alpha2.tsx
│   │   ├── menus/                     # Context menu components
│   │   │   ├── example-active-toggle-menu-item-v1alpha1.tsx
│   │   │   └── example-active-toggle-menu-item-v1alpha2.tsx
│   │   ├── components/                # Shared UI components
│   │   │   ├── available-version.tsx  # API version auto-detection wrapper
│   │   │   ├── error-page.tsx         # Error boundary component
│   │   │   ├── available-version.module.scss
│   │   │   ├── error-page.module.scss
│   │   │   └── *.module.scss.d.ts    # TypeScript types for SCSS modules
│   │   ├── preferences/               # Settings/preferences UI
│   │   │   └── example-preference.tsx
│   │   ├── icons/                     # SVG icon components
│   │   │   ├── index.ts              # Icon exports barrel file
│   │   │   └── example.tsx           # Icon wrapper component
│   │   ├── k8s/                       # Kubernetes resource definitions
│   │   │   ├── types.ts              # TypeScript interfaces for CRD types
│   │   │   └── example/
│   │   │       ├── example-v1alpha1.ts  # K8s Example resource (v1alpha1)
│   │   │       └── example-v1alpha2.ts  # K8s Example resource (v1alpha2)
│   │   └── vars.scss                 # SCSS variables shared across styles
│   └── common/                        # Shared code between main and renderer
│       ├── store/                     # MobX state stores
│       │   ├── index.ts              # Store exports
│       │   └── preferences-store.ts  # ExamplePreferencesStore (user preferences)
│       └── utils.ts                  # Utility functions
│
├── v1/                               # Legacy v1 codebase (archived, not in use)
│   ├── components/                  # Force-graph visualization components
│   ├── main.ts                      # Legacy main entry
│   └── renderer.tsx                 # Legacy renderer entry
│
├── docs/                            # Documentation
│   ├── README.md
│   ├── architecture/
│   ├── guides/
│   ├── api/
│   └── examples/
│
├── examples/                        # Example CRD test manifests
│   ├── v1alpha1/
│   └── v1alpha2/
│
├── integration/                     # Integration tests
│   └── __tests__/
│
├── .planning/                       # GSD planning documentation (auto-generated)
│   └── codebase/
│
├── electron.vite.config.js         # Vite build config for dual Electron targets
├── tsconfig.json                   # TypeScript compiler config
├── package.json                    # NPM manifest
├── pnpm-lock.yaml                  # Lockfile
├── pnpm-workspace.yaml             # Monorepo config (if applicable)
├── biome.jsonc                     # Biome linter/formatter config
├── knip.jsonc                      # Unused code detection config
├── mise.toml                       # Development environment tool config
└── README.md                       # Project root documentation
```

## Directory Purposes

**src/:**
- Purpose: All application source code (v2 - current)
- Contains: TypeScript/TSX files only (no build artifacts)
- Organization: Split by architectural layer (main, renderer, common)

**src/main/:**
- Purpose: Electron main process code
- Contains: Extension lifecycle, initialization
- Key files: `index.ts` (single entry point)

**src/renderer/:**
- Purpose: Electron renderer process UI code
- Contains: React components, K8s resource definitions, UI registration
- Organization: By feature/responsibility (pages, details, menus, components, k8s, icons, preferences)

**src/renderer/pages/:**
- Purpose: Full-page cluster views (tabs in cluster navigation)
- Contains: List/table components for viewing collections of resources
- Naming: `*-page-*.tsx` (e.g., `examples-page-v1alpha1.tsx`)
- Pattern: Wrapped with `@observer` for MobX reactivity

**src/renderer/details/:**
- Purpose: Detail drawer/sidebar views (shown when resource selected)
- Contains: Resource property display, metadata rendering
- Naming: `*-details-*.tsx` (e.g., `example-details-v1alpha1.tsx`)
- Pattern: Accept resource object as prop

**src/renderer/menus/:**
- Purpose: Context menu items and action buttons
- Contains: Dropdown menu components for resource actions
- Naming: `*-menu-item-*.tsx` (e.g., `example-active-toggle-menu-item-v1alpha1.tsx`)
- Pattern: Access selected resource context from FreeLens API

**src/renderer/components/:**
- Purpose: Shared, reusable UI components
- Contains: Error handling, version detection logic, common UI patterns
- Key files:
  - `error-page.tsx`: Error boundary wrapper - catches render errors
  - `available-version.tsx`: Auto-detects and renders correct API version

**src/renderer/preferences/:**
- Purpose: User preferences/settings UI
- Contains: Input fields, toggles, configuration controls
- Pattern: Read/write to `ExamplePreferencesStore`

**src/renderer/icons/:**
- Purpose: Icon component wrappers
- Contains: SVG icons used in UI
- Naming: Icon filename matches function name (e.g., `example.tsx` → `ExampleIcon()`)
- Pattern: Vite `?raw` import for inline SVG

**src/renderer/k8s/:**
- Purpose: Kubernetes resource type definitions
- Contains: Custom Resource Definition (CRD) classes, API bindings, types
- Structure:
  - `types.ts`: TypeScript interfaces shared across versions
  - `example/example-v1alpha1.ts`: v1alpha1 CRD class
  - `example/example-v1alpha2.ts`: v1alpha2 CRD class

**src/common/:**
- Purpose: Code shared between main and renderer processes
- Contains: State stores, utilities used by both layers

**src/common/store/:**
- Purpose: MobX state stores
- Contains: `ExamplePreferencesStore` for user preferences
- Pattern: Extends `Common.Store.ExtensionStore`
- Key file: `preferences-store.ts` - implements `fromStore()` and `toJSON()` lifecycle

**v1/:**
- Purpose: Legacy v1 codebase (original force-graph extension)
- Status: Archived reference, not used in current build
- Note: Keep for historical reference, migration planning

**docs/:**
- Purpose: Project documentation
- Contains: Architecture diagrams, development guides, API docs, migration guides

**examples/:**
- Purpose: Test CRD manifests for development
- Contains: Example Kubernetes YAML files for testing with cluster

**integration/:**
- Purpose: Integration tests
- Contains: End-to-end test scenarios

**.planning/codebase/:**
- Purpose: GSD (Get-Stuff-Done) planning documents
- Contains: ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, STACK.md, CONCERNS.md
- Auto-generated by planning agents

## Key File Locations

**Entry Points:**
- `src/main/index.ts`: Main process extension class - creates `ExampleMain`
- `src/renderer/index.tsx`: Renderer process extension class - creates `ExampleRenderer`, registers all views

**Configuration:**
- `package.json`: NPM/pnpm package metadata
- `tsconfig.json`: TypeScript configuration
- `electron.vite.config.js`: Vite build config for Electron dual-process
- `biome.jsonc`: Code quality/formatting rules

**Core Logic:**
- `src/renderer/k8s/example/example-v1alpha1.ts`: v1alpha1 CRD definition
- `src/renderer/k8s/example/example-v1alpha2.ts`: v1alpha2 CRD definition
- `src/renderer/pages/examples-page-v1alpha1.tsx`: Main page for listing resources
- `src/common/store/preferences-store.ts`: User preference persistence

**Testing:**
- `integration/__tests__/extensions.tests.ts`: Integration test suite

**Utilities:**
- `src/common/utils.ts`: Shared utility functions

## Naming Conventions

**Files:**

| Pattern | Example | Usage |
|---------|---------|-------|
| `*-page-*.tsx` | `examples-page-v1alpha1.tsx` | Page components for cluster tabs |
| `*-details-*.tsx` | `example-details-v1alpha1.tsx` | Detail drawer components |
| `*-menu-item-*.tsx` | `example-active-toggle-menu-item-v1alpha1.tsx` | Context menu components |
| `*-*.module.scss` | `available-version.module.scss` | CSS module stylesheets (typed) |
| `*.scss.d.ts` | `available-version.module.scss.d.ts` | Generated TypeScript types for SCSS |
| `*-store.ts` | `preferences-store.ts` | MobX store classes |
| `index.ts` / `index.tsx` | `src/renderer/icons/index.ts` | Barrel file exports |

**Directories:**
- Kebab-case with semantic meaning: `src/renderer/k8s/example/`
- Version variants in filenames: `example-v1alpha1.ts`
- API version in directory: `src/renderer/k8s/example/` for Example CRD

**Functions/Components:**
- PascalCase for React components: `ExamplesPage()`, `ExampleIcon()`
- PascalCase for classes: `ExamplePreferencesStore`, `Example extends LensExtensionKubeObject`
- camelCase for utility functions: `createAvailableVersionPage()`, `withErrorPage()`

**Types/Interfaces:**
- PascalCase: `ExampleSpec`, `ExamplePreferencesModel`, `VersionVariant`
- Suffix with type: `*Props`, `*Api`, `*Store`, `*CRD`
- Type file: `types.ts` in parent dir

## Where to Add New Code

**New Page Component:**
- Path: `src/renderer/pages/`
- Pattern: Create `new-resource-page-v1alpha1.tsx`
- Template: Copy from `examples-page-v1alpha1.tsx`
- Register: Add to `clusterPages` array in `src/renderer/index.tsx`

**New Detail View Component:**
- Path: `src/renderer/details/`
- Pattern: Create `new-resource-details-v1alpha1.tsx`
- Template: Copy from `example-details-v1alpha1.tsx`
- Register: Add to `kubeObjectDetailItems` array in `src/renderer/index.tsx`

**New K8s Resource Type:**
- Path: `src/renderer/k8s/new-resource/`
- Pattern: Create `new-resource-v1alpha1.ts`
- Template: Extend `Renderer.K8sApi.LensExtensionKubeObject<Metadata, Status, Spec>`
- Define: Static `kind`, `apiBase`, `crd` metadata, accessor methods
- Types: Add interfaces to `src/renderer/k8s/types.ts`

**New Menu Item:**
- Path: `src/renderer/menus/`
- Pattern: Create `new-action-menu-item-v1alpha1.tsx`
- Template: Copy from `example-active-toggle-menu-item-v1alpha1.tsx`
- Register: Add to `kubeObjectMenuItems` or `clusterPageMenus` in `src/renderer/index.tsx`

**Shared Store:**
- Path: `src/common/store/`
- Pattern: Create `new-store.ts`
- Template: Extend `Common.Store.ExtensionStore<T>`
- Export: Add to `src/common/store/index.ts` barrel file

**Shared Utilities:**
- Path: `src/common/utils.ts`
- Pattern: Add function, export from file
- Usage: Import from `src/common/utils` in components

**Icon Component:**
- Path: `src/renderer/icons/`
- Steps:
  1. Add SVG file: `new-icon.svg`
  2. Create wrapper: `new-icon.tsx`
  3. Export from barrel: `src/renderer/icons/index.ts`

**Preferences Component:**
- Path: `src/renderer/preferences/`
- Pattern: Create `new-preference.tsx`
- Template: Use FreeLens `Renderer.Component.*` for UI controls
- Store: Read/write to `ExamplePreferencesStore` from `src/common/store/`

## Special Directories

**v1/:**
- Purpose: Legacy codebase archive
- Generated: No (manually maintained history)
- Committed: Yes (for reference/rollback)
- Status: Archived - no new changes

**dist/ (generated):**
- Purpose: Build output
- Generated: Yes (`pnpm build`)
- Committed: No (.gitignore)
- Contents: Bundled JS, sourcemaps, tree-shaken

**out/ (generated):**
- Purpose: Electron-vite build output
- Generated: Yes (`electron-vite build`)
- Committed: No (.gitignore)
- Structure: `out/main/`, `out/renderer/`, `out/preload/`

**node_modules/ (generated):**
- Purpose: NPM/pnpm dependencies
- Generated: Yes (`pnpm install`)
- Committed: No (.gitignore)

**.planning/codebase/ (auto-generated by GSD):**
- Purpose: Codebase mapping documents
- Generated: Yes (by planning agents)
- Committed: Optionally (helps future sessions)
- Contents: ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, STACK.md, CONCERNS.md

## Import Path Patterns

**From src/renderer/:**
```tsx
// Import from same directory
import { ExampleDetailsV1alpha1 } from "./example-details-v1alpha1";

// Import from src/common
import { ExamplePreferencesStore } from "../../common/store";

// Import from src/renderer/k8s
import { Example } from "../k8s/example/example-v1alpha1";

// Import from FreeLens
import { Renderer } from "@freelensapp/extensions";

// Import from styles (generates .d.ts)
import styles from "./examples-page.module.scss";
```

**Barrel Files (index.ts):**
- `src/renderer/icons/index.ts`: Exports all icon components
- `src/common/store/index.ts`: Exports all stores
- `src/renderer/components/`: Components imported directly, no barrel file

**Absolute vs Relative:**
- Use relative imports within `src/` (more portable)
- Use absolute imports for external packages only

---

*Structure analysis: 2026-01-20*
