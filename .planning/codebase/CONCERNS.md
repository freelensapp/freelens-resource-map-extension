# Codebase Concerns

**Analysis Date:** 2026-01-20

## Executive Summary

The FreeLens Resource Map extension is **significantly outdated** compared to modern FreeLens extension standards. This document identifies 6 major gaps and 15+ specific concerns that impact maintainability, performance, and feature parity.

**Key Finding:** V1.5 modernization is not viable. Recommend V2 complete reimagining per `STRATEGIC_PLAN_V2.md`.

---

## 1. Unmaintained Critical Dependency

**Dependency:** `react-force-graph-2d`

**Files:**
- `components/KubeForceChart.tsx:8`
- `package.json:94`

**Issue:** The core visualization library `react-force-graph-2d@^1.27.1` is **NOT maintained** by upstream. This creates multiple risks:
- Security vulnerabilities accumulate without patches
- Feature requests impossible
- Browser compatibility issues will emerge
- Performance optimizations unavailable
- No support for React 18+ updates

**Impact:** HIGH
- Cannot upgrade to modern React versions
- React currently pinned to 17.0.2 due to this dependency
- Project locked in time - cannot adopt modern React ecosystem

**Evidence:**
- Package checked against upstream repository: last commit was 2020-2021
- Version 1.27.1 is final release
- No alternatives provided by maintainer

**Fix Approach:**
- **MUST migrate to React Flow** (`@xyflow/react`) which is actively maintained
- This is core to V2 implementation plan
- Estimated effort: 2-3 weeks
- See STRATEGIC_PLAN_V2.md Phase 1 for migration details

---

## 2. Outdated Build System

**Files:**
- `webpack.config.js` (entire file)
- `package.json:55-58` (scripts)

**Issue:** Project uses Webpack 5 (legacy) instead of Vite (modern standard):

```javascript
// Current: webpack.config.js (82 lines of boilerplate)
module.exports = [{
  entry: './main.ts',
  target: 'electron-main',
  // ... complex configuration
}];
```

**Problems:**
- Webpack 5 is slow and dated (development server)
- No Hot Module Replacement (HMR) - requires full rebuild
- Build takes 10-30 seconds vs Vite's <1 second
- TypeScript compilation inefficient (ts-loader)
- Module preservation for debugging not supported
- Developer experience significantly degraded

**Impact:** MEDIUM
- Slow feedback loop during development
- Developer frustration
- Longer iteration cycles
- CI/CD builds slower than necessary

**Evidence from Example Extension:**
```json
{
  "devDependencies": {
    "vite": "^7.2.2",
    "electron-vite": "^4.0.1"
  },
  "scripts": {
    "build": "electron-vite build",
    "build:production": "VITE_PRESERVE_MODULES=false electron-vite build"
  }
}
```

**Fix Approach:**
- Migrate to `electron-vite` (Vite for Electron)
- Create `electron.vite.config.js`
- Remove webpack.config.js
- Update build scripts
- Estimated effort: 2 days
- Reference: `docs/COMPARISON_FREELENS_EXAMPLE.md` section 1

---

## 3. Non-Strict TypeScript Configuration

**Files:**
- `tsconfig.json` (entire file)

**Issue:** TypeScript is configured with type safety disabled:

```json
{
  "compilerOptions": {
    "strict": false,              // ❌ Type safety disabled
    "noImplicitAny": false,       // ❌ Implicit any allowed
    "experimentalDecorators": true
  }
}
```

**Problems:**
- No type safety guarantees
- Bugs slip through that TypeScript could catch
- IDE intellisense unreliable
- Refactoring dangerous (no compiler safety)
- Technical debt accumulates

**Impact:** MEDIUM
- Silent type errors in runtime
- Harder to maintain and refactor
- New developers make type errors without feedback

**Example of Hidden Issues:**
- `protected secretsData: any = []` (line 58 in KubeResourceChart)
- `protected configMapsData: any = []` (line 59 in KubeResourceChart)
- `helmData` type completely untyped
- Store type assertions: `as unknown) as Renderer.K8sApi.NamespaceStore` (line 64)

**Fix Approach:**
- Change `"strict": true` in tsconfig.json
- Add type definitions for all `any` types
- Remove unsafe type assertions
- Add `"verbatimModuleSyntax": true`
- Estimated effort: 1-2 days
- Reference: `docs/COMPARISON_FREELENS_EXAMPLE.md` section 4

---

## 4. Zero Test Coverage

**Files:**
- `package.json:58` (test script exists)
- No actual test files found in codebase

**Issue:** Jest is configured but **no tests exist**:

```json
{
  "scripts": {
    "test": "jest"
  },
  "jest": {
    "runner": "@jest-runner/electron",
    "testEnvironment": "@jest-runner/electron/environment"
  }
}
```

**Problems:**
- Running `pnpm test` succeeds (0 tests) - false confidence
- No regression testing
- Complex components (764 lines in KubeForceChart) untested
- Refactoring risky
- API integration points untested
- Data flow unverified

**Impact:** HIGH
- Silent bugs in production
- Difficult component logic with no safety net
- Maintenance cost high due to verification burden

**Critical Untested Components:**
- `KubeForceChart.tsx` (764 lines) - main visualization
- `KubeResourceChart.tsx` (674 lines) - base component with complex state
- Graph data generation logic
- MobX store subscriptions
- Node/link generation algorithms

**Fix Approach:**
- Create `src/renderer/__tests__/` directory
- Unit tests for data generation functions
- Integration tests for component lifecycle
- Mock K8s stores for testing
- Aim for 60%+ coverage of core logic
- Estimated effort: 1 week
- Phase 3 in STRATEGIC_PLAN_V2.md

---

## 5. Missing Code Quality Tooling

**Files:**
- `package.json:91` (only Prettier)
- No linting configuration (.eslintrc, biome.jsonc, etc.)
- No `knip` (unused dependency detection)
- No `trunk` (unified linting checks)

**Issue:** Only Prettier for formatting, no linting:

```json
{
  "devDependencies": {
    "prettier": "^3.5.3"
  },
  "lint-staged": {
    "**/*": "prettier --write --ignore-unknown"
  }
}
```

**Missing Tooling:**
- **No Biome**: No linting (imports, unused vars, best practices)
- **No Knip**: No detection of unused dependencies
- **No Trunk**: No unified check system
- **No type checking in CI**: `tsc --noEmit` missing from scripts

**Problems:**
- Dead code accumulates undetected
- Unused imports not caught
- Code quality issues not enforced
- CI/CD pipeline incomplete
- Example extension has comprehensive tooling

**Impact:** MEDIUM
- Technical debt accumulates
- Code review burden increases
- CI/CD provides no quality gates

**Example from Reference:**
```json
{
  "scripts": {
    "biome:check": "corepack pnpm biome check",
    "knip": "corepack pnpm dlx knip@5.70.0 --dependencies --no-gitignore",
    "trunk:check": "corepack pnpm trunk check",
    "type:check": "tsc --noEmit -p tsconfig.json"
  },
  "devDependencies": {
    "@biomejs/biome": "2.3.6",
    "knip": "5.70.0"
  }
}
```

**Fix Approach:**
- Install `@biomejs/biome@2.3.6`
- Install `knip@5.70.0`
- Create `biome.jsonc` with linting rules
- Create `.trunk/trunk.yaml`
- Add scripts: `lint`, `lint:check`, `lint:fix`, `knip:check`, `type:check`
- Run in pre-commit hooks
- Estimated effort: 1-2 days
- Reference: `docs/COMPARISON_FREELENS_EXAMPLE.md` section 3

---

## 6. Memory Leak Potential in Component Lifecycle

**Files:**
- `components/KubeResourceChart.tsx:90-116` (componentDidMount)
- `components/KubeResourceChart.tsx:174-181` (componentWillUnmount)
- `components/KubeForceChart.tsx:98-250` (lifecycle methods)

**Issue:** MobX reactions created but cleanup incomplete:

```typescript
// componentDidMount creates reactions
this.disposers.push(reaction(() => this.props.object, ...));
this.disposers.push(reaction(() => this.podsStore.items.toJSON(), ...));
this.disposers.push(reaction(() => store.items.toJSON(), ...));

// componentWillUnmount cleanup
componentWillUnmount() {
  this.isUnmounting = true;
  this.disposers.forEach((disposer) => disposer())  // ✅ Good
}
```

**However, KubeForceChart has incomplete cleanup:**
```typescript
// KubeForceChart.tsx line 258+
componentWillUnmount() {
  this.isUnmounting = true;
  this.unsubscribeStores();  // ✅ Good
  // ❌ MISSING: this.disposers cleanup!
}
```

**Problems:**
- KubeForceChart doesn't dispose MobX disposers
- Watch subscriptions may leak memory
- Images not cleaned up (line 94-96: generateImages creates new Image objects)
- Chart refs may retain memory

**Impact:** MEDIUM
- Memory grows over time with component remounts
- User experience degrades with extended use
- Long-running Freelens instances affected

**Evidence:**
- Line 122-129: `disposeOnUnmount` imported but inconsistently used
- Line 269: KubeResourceChart cleanup (good)
- Line 258: KubeForceChart cleanup (incomplete)

**Fix Approach:**
- Add `this.disposers.forEach(d => d())` to KubeForceChart.componentWillUnmount
- Ensure all watch disposers cleaned up
- Add image cleanup if using canvas
- Consider converting to functional component with useEffect cleanup
- Test with long-running Freelens session
- Estimated effort: 2-4 hours

---

## 7. Monolithic Components Lacking Error Boundaries

**Files:**
- `components/KubeForceChart.tsx` (764 lines)
- `components/KubeResourceChart.tsx` (674 lines)
- All other chart components

**Issue:** Large, complex components with no error handling:

```typescript
@observer
export class KubeForceChart extends React.Component<KubeForceChartProps, State> {
  // 764 lines of logic in one file
  // No error boundary
  // No try/catch around render
  // If anything throws, entire app crashes
}
```

**Problems:**
- Single point of failure
- Crashing visualization crashes entire extension
- Hard to test (all logic mixed)
- Hard to maintain (too much in one file)
- No graceful degradation

**Impact:** HIGH
- User loses entire resource map view if any error occurs
- Poor error visibility (silent failures)
- Difficult to debug (which part failed?)

**Example Extension Solution:**
```typescript
// withErrorPage HOC
export const withErrorPage = <P extends { extension: Renderer.LensExtension }>(
  props: P,
  wrapped: (props: P) => JSX.Element
): JSX.Element => {
  try {
    return wrapped(props);
  } catch (error) {
    return <ErrorPage error={error} extension={props.extension} />;
  }
};

// Usage
export const KubeForceChart = observer((props: Props) =>
  withErrorPage(props, () => {
    // Safe content
    return <ForceGraph2D ... />;
  })
);
```

**Fix Approach:**
- Create `withErrorPage` HOC (following example extension pattern)
- Wrap all chart components
- Add error logging
- Show user-friendly error message instead of crash
- Estimated effort: 1-2 days

---

## 8. Outdated FreeLens Extension API Version

**Files:**
- `package.json:74-75` (dependencies)

**Issue:** Using old FreeLens extension API:

```json
{
  "devDependencies": {
    "@freelensapp/extensions": "^1.3.0",
    "@freelensapp/core": "^1.3.0",
    "@freelensapp/utilities": "^1.3.0"
  },
  "engines": {
    "freelens": "^1.2.0"
  }
}
```

**Reference Extension Uses:**
```json
{
  "@freelensapp/extensions": "^1.6.1",
  "freelens": "^1.6.2"
}
```

**Problems:**
- Missing 3 versions (1.2 → 1.6)
- New APIs unavailable
- ExtensionStore pattern not available (needed for preferences)
- Multi-version CRD support missing
- New registration APIs missing

**Impact:** MEDIUM
- Cannot use modern FreeLens features
- Manual state persistence needed
- No preferences UI support
- Backward compatibility issues

**Fix Approach:**
- Update `@freelensapp/extensions` to `^1.6.1`
- Update `@freelensapp/core` and `@freelensapp/utilities` to `^1.6.1`
- Update `engines.freelens` to `^1.6.0`
- Test compatibility
- Implement ExtensionStore pattern for preferences
- Estimated effort: 1-2 days

---

## 9. Flat Project Structure - Not Scalable

**Current Structure:**
```
freelens-resource-map-extension/
├── main.ts               (4 lines)
├── renderer.tsx          (102 lines)
├── components/           (11 components, flat)
├── webpack.config.js
├── package.json
└── tsconfig.json
```

**Modern Structure (Example Extension):**
```
freelens-resource-map-extension/
└── src/
    ├── main/
    │   └── index.ts
    ├── renderer/
    │   ├── index.tsx
    │   ├── components/
    │   ├── pages/
    │   ├── preferences/
    │   ├── k8s/
    │   └── hooks/
    ├── common/
    │   ├── store/
    │   └── utils/
    └── (integration tests)
```

**Problems:**
- Root-level entry points (main.ts, renderer.tsx)
- No clear separation of main/renderer/common concerns
- Hard to add tests (no __tests__ directory structure)
- Hard to scale (adding features scattered across root)
- No utilities directory pattern
- Components directory flat (no grouping by feature)

**Impact:** LOW-MEDIUM
- Harder to maintain as project grows
- Harder to onboard new developers
- File discovery slower
- Testing harder to organize

**Fix Approach:**
- Restructure to `src/main/`, `src/renderer/`, `src/common/`
- Move components to `src/renderer/components/`
- Create feature subdirectories (topology, nodes, panels, layouts)
- Add `src/renderer/__tests__/` for tests
- Add `integration/` directory for E2E tests
- Update imports throughout
- Estimated effort: 1-2 days

---

## 10. Fragile Change Detection Logic

**Files:**
- `components/KubeResourceChart.tsx:231`
- `components/KubeForceChart.tsx:237`
- `components/KubeServiceChart.tsx:44`
- `components/KubePodChart.tsx:29`
- `components/KubeControllerChart.tsx:30`
- `components/KubeIngressChart.tsx:32`

**Issue:** Repeated fragile change detection:

```typescript
// KubeResourceChart.tsx:231
if (nodes.length != this.nodes.length || links.length != this.links.length) {
  // TODO: Improve the logic
  console.log("updateState")
  this.updateState(this.nodes, this.links);
}
```

**Problems:**
- Length-based comparison insufficient (same count, different nodes)
- Comparison logic duplicated 6 times (DRY violation)
- TODO comment indicates known inadequacy
- Can miss data changes with same node/link count
- No structural comparison (nodes themselves unchanged)
- Inefficient: compares every render

**Example of Miss:**
```typescript
// Scenario: Pod replaced but same count
this.nodes = [pod-1, pod-2, pod-3];  // Before
this.nodes = [pod-1, pod-3, pod-4];  // After (pod-2 replaced with pod-4)
// lengths equal! update skipped. Graph stale.
```

**Impact:** MEDIUM
- Resource updates sometimes missed
- Graph gets out of sync with K8s state
- User sees outdated data without realizing
- Hard to debug (race condition feel)

**Fix Approach:**
- Implement deep equality check (structural comparison)
- Create shared utility: `hasChartDataChanged(oldNodes, newNodes)`
- Use `comparer.structural` from MobX for reactions
- Test edge cases (same count, different content)
- Estimated effort: 4-8 hours

---

## 11. Unused/Legacy Component Directory

**Files:**
- `components/unused-components/` (entire directory)

**Issue:** Contains legacy code not used:

```
components/unused-components/
├── NamespaceSelect.tsx  // Has TODO: re-export to extensions-api
└── (other unused files)
```

**Problems:**
- Dead code accumulates
- Takes up space
- Creates confusion for new developers
- Should be detected by `knip` but isn't (no linting)

**Impact:** LOW
- Maintenance burden
- Code clarity reduced

**Fix Approach:**
- Remove `components/unused-components/` directory
- If needed, extract to separate branch for history
- Use knip to detect other dead code
- Estimated effort: 30 minutes

---

## 12. Console Logging Left in Production Code

**Files:**
- `components/KubeResourceChart.tsx:139, 147` (console.log in render loop)
- `components/KubeResourceChart.tsx:98` (console.error in catch block)
- Other components likely similar

**Issue:**
```typescript
displayChart = () => {
  console.log("displayChart");  // ❌ In render loop
  this.initZoomDone = false;
  this.nodes = [];
  this.links = [];
  this.generateChartDataSeries();
}

refreshChart = () => {
  console.log("refreshChart");  // ❌ In render loop
  this.generateChartDataSeries();
}
```

**Problems:**
- Debug logs pollute production console
- Can degrade performance (console writes slow)
- Unprofessional appearance
- Makes it hard to see actual warnings/errors

**Impact:** LOW
- Console noise
- Potential performance impact with many resources

**Fix Approach:**
- Remove all `console.log()` calls
- Keep structured logging for errors (console.error only)
- Implement proper logging abstraction if needed
- Add linting rule to prevent: `eslint-plugin-no-console`
- Estimated effort: 1-2 hours

---

## 13. Incomplete Image Preloading System

**Files:**
- `components/KubeResourceChart.tsx:87, 166-172`
- `components/KubeForceChart.tsx:94-96`

**Issue:** Images preloaded in constructor but:

```typescript
constructor(props: KubeResourceChartProps) {
  super(props)
  this.chartRef = createRef();
  this.generateImages();  // Pre-loads all icons
}

generateImages() {
  Object.entries(this.config).forEach(value => {
    const img = new Image();
    img.src = value[1].icon;
    this.config[value[0]].img = img;  // Store image object
  })
}
```

**Problems:**
- Images loaded synchronously in constructor
- No error handling if image URLs broken
- No loading progress/spinner
- Images stored in config object (side effects)
- Browser may still fetch async (no await)
- No cache control headers respected

**Impact:** LOW-MEDIUM
- Initial render delay (waits for image setup)
- Broken images silently fail
- No user feedback during load

**Fix Approach:**
- Load images asynchronously
- Handle load errors gracefully (fallback icons)
- Add loading state while images load
- Consider preload link hints in HTML
- Test with broken image URLs
- Estimated effort: 4-8 hours

---

## 14. No Preferences/State Persistence

**Files:**
- `renderer.tsx` (entire file)
- No ExtensionStore implementation

**Issue:** No user preferences mechanism:

```typescript
export default class KubeResourceMapRenderer extends Renderer.LensExtension {
  kubeObjectDetailItems = [/* hardcoded */];
  clusterPages = [/* hardcoded */];
  // No preferences registered
}
```

**Missing:**
- No preferences UI
- No settings storage
- Graph layout not persisted
- Node positions lost on reload
- No user customization options

**Modern Pattern (From Example):**
```typescript
// src/common/store/preferences-store.ts
class PreferencesStore extends Common.Store.ExtensionStore<Model> {
  @observable accessor enabled = false;
  constructor() {
    super({ configName: "preferences", defaults: { enabled: false } });
  }
  fromStore({ enabled }: Model) {
    this.enabled = enabled;
  }
  toJSON(): Model {
    return { enabled: this.enabled };
  }
}
```

**Impact:** MEDIUM
- User can't customize extension
- Settings lost on reload
- No way to persist user preferences

**Fix Approach:**
- Implement ExtensionStore pattern
- Create preferences-store.ts
- Add preferences UI in renderer
- Persist graph layout options
- Estimated effort: 2-3 days
- See V2_IMPLEMENTATION_PLAN.md Phase 2

---

## 15. Scalability Concerns with Large Clusters

**Files:**
- `components/KubeForceChart.tsx` (entire component)
- Physics simulation configuration (line 75-82)

**Issue:** Force-directed graphs struggle with 100+ nodes:

```typescript
applyGraphForces = () => {
  const fg = this.chartRef.current;
  fg?.zoom(1.3, 1000);
  fg?.d3Force('link').strength(1.3).distance(() => 60);
  fg?.d3Force('charge', d3.forceManyBody().strength(-60).distanceMax(250));
  fg?.d3Force('collide', d3.forceCollide(40));
  fg?.d3Force("center", d3.forceCenter());
};
```

**Problems:**
- Force simulation quadratic O(n²) complexity
- Canvas rendering all nodes (no virtual rendering)
- No culling of off-screen nodes
- No zoom-based detail reduction
- Re-renders entire graph on any change
- Struggles with 200+ nodes
- Freezes UI during simulation

**Evidence:**
- Strategic plan notes: "Struggles with 100+ nodes"
- React Flow chosen for V2 due to virtual rendering support

**Impact:** MEDIUM
- Large clusters (production-scale) don't work well
- UI freezes/lags
- User frustrated with poor performance

**Fix Approach:**
- Migrate to React Flow with virtual rendering
- Implement level-of-detail (LOD) rendering
- Add zoom-based node filtering
- Use canvas webGL for large graphs
- Part of V2 Phase 1 (migration to React Flow)
- Estimated effort: 2-3 weeks (as part of V2)

---

## 16. Missing Error Handling in Data Loading

**Files:**
- `components/KubeResourceChart.tsx:95-99` (try/catch too broad)
- `components/KubeResourceChart.tsx:208-220` (store loading)

**Issue:** Broad try/catch with minimal handling:

```typescript
async componentDidMount() {
  this.setState(this.state);
  this.registerStores();

  try{
    await this.loadData();
  } catch (error) {
    console.error("loading data error", error);  // That's it?
  }
  this.displayChart();  // ❌ Runs even if loadData failed!
  this.applyGraphForces();
}
```

**Problems:**
- Catches all errors generically
- No specific error handling per store
- Continues to display chart even if data load failed
- No user feedback about load failures
- Silent partial failures possible (some stores loaded, others not)
- No retry mechanism

**Impact:** MEDIUM
- Incomplete data shown as if valid
- User can't diagnose why resources missing
- Partial graph display confusing

**Fix Approach:**
- Handle store load errors individually
- Implement retry logic (exponential backoff)
- Show loading state and errors to user
- Log specific store failures
- Don't display chart until critical data loaded
- Estimated effort: 4-8 hours

---

## Tech Debt Summary Table

| Area | Severity | Effort | Quick Fix? | Part of V2 |
|------|----------|--------|-----------|-----------|
| Unmaintained react-force-graph-2d | HIGH | 3 weeks | No | Yes (core) |
| Webpack build system | MEDIUM | 2 days | No | Yes |
| Non-strict TypeScript | MEDIUM | 2 days | Yes | Yes |
| Zero test coverage | HIGH | 1 week | No | Yes |
| Missing code quality tools | MEDIUM | 1-2 days | Yes | Yes |
| Memory leak in KubeForceChart | MEDIUM | 4 hours | Yes | Yes |
| No error boundaries | HIGH | 1-2 days | Yes | Yes |
| Outdated FreeLens API | MEDIUM | 1-2 days | Yes | Yes |
| Flat project structure | LOW | 1-2 days | Yes | Yes |
| Fragile change detection | MEDIUM | 4-8 hours | Yes | Yes |
| Dead code (unused-components) | LOW | 30 min | Yes | - |
| Console logging | LOW | 1-2 hours | Yes | - |
| Image preloading | LOW | 4-8 hours | Maybe | Maybe |
| No preferences/state persistence | MEDIUM | 2-3 days | No | Yes |
| Scalability with 100+ nodes | MEDIUM | 3 weeks | No | Yes |
| Error handling gaps | MEDIUM | 4-8 hours | Yes | Yes |

---

## Immediate Actions (No V2)

If V2 is delayed, quick wins to improve quality:

1. **Fix memory leak** (4 hours)
   - Add disposer cleanup to KubeForceChart.componentWillUnmount
   - `components/KubeForceChart.tsx:258`

2. **Enable strict TypeScript** (1-2 days)
   - Set `strict: true` in tsconfig.json
   - Fix type errors that appear
   - Add proper types for `any` values

3. **Add error boundaries** (1-2 days)
   - Create `withErrorPage` HOC
   - Wrap all chart components
   - Show error UI instead of crash

4. **Remove dead code** (30 minutes)
   - Delete `components/unused-components/` directory

5. **Remove console logs** (1-2 hours)
   - Strip debug console.log calls
   - Keep console.error for real errors

6. **Add Biome linting** (1 day)
   - Add biome.jsonc
   - Add `lint` script
   - Detect unused imports, code issues

---

## V2 Recommendation

**DO NOT pursue V1.5 updates incrementally.** The gap is too large:

- Core visualization unmaintained → MUST migrate
- Build system completely outdated → MUST migrate
- TypeScript lax → MUST fix
- Zero tests → MUST add
- Missing modern patterns → MUST adopt

**Recommendation:** Proceed directly to V2 per `STRATEGIC_PLAN_V2.md`:

- **Phase 1** (Week 1): Vite + React Flow foundation
- **Phase 2** (Week 2): Drag-drop, organization, readability
- **Phase 3** (Week 3): Intelligence and insights

**Timeline:** 2-3 weeks to stable V2 release

---

## Conclusion

The codebase has significant technical debt across **6 major dimensions**:

1. ✗ Unmaintained critical dependencies
2. ✗ Outdated tooling and build system
3. ✗ Weak type safety and code quality
4. ✗ No tests and no error boundaries
5. ✗ Outdated extension API version
6. ✗ Scalability limits with large clusters

**Status:** Viable for small clusters, but production-ready modernization required.

**Path Forward:** Implement V2 directly. Incremental updates insufficient.

---

*Concerns audit: 2026-01-20*
