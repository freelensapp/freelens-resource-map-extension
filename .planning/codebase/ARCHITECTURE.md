# Architecture

**Analysis Date:** 2026-01-20

## Pattern Overview

**Overall:** Freelens Extension Plugin Architecture with Dual-Process Electron Model

**Key Characteristics:**
- Two separate entry points: main process (Node.js) and renderer process (React UI)
- Plugin-based extension system extending `Renderer.LensExtension` and `Main.LensExtension`
- MobX reactive state management integrated with FreeLens runtime stores
- Support for multiple Kubernetes API versions with automatic version detection
- Strongly typed K8s resource bindings via `LensExtensionKubeObject` inheritance
- Modular UI component composition following FreeLens component library patterns

## Layers

**Main Process (Electron-main):**
- Purpose: Extension lifecycle management and initialization
- Location: `src/main/index.ts`
- Contains: Extension activation hooks, configuration loading
- Depends on: `@freelensapp/extensions`, `ExamplePreferencesStore`
- Used by: FreeLens runtime on application startup
- Export: Class `ExampleMain extends Main.LensExtension`

**Renderer Process (Electron-renderer):**
- Purpose: UI registration and component mounting
- Location: `src/renderer/index.tsx`
- Contains: All page, menu, detail view, and preference component registrations
- Depends on: All UI components, K8s type definitions, FreeLens Renderer API
- Used by: FreeLens UI runtime to inject extension views
- Export: Class `ExampleRenderer extends Renderer.LensExtension`

**Shared/Common Layer:**
- Purpose: Configuration and state shared between processes
- Location: `src/common/`
- Contains: `ExamplePreferencesStore` (MobX state), utility functions
- Depends on: `@freelensapp/extensions`, `mobx`
- Used by: Both main and renderer processes

**UI Components Layer:**
- Purpose: Reusable React components for displaying resources
- Location: `src/renderer/components/`, `src/renderer/pages/`, `src/renderer/details/`, `src/renderer/menus/`
- Contains: Pages, detail views, menu items, error handling components
- Depends on: Renderer component library, MobX reactions, K8s type system

**K8s Integration Layer:**
- Purpose: Kubernetes resource definitions and API bindings
- Location: `src/renderer/k8s/`
- Contains: `Example` class (extends `LensExtensionKubeObject`), API classes, type definitions
- Depends on: `Renderer.K8sApi` from FreeLens runtime
- Used by: Page components, detail views, store management

## Data Flow

**Resource Lifecycle Flow:**

1. **Extension Activation**
   - Main: `Main.LensExtension.onActivate()` → load `ExamplePreferencesStore`
   - Renderer: `Renderer.LensExtension.onActivate()` → initialize store and register all views

2. **K8s Store Access**
   - FreeLens runtime maintains MobX observable stores for each K8s resource type
   - `Example.getStore()` retrieves the singleton store from `Renderer.K8sApi.apiManager`
   - Store auto-updates when cluster resources change (cluster watch)

3. **Page Component Rendering**
   - Page components (`ExamplesPageV1alpha1`, `ExamplesPageV1alpha2`) wrapped with `@observer` decorator
   - MobX auto-tracks dependencies on store properties
   - On store change → component re-renders automatically
   - Components query store for resources, render in `KubeObjectListLayout`

4. **Detail View Display**
   - When user selects a resource → FreeLens calls registered detail component
   - `ExampleDetailsV1alpha1` receives resource as prop
   - Component reads `ExamplePreferencesStore` for user preferences
   - MobX reactions trigger update if preferences change

5. **Menu Integration**
   - `ExampleActiveToggleMenuItem` provides context-sensitive actions
   - MenuItem state bound to preference store and selected resource

6. **Preference Persistence**
   - `ExamplePreferencesStore` extends `ExtensionStore`
   - Implements `fromStore()` (load) and `toJSON()` (save) lifecycle
   - MobX observable properties decorated with `@observable accessor`
   - Persisted to FreeLens config via store base class

**State Management Pattern:**

```
FreeLens Runtime MobX Stores (read-only from extension perspective)
    ↓ (via Renderer.K8sApi.apiManager.getStore())
    ↓
Page/Detail Component (@observer)
    ↓ (reads properties, MobX tracks)
    ↓
Automatic re-render on store change

ExamplePreferencesStore (ExtensionStore, MobX @observable)
    ↓ (explicit access via getInstance())
    ↓
Detail/Preference Component reads properties
    ↓ (modify properties)
    ↓
Extension persistence (toJSON → FreeLens config)
```

## Key Abstractions

**Kubernetes Resource Definition:**
- Purpose: Strongly typed wrapper around K8s API resources
- Examples: `src/renderer/k8s/example/example-v1alpha1.ts`, `src/renderer/k8s/example/example-v1alpha2.ts`
- Pattern: Extends `Renderer.K8sApi.LensExtensionKubeObject<Metadata, Status, Spec>`
- Defines: Static `kind`, `apiBase`, `crd` (CRD metadata), static accessor methods for spec/status fields
- Used by: Page components, stores, detail views to access/transform resource data

**Store Classes:**
- Purpose: Manage collection state for a K8s resource type
- Pattern: `ExampleStore extends Renderer.K8sApi.KubeObjectStore<Example, ExampleApi>`
- Provides: Observable list of resources, filtering, sorting, search (from base class)
- Lifecycle: Created once per resource type, destroyed with extension

**API Classes:**
- Purpose: Bridge between resource class and FreeLens K8s API
- Pattern: `ExampleApi extends Renderer.K8sApi.KubeApi<Example>`
- Handles: HTTP calls to `apiBase` path, resource list/watch/CRUD operations

**Component Wrappers:**
- Purpose: Graceful error handling and loading states
- Pattern: `withErrorPage(props, renderFn)` in `src/renderer/components/error-page.tsx`
- Behavior: Catches errors during render, displays error boundary instead of white screen

**Version Detection:**
- Purpose: Support multiple API versions with automatic selection
- Pattern: `createAvailableVersionPage()` in `src/renderer/components/available-version.tsx`
- Behavior: Tries K8s object variants in order, renders first available, shows fallback if none found

## Entry Points

**Main Process Entry:**
- Location: `src/main/index.ts`
- Export: `ExampleMain` class (default export)
- Triggers: FreeLens loads extension on application startup
- Responsibilities:
  - Initialize `ExamplePreferencesStore` via `onActivate()`
  - Load persisted preferences from config
  - No UI logic (Node.js-only layer)

**Renderer Process Entry:**
- Location: `src/renderer/index.tsx`
- Export: `ExampleRenderer` class (default export)
- Triggers: FreeLens loads extension UI after renderer startup
- Responsibilities:
  - Initialize store and register all views
  - Register `appPreferences` (settings UI)
  - Register `kubeObjectDetailItems` (detail panels)
  - Register `clusterPages` (cluster-level pages)
  - Register `clusterPageMenus` (cluster page sidebar menus)
  - Register `kubeObjectMenuItems` (context menus on resources)

**Cluster Pages:**
- Location: `src/renderer/pages/`
- Pattern: Component receives `extension: Renderer.LensExtension` prop
- Rendering: Embedded in cluster's main navigation tabs
- Example: `ExamplesPageV1alpha1` lists all Example resources in cluster

**Detail Views:**
- Location: `src/renderer/details/`
- Pattern: Component receives resource object + extension props
- Rendering: Shown in drawer/sidebar when user selects resource
- Example: `ExampleDetailsV1alpha1` shows spec, status, preferences for selected resource

**Menu Items:**
- Location: `src/renderer/menus/`
- Pattern: Components receive selected resource or cluster context
- Rendering: Context menus on resources or cluster page menus
- Example: `ExampleActiveToggleMenuItem` renders resource action menu

**Preferences Panel:**
- Location: `src/renderer/preferences/`
- Pattern: Component has no props (reads singleton store)
- Rendering: FreeLens settings UI
- Example: `ExamplePreferenceInput` + `ExamplePreferenceHint` form

## Error Handling

**Strategy:** Isolation + graceful degradation

**Patterns:**
- `withErrorPage(props, renderFn)` wraps component render functions to catch errors
- Error boundary catches React render errors, displays `ErrorPage` component
- Logs errors to console + FreeLens logger
- Failed page renders show user-friendly "Something went wrong" message instead of white screen
- Failed store operations caught at component level (MobX reactions safe from exceptions)
- Type errors prevented via strict TypeScript (though `tsconfig.json` has `strict: false` for compatibility)

## Cross-Cutting Concerns

**Logging:**
- Approach: Mix of console.log and `Common.logger` from FreeLens
- `ExamplePreferencesStore` logs store load/save operations for debugging
- `createAvailableVersionPage` logs API version selection decisions

**Validation:**
- Approach: Static type checking via TypeScript
- No runtime validation layer (trusts FreeLens stores and K8s API types)
- Component prop interfaces ensure type safety
- CRD schema validation handled by Kubernetes (server-side)

**Authentication:**
- Approach: Inherits from FreeLens runtime
- Extension uses cluster connection from FreeLens main app
- No separate auth layer (all K8s API calls use active cluster connection)
- `kubeObjectDetailItems` requires authenticated access to view resources

**Initialization Order:**
1. FreeLens starts → loads main process extension
2. Main: `onActivate()` → load preferences store
3. FreeLens starts renderer → loads renderer extension
4. Renderer: `onActivate()` → register all views
5. Views initialized lazily when first accessed

---

*Architecture analysis: 2026-01-20*
