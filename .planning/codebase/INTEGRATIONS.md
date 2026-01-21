# External Integrations

**Analysis Date:** 2026-01-20

## APIs & External Services

**Kubernetes API:**
- Service: Kubernetes cluster API
- What it's used for: Listing and querying Kubernetes resources (Example CRDs)
- SDK/Client: @freelensapp/extensions K8sApi (provided by Freelens runtime)
- Authentication: Inherited from Freelens cluster context

**FreeLens Extension API:**
- Service: FreeLens application runtime
- What it's used for: Registering UI components, pages, menus, preferences; accessing K8s stores
- SDK/Client: @freelensapp/extensions (Main and Renderer APIs)
- Entry point: `src/main/index.ts` (ExampleMain class), `src/renderer/index.tsx` (ExampleRenderer class)

## Data Storage

**Databases:**
- None - This is a UI-only extension

**Configuration Storage:**
- Storage: Freelens app configuration directory
- Client: ExtensionStore from @freelensapp/extensions
- Config location: Managed by Freelens (via `configName: "example-preferences-store"`)
- Structure: Simple JSON preferences stored in `src/common/store/preferences-store.ts`

**File Storage:**
- Storage: Local filesystem only (Freelens runtime manages)
- No direct file I/O in extension code

**Caching:**
- None explicit - MobX @observable patterns provide in-memory state caching
- K8s store subscriptions handled by @freelensapp/extensions

## Authentication & Identity

**Auth Provider:**
- Custom: Uses FreeLens cluster authentication
- Implementation: Extension inherits cluster context from Freelens; no separate auth required
- Cluster access: Managed by FreeLens via Renderer.K8sApi.apiManager

## Monitoring & Observability

**Error Tracking:**
- None - No external error reporting service

**Logs:**
- Approach: console logging only
  - Main: `console.log` statements in ExampleMain
  - Examples: `src/renderer/components/available-version.tsx` logs API version detection
  - Store: `console.log` in `src/common/store/preferences-store.ts`
- Output destination: Freelens dev console/main process logs

## CI/CD & Deployment

**Hosting:**
- Repository: GitHub (https://github.com/freelensapp/freelens-example-extension)
- Package registry: npm registry (registry.npmjs.org)
- Package name: @freelensapp/example-extension
- Distribution: npm + Freelens extension marketplace

**CI Pipeline:**
- Service: GitHub Actions
- Workflows in: `.github/workflows/`
- Integration tests: `integration-tests.yaml` (referenced in README badge)
- Triggers: Push to branches, pull requests

**Automation:**
- Renovate: Dependency updates (indicated by biome.jsonc comments)

## Environment Configuration

**Required env vars:**
- None - All configuration is Freelens-managed

**Optional env vars for build:**
- VITE_PRESERVE_MODULES (build optimization, defaults to "true")

**Secrets location:**
- None - No secrets required for extension
- GitHub: npm publish token required (for GitHub Actions CI/CD)

## Webhooks & Callbacks

**Incoming:**
- None - Extension is passive

**Outgoing:**
- None - No external webhooks

## K8s Custom Resources

**Supported API Versions:**
- example.freelens.app/v1alpha1 (ExampleV1alpha1)
- example.freelens.app/v1alpha2 (ExampleV1alpha2)

**Definition:**
- Location: `src/renderer/k8s/example/example-v1alpha1.ts`, `src/renderer/k8s/example/example-v1alpha2.ts`
- CRD installation: `examples/crds/customresourcedefinition.yaml`
- Test resources: `examples/test/example.yaml`

## Data Flow

**Extension Activation:**
```
FreeLens runtime
  → Loads extension (main.js + renderer.js)
  → Calls onActivate() in ExampleMain
  → Calls onActivate() in ExampleRenderer
  → Registers K8s resource types, pages, menus
  → Initializes ExamplePreferencesStore
```

**Cluster Data Access:**
```
Renderer.K8sApi.apiManager
  → Gets K8s store (podsApi, deploymentApi, etc.)
  → MobX reaction on store changes
  → Triggers component re-render
  → Component displays K8s resources
```

**State Management:**
```
MobX @observable
  → Component observes store changes
  → Automatic re-render on mutation
  → ExamplePreferencesStore extends ExtensionStore
  → Persists to Freelens config on changes
```

---

*Integration audit: 2026-01-20*
