# Coding Conventions

**Analysis Date:** 2026-01-20

## Naming Patterns

**Files:**
- React components: PascalCase with `.tsx` extension (e.g., `ExampleIcon.tsx`, `ExamplesPage.tsx`)
- TypeScript files: camelCase or PascalCase depending on content (e.g., `types.ts`, `Example.ts`)
- Store files: Follow feature naming convention (e.g., `preferences-store.ts`)
- Utility files: camelCase (e.g., `utils.ts`)
- Styles: kebab-case with `.module.scss` for CSS Modules (e.g., `examples-page.module.scss`)
- Configuration: kebab-case (e.g., `biome.jsonc`, `electron.vite.config.js`)

**Classes:**
- PascalCase for all classes
- API classes append `Api` suffix (e.g., `ExampleApi`)
- Store classes append `Store` suffix (e.g., `ExamplePreferencesStore`)
- Kubernetes resource classes extend `LensExtensionKubeObject` (e.g., `Example extends Renderer.K8sApi.LensExtensionKubeObject`)
- Extension classes extend appropriate extension base class (e.g., `ExampleRenderer extends Renderer.LensExtension`)

**Functions:**
- camelCase for all function names
- React components exported as `const ComponentName = observer(...)` pattern
- Higher-order functions use `with` prefix (e.g., `withErrorPage()`)
- Utility functions are lowercase (e.g., `maybe()`)
- Event handlers use `on` prefix or descriptive camelCase (e.g., `onChange()`)

**Variables:**
- camelCase for local variables and properties
- UPPERCASE for constants (e.g., `sortingCallbacks`)
- Observable properties in MobX stores use `@observable accessor` pattern (e.g., `@observable accessor enabled = false`)
- Type discriminators use descriptive names (e.g., `KubeObject`, `KubeObjectApi`)

**Types and Interfaces:**
- PascalCase for all type names and interface names
- Interfaces prefixed with `I` are NOT used; plain names without prefix
- Props interfaces append `Props` suffix (e.g., `ExampleDetailsProps`, `ErrorPageProps`, `ExamplesPageProps`)
- Model interfaces append `Model` suffix (e.g., `ExamplePreferencesModel`)
- Spec/Status patterns follow Kubernetes conventions (e.g., `ExampleSpec`, `ExampleStatus`)
- Type aliases for complex types use descriptive names (e.g., `type KubeObject = Example`)

## Code Style

**Formatting:**
- Tool: Biome (with Prettier as fallback for unsupported formats)
- Indent style: 2 spaces
- Line ending: LF (Unix style)
- Line width: 120 characters
- Semicolons: Always required
- Trailing commas: Always in multi-line structures
- Quote style: Double quotes for JavaScript, auto for attributes

**Linting:**
- Tool: Biome with custom rules (`biome.jsonc`)
- Disabled strict checks that should be enforced later:
  - `noUnusedVariables` - off (should be error)
  - `useExhaustiveDependencies` - off (should be error)
  - `noParameterAssign` - off (should be error)
  - `noExplicitAny` - off (should be error)
  - `noBannedTypes` - off (should be error)
- Enabled strict checks:
  - `useAsConstAssertion` - error
  - `noNamespace` - error
  - `noExtraNonNullAssertion` - error
  - `noMisleadingInstantiator` - error
  - `useNamespaceKeyword` - error

**Import Organization:**
- Order defined in `biome.jsonc`:
  1. Type imports (with `type` keyword)
  2. Node built-in modules (`:NODE:`)
  3. Blank line
  4. `@freelensapp/**` scoped packages
  5. Blank line
  6. Other npm packages (`:PACKAGE:`)
  7. Blank line
  8. Relative imports (`:PATH:`)

**Path Aliases:**
- No path aliases configured in this codebase (uses relative imports)
- Use ES6 module syntax with relative paths (e.g., `import { X } from "../module"`)

## Error Handling

**Pattern: Try-Catch Wrapper**
```typescript
// From src/renderer/components/error-page.tsx
export function withErrorPage<P extends { extension: Renderer.LensExtension }>(
  props: P,
  wrapped: (props: P) => JSX.Element,
) {
  try {
    return wrapped(props);
  } catch (error) {
    return <ErrorPage error={error} extension={props.extension} />;
  }
}
```

**Pattern: Safe Wrapper with Null Return**
```typescript
// From src/common/utils.ts
export function maybe<T>(wrapped: () => T): T | null {
  try {
    return wrapped();
  } catch (error) {
    return null;
  }
}
```

**Error Logging:**
- Use `Common.logger.error()` from FreeLens runtime (e.g., `Common.logger.error('[ExtensionName]: ' + error)`)
- Format: `[EXTENSION-NAME-OR-MODULE] message` for consistency with store logging

**When to use each pattern:**
- `withErrorPage()` - Wrap React component rendering to catch UI errors and display error UI
- `maybe()` - Wrap optional operations that might fail but should degrade gracefully
- Direct try-catch - Rarely used; prefer higher-order patterns

## Logging

**Framework:** `console.log()` and `Common.logger.error()`

**Patterns:**
- Development logging: Use `console.log('[MODULE-NAME]', message)` for debugging
- Store logging: Prefix with store name in brackets (e.g., `[EXAMPLE-PREFERENCES-STORE] message`)
- Error logging: Use `Common.logger.error('[ExtensionName]: message')`
- Examples in codebase:
  - `src/common/store/preferences-store.ts` uses `console.log('[EXAMPLE-PREFERENCES-STORE] constructor')`
  - `src/renderer/components/error-page.tsx` uses `Common.logger.error('[${extension.name}]: ${error}')`

## Comments

**When to Comment:**
- Constructor/initialization logic that has side effects should log via console
- Complex business logic should have JSDoc documentation
- Commented-out code should be removed rather than kept

**JSDoc/TSDoc:**
- Document function purpose, parameters, and return types
- Example from codebase:
  ```typescript
  /**
   * Wraps component in try/catch block and prints ErrorPage on error.
   *
   * ```ts
   * export const Component = (props: ComponentProps) => withErrorPage(props, () => {
   *   throw new Error("something died");
   * })
   * ```
   */
  ```

## Function Design

**Size:** Functions should be compact; complex logic broken into named helper functions

**Parameters:**
- Use destructuring for props in React components
- Accept object parameters for configuration/options
- Use TypeScript types for all parameters (no implicit `any`)

**Return Values:**
- Explicitly type return values on all functions
- React components should return `JSX.Element` or wrapped components
- Use `void` for functions with side effects only
- Use `null` for optional returns in utility functions

**Function Declaration Style:**
- Prefer arrow functions with `const` (e.g., `export const Component = () => {}`)
- Use `function` keyword for named exports only when needed for hoisting
- React components use `const FunctionName = observer((props) => {})` pattern with MobX observer

## Module Design

**Exports:**
- Use named exports for all public APIs
- Use `export default` only for extension entry points (`ExampleRenderer`, `ExampleMain`)
- Each module should have a clear single responsibility

**Barrel Files:**
- Used selectively for re-exporting related exports
- Example: `src/renderer/icons/index.ts` exports icon components
- Example: `src/renderer/tooltips/index.ts` exports tooltip components
- Example: `src/common/store/index.ts` exports store classes

**Module Organization:**
- Imports grouped by category (types, external packages, internal modules)
- React imports separated from business logic imports
- MobX/state management imports grouped together

## TypeScript Configuration

**Strict Mode:** Not enabled (`tsconfig.json` extends `@electron-toolkit/tsconfig/tsconfig.node.json`)

**Key Settings:**
- `composite: true` - Enables project references for better builds
- `jsx: "react-jsx"` - Modern JSX transform
- `esModuleInterop: true` - CommonJS/ES6 interop for Freelens
- `moduleResolution: "node10"` - Standard Node module resolution
- Experimental decorators enabled for MobX support via Babel plugin

## MobX Patterns

**Observable Properties:**
```typescript
@observable accessor enabled = false;
```

**Observer Components:**
```typescript
export const ComponentName = observer((props: Props) => {
  // component body
});
```

**Store Pattern:**
```typescript
class Store extends Common.Store.ExtensionStore<Model> {
  @observable accessor property = initialValue;

  constructor() {
    super({ configName: "unique-name", defaults: {} });
    makeObservable(this);
  }

  fromStore(data: Model): void {
    // deserialize from persistent storage
  }

  toJSON(): Model {
    // serialize to persistent storage
  }
}
```

## React Patterns

**Component Structure:**
- Functional components with hooks where needed
- MobX `observer` wrapper for reactive components
- Props interface defines shape of component props
- Error boundaries via `withErrorPage()` wrapper

**CSS Modules:**
- `.module.scss` files for component styling
- camelCase class names in styles (via `localsConvention: "camelCaseOnly"`)
- Inline styles via `?inline` import for global scope

---

*Convention analysis: 2026-01-20*
