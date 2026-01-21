# Architecture

**Analysis Date:** 2026-01-20

## Pattern Overview

**Overall:** Monolithic Webpack-dual-target extension with flat component structure

**Key Characteristics:**
- Two entry points compiled to separate bundles (main process and renderer process)
- Flat component directory without logical separation by concern
- Direct FreeLens runtime dependency injection via global variables
- MobX-based reactive state from FreeLens K8s stores
- Single base chart class extended for different resource types

## Layers

**Entry Point Layer (Electron Dual-Target):**
- Purpose: Extension bootstrap and view registration
- Location: `main.ts`, `renderer.tsx` (root level)
- Contains: Extension class definitions, view/page/detail registration
- Depends on: `@freelensapp/extensions`
- Used by: FreeLens runtime (loads via package.json main/renderer fields)

**Presentation Layer (React Components):**
- Purpose: UI rendering and user interaction
- Location: `components/` directory
- Contains: Chart components (KubeForceChart, KubeResourceChart), detail views, tooltips, legend
- Depends on: React, MobX, react-force-graph-2d, FreeLens Renderer API
- Used by: Registered in renderer.tsx, displayed in UI

**Data Flow Layer (Graph Computation):**
- Purpose: Node/link generation from K8s objects, graph physics simulation
- Location: Core logic inside `components/KubeResourceChart.tsx` and `components/KubeForceChart.tsx`
- Contains: Store subscriptions, data transformation, D3-force simulation
- Depends on: FreeLens K8s stores, D3-force library
- Used by: Chart rendering layer

**Configuration & Types Layer:**
- Purpose: Resource metadata and TypeScript interfaces
- Location: `components/helpers/config.ts`, `components/helpers/types.ts`
- Contains: Color/icon/size mapping for resource types, D3 graph types
- Depends on: None (pure data)
- Used by: Chart components for rendering configuration

**Tooltip Layer:**
- Purpose: Resource-specific detail rendering in graph node tooltips
- Location: `components/tooltips/`
- Contains: TSX components per resource type (Pod, Service, Deployment, etc.)
- Depends on: React, FreeLens K8s API types
- Used by: KubeForceChart for dynamic tooltip HTML generation

## Data Flow

**Cluster View (Full Resource Map):**

1. FreeLens runtime initializes extension, calls `KubeResourceMapRenderer.clusterPages[0]`
2. Mounts `KubeResourcePage` component → renders `KubeForceChart`
3. `KubeForceChart` constructor initializes MobX decorators and image cache
4. `componentDidMount()` calls `registerStores()` and `setupMobXReactions()`
5. MobX reactions auto-trigger on K8s store changes:
   - `this.podsStore.items` changes → calls `refreshChart()`
   - `this.deploymentStore.items` changes → calls `refreshChart()`
   - (See KubeForceChart.tsx:164-182 for all reactions)
6. `refreshChart()` calls `generateChartDataSeries()` → transforms K8s objects to graph nodes/links
7. `ForceGraph2D` renders canvas with D3-force physics simulation
8. Canvas click handlers call `handleNodeClick()` to highlight connected nodes

**Detail View (Resource-Specific Map):**

1. FreeLens displays resource detail page (e.g., Deployment)
2. Calls registered component from `renderer.tsx` kubeObjectDetailItems (e.g., `KubeControllerChart`)
3. Subclass of `KubeResourceChart` overrides:
   - `registerStores()` - defines which stores to watch
   - `generateChartDataSeries()` - defines which nodes/links to include
4. Example: `KubeControllerChart.generateChartDataSeries()` (KubeControllerChart.tsx:23-33):
   - Calls `generateControllerNode(this.props.object)` to add controller
   - Calls `generateIngresses()` to add related ingresses
   - Calls `updateState()` with new nodes/links
5. Same MobX reaction chain triggers on parent controller's related resources

**State Management:**

- FreeLens stores (MobX observable): `podsStore`, `deploymentStore`, `serviceStore`, etc.
- Chart internal state: `this.nodes` (array), `this.links` (array), React state for hover/highlight
- No local state management library (plain React + MobX reactions)
- Component unmount cleanup: `componentWillUnmount()` disposes all MobX reactions (KubeResourceChart.tsx:186-192)

## Key Abstractions

**KubeResourceChart (Base Class):**
- Purpose: Shared logic for all chart views
- Location: `components/KubeResourceChart.tsx` (674 lines)
- Pattern: Template method - subclasses override `generateChartDataSeries()` and `registerStores()`
- Methods:
  - `registerStores()` - abstract, defines which stores to subscribe
  - `generateChartDataSeries()` - abstract, transforms K8s objects to graph data
  - `generatePodNode()`, `generateControllerNode()`, `generateServices()` - helpers for node generation
  - `setupMobXReactions()` - watches all stores, calls refreshChart on change

**KubeForceChart (Cluster View):**
- Purpose: Display all cluster resources as interactive graph
- Location: `components/KubeForceChart.tsx` (764 lines)
- Pattern: Extends KubeResourceChart, includes ForceGraph2D canvas
- Unique logic:
  - Pre-loads all node images in constructor via `generateImages()`
  - Applies D3-force physics via `applyGraphForces()` (line 641-664)
  - Handles canvas interactions (hover, click, pan, zoom)
  - Manages graph layout with force-directed simulation

**Detail Charts (Pod, Controller, Service, Ingress):**
- Purpose: Show specific resource and its relationships
- Location: `components/KubePodChart.tsx`, `KubeControllerChart.tsx`, etc.
- Pattern: Thin subclasses of KubeResourceChart
- Example (KubePodChart.tsx:22-32):
  ```typescript
  generateChartDataSeries = () => {
    const nodes = [...this.nodes];
    const links = [...this.links];
    this.generatePodNode();           // Add pod
    this.generateIngresses();          // Add related ingresses
    if (nodes.length != this.nodes.length) {
      this.updateState(this.nodes, this.links);
    }
  }
  ```

**Tooltip System:**
- Purpose: Resource-specific detail rendering
- Location: `components/tooltips/` directory
- Pattern: React components named `{ResourceType}Tooltip.tsx`
- Flow:
  1. Config maps resource kind to tooltip component (config.ts doesn't use this, but code path exists)
  2. KubeForceChart.tsx:530 renders tooltip to HTML: `ReactDOM.renderToStaticMarkup(<Tooltip {...kubeObject} />)`
  3. HTML stored in node.tooltipHTML, displayed by ForceGraph2D on hover

**Resource Configuration:**
- Purpose: Define visual properties per K8s resource type
- Location: `components/helpers/config.ts`
- Structure: Flat object mapping resource names to {color, icon, size}
- Example (config.ts:13-18):
  ```typescript
  deployment: {
    color: "#6771dc",
    icon: "https://raw.githubusercontent.com/kubernetes/community/master/icons/svg/resources/unlabeled/deploy.svg",
    size: 25,
  }
  ```

## Entry Points

**Main Process (`main.ts`):**
- Location: `main.ts` (root, 4 lines)
- Triggers: FreeLens loads extension
- Responsibilities:
  - Extend `Main.LensExtension` (no custom logic)
  - Webpack entry point for main process bundle (dist/main.js)

**Renderer Process (`renderer.tsx`):**
- Location: `renderer.tsx` (root, 105 lines)
- Triggers: FreeLens loads extension after main process
- Responsibilities:
  - Extend `Renderer.LensExtension`
  - Register view components via `kubeObjectDetailItems`, `clusterPages`, `clusterPageMenus`
  - Map resource kinds to chart components:
    - `Deployment` → `KubeControllerChart`
    - `Pod` → `KubePodChart`
    - `Service` → `KubeServiceChart`
    - `Ingress` → `KubeIngressChart`
  - Register cluster page: Resource Map (id: "resource-map") → `KubeResourcePage`
  - Register cluster overview item: Embeds `KubeForceChart` in workloads overview

**Component Entry Points:**
- `KubeResourcePage` (renderer.tsx:66): Wraps KubeForceChart with page layout/toolbar
- `KubeForceChart` (multiple locations): Main visualization, used in cluster page and overview

## Error Handling

**Strategy:** Try-catch blocks with console logging, no error boundaries

**Patterns:**
- Deployment store access wrapped in try-catch (KubeResourceChart.tsx:52-60)
- Node generation failures silently skip that object (no error propagation)
- K8s store getters default to empty arrays if not available

**Gaps:**
- No React error boundaries
- No user-facing error messages
- Store subscription failures not caught

## Cross-Cutting Concerns

**Logging:** Console.log/console.error only, no structured logging

**Validation:** Minimal validation - relies on FreeLens store correctness
- Pod ownership verification (KubePodChart.tsx:47-55): checks getOwnerRefs() exists
- Label matching for deployment detection (KubePodChart.tsx:53-55)

**Authentication:** Handled by FreeLens runtime, not in extension

**Performance:**
- Graph generation O(n*m) where n=pods, m=deployments for label matching
- Canvas rendering limited by D3-force simulation (60fps max)
- No virtualization for large clusters (1000+ pods may be slow)
- Node images pre-loaded once in constructor to avoid loop overhead

---

*Architecture analysis: 2026-01-20*
