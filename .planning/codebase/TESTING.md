# Testing Patterns

**Analysis Date:** 2026-01-20

## Test Framework

**Status:** No testing framework configured

**Current State:**
- No Jest, Vitest, or other test runners installed
- No test configuration files (`jest.config.*`, `vitest.config.*`) present
- No test files found in `src/` directory
- Zero test coverage

**Recommended Frameworks:**
- Jest (industry standard for React/TypeScript)
- Vitest (modern, Vite-integrated alternative)

## Test File Organization

**No Current Pattern** - Tests are not yet implemented in this codebase

**Recommended Pattern:**
- Co-located with source: `src/components/__tests__/ComponentName.test.tsx`
- Alternatively separate: `src/__tests__/components/ComponentName.test.tsx`
- Utility tests: `src/__tests__/utils/utils.test.ts`
- Store tests: `src/__tests__/stores/preferences-store.test.ts`

## Test Structure

**No Examples** - Framework not yet implemented

**Recommended Structure:**
```typescript
import { render, screen } from "@testing-library/react";
import { observer } from "mobx-react";
import { ExamplePreferencesStore } from "../stores/preferences-store";

describe("ExampleComponent", () => {
  beforeEach(() => {
    // Setup
  });

  afterEach(() => {
    // Cleanup
  });

  it("should render with props", () => {
    // Test body
  });
});
```

## Mocking

**No Current Mocking** - Framework not configured

**What to Mock:**
- FreeLens API (`@freelensapp/extensions`)
- MobX stores
- External service calls

**What NOT to Mock:**
- Utility functions (test real behavior)
- React component rendering
- MobX observer decorator behavior (test with real stores when possible)

## Fixtures and Factories

**No Test Data** - Fixtures not yet created

**Recommended Locations:**
- `src/__tests__/fixtures/` - Test data files
- `src/__tests__/factories/` - Factory functions for creating test objects

**Example Pattern for Kubernetes Objects:**
```typescript
// src/__tests__/factories/example-factory.ts
import { Example } from "../renderer/k8s/example/example-v1alpha1";

export function createExampleFixture(overrides?: Partial<Example>): Example {
  return {
    apiVersion: "example.freelens.app/v1alpha1",
    kind: "Example",
    metadata: {
      name: "test-example",
      namespace: "default",
    },
    spec: {
      title: "Test Example",
      active: false,
      description: "Test description",
      examples: [],
    },
    status: {},
    ...overrides,
  };
}
```

## Coverage

**Current Coverage:** Not tracked (0%)

**Recommended Target:** 80%+ for critical paths
- Priority 1: Store logic (`src/common/store/`)
- Priority 2: React components with business logic
- Priority 3: Utility functions
- Priority 4: UI-only components

**View Coverage (when configured):**
```bash
npm test -- --coverage
```

## Test Types

**Unit Tests:**
- Store logic: Test MobX store methods and state mutations
- Utility functions: Test with various inputs and error cases
- Component logic: Test with mocked props and stores

**Integration Tests:**
- Component + Store interaction: Test observer components with real MobX stores
- Error handling: Test `withErrorPage()` wrapper behavior
- Preferences persistence: Test store `fromStore()` and `toJSON()` methods

**E2E Tests:**
- Not applicable for this extension (Electron-based)
- Could test FreeLens integration if extension integration layer exists

## Common Patterns to Test

**Testing MobX Stores:**
```typescript
describe("ExamplePreferencesStore", () => {
  it("should initialize with defaults", () => {
    const store = new ExamplePreferencesStore();
    expect(store.enabled).toBe(false);
  });

  it("should update enabled state", () => {
    const store = new ExamplePreferencesStore();
    store.enabled = true;
    expect(store.enabled).toBe(true);
  });

  it("should serialize to JSON", () => {
    const store = new ExamplePreferencesStore();
    store.enabled = true;
    const json = store.toJSON();
    expect(json.enabled).toBe(true);
  });

  it("should deserialize from store", () => {
    const store = new ExamplePreferencesStore();
    store.fromStore({ enabled: true });
    expect(store.enabled).toBe(true);
  });
});
```

**Testing Observer Components:**
```typescript
describe("ExampleComponent", () => {
  it("should render with store state", () => {
    const mockExtension = { name: "example" };
    const mockProps = { extension: mockExtension };

    render(<ExampleComponent {...mockProps} />);

    // Verify store state is reflected in UI
    expect(screen.getByText(/expected content/)).toBeInTheDocument();
  });
});
```

**Testing Error Handling:**
```typescript
describe("withErrorPage", () => {
  it("should render error page on error", () => {
    const mockExtension = { name: "example" };
    const mockProps = { extension: mockExtension };

    const result = withErrorPage(mockProps, () => {
      throw new Error("Test error");
    });

    expect(result.type).toBe(ErrorPage);
  });

  it("should render wrapped component on success", () => {
    const mockExtension = { name: "example" };
    const mockProps = { extension: mockExtension };

    const result = withErrorPage(mockProps, () => <div>Success</div>);

    expect(result.type).toBe("div");
  });
});
```

**Testing Utility Functions:**
```typescript
describe("maybe", () => {
  it("should return result on success", () => {
    const result = maybe(() => 42);
    expect(result).toBe(42);
  });

  it("should return null on error", () => {
    const result = maybe(() => {
      throw new Error("Test");
    });
    expect(result).toBeNull();
  });
});
```

## Async Testing

**No Current Pattern** - Framework not yet implemented

**Recommended for MobX Stores with Async Logic:**
```typescript
describe("AsyncStore", () => {
  it("should handle async operations", async () => {
    const store = new AsyncStore();

    await act(async () => {
      await store.fetchData();
    });

    expect(store.data).toBeDefined();
  });
});
```

## Error Testing

**No Current Pattern** - Framework not yet implemented

**Recommended:**
```typescript
describe("error scenarios", () => {
  it("should handle missing props gracefully", () => {
    expect(() => {
      render(<ComponentName extension={null} />);
    }).toThrow();
  });

  it("should catch and display component errors", () => {
    const result = withErrorPage(
      { extension: { name: "test" } },
      () => {
        throw new Error("Component error");
      }
    );

    expect(result.props.error).toBeDefined();
  });
});
```

## Required Dependencies

When setting up testing, install:
```bash
npm install --save-dev jest @types/jest ts-jest
npm install --save-dev @testing-library/react @testing-library/jest-dom
npm install --save-dev jest-mock-extended
```

For MobX testing:
```bash
npm install --save-dev @testing-library/react-hooks
npm install --save-dev mobx-react-lite
```

## Configuration Recommendations

**Jest Config Template:**
```javascript
// jest.config.js
export default {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx"],
  transform: {
    "^.+\\.tsx?$": "ts-jest",
  },
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/**/index.ts",
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
```

## Priority Test Areas

**Critical (Must Test):**
1. `src/common/store/preferences-store.ts` - MobX store with persistence
2. `src/common/utils.ts` - Utility functions
3. `src/renderer/components/error-page.tsx` - Error handling wrapper

**Important (Should Test):**
1. Components with business logic (details pages, preferences)
2. Store integration with components

**Nice to Have:**
1. UI-only components (pages, menus, icons)
2. Type definitions and interfaces

---

*Testing analysis: 2026-01-20*
