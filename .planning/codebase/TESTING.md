# Testing Patterns

**Analysis Date:** 2026-01-20

## Test Framework

**Runner:**
- Jest v29.7.0
- Electron test environment: `@jest-runner/electron`
- Config: `package.json` jest section (no separate jest.config.js)

**Configuration:**
```json
"jest": {
  "runner": "@jest-runner/electron",
  "testEnvironment": "@jest-runner/electron/environment"
}
```

**Assertion Library:**
- Not explicitly configured (Jest includes assertion library by default)
- Expected to use Jest's `expect()` for assertions

**Run Commands:**
```bash
pnpm test              # Run all tests (via Jest)
```

## Test File Organization

**Location:**
- Not detected - No test files found in codebase
- Pattern would follow: `*.test.ts` or `*.spec.ts` (standard Jest convention)
- Tests likely would be co-located with source files based on Jest defaults

**Naming:**
- Expected pattern: `ComponentName.test.tsx` for components
- No tests currently exist to demonstrate actual pattern

**Structure:**
- No test directory structure established
- Jest configuration supports Electron environment (for UI testing)

## Current Test Status

**Critical Finding:** NO TESTS EXIST

- No `*.test.ts` files found
- No `*.spec.ts` files found
- No `__tests__/` directories
- Jest is configured but has zero test coverage

**Test Suite Organization (Not Implemented):**
- Would likely use Jest's `describe()` blocks for component suites
- Would use Electron test environment for rendering/interaction tests
- No test setup files detected

## Mocking

**Framework:**
- Jest's built-in mocking capabilities available
- Not currently in use (no tests to mock)

**Expected Pattern (not observed):**
- Jest's `jest.mock()` for mocking modules
- `@jest-runner/electron` provides Electron APIs
- MobX stores would need mocking for component tests

**What Would Need Mocking:**
- `Renderer.K8sApi.apiManager` - K8s API store manager
- FreeLens extension APIs: `@freelensapp/extensions`
- `react-force-graph-2d` - Graph visualization library
- `d3-force` - Physics simulation

**What NOT to Mock:**
- React internals (Jest/Testing Library handle this)
- MobX observable decorators (use actual observables in tests)
- Local helper functions (test with real implementations)

## Fixtures and Factories

**Test Data:**
- Not implemented
- Would likely need Kubernetes object fixtures: Pod, Deployment, Service, etc.
- Need mock K8s store responses

**Location:**
- Not established
- Recommended: `__fixtures__/` or `test/fixtures/` directory
- Could use `@freelensapp/extensions` test utilities if available

## Coverage

**Requirements:**
- Not enforced (no coverage threshold configured)
- No code coverage analysis currently performed

**View Coverage:**
```bash
# Command would be (not currently functional):
pnpm test -- --coverage
```

## Test Types

**Unit Tests:**
- Scope: Individual functions, helper utilities, type definitions
- Approach: Would test data transformation logic (node/link generation)
- Examples:
  - `config.ts` type validation
  - `types.ts` TypeScript interfaces (compile-time checks)
  - Utility functions like `getLinksForNode()`, `getHelmReleaseName()`

**Integration Tests:**
- Scope: Component rendering with MobX stores
- Approach: Would test chart data flow with mocked K8s stores
- Examples:
  - `KubeForceChart` rendering with mock data
  - Reaction to store changes triggering re-renders
  - Data loading and error handling

**E2E Tests:**
- Framework: Not used
- No end-to-end test setup detected

## Testing Challenges (Not Addressed)

1. **FreeLens Extension Dependencies:**
   - Components tightly coupled to `Renderer.K8sApi` stores
   - `@freelensapp/extensions` imports not easily mockable without extension context

2. **MobX Complexity:**
   - Observable decorators need actual MobX setup
   - Reactions and disposers require careful lifecycle management in tests

3. **Canvas Rendering:**
   - `ForceGraph2D` (canvas-based) difficult to test
   - Would need DOM testing library or visual regression testing

4. **Electron Environment:**
   - Requires `@jest-runner/electron`
   - Tests must run in Electron context (not jsdom)

## Recommended Test Structure (Not Implemented)

### Example Unit Test Pattern

```typescript
// helpers/config.test.ts
import { config } from './config';

describe('config', () => {
  it('should have color for each resource type', () => {
    expect(config.deployment.color).toBeDefined();
    expect(config.pod.color).toBeDefined();
  });

  it('should have icon URLs', () => {
    expect(config.service.icon).toMatch(/^https:\/\//);
  });
});
```

### Example Component Test Pattern

```typescript
// KubeResourceChart.test.tsx
import React from 'react';
import { render } from '@testing-library/react';
import { KubeResourceChart } from './KubeResourceChart';
import { reaction } from 'mobx';

describe('KubeResourceChart', () => {
  beforeEach(() => {
    // Setup MobX stores mock
  });

  afterEach(() => {
    // Cleanup
  });

  it('should render with pod data', () => {
    const mockObject = { /* Pod mock */ };
    const { container } = render(
      <KubeResourceChart object={mockObject} />
    );
    expect(container).toBeTruthy();
  });

  it('should update on store changes', async () => {
    // Test reaction to observable changes
  });
});
```

## Missing Test Infrastructure

**To implement testing, would need:**

1. **Test utilities:**
   - Mock K8s objects and stores
   - FreeLens API mocks
   - Setup helper for component mounting

2. **Testing libraries:**
   - `@testing-library/react` for component rendering
   - `@testing-library/jest-dom` for assertions
   - `jest-mock-extended` for mock creation

3. **Test setup:**
   - `jest.setup.ts` for global test configuration
   - Mock implementations of FreeLens APIs
   - MobX test utilities

4. **Coverage tools:**
   - Configure coverage thresholds in `package.json`
   - Add coverage reporting (LCOV, HTML reports)

## Current Test Gaps

**Untested Areas:**
- `KubeForceChart.tsx` (765 lines) - Main chart rendering logic untested
- `KubeResourceChart.tsx` (675 lines) - Base chart logic and data flow untested
- All tooltip components - Rendering logic untested
- Store subscriptions - Lifecycle management untested
- Error handling in `loadData()` - Error scenarios untested
- Graph physics simulation (`applyGraphForces()`) - Layout logic untested
- Data transformation logic - Node/link generation untested

**High Risk Areas Without Tests:**
1. **Data flow reactivity** - MobX reactions could silently break
2. **Memory leaks** - Disposal cleanup may not work correctly
3. **Store subscriptions** - Watch disposers may not unsubscribe properly
4. **Component lifecycle** - componentWillUnmount cleanup untested

**Priority for Testing (Recommended):**
- CRITICAL: Data loading and error handling
- CRITICAL: MobX reaction disposal (prevents memory leaks)
- HIGH: Component rendering with mock data
- HIGH: Store subscription lifecycle
- MEDIUM: Graph layout and physics
- MEDIUM: Tooltip rendering

## Jest Configuration

**In package.json:**
```json
"jest": {
  "runner": "@jest-runner/electron",
  "testEnvironment": "@jest-runner/electron/environment"
}
```

**Implications:**
- Tests run in Electron context (not Node.js jsdom)
- Can test Electron-specific APIs
- May require special handling for browser APIs

**To Enable More Features, Add:**
```json
"jest": {
  "runner": "@jest-runner/electron",
  "testEnvironment": "@jest-runner/electron/environment",
  "testMatch": ["**/__tests__/**/*.test.ts", "**/*.test.ts"],
  "collectCoverageFrom": ["components/**/*.{ts,tsx}"],
  "coverageThreshold": {
    "global": { "statements": 70, "branches": 70 }
  }
}
```

---

*Testing analysis: 2026-01-20*

**CRITICAL:** This codebase has zero test coverage. All JavaScript is untested. Consider creating unit tests for utility functions and integration tests for components before making significant changes.
