# Coding Conventions

**Analysis Date:** 2026-01-20

## Naming Patterns

**Files:**
- PascalCase for component files: `KubeForceChart.tsx`, `KubeResourceChart.tsx`, `DeploymentTooltip.tsx`
- camelCase for utility files: `config.ts`, `types.ts`
- All files use `.ts` or `.tsx` extensions (TypeScript)

**Functions:**
- camelCase for function names: `loadData()`, `generatePods()`, `handleNodeHover()`, `getLinksForNode()`
- Method names in classes follow camelCase: `applyGraphForces()`, `registerStores()`, `displayChart()`
- Getters use `get` prefix or descriptive names: `getPodNode()`, `getControllerChartNode()`, `getHelmReleaseName()`

**Variables:**
- camelCase for local variables and properties: `totalItems`, `nodes`, `links`, `highlightLinks`
- `protected` and `private` class members use underscore-prefixed names where appropriate; otherwise camelCase
- Constants/configurations use camelCase: `config`, `defaultProps`
- Observable/reactive variables match standard camelCase patterns

**Types:**
- PascalCase for type/interface names: `KubeResourceChartProps`, `State`, `ChartDataSeries`, `NodeObject`, `LinkObject`
- Interface names for component props use `[ComponentName]Props` pattern: `DeploymentTooltipProps`, `KubeForceChartProps`
- Generic types use uppercase single letters: `T`, `K`, `V`

**CSS/Classes:**
- camelCase class names: `ResourceMapOverviewDetail`
- Kebab-case SCSS files: `KubeForceChart.scss`, `KubeResourcePage.scss`

## Code Style

**Formatting:**
- Prettier v3.5.3 configured for automatic formatting
- Uses lint-staged to format all files on pre-commit
- Configuration: `lint-staged` runs `prettier --write --ignore-unknown` on all files (see `package.json`)

**Indentation:**
- 2-space indentation (TypeScript + SCSS)

**Semicolons:**
- Present on all statements

**Quotes:**
- Double quotes for JSX/TSX string attributes: `kind: "Deployment"`, `Details: (props: ...) => (...)`

**Linting:**
- No ESLint configuration found (lint-staged only runs Prettier)
- TypeScript strict mode disabled (`strict: false` in `tsconfig.json`)

## Import Organization

**Order:**
1. Style imports (SCSS/CSS): `import "./KubeForceChart.scss";`
2. Library imports (external packages)
   - Framework libraries: `import React from "react"`
   - FreeLens extensions: `import { Renderer } from "@freelensapp/extensions"`
   - State management: `import { observable, reaction } from "mobx"`
   - Component libraries: `import { observer } from "mobx-react"`
3. React/component utilities: `import React, { createRef, Fragment, MutableRefObject } from "react"`
4. Visualization libraries: `import ForceGraph2D from 'react-force-graph-2d'`
5. DOM utilities: `import ReactDOM from "react-dom"`
6. Local component imports: `import { ... } from "./tooltips"`
7. Local type/config imports: `import { config } from "./helpers/config"`
8. D3 imports (data visualization): `import * as d3 from "d3-force"`

**Path Aliases:**
- Relative paths only: `"./KubeForceChart"`, `"./helpers/config"`, `"./tooltips"`
- No path aliases configured in `tsconfig.json`

## Error Handling

**Patterns:**
- Try-catch blocks for async operations in `loadData()`: Wraps `store.loadAll()` calls
  ```typescript
  try {
    const items = await store.loadAll();
    const unsuscribe = store.subscribe();
    this.watchDisposers.push(unsuscribe);
  } catch (error) {
    console.error("loading store error", error);
  }
  ```
- Console.error for logging errors: `console.error("loading data error", error)`
- Console.log for debugging: `console.log("displayChart")`, `console.log("refreshChart")`
- Errors silently caught with console output (no custom error classes or error boundaries)
- State fallback for errors: `this.noResourcesFound = totalItems === 0` after error in data loading

**No error boundaries, custom error handling, or formal error propagation strategy detected**

## Logging

**Framework:** console (browser console API)

**Patterns:**
- `console.error()` for error conditions: Used when store loading fails, general error reporting
- `console.log()` for informational messages: Lifecycle debugging (`displayChart`, `refreshChart`)
- Logged messages are descriptive: `"loading store error"`, `"loading data error"`
- Logging includes error object for debugging: `console.error("message", error)`

**No structured logging library (Winston, Pino, etc.) detected**

## Comments

**When to Comment:**
- Section separators for code organization: `// ========================= Imports & Decorators =========================`
- Inline TODO comments for known issues: `// TODO: Improve the logic` (in `KubeControllerChart.tsx:30`)
- Rare actual code comments (mostly implicit from function/variable names)

**JSDoc/TSDoc:**
- Not used in this codebase
- Types defined via TypeScript interfaces and explicit type annotations

## Function Design

**Size:** Functions range from small (5-10 lines) to large (50+ lines)
- Small: `applyGraphForces()` (~10 lines), `generatePods()` (~8 lines)
- Large: `generateChartDataSeries()` (~25 lines), `loadData()` (~20 lines)

**Parameters:**
- Props pattern for React components: `KubeResourceChartProps`, `DeploymentTooltipProps`
- Type-safe parameter objects instead of multiple args
- Default props via `static defaultProps`: `static defaultProps: KubeResourceChartProps = { id: "kube-resource-map" }`

**Return Values:**
- Implicit return (React components): JSX returns from `render()` methods
- Methods return void or typed objects
- Arrow functions used for callbacks: `generateChartDataSeries = () => { ... }`

**Async Functions:**
- Used for data loading: `async loadData()`
- Awaits promises: `const items = await store.loadAll()`
- Error handling with try-catch

## Module Design

**Exports:**
- Named exports for classes and interfaces: `export class KubeResourceChart`, `export interface ChartDataSeries`
- Barrel file pattern: `components/index.ts` re-exports: `export * from "./KubeForceChart"`
- Default exports for extension classes in entry points: `export default class KubeResourceMapRenderer`

**Barrel Files:**
- `components/index.ts`: Re-exports `KubeForceChart`, `KubeResourceChartLegend`, `KubeResourcePage`
- `components/tooltips/index.ts`: Re-exports all tooltip components
- Used to simplify imports from renderer: `import { KubeForceChart, KubeResourcePage } from "./components"`

**File Organization:**
- One component per file (except `KubeControllerChart.tsx` which extends `KubeResourceChart`)
- Shared types/config in `helpers/` directory
- Related tooltips grouped in `tooltips/` directory
- Entry points at root: `main.ts`, `renderer.tsx`

## React & Component Patterns

**Class Components:**
- All components extend `React.Component`: `class KubeResourceChart extends React.Component<Props, State>`
- Not using functional components or hooks (React 17 era)

**State Management:**
- MobX `@observable` decorators for reactive state: `@observable data: State`
- MobX `reaction()` for reactive side effects with disposal
- Local React state via `this.setState()` for UI state: `this.setState({ highlightLinks, hoverNode: node })`
- Combined approach: MobX for global observables, React state for local UI

**Props & Typing:**
- Strict prop typing via interfaces: `interface KubeResourceChartProps { id?: string; object?: KubeObject; }`
- Optional props marked with `?`: `id?: string`
- Props destructuring in methods: `const { object } = this.props`

**Component Lifecycle:**
- `componentDidMount()`: Initialize data loading, set up MobX reactions
- `componentWillUnmount()`: Cleanup MobX disposers and watchers: `this.disposers.forEach((disposer) => disposer())`
- `render()`: Return JSX (in functional/simple components)

**@observer Decorator:**
- All reactive components use `@observer` from `mobx-react`
- Enables automatic re-renders when observable state changes

## MobX Patterns

**Decorators:**
- `@observable` for reactive properties: `@observable data: State`
- `@action` for state mutations: `@action protected async loadData() { ... }`
- `@observer` on component classes for reactivity

**Reactions:**
- `reaction()` for responding to observable changes:
  ```typescript
  this.disposers.push(reaction(() => this.podsStore.items.toJSON(),
    (values, previousValue, _reaction) => { this.refreshItems(values, previousValue) },
    reactionOpts));
  ```
- Structural comparison with `comparer.structural`: `const reactionOpts = { equals: comparer.structural }`
- Disposers collected for cleanup in `componentWillUnmount()`

**Store Access:**
- Access FreeLens stores via API manager: `Renderer.K8sApi.apiManager.getStore(Renderer.K8sApi.podsApi)`
- Store types explicitly cast: `as Renderer.K8sApi.PodsStore`
- Multiple stores initialized in component properties

**Disposal Pattern:**
- All side effects tracked in `disposers` array: `this.disposers: Function[] = []`
- Cleanup on unmount: `this.disposers.forEach((disposer) => disposer())`
- Watch subscriptions tracked: `this.watchDisposers: Function[] = []`

## TypeScript Configuration

**Strictness:**
- `strict: false` - No strict mode
- `noImplicitAny: false` - Any types allowed without explicit annotation
- `skipLibCheck: true` - Don't type-check declaration files
- `experimentalDecorators: true` - Required for MobX and class decorators
- `useDefineForClassFields: true` - TypeScript class field semantics

**Target:** ESNext compilation

**Module Resolution:** Node

**JSX:** React (classic transform, not new JSX runtime)

## Data Structure Patterns

**Node Objects:**
```typescript
type NodeObject = object & {
  id?: string|number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number;
  fy?: number;
};
```

**Chart Data (extends NodeObject):**
```typescript
interface ChartDataSeries extends NodeObject {
  id?: string|number;
  object: Renderer.K8sApi.KubeObject;
  kind: string;
  name?: string;
  namespace?: string;
  image?: HTMLImageElement;
  color?: string;
  tooltipHTML?: string;
}
```

**Links:**
```typescript
type LinkObject = object & {
  source?: string|number|NodeObject;
  target?: string|number|NodeObject;
};
```

## Specific Quirks/Issues

1. **No type strictness**: Many `any` types used, no strict type checking
2. **Mixed async patterns**: Uses `async/await` but also callback subscriptions
3. **TODO comments indicate known improvements**: Logic for change detection needs improvement
4. **Disabled type checking**: `skipLibCheck: true` and `strict: false` reduce type safety
5. **Method binding**: Some methods use arrow functions to bind `this`, others use direct method declarations
6. **Protected members**: Heavy use of `protected` class members for internal state

---

*Convention analysis: 2026-01-20*
