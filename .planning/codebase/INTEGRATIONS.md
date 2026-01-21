# External Integrations

**Analysis Date:** 2026-01-20

## APIs & External Services

**Kubernetes API:**
- FreeLens K8s API (via @freelensapp/extensions)
  - SDK/Client: `Renderer.K8sApi` from @freelensapp/extensions
  - Authentication: Handled by FreeLens runtime (kubeconfig-based)
  - Used for: Accessing K8s resources (Pods, Services, Deployments, etc.)

**No Third-Party APIs:**
- This extension does NOT use external cloud APIs (AWS, Azure, GCP)
- No webhook integrations detected
- No external SaaS dependencies

## Data Storage

**Databases:**
- **None**. This extension is read-only consumer of Kubernetes cluster data.
- Data source: Connected Kubernetes cluster via FreeLens
- Client: Renderer.K8sApi.apiManager (provided by FreeLens)

**File Storage:**
- **Local filesystem only** - No cloud storage
- Build outputs stored in `dist/` directory
- No persistent storage for extension state detected

**Caching:**
- MobX observable stores (in-memory, provided by FreeLens)
  - K8s object caching via FreeLens stores
  - No custom caching layer
  - No Redis/memcached integration

## Authentication & Identity

**Auth Provider:**
- **Custom (kubeconfig-based)** - Handled entirely by FreeLens runtime
- Approach: Extension receives authenticated K8s API access through FreeLens
- No separate authentication required
- No API keys, JWT tokens, or OAuth flows in extension code

**K8s Access:**
- Authenticated via FreeLens's kubeconfig management
- RBAC determined by FreeLens user's cluster permissions
- Extension inherits permissions (cannot elevate or bypass)

## Monitoring & Observability

**Error Tracking:**
- None detected. Strategic Plan V2 recommends adding error boundaries and logging.

**Logs:**
- console-based logging (console.log/warn/error)
- Electron DevTools console available during development
- No structured logging framework
- No remote logging to external services

**Performance Monitoring:**
- None. Strategic Plan V2 notes visualization performance is concern for 100+ nodes.

## CI/CD & Deployment

**Hosting:**
- npm registry (npmjs.org)
- Published as @freelensapp/freelens-resource-map-extension (public)
- GitHub releases (GitHub Actions not detected in current codebase)

**CI Pipeline:**
- None configured. Jest configured but no tests exist.
- Strategic Plan V2 recommends integration tests + GitHub Actions

**Release Management:**
- Semantic Release configured (in package.json):
  - Branches: ["master"]
  - Plugins: changelog, npm, GitHub, git
  - Auto-versioning from commit messages
  - Publishes to npmjs.org
  - Assets: *.tgz file uploaded to GitHub releases

## Environment Configuration

**Required env vars:**
- None explicitly required
- NODE_ENV used by Webpack (defaults to "production")
- VITE_PRESERVE_MODULES used in planned Vite build

**Secrets location:**
- No secrets storage in extension
- No .env files detected
- kubeconfig handled by FreeLens runtime (user responsibility)

## Webhooks & Callbacks

**Incoming:**
- None. Extension is passive consumer of K8s state.

**Outgoing:**
- None. Extension does not invoke external webhooks.

**MobX Reactions (Internal Events):**
- Extension uses MobX reactions to respond to K8s store changes:
  - File: `src/renderer/components/KubeResourceChart.tsx` (lines ~80-100)
  - Pattern: `reaction(() => store.items, () => refreshChart())`
  - Triggers on: Pod/Service/Deployment/etc. changes in cluster

## FreeLens Integration Points

**Extension Registration:**
- File: `renderer.tsx`
- Entry point: `Renderer.LensExtension` extension class
- Registrations:
  1. **Cluster Pages**: Full-tab topology view
  2. **Detail Views**: Mini-maps on resource detail panels
  3. **Workload Overview**: Embedded visualization

**K8s Store Access Pattern:**
```typescript
// src/renderer/components/KubeResourceChart.tsx (lines 52-60)
protected podsStore = Renderer.K8sApi.apiManager.getStore(Renderer.K8sApi.podsApi);
protected deploymentStore = Renderer.K8sApi.apiManager.getStore(Renderer.K8sApi.deploymentApi);
protected serviceStore = Renderer.K8sApi.apiManager.getStore(Renderer.K8sApi.serviceApi);
protected ingressStore = Renderer.K8sApi.apiManager.getStore(Renderer.K8sApi.ingressApi);
protected nodeStore = Renderer.K8sApi.apiManager.getStore(Renderer.K8sApi.nodeApi);
protected statefulSetStore = Renderer.K8sApi.apiManager.getStore(Renderer.K8sApi.statefulSetApi);
```

**Stores Used:**
- Pods, Deployments, Services, StatefulSets, Ingress, Nodes
- Each store is MobX observable
- Auto-updates when cluster resources change
- Reactions trigger chart refresh on store changes

## Planned Integrations (V2)

**From Strategic Plan V2:**

1. **ExtensionStore Pattern** (not yet implemented):
   - Location: `src/common/store/topology-preferences-store.ts`
   - Purpose: Persist user preferences (layout algorithm, display options)
   - Scope: Preferences UI integration

2. **Error Tracking** (recommended):
   - Integration point: Error boundaries in all components
   - Scope: Graceful error handling, user-friendly messages

3. **Insights Engine** (planned):
   - Not an external integration
   - Internal analysis of cluster state
   - Features: Issue detection, optimization suggestions, connection explanations

## Data Flow

```
Kubernetes Cluster
    ↓ (kubeconfig via FreeLens)
FreeLens Runtime (K8s API access)
    ↓ (Renderer.K8sApi.apiManager)
Extension K8s Stores (MobX observable)
    ↓ (reactions auto-trigger)
Extension Components
    ↓
Force-Directed Graph Visualization
    ↓
User Interface (React)
```

**One-Way Flow:**
- Extension reads K8s state
- No write-back to cluster
- No persistent storage outside cluster
- No external API calls

## Security Considerations

**No Credential Exposure:**
- kubeconfig handled entirely by FreeLens
- No credential storage in extension code
- No API keys or secrets in code

**RBAC Enforcement:**
- Extension respects Kubernetes RBAC
- Cannot access resources user doesn't have permission for
- Permissions determined by kubeconfig's current context

**Data Privacy:**
- All data remains in-memory or in user's cluster
- No external API calls to third parties
- No analytics or telemetry detected

## Network Access

**Required:**
- Local kubeconfig file access (via FreeLens)
- Kubernetes API server connectivity (via kubeconfig context)
- npm registry access (for package installation only)

**NOT Required:**
- Internet connectivity after installation
- DNS resolution to external services
- Firewall exceptions for external IPs

## Dependency Risk Assessment

| Dependency | Version | Risk | Status |
|-----------|---------|------|--------|
| react-force-graph-2d | 1.27.1 | ⚠️ High | Unmaintained since ~2023 |
| d3-force | 3.0.0 | ✅ Low | Actively maintained by D3 |
| force-graph | 1.49.5 | ✅ Low | Occasionally maintained |
| MobX | 6.10.2 | ⚠️ Medium | Behind latest (6.13.7) |
| @freelensapp/extensions | ^1.3.0 | ⚠️ Medium | Behind latest (1.6.1) |
| Webpack | 5.98.0 | ⚠️ Medium | Old build system |

**Critical Action:**
Strategic Plan V2 recommends replacing `react-force-graph-2d` with `@xyflow/react` to unblock V2 development and modernization.

---

*Integration audit: 2026-01-20*
