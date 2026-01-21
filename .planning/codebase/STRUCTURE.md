# Codebase Structure

**Analysis Date:** 2026-01-20

## Directory Layout

```
freelens-resource-map-extension/
├── components/                      # All UI components and business logic
│   ├── helpers/                     # Shared utilities and configuration
│   │   ├── config.ts               # Resource type visual config (colors, icons, sizes)
│   │   └── types.ts                # TypeScript interfaces for D3 graph types
│   ├── tooltips/                   # Resource-specific tooltip components
│   │   ├── DefaultTooltip.tsx
│   │   ├── DeploymentTooltip.tsx
│   │   ├── PodTooltip.tsx
│   │   ├── ServiceTooltip.tsx
│   │   ├── IngressTooltip.tsx
│   │   ├── StatefulsetTooltip.tsx
│   │   └── index.ts                # Barrel export
│   ├── unused-components/          # Legacy code (safe to ignore)
│   │   └── NamespaceSelect.tsx
│   ├── index.ts                    # Barrel export for main components
│   ├── KubeForceChart.tsx          # Cluster-wide resource map (764 lines)
│   ├── KubeResourceChart.tsx       # Base class for all charts (674 lines)
│   ├── KubeControllerChart.tsx     # Detail view for Deployments/DaemonSets/StatefulSets
│   ├── KubePodChart.tsx            # Detail view for Pods
│   ├── KubeServiceChart.tsx        # Detail view for Services
│   ├── KubeIngressChart.tsx        # Detail view for Ingresses
│   ├── KubeResourcePage.tsx        # Page wrapper for full-screen cluster view
│   ├── KubeResourceChartLegend.tsx # Resource type legend tooltip
│   ├── KubeForceChart.scss         # Canvas container styles
│   ├── KubeResourcePage.scss       # Page layout styles
│   └── KubeResourceChartLegend.scss
├── main.ts                         # Main process entry point (4 lines)
├── renderer.tsx                    # Renderer process entry point (105 lines)
├── webpack.config.js               # Dual-target build configuration
├── tsconfig.json                   # TypeScript configuration
├── package.json                    # Dependencies and scripts
├── dist/                           # Build output (generated)
│   ├── main.js                     # Main process bundle
│   ├── renderer.js                 # Renderer process bundle
│   └── chunks/                     # Code-split chunks
├── docs/                           # Documentation
│   ├── architecture/
│   │   └── overview.md             # High-level architecture
│   ├── api/                        # Component/type documentation
│   ├── guides/
│   │   └── development.md          # Development workflow
│   └── MIGRATION_GUIDE.md          # Migration from original Lens extension
├── images/                         # Static images (README screenshots)
├── .github/                        # GitHub workflows
├── pnpm-lock.yaml                  # Dependency lock file
├── pnpm-workspace.yaml             # Monorepo config (minimal)
└── STRATEGIC_PLAN_V2.md            # Long-term roadmap

KEY: 25 source files (19 .tsx, 2 .ts, 2 config, 2 package files)
```

## Directory Purposes

**`components/`:**
- Purpose: All UI and business logic
- Contains: React components, MobX state, K8s data transformation, tooltips
- Key files: `KubeResourceChart.tsx` (base), `KubeForceChart.tsx` (cluster view)
- Status: ~2,200 lines of TypeScript/TSX total

**`components/helpers/`:**
- Purpose: Shared constants and type definitions
- Contains: Resource configuration (colors, icons), D3 graph type interfaces
- Key files: `config.ts` (10 resource types), `types.ts` (NodeObject, LinkObject interfaces)

**`components/tooltips/`:**
- Purpose: Resource-specific detail rendering
- Contains: TSX components for Pod, Service, Deployment, Ingress, StatefulSet, Default
- Naming: `{ResourceType}Tooltip.tsx` format
- Used by: KubeForceChart renders these to HTML on node hover

**`components/unused-components/`:**
- Purpose: Legacy code from original fork
- Contains: `NamespaceSelect.tsx` (not wired up)
- Status: Safe to ignore, no imports from active code

**`dist/`:**
- Purpose: Webpack build output
- Generated: Yes
- Committed: No (in .gitignore)
- Contains: `main.js`, `renderer.js`, code-split chunks

**`docs/`:**
- Purpose: Detailed documentation
- Contains: Architecture diagrams, component API docs, development guides
- Key files: `overview.md`, `V2_IMPLEMENTATION_PLAN.md`, `MIGRATION_GUIDE.md`

**`images/`:**
- Purpose: Static assets for documentation
- Contains: Install screenshot, feature screenshot

**`.github/`:**
- Purpose: GitHub Actions CI/CD
- Contains: Release workflow (semantic-release)

## Key File Locations

**Entry Points:**
- `main.ts`: Main process bootstrap (Electron main thread)
- `renderer.tsx`: Renderer process & view registration

**Configuration:**
- `webpack.config.js`: Dual-target build (main + renderer)
- `tsconfig.json`: TypeScript settings (experimentalDecorators for MobX)
- `package.json`: Dependencies (React 17, MobX 6, react-force-graph-2d)

**Core Logic:**
- `components/KubeResourceChart.tsx`: Base chart class (all stores, MobX reactions, node generation)
- `components/KubeForceChart.tsx`: Full cluster visualization (D3-force physics, canvas rendering)

**Utilities:**
- `components/helpers/config.ts`: Resource visual properties
- `components/helpers/types.ts`: D3 graph node/link interfaces
- `components/helpers/index.ts`: Would re-export (currently empty)

**Testing:**
- No test files present (jest configured but unused)

## Naming Conventions

**Files:**
- Component files: PascalCase.tsx (e.g., `KubeForceChart.tsx`)
- Helper files: camelCase.ts (e.g., `config.ts`, `types.ts`)
- Style files: Match component name with .scss (e.g., `KubeForceChart.scss`)
- Tooltip files: `{ResourceType}Tooltip.tsx` format
- Unused/legacy: `unused-components/` directory prefix

**Directories:**
- Component domain: `components/` (singular domain name)
- Specialized zones: `components/helpers/`, `components/tooltips/`, `components/unused-components/`
- Build output: `dist/` (conventional)
- Documentation: `docs/` (conventional)

**Classes:**
- Extension classes: `KubeResourceMap{Process}Extension` format (e.g., `KubeResourceMapMainExtension`)
- Chart components: `Kube{Resource}Chart` format
- Tooltip components: `{Resource}Tooltip` format

**Functions & Methods:**
- Private helpers: `protected` or `private` keyword (e.g., `protected generatePodNode()`)
- Public interface: rarely used (components are stateful class-based React)
- Getter methods: `get{Subject}()` pattern (e.g., `getControllerObject()`)

**Variables:**
- MobX observables: `@observable propertyName` decorator
- Private fields: underscore prefix (e.g., `private chartRef`, `private watchDisposers`)
- Stores: `{resourceType}Store` format (e.g., `podsStore`, `deploymentStore`)

**Types:**
- Interfaces: PascalCase (e.g., `ChartDataSeries`, `NodeObject`, `LinkObject`)
- Type aliases: PascalCase (e.g., `Config`, `ConfigItem`)

## Where to Add New Code

**New Resource Type (Chart View):**
1. Create `components/Kube{ResourceType}Chart.tsx` extending `KubeResourceChart`
2. Implement `registerStores()` to select which stores to watch
3. Implement `generateChartDataSeries()` to transform this resource + related resources to nodes/links
4. Register in `renderer.tsx` kubeObjectDetailItems array with kind/apiVersion/priority
5. (Optional) Create `components/tooltips/{ResourceType}Tooltip.tsx` for custom tooltip
6. Add resource config to `components/helpers/config.ts` with color/icon/size

**Example: Adding a ConfigMap detail view**
```typescript
// components/KubeConfigMapChart.tsx
export class KubeConfigMapChart extends KubeResourceChart {
  registerStores() {
    this.kubeObjectStores = [
      this.configMapStore,
      this.podsStore,      // ConfigMaps mounted in pods
      this.deploymentStore
    ]
  }

  generateChartDataSeries = () => {
    this.generateConfigMapNode(this.props.object);
    this.generateMountingPods();
    this.updateState(this.nodes, this.links);
  }
}

// Add to renderer.tsx
kubeObjectDetailItems = [
  // ... existing ...
  {
    kind: "ConfigMap",
    apiVersions: ["v1"],
    priority: 10,
    components: {
      Details: (props) => <KubeConfigMapChart {...props} />
    }
  }
]
```

**New Utility/Helper:**
- Shared helpers: `components/helpers/`
- Math/formatting: Extract to functions in `components/helpers/utils.ts` (not yet created)

**Shared Components:**
- Not used - each chart is standalone
- Would go in `components/shared/` if needed

## Special Directories

**`components/unused-components/`:**
- Purpose: Legacy code from fork
- Generated: No
- Committed: Yes
- Contains: `NamespaceSelect.tsx` (non-functional namespace filter)
- Action: Safe to delete if cleaned up properly

**`dist/`:**
- Purpose: Webpack output
- Generated: Yes (`pnpm run build`)
- Committed: No (.gitignore)
- Re-creates: Each build

**`node_modules/`:**
- Purpose: npm/pnpm packages
- Generated: Yes (`pnpm install`)
- Committed: No (.gitignore)
- Major packages:
  - `react@17.0.2` (provided by FreeLens at runtime)
  - `mobx@6.10.2` (provided by FreeLens at runtime)
  - `react-force-graph-2d@1.27.1` (bundled)
  - `d3-force@3.0.0` (bundled)
  - `@freelensapp/extensions@1.3.0` (type definitions only)

## Structure Gap Analysis: Current vs. Freelens Extension Example

**Current (Flat) Structure:**
```
freelens-resource-map-extension/
├── main.ts (4 lines, minimal)
├── renderer.tsx (105 lines, all view registration)
└── components/
    ├── Kube*.tsx (all components mixed)
    ├── helpers/
    └── tooltips/
```

**Modern Structure (freelens-extension-example):**
```
freelens-extension-example/
├── src/
│   ├── main/
│   │   └── index.ts (main process logic)
│   ├── renderer/
│   │   ├── components/    (UI components)
│   │   ├── details/       (detail view components)
│   │   ├── pages/         (full-page views)
│   │   ├── menus/         (context/toolbar menus)
│   │   ├── icons/         (icon components)
│   │   ├── k8s/           (K8s model classes)
│   │   └── index.tsx      (view registration)
│   └── common/
│       ├── store/         (shared state/stores)
│       └── utils.ts       (utility functions)
```

**Gap 1: No `src/` Directory Structure**
- Current: Files at root level (`main.ts`, `renderer.tsx`)
- Modern: Organized under `src/main/`, `src/renderer/`, `src/common/`
- Impact: Less clear separation of concerns as project grows

**Gap 2: View Registration Mixed with Logic**
- Current: `renderer.tsx` does both view registration (105 lines) and logic in components
- Modern: `src/renderer/index.tsx` handles registration, components in `src/renderer/components/`, details in `src/renderer/details/`
- Impact: Hard to see at a glance what views are registered; unclear component purpose

**Gap 3: No Explicit Common Layer**
- Current: Utilities scattered in `components/helpers/`
- Modern: Dedicated `src/common/store/` and `src/common/utils.ts`
- Impact: Hard to distinguish shared code from component-specific code

**Gap 4: Tooltips Mixed with Chart Components**
- Current: `components/tooltips/` at same level as main charts
- Modern: Structured as `src/renderer/details/` (for detail views)
- Impact: Tooltip relationship to charts not immediately obvious

**Gap 5: Type Definitions Not Isolated**
- Current: Types in `components/helpers/types.ts`
- Modern: K8s models in `src/renderer/k8s/` with version-specific files
- Impact: K8s API version handling unclear

**Gap 6: No Main Process Logic**
- Current: `main.ts` is empty (4 lines, just extends LensExtension)
- Modern: `src/main/index.ts` can contain initialization logic
- Impact: Cannot add main process features (IPC, lifecycle hooks)

## Migration Path to Modern Structure

If refactoring to modern structure is desired:

1. Create `src/` directory with `main/`, `renderer/`, `common/` subdirectories
2. Move `main.ts` → `src/main/index.ts`
3. Move `renderer.tsx` → `src/renderer/index.tsx`
4. Move `components/` → `src/renderer/components/` with subdirectories:
   - `src/renderer/pages/` → `KubeResourcePage.tsx`
   - `src/renderer/details/` → detail charts (KubePodChart, KubeControllerChart, etc.)
   - `src/renderer/icons/` → legend and icon components
5. Move `components/helpers/` → `src/common/`
6. Move `components/tooltips/` → `src/renderer/details/` as tooltip components
7. Update webpack.config.js entry points to `src/main/index.ts` and `src/renderer/index.tsx`
8. Update tsconfig.json include paths if using path aliases

**Current structure is functional but loses clarity as complexity increases.**

---

*Structure analysis: 2026-01-20*
