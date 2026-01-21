# Freelens Extension Example - API Documentation

**Version:** 1.6.2
**Package:** `@freelensapp/example-extension`
**Repository:** [freelensapp/freelens-example-extension](https://github.com/freelensapp/freelens-example-extension)

---

## Table of Contents

1. [Extension Architecture](#extension-architecture)
2. [Main Process API](#main-process-api)
3. [Renderer Process API](#renderer-process-api)
4. [State Management](#state-management)
5. [Kubernetes Resources](#kubernetes-resources)
6. [React Components](#react-components)
7. [Utilities](#utilities)
8. [Type Definitions](#type-definitions)

---

## Extension Architecture

The Freelens extension system uses a dual-process architecture:

- **Main Process** (`src/main/index.ts`): Backend logic, lifecycle hooks
- **Renderer Process** (`src/renderer/index.tsx`): UI components, K8s integration

Both processes extend `LensExtension` base classes and register functionality via declarative properties.

---

## Main Process API

### `ExampleMain`

Main process entry point for the extension.

**Location:** `src/main/index.ts`

**Type Signature:**
```typescript
class ExampleMain extends Main.LensExtension {
  async onActivate(): Promise<void>
}
```

**Lifecycle Hook:**
- `onActivate()`: Called when extension is activated. Initializes the preferences store.

**Usage Example:**
```typescript
import { Main } from "@freelensapp/extensions";
import { ExamplePreferencesStore } from "../common/store";

export default class MyExtension extends Main.LensExtension {
  async onActivate() {
    await ExamplePreferencesStore.getInstanceOrCreate().loadExtension(this);
  }
}
```

---

## Renderer Process API

### `ExampleRenderer`

Renderer process entry point. Registers all UI components, pages, and menus.

**Location:** `src/renderer/index.tsx`

**Type Signature:**
```typescript
class ExampleRenderer extends Renderer.LensExtension {
  async onActivate(): Promise<void>

  // Registration Properties
  appPreferences: AppPreferenceRegistration[]
  kubeObjectDetailItems: KubeObjectDetailRegistration[]
  clusterPages: ClusterPageRegistration[]
  clusterPageMenus: ClusterPageMenuRegistration[]
  kubeObjectMenuItems: KubeObjectMenuItemRegistration[]
}
```

### Registration Interfaces

#### App Preferences

Registers extension settings in Lens preferences UI.

```typescript
interface AppPreferenceRegistration {
  title: string;
  components: {
    Input: () => JSX.Element;
    Hint: () => JSX.Element;
  };
}
```

**Example:**
```typescript
appPreferences = [
  {
    title: "Example Preferences",
    components: {
      Input: () => <ExamplePreferenceInput />,
      Hint: () => <ExamplePreferenceHint />,
    },
  },
];
```

#### KubeObject Detail Items

Registers detail panels for K8s resources.

```typescript
interface KubeObjectDetailRegistration {
  kind: string;
  apiVersions: string[];
  priority: number;
  components: {
    Details: (props: Renderer.Component.KubeObjectDetailsProps<any>) => JSX.Element;
  };
}
```

**Example:**
```typescript
kubeObjectDetailItems = [
  {
    kind: ExampleV1alpha1.kind,
    apiVersions: ExampleV1alpha1.crd.apiVersions,
    priority: 10,
    components: {
      Details: (props) => <ExampleDetailsV1alpha1 {...props} extension={this} />,
    },
  },
];
```

#### Cluster Pages

Registers top-level navigation pages.

```typescript
interface ClusterPageRegistration {
  id: string;
  components: {
    Page: () => JSX.Element;
  };
}
```

**Example:**
```typescript
clusterPages = [
  {
    id: "example",
    components: {
      Page: () => <ExamplesPageV1alpha1 extension={this} />,
    },
  },
];
```

#### Cluster Page Menus

Registers navigation menu items.

```typescript
interface ClusterPageMenuRegistration {
  id: string;
  title: string;
  target: { pageId: string };
  components: {
    Icon: (props: Renderer.Component.IconProps) => JSX.Element;
  };
}
```

**Example:**
```typescript
clusterPageMenus = [
  {
    id: "example",
    title: ExampleV1alpha1.crd.title,
    target: { pageId: "example" },
    components: {
      Icon: ExampleIcon,
    },
  },
];
```

#### KubeObject Menu Items

Registers context menu items for K8s resources.

```typescript
interface KubeObjectMenuItemRegistration {
  kind: string;
  apiVersions: string[];
  components: {
    MenuItem: (props: Renderer.Component.KubeObjectMenuProps<any>) => JSX.Element;
  };
}
```

**Example:**
```typescript
kubeObjectMenuItems = [
  {
    kind: ExampleV1alpha1.kind,
    apiVersions: ExampleV1alpha1.crd.apiVersions,
    components: {
      MenuItem: (props) => <ExampleActiveToggleMenuItem {...props} extension={this} />,
    },
  },
];
```

---

## State Management

### `ExamplePreferencesStore`

MobX-based store for extension preferences. Persists to Lens configuration.

**Location:** `src/common/store/preferences-store.ts`

**Type Signature:**
```typescript
interface ExamplePreferencesModel {
  enabled: boolean;
}

class ExamplePreferencesStore extends Common.Store.ExtensionStore<ExamplePreferencesModel> {
  @observable accessor enabled: boolean;

  constructor(config: {
    configName: string;
    defaults: ExamplePreferencesModel;
  })

  fromStore(model: ExamplePreferencesModel): void
  toJSON(): ExamplePreferencesModel
}
```

**Observable Properties:**
- `enabled`: Boolean preference flag (default: `false`)

**Methods:**
- `fromStore({ enabled })`: Hydrates store from persisted storage
- `toJSON()`: Serializes current state for persistence
- `loadExtension(extension)`: (inherited) Binds store to extension instance

**Usage Example:**
```typescript
// Get or create singleton instance
const store = ExamplePreferencesStore.getInstanceOrCreate();

// Load in extension
await store.loadExtension(this);

// Access observable value
console.log(store.enabled); // false

// Update (triggers persistence)
store.enabled = true;

// Use in React component
import { observer } from "mobx-react";

const MyComponent = observer(() => {
  const prefs = ExamplePreferencesStore.getInstanceOrCreate();
  return <Checkbox value={prefs.enabled} onChange={v => prefs.enabled = v} />;
});
```

---

## Kubernetes Resources

### Versioned CRDs

The extension demonstrates multi-version CRD support (v1alpha1 and v1alpha2).

#### Example v1alpha1

**Location:** `src/renderer/k8s/example/example-v1alpha1.ts`

```typescript
interface ExampleSpec {
  title?: string;
  active?: boolean;
  description?: string;
  examples?: NamespacedObjectReference[];
}

type ExampleStatus = {};

class Example extends Renderer.K8sApi.LensExtensionKubeObject<
  Renderer.K8sApi.KubeObjectMetadata,
  ExampleStatus,
  ExampleSpec
> {
  static readonly kind = "Example";
  static readonly namespaced = true;
  static readonly apiBase = "/apis/example.freelens.app/v1alpha1/examples";

  static readonly crd: ExampleKubeObjectCRD = {
    apiVersions: ["example.freelens.app/v1alpha1"],
    plural: "examples",
    singular: "example",
    shortNames: ["ex"],
    title: "Examples",
  };

  static getActive(object: Example): boolean
  static getTitle(object: Example): string | undefined
}

class ExampleApi extends Renderer.K8sApi.KubeApi<Example> {}
class ExampleStore extends Renderer.K8sApi.KubeObjectStore<Example, ExampleApi> {}
```

#### Example v1alpha2

**Location:** `src/renderer/k8s/example/example-v1alpha2.ts`

```typescript
interface ExampleSpec {
  title?: string;
  suspended?: boolean;  // Changed from 'active' in v1alpha1
  description?: string;
  examples?: NamespacedObjectReference[];
}

type ExampleStatus = {};

class Example extends Renderer.K8sApi.LensExtensionKubeObject<...> {
  static readonly kind = "Example";
  static readonly namespaced = true;
  static readonly apiBase = "/apis/example.freelens.app/v1alpha2/examples";

  static readonly crd: ExampleKubeObjectCRD = {
    apiVersions: ["example.freelens.app/v1alpha2"],
    plural: "examples",
    singular: "example",
    shortNames: ["ex"],
    title: "Examples",
  };

  static getSuspended(object: Example): boolean
  static getTitle(object: Example): string | undefined
}

class ExampleApi extends Renderer.K8sApi.KubeApi<Example> {}
class ExampleStore extends Renderer.K8sApi.KubeObjectStore<Example, ExampleApi> {}
```

### Working with KubeObjects

**Access Store:**
```typescript
const store = Example.getStore<Example>();
```

**Patch Resource:**
```typescript
await store.patch(
  object,
  {
    spec: {
      active: true,
    },
  },
  "merge"
);
```

**Static Helpers:**
```typescript
const isActive = Example.getActive(object);  // v1alpha1
const isSuspended = Example.getSuspended(object);  // v1alpha2
const title = Example.getTitle(object);
```

---

## React Components

### Page Components

#### `ExamplesPage`

Lists Example resources in a table.

**Locations:**
- v1alpha1: `src/renderer/pages/examples-page-v1alpha1.tsx`
- v1alpha2: `src/renderer/pages/examples-page-v1alpha2.tsx`

**Type Signature:**
```typescript
interface ExamplesPageProps {
  extension: Renderer.LensExtension;
}

const ExamplesPage: React.FC<ExamplesPageProps>
```

**Features:**
- Sortable columns (name, namespace, active/resumed, title, age)
- Search/filter functionality
- Badges for boolean status
- Namespace links
- Age display

**Usage:**
```typescript
import { observer } from "mobx-react";
import { Example, type ExampleApi } from "../k8s/example/example-v1alpha1";
import { KubeObjectListLayout } from "@freelensapp/extensions";

export const ExamplesPage = observer((props: ExamplesPageProps) => {
  const store = Example.getStore<Example>();

  return (
    <KubeObjectListLayout<Example, ExampleApi>
      tableId="examplesTable"
      store={store}
      sortingCallbacks={sortingCallbacks}
      searchFilters={[(object) => object.getSearchFields()]}
      renderHeaderTitle="Examples"
      renderTableHeader={renderTableHeader}
      renderTableContents={(object) => [
        <WithTooltip>{object.getName()}</WithTooltip>,
        <LinkToNamespace namespace={object.getNs()} />,
        <BadgeBoolean value={Example.getActive(object)} />,
        <WithTooltip>{Example.getTitle(object) ?? "N/A"}</WithTooltip>,
        <KubeObjectAge object={object} key="age" />,
      ]}
    />
  );
});
```

### Detail Components

#### `ExampleDetails`

Displays details panel for individual Example resources.

**Locations:**
- v1alpha1: `src/renderer/details/example-details-v1alpha1.tsx`
- v1alpha2: `src/renderer/details/example-details-v1alpha2.tsx`

**Type Signature:**
```typescript
interface ExampleDetailsProps extends Renderer.Component.KubeObjectDetailsProps<Example> {
  extension: Renderer.LensExtension;
}

const ExampleDetails: React.FC<ExampleDetailsProps>
```

**Features:**
- API version display
- Markdown description rendering
- Integration with preferences store

**Usage:**
```typescript
import { observer } from "mobx-react";
import { DrawerItem, MarkdownViewer, BadgeBoolean } from "@freelensapp/extensions";

export const ExampleDetails = observer((props: ExampleDetailsProps) => {
  const { object } = props;
  const preferences = ExamplePreferencesStore.getInstance<ExamplePreferencesStore>();

  return (
    <>
      <DrawerItem name="Api Version">v1alpha1</DrawerItem>
      <DrawerItem name="Description">
        <MarkdownViewer markdown={object.spec.description ?? ""} />
      </DrawerItem>
      <DrawerItem name="Example checkbox">
        <BadgeBoolean value={preferences.enabled} />
      </DrawerItem>
    </>
  );
});
```

### Menu Components

#### `ExampleActiveToggleMenuItem`

Context menu item to toggle resource state.

**Locations:**
- v1alpha1: `src/renderer/menus/example-active-toggle-menu-item-v1alpha1.tsx`
- v1alpha2: `src/renderer/menus/example-active-toggle-menu-item-v1alpha2.tsx`

**Type Signature:**
```typescript
interface ExampleActiveToggleMenuItemProps extends Renderer.Component.KubeObjectMenuProps<Example> {
  extension: Renderer.LensExtension;
}

const ExampleActiveToggleMenuItem: React.FC<ExampleActiveToggleMenuItemProps>
```

**Features:**
- Conditional UI based on current state (active/suspended)
- Patches resource on click
- Icons for visual feedback

**Usage:**
```typescript
import { MenuItem, Icon } from "@freelensapp/extensions";

export const ExampleActiveToggleMenuItem = (props: ExampleActiveToggleMenuItemProps) => {
  const { object, toolbar } = props;
  const store = Example.getStore<Example>();

  const toggle = async () => {
    await store.patch(object, {
      spec: { active: !object.spec.active }
    }, "merge");
  };

  return (
    <MenuItem onClick={toggle}>
      <Icon material="play_circle_outline" interactive={toolbar} title="Resume" />
      <span className="title">Resume</span>
    </MenuItem>
  );
};
```

### Preference Components

#### `ExamplePreferenceInput`

Checkbox input for extension preferences.

**Location:** `src/renderer/preferences/example-preference.tsx`

**Type Signature:**
```typescript
const ExamplePreferenceInput: React.FC
```

**Usage:**
```typescript
import { observer } from "mobx-react";
import { Checkbox } from "@freelensapp/extensions";

const preferences = ExamplePreferencesStore.getInstanceOrCreate<ExamplePreferencesStore>();

export const ExamplePreferenceInput = observer(() => {
  return (
    <Checkbox
      label="Example checkbox"
      value={preferences.enabled}
      onChange={(v) => {
        preferences.enabled = v;
      }}
    />
  );
});
```

#### `ExamplePreferenceHint`

Helper text for preference input.

**Location:** `src/renderer/preferences/example-preference.tsx`

**Type Signature:**
```typescript
const ExamplePreferenceHint: React.FC
```

### Utility Components

#### `ErrorPage`

Error boundary component with styling.

**Location:** `src/renderer/components/error-page.tsx`

**Type Signature:**
```typescript
interface ErrorPageProps {
  error?: unknown;
  extension: Renderer.LensExtension;
  children?: React.ReactNode;
}

function ErrorPage(props: ErrorPageProps): JSX.Element
```

#### `withErrorPage`

Higher-order component for error handling.

**Location:** `src/renderer/components/error-page.tsx`

**Type Signature:**
```typescript
function withErrorPage<P extends { extension: Renderer.LensExtension }>(
  props: P,
  wrapped: (props: P) => JSX.Element
): JSX.Element
```

**Usage:**
```typescript
export const MyComponent = (props: MyProps) =>
  withErrorPage(props, () => {
    // Component logic that might throw
    return <div>Safe content</div>);
  });
```

#### `createAvailableVersionPage`

Factory for multi-version CRD pages with automatic fallback.

**Location:** `src/renderer/components/available-version.tsx`

**Type Signature:**
```typescript
interface VersionVariant<T extends AvailableVersionPageProps> {
  kubeObjectClass: typeof Renderer.K8sApi.LensExtensionKubeObject<any, any, any>;
  PageComponent: React.ComponentType<T>;
  version: string;
}

function createAvailableVersionPage<T extends AvailableVersionPageProps>(
  resourceName: string,
  variants: VersionVariant<T>[]
): React.ComponentType<T>
```

**Behavior:**
1. Tries each version variant in order
2. Renders first available version (CRD installed in cluster)
3. Shows friendly "Not Available" message if none found

**Usage:**
```typescript
clusterPages = [
  {
    id: "example",
    components: {
      Page: createAvailableVersionPage("Examples", [
        {
          kubeObjectClass: ExampleV1alpha2,
          PageComponent: ExamplesPageV1alpha2,
          version: "v1alpha2"
        },
        {
          kubeObjectClass: ExampleV1alpha1,
          PageComponent: ExamplesPageV1alpha1,
          version: "v1alpha1"
        },
      ]),
    },
  },
];
```

#### `ExampleIcon`

Custom icon component using SVG.

**Location:** `src/renderer/icons/example.tsx`

**Type Signature:**
```typescript
function ExampleIcon(props: Renderer.Component.IconProps): JSX.Element
```

**Usage:**
```typescript
import svgIcon from "./example.svg?raw";
import { Icon } from "@freelensapp/extensions";

export function ExampleIcon(props: Renderer.Component.IconProps) {
  return <Icon {...props} svg={svgIcon} />;
}
```

---

## Utilities

### `maybe`

Safe execution wrapper. Returns `null` on error.

**Location:** `src/common/utils.ts`

**Type Signature:**
```typescript
function maybe<T>(wrapped: () => T): T | null
```

**Usage:**
```typescript
const value = maybe(() => {
  return riskyOperation();
});

if (value !== null) {
  // Success
}
```

---

## Type Definitions

### Common Types

#### `NamespacedObjectReference`

Reference to a namespaced Kubernetes object.

**Location:** `src/renderer/k8s/types.ts`

```typescript
interface NamespacedObjectReference {
  name: string;
  namespace?: string;
}
```

#### `ExampleKubeObjectCRD`

CRD configuration for Example resources.

**Location:** `src/renderer/k8s/types.ts`

```typescript
interface ExampleKubeObjectCRD extends Renderer.K8sApi.LensExtensionKubeObjectCRD {
  title: string;
}
```

**Properties:**
- `apiVersions`: Array of API version strings
- `plural`: Plural resource name
- `singular`: Singular resource name
- `shortNames`: Short names for kubectl
- `title`: Display title in UI

### Component Props

#### `AvailableVersionPageProps`

**Location:** `src/renderer/components/available-version.tsx`

```typescript
interface AvailableVersionPageProps {
  extension: Renderer.LensExtension;
}
```

#### `ErrorPageProps`

**Location:** `src/renderer/components/error-page.tsx`

```typescript
interface ErrorPageProps {
  error?: unknown;
  extension: Renderer.LensExtension;
  children?: React.ReactNode;
}
```

#### `ExamplesPageProps`

**Location:** `src/renderer/pages/examples-page-v1alpha1.tsx` (and v1alpha2)

```typescript
interface ExamplesPageProps {
  extension: Renderer.LensExtension;
}
```

#### `ExampleDetailsProps`

**Location:** `src/renderer/details/example-details-v1alpha1.tsx` (and v1alpha2)

```typescript
interface ExampleDetailsProps extends Renderer.Component.KubeObjectDetailsProps<Example> {
  extension: Renderer.LensExtension;
}
```

#### `ExampleActiveToggleMenuItemProps`

**Location:** `src/renderer/menus/example-active-toggle-menu-item-v1alpha1.tsx` (and v1alpha2)

```typescript
interface ExampleActiveToggleMenuItemProps extends Renderer.Component.KubeObjectMenuProps<Example> {
  extension: Renderer.LensExtension;
}
```

---

## Usage Patterns

### Pattern 1: Multi-Version CRD Support

Support multiple API versions with version-specific components:

```typescript
// 1. Define version-specific KubeObject classes
// src/renderer/k8s/example/example-v1alpha1.ts
export class Example extends Renderer.K8sApi.LensExtensionKubeObject<...> {
  static readonly apiBase = "/apis/example.freelens.app/v1alpha1/examples";
  static readonly crd = { apiVersions: ["example.freelens.app/v1alpha1"], ... };
}

// src/renderer/k8s/example/example-v1alpha2.ts
export class Example extends Renderer.K8sApi.LensExtensionKubeObject<...> {
  static readonly apiBase = "/apis/example.freelens.app/v1alpha2/examples";
  static readonly crd = { apiVersions: ["example.freelens.app/v1alpha2"], ... };
}

// 2. Create version-specific components
export const ExamplesPageV1alpha1 = observer((props) => { /* v1alpha1 logic */ });
export const ExamplesPageV1alpha2 = observer((props) => { /* v1alpha2 logic */ });

// 3. Register both versions
clusterPages = [
  { id: "example", components: { Page: () => <ExamplesPageV1alpha1 /> }},
  { id: "example", components: { Page: () => <ExamplesPageV1alpha2 /> }},
  { id: "example", components: { Page: createAvailableVersionPage("Examples", [
    { kubeObjectClass: ExampleV1alpha2, PageComponent: ExamplesPageV1alpha2, version: "v1alpha2" },
    { kubeObjectClass: ExampleV1alpha1, PageComponent: ExamplesPageV1alpha1, version: "v1alpha1" },
  ])}},
];
```

### Pattern 2: Observable Preferences Store

Use MobX for reactive preferences:

```typescript
// 1. Define model interface
interface MyPreferencesModel {
  enabled: boolean;
  count: number;
}

// 2. Extend ExtensionStore
class MyPreferencesStore extends Common.Store.ExtensionStore<MyPreferencesModel> {
  @observable accessor enabled = false;
  @observable accessor count = 0;

  constructor() {
    super({
      configName: "my-preferences",
      defaults: { enabled: false, count: 0 }
    });
    makeObservable(this);
  }

  fromStore({ enabled, count }: MyPreferencesModel) {
    this.enabled = enabled;
    this.count = count;
  }

  toJSON(): MyPreferencesModel {
    return { enabled: this.enabled, count: this.count };
  }
}

// 3. Load in extension
async onActivate() {
  await MyPreferencesStore.getInstanceOrCreate().loadExtension(this);
}

// 4. Use in React components
const MyComponent = observer(() => {
  const prefs = MyPreferencesStore.getInstanceOrCreate();
  return <Checkbox value={prefs.enabled} onChange={v => prefs.enabled = v} />;
});
```

### Pattern 3: Error Boundaries

Wrap all user components in error handlers:

```typescript
import { withErrorPage } from "../components/error-page";

export const MyComponent = (props: MyProps) =>
  withErrorPage(props, () => {
    // Risky operations
    const store = KubeObject.getStore<KubeObject>();

    // Render
    return (
      <KubeObjectListLayout
        store={store}
        // ...
      />
    );
  });
```

### Pattern 4: Menu Item Actions

Create context menu items that modify resources:

```typescript
export const MyMenuItem = (props: KubeObjectMenuProps<MyResource>) => {
  const { object } = props;
  const store = MyResource.getStore<MyResource>();

  const handleClick = async () => {
    await store.patch(object, {
      spec: { myField: newValue }
    }, "merge");
  };

  return (
    <MenuItem onClick={handleClick}>
      <Icon material="edit" interactive={toolbar} />
      <span className="title">Edit Resource</span>
    </MenuItem>
  );
};
```

### Pattern 5: Details Panel Integration

Add custom details to resource panels:

```typescript
export const MyDetails = observer((props: KubeObjectDetailsProps<MyResource>) => {
  const { object } = props;

  return (
    <>
      <DrawerItem name="My Field">
        {object.spec.myField ?? "N/A"}
      </DrawerItem>

      <DrawerItem name="Complex Content">
        <MarkdownViewer markdown={object.spec.description} />
      </DrawerItem>

      <DrawerItem name="Status">
        <BadgeBoolean value={object.spec.enabled} />
      </DrawerItem>
    </>
  );
});
```

---

## Build & Development

### Scripts

```bash
# Type checking
pnpm type:check

# Build
pnpm build

# Development build (preserves modules)
pnpm build:production

# Linting
pnpm lint:check
pnpm lint:fix

# Create dev package
pnpm pack:dev
```

### Entry Points

- **Main:** `main/index.ts` → compiled to `out/main/index.js`
- **Renderer:** `renderer/index.tsx` → compiled to `out/renderer/index.js`

### Dependencies

**Required Runtime:**
- Node.js >= 22.16.0
- Freelens >= 1.6.0

**Key Dev Dependencies:**
- `@freelensapp/extensions` ^1.6.1
- `mobx` 6.13.7
- `mobx-react` 7.6.0
- `react` 17.0.2
- `typescript` 5.9.3

---

## Export Summary

### Main Process
```typescript
export { default } from "./main/index";  // ExampleMain
```

### Renderer Process
```typescript
export { default } from "./renderer/index";  // ExampleRenderer
```

### Common (Shared)
```typescript
export * from "./common/store";  // ExamplePreferencesStore, ExamplePreferencesModel
export * from "./common/utils";  // maybe
```

### K8s Types
```typescript
export * from "./renderer/k8s/types";  // NamespacedObjectReference, ExampleKubeObjectCRD
export * from "./renderer/k8s/example/example-v1alpha1";  // Example (v1alpha1), ExampleApi, ExampleStore
export * from "./renderer/k8s/example/example-v1alpha2";  // Example (v1alpha2), ExampleApi, ExampleStore
```

### Components
```typescript
export * from "./renderer/components/error-page";  // ErrorPage, withErrorPage
export * from "./renderer/components/available-version";  // createAvailableVersionPage
export * from "./renderer/icons";  // ExampleIcon
```

---

## License

MIT License © 2025 Freelens Authors
