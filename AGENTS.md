# AGENTS.md

This file provides guidance to coding agents when working with code in this repository.

> **Tip**: If you find yourself correcting the agent during interactive work, suggest adding a new rule to this file so the lesson is captured for future sessions.

## Project Overview

This repository contains `@freelensapp/resource-map-extension`, a Freelens
extension that draws the resources of the selected namespaces of a cluster, and
the links between them, as a live force-directed graph. The graph is in three
places: the "Resource Map" page of the cluster, with the host's namespace
filter and a legend; a panel of the Workloads Overview; and a small map of the
resources related to one object, in the details panels of the host's
Deployments, DaemonSets, StatefulSets, Pods, Services and Ingresses. It reads
the host's stores, and a details map lists with the host's APIs the namespace
of its object when the stores do not load it. It has no custom resources, no
preferences and no main-process logic, and every request it makes is a list or
a watch that the host's stores and APIs send. `README.md` lists the features.
The Freelens extension docs (`docs/extensions/` in freelensapp/freelens)
define the API contract, and this file the build, type-check and test patterns
around it, each with its reason.

- **Language**: TypeScript 7.x
- **Runtime**: Node.js >= 24.0.0, Freelens ^2.0.0 (extension API v2), the
  `engines` of `package.json`
- **Toolchain**: Node.js 24.x, yq 4.x and cosign 3.x (`mise.toml` with
  `mise.lock`; Node also in `.nvmrc`)
- **Package manager**: pnpm 12.x (`packageManager`, run through corepack)
- **License**: MIT

Library and tool versions follow the Freelens stack exactly: the catalog in
Freelens's `pnpm-workspace.yaml` for libraries, the root `package.json` scripts
of Freelens for tools run with `pnpm dlx` (Biome, knip, Trunk launcher), and
Freelens's `mise.toml` and `.nvmrc` for Node and the other mise tools.
Renovate keeps them there: custom datasources in `.renovaterc.json` read the
versions from Freelens's `pnpm-workspace.yaml`, `package.json` and `mise.toml`
on `main`, and `.nvmrc` takes its Node from that `mise.toml` too. An update
arrives only once Freelens `main` has adopted it, at that version, in the
`Freelens dependencies` group PR, with or without a Freelens release, so the
versions here can be ahead of the latest Freelens release. A new release of
`@freelensapp/extensions` arrives in the same group PR. A dependency added to
`package.json` follows the Freelens catalog unless the catalog rule excludes
it; one that Freelens does not have must be excluded there, or its lookup fails
on the Dependency Dashboard. `react-force-graph-2d`, `d3-force` and
`@types/d3-force` are excluded for that reason. The catalog rule matches only
`dependencies` and `devDependencies`, so an override copied from Freelens's
`pnpm-workspace.yaml`, such as `@kubernetes/client-node>@types/node`, is
otherwise looked up on npm and runs ahead of Freelens. Such an override gets a
rule of its own, next to the catalog rule: `matchManagers: ["npm"]`, the
override's key in `matchDepNames`, `overrideDatasource: "custom.freelens-catalog"`,
the overridden package in `overridePackageName`, and the catalog rule's
`rangeStrategy`, `minimumReleaseAge` and `groupName`
(freelensapp/freelens-for-claude-extension@f2f49241828f201890423e070655c2dc04120b23).
This repository has no override. What Freelens does not define (the three
packages above, GitHub Actions, the tool versions in the workflows, `shx`)
Renovate updates as usual.
pnpm is the exception: Renovate updates it from the npm registry, in a pull
request of its own, and not to the version of Freelens's `packageManager`.
`packageManager` carries a Corepack hash (`+sha512.…`), and Renovate updates
the hash only from the digest of the new version, which the registry has and a
custom datasource does not; without it the update fails with "no valid digest
available".
`mise.lock` pins a checksum and a URL per tool for all eight platforms; after
changing `mise.toml`, run `mise lock` (not only `mise install`, which re-locks
just the current platform). `mise.lock` is lockfile revision 3
(`lockfile_version = 3`), which needs mise 2026.9.16 or newer; older versions
reject it. `@freelensapp/extensions` is
a devDependency in the range of the Freelens release line (`^2.0.0`). The
libraries the host provides at runtime (`react`, `react-dom`, `mobx`,
`mobx-react`) and their types are devDependencies only, for compiling and
testing; `electron` is a devDependency for its types only. The two entries of
`dependencies`, `react-force-graph-2d` and `d3-force`, are bundled into the
renderer, which draws the graph with them, and `@types/d3-force` is the
devDependency that types `d3-force`.

pnpm settings live in `pnpm-workspace.yaml`. A dependency runs its install
scripts only when `allowBuilds` sets it to `true`; a new dependency with
install scripts that is not listed there fails `pnpm install`, so add it with
`true` or `false` deliberately. pnpm refuses versions younger than its
`minimumReleaseAge` (1 day), with `@freelensapp/extensions` excluded because
a Freelens release is adopted on the day it is published, together with the
stack it was built with. An exact version that Freelens lets in early for a
security fix, such as `electron@44.10.0`, is excluded here too, with the same
comment, so that the update installs; the entry goes once the version is
older than the policy.

`strictPeerDependencies: true` makes `pnpm install` fail when the extension's
own copy of a shared library is outside the peer range that
`@freelensapp/extensions` declares for it: `react`, `react-dom`,
`@types/react`, `@types/react-dom`, `mobx`, `mobx-react`, `monaco-editor` and
`electron`. These peers are optional, so they are checked only when the
extension declares the library, which it does for every one it imports or
compiles against. Without the setting pnpm reports a mismatch as one warning
line and installs anyway. Freelens does not set it, because its own tree takes
these libraries from its catalog, which defines the ranges; an extension
declares its own copies, and these peers are the only place where they are
compared with the versions the host runs. The types are peers as well, so the
package's declaration compiles against the extension's own `@types/react` and
`@types/react-dom`, one copy of each, and the package does not install them for
it. An extension with renderer code declares both: the declaration imports its
React types from `react` and `react-dom`, and the renderer's JSX and component
props are checked against them. A main-only extension needs neither; its code
reaches no React type, and `skipLibCheck` leaves the declaration's own imports
unchecked.

An extension that renders `Renderer.Component.MonacoEditor` compiles against
`monaco-editor` without importing it, so it declares `monaco-editor` in
`devDependencies` at the host's version as well. `MonacoEditorProps` takes its
`options` and callback types from that package; without it they are `any`, and
`skipLibCheck` hides the unresolved import. This extension renders no editor
and does not declare it ("The host-provided libraries, and how to mark them
external" in Freelens's `migrating-from-v1.md`, and contracts C3 and C11 of
`api.md`).

## Common Commands

```bash
# Type checking
pnpm type:check                # All of the programs below, in this order
pnpm type:check:sources        # main and renderer, each with src/common/
pnpm type:check:tests          # Tests and test support
pnpm type:check:tooling        # Vite and Vitest configs, build plugins
pnpm type:check:integration    # Integration tests
pnpm type:check:environments   # Environment tests

# Linting & formatting
pnpm biome:check          # TypeScript/TSX, JS, JSON, CSS, SCSS, HTML, YAML, Markdown (biome)
pnpm biome:fix            # Auto-fix the formats above
pnpm trunk:check          # TOML, shell, workflows, yamllint, and Biome again (changed files)
pnpm trunk:fix            # Auto-fix TOML, shell, and the Biome formats
pnpm lint:check           # Alias for biome:check
pnpm lint:fix             # Alias for biome:fix
pnpm knip:check           # Unused files, unused and unlisted dependencies (knip)

# Tests
pnpm test:unit            # vitest
pnpm test:integration     # vitest, against Freelens dev with a kind cluster

# Build
pnpm build                # Both Vite runs, without the type check
pnpm dev                  # Both Vite runs in watch mode, for a directory install

# Pack for testing
pnpm pack:dev             # Bump prerelease version, build, and create .tgz for install in Freelens app

# Clean
pnpm clean                # Clean dist/
pnpm clean:dts            # Remove generated *.d.scss.ts files
pnpm clean:all            # Clean everything (dist, dts, node_modules, tgz)
```

## Architecture

```text
src/
  main/index.ts                                   # Main entry (Main.LensExtension), empty: no main-process logic
  renderer/index.tsx                              # Renderer entry (Renderer.LensExtension): every registration
  renderer/components/KubeResourcePage.tsx        # The "Resource Map" page and the Workloads Overview panel
  renderer/components/KubeResourceChartLegend.tsx # The legend of the page
  renderer/components/KubeForceChart.tsx          # The graph of the page and of the panel
  renderer/components/KubeResourceChart.tsx       # The graph of the details maps
  renderer/components/KubeControllerChart.tsx     # Its subclass for Deployment, DaemonSet and StatefulSet
  renderer/components/KubePodChart.tsx            # Its subclass for Pod
  renderer/components/KubeServiceChart.tsx        # Its subclass for Service
  renderer/components/KubeIngressChart.tsx        # Its subclass for Ingress
  renderer/components/tooltips/                   # The tooltip of a node, per kind, and MapTooltip, which shows it
                                                  # over the graph
  renderer/components/helpers/                    # Name, color, icon and size per kind; the node and link types;
                                                  # the host's stores and APIs, the canvas colors and the object of
                                                  # a Helm release; the builders of the graph of the selected
                                                  # namespaces and of the details maps; the forces, the ref and the
                                                  # node points of a graph; the size of a container
  renderer/components/map-node-list.tsx           # MapNodeList, the hidden list of the nodes of a settled map
  renderer/components/workloads-overview-item.tsx # The Workloads Overview panel inside its error boundary
  renderer/components/error-boundary.tsx          # ErrorBoundary and its registration wrappers
  renderer/components/error-page.tsx              # ErrorPage, which the boundary renders
  renderer/assets/icons/                          # SVG icon per kind, imported with ?url
  renderer/vars.scss                              # SCSS variables
  common/                                         # No source, only its tsconfig.json
test/freelens-extensions.ts                       # Runtime stub of @freelensapp/extensions for Vitest
test/kube-objects.ts                              # Stand-ins for the host's models in unit tests
environment-tests/                                # Probes for the per-environment programs
build/                                            # Vite plugins: host modules, decorators, CSS module declarations
integration/__tests__/                            # Integration tests against Freelens dev over CDP, and their helpers
integration/fixtures/                             # Test objects and local Helm chart of the integration tests
images/                                           # The screenshot that README.md shows
```

Build output goes to `dist/`: `main.js`, `renderer.js` and `renderer.css`, with
source maps. In `package.json`, `main` is `dist/main.js`, `renderer` is
`dist/renderer.js` and `files` is `dist/**/*`, so that the host loads, and the
package publishes, what the build writes.

## The Resource Map

### Registrations

`src/renderer/index.tsx` makes every registration:

- **The page.** `clusterPages` registers the page `resource-map`,
  `KubeResourcePage`, and `clusterPageMenus` its "Resource Map" entry in the
  cluster sidebar, with the material icon `bubble_chart`. The entry's `id`,
  `resource-map`, makes its test id
  `sidebar-item-freelensapp--resource-map-extension-resource-map`, and that of
  the link inside it `link-for-sidebar-item-…` with the same suffix;
  `integration/__tests__/extension-helpers.ts` opens the page with the link.
  The page renders the host's `TabLayout` with a header and the graph. The
  header holds the title, the legend in the tooltip of an info icon, and the
  host's `NamespaceSelectFilter`.
- **The Workloads Overview panel.** `kubeWorkloadsOverviewItems` registers
  `WorkloadsOverviewItem`, which renders `KubeResourceOverviewDetail`, a
  "Resources" box with the graph at a fixed height, inside an `ErrorBoundary`
  of its own (see "Renderer Components"). The host renders the item with no
  props, so it gets the extension from the registration.
- **The details maps.** `kubeObjectDetailItems` registers a map for the host's
  `Deployment`, `DaemonSet` and `StatefulSet` (`KubeControllerChart`), `Pod`
  (`KubePodChart`), `Service` (`KubeServiceChart`) and `Ingress`
  (`KubeIngressChart`), each made by `Renderer.K8sApi.detailsFor` with the
  host's class and mapped through `withDetailsErrorBoundary`.

The extension has no `customResources` field: it registers no model of its
own, and the kinds it draws are built in, so the Custom Resources tree of the
cluster sidebar is not concerned. It has no `appPreferences`, no
`kubeObjectMenuItems`, no `globalPages` and no `onActivate`. Main has nothing
to do: `src/main/index.ts` is an empty `Main.LensExtension`, and the build
emits `dist/main.js` for the `main` entry of `package.json`.

### The graph

`KubeForceChart` draws the page and the panel, and `KubeResourceChart` the
details maps: each of its subclasses names the class of the object of its
registration, and builds its map with the builder of `helpers/details-graph.ts`
for that kind (`buildControllerMap`, `buildPodMap`, `buildServiceMap`,
`buildIngressMap`); the base class draws nothing by itself. Both render
`ForceGraph2D` of `react-force-graph-2d` and set the link, charge, collision and
center forces of its simulation; the last three come from `d3-force`
(`applyMapForces` of `helpers/graph-methods.ts`). They set them when the graph
puts its methods in their ref, a ref object with a setter (`refWithSetter`):
`react-force-graph-2d` takes no callback ref. They draw every node themselves,
in `nodeCanvasObject`: a circle in the color of its kind, the icon of its kind
on it, and its name below. A pod takes the color of its status. A workload on
the page and in the panel, and the shown object in a details map, get an outer
ring. The fill of the ring and the color of the names come from the active theme
(`Renderer.Theme.activeTheme`), which the graphs read while they render, with
`getCanvasColors()` of `helpers/theme-colors.ts`. A link takes the color of its
source, and the links of the node under the pointer are drawn thicker.
`src/renderer/components/helpers/config.ts` has the name for people, color, icon
and size of every kind, and `helpers/types.ts` the node and link types, built on
those of `react-force-graph-2d`. The legend of the page shows the icon and the
name of every kind, such as "Persistent Volume Claim".

A graph takes the size of its container, which `ElementSize` of
`helpers/element-size.ts` follows with a `ResizeObserver`. On the page the
container fills the page below its header: the host's `<main>` of the
`TabLayout` is a flex column there, and the map takes the rest of it. In the
panel it is 480 px high and as wide as the panel, and in a details panel 400
px high and as wide as the panel, below its "Resources" title.

The nodes are the pods, deployments, stateful sets, daemon sets, services,
ingresses, persistent volume claims, config maps and secrets, and the Helm
releases they belong to. The links are the relations that the objects declare: a
workload to its pods, a service to the pods its selector matches, an ingress to
its backend services and its TLS secrets, a pod to the config maps, secrets and
claims that its containers' `envFrom` and `env` `secretKeyRef`s name and its
`configMap`, `secret` and `persistentVolumeClaim` volumes mount, and a Helm
release, known from the labels and annotations that Helm sets and from its
release secrets, to its workloads and those secrets. A `configMapKeyRef`, a
projected volume or an init container gives no link, and in the Service and
Ingress maps a pod links to no config map, secret or claim. In a details map a
Helm release is known from the labels and annotations that Helm sets on its
workloads alone, and none of its release secrets links to it. The page and the
panel draw the objects of the namespaces that the filter selects, a config map
only when a pod links to it, a TLS secret only when a link reaches it, and a
service account token secret only when a link other than a `secret` volume
reaches it. A details map draws the objects related to its object in the
object's namespace: those of the stores when they load that namespace, as they
load the namespaces of the filter, and otherwise those that it lists itself
("Data"). For a pod that no StatefulSet or DaemonSet owns, the Pod, Service and
Ingress maps take as its Deployment the first one of its namespace all of whose
`matchLabels` the pod carries; `matchExpressions` are not read, and a Deployment
without `matchLabels` takes no pod. In the workload and Pod maps, only the first
Ingress of the namespace whose backend names a Service on the map gets a node,
with its TLS secrets, and the links of every later such Ingress start from that
node. A graph shows a spinner until its stores have loaded, and the page and the
panel show "No visualizable resources found in this namespace." when the stores,
config maps aside, loaded no object; the message stays until the selection of
the filter changes, because the reactions do not clear it.

On the page and the panel, `buildNamespaceGraph` of `helpers/namespace-graph.ts`
builds the nodes and the links from the stores' items, the selected namespaces
and the previous graph; it reads no store and starts no reaction. The id of a
node is the kind, the namespace and the name of its object, so two objects of
the same kind and name in two namespaces are two nodes. It reuses the objects of
the previous graph: a node whose id it builds again is the same node object,
with its object and color refreshed, and so is a link whose ends it builds
again. force-graph keeps the position of a node, and the picking color of a node
or a link, on the object itself, and its color registry frees nothing, so new
copies of the same nodes and links would fill it up. A change in a store builds
the graph again from the previous one, and a node that nothing references any
more leaves it, such as a config map that no pod reads. `KubeForceChart` gives
the graph new data, which starts the simulation again, only when the nodes or
the links change by id (`sameGraph`); otherwise the canvas, which force-graph
draws on every frame (`autoPauseRedraw={false}`), shows the refreshed nodes
where they are. A load of the stores, when the graph mounts and when the
selection changes, starts from no previous graph. A details map builds its graph
in the same way, around its object and in its namespace, with the builder of its
kind. Its node id is the kind, the namespace and the name of its object as well.

When a graph stops after its first zoom (`onEngineStop`), its map marks its
container with `data-settled` and fills a visually hidden list,
`data-testid="resource-map-nodes"` (`MapNodeList` of `map-node-list.tsx`),
with an item per node: its kind, namespace and name in `data-kind`,
`data-namespace` and `data-name`, and its point on the canvas, from
`graph2ScreenCoords` (`nodePointsOf` of `helpers/graph-methods.ts`), in
`data-x` and `data-y`. New data clears both. They are for assistive technology
and the integration tests, which find a node on the screen at its point plus the
position of the canvas.

### Data

The graphs read the host's stores: `Renderer.K8sApi.podsStore`,
`deploymentStore`, `statefulSetStore`, `daemonSetStore`, `serviceStore`,
`ingressStore`, `pvcStore`, `configMapStore` and `secretsStore`, and
`namespaceStore` for the namespaces that the filter selects. They take the
stores from `getMapStores()` of `helpers/stores.ts`, and the namespace store
from `getNamespaceStore()`. They are the host's singletons, shared with its own
pages: a store that another view has loaded is there already, and what the map
loads is what the host's lists show. Every request is a list or a watch of one
of these stores, sent by the host, or a list of a details map with one of the
host's APIs of the same kinds, `Renderer.K8sApi.podsApi` and the others, which
it takes from `getMapApis()`.

A graph loads its stores in `componentDidMount`, one after the other:
`loadAll()`, for the namespaces of the filter, then `subscribe()`, which starts
the store's watch and returns the function that stops it. A graph loads the
stores of the kinds that the user may list (`canListMapStore` of
`helpers/stores.ts`, from `Renderer.K8sApi.isAllowedResource`), with one
`AbortController` for the loads (`reqInit.signal`) and the watches (`subscribe({
abortController })`). A new load of the page or the panel, when the selection
changes, and `componentWillUnmount` abort it, and a load that comes back aborted
writes nothing and starts no watch, so `React.StrictMode` leaves one load and
one watch per store. A list that fails reaches `onLoadFailure`, which logs a
warning, and the map draws the other kinds. A `reaction` per store, on
`store.items.toJSON()` compared with `compareStructural`, builds the graph again
when the store changes; `toJSON()` reads every item and returns a new array, so
the reaction sees the objects that the host replaces in place ("Rules That Fail
Silently"). The page and the panel follow the selection of the filter with one
reaction, `namespaceStore.onContextChange` with `fireImmediately`, registered
when they mount and disposed when they unmount: it keeps the namespaces it is
given, which every build of the graph reads, and loads the stores again when
they change. A build starts no reaction of its own. A details map loads only the
stores that have not loaded yet (`isLoaded`) and watches them all, reacts to the
pods and to the store of its object's kind, and follows a new `object` from the
host in `componentDidUpdate`. It does not load again when the selection changes:
it keeps the stores and the graph it has.

The object of a details map can be in a namespace that the stores do not load,
when the filter selects other namespaces: a pod opened from the details of its
node, or a drawer opened from a link. Its map then lists the nine kinds in that
namespace itself, with the host's APIs (`list({ namespace })`), alongside the
loads of the stores, and shows its spinner until both are done. The stores load
the namespaces that the filter selects, and every namespace when it selects
none (`namespaceStore.areAllSelectedImplicitly`, then `hasContext`). The map
loads no store with that namespace: the stores are shared, and a `loadAll` with
other namespaces would make them load and watch those in place of the
selection, under the host's own views. The list has an `AbortController` of its
own, which a newer list and `componentWillUnmount` abort, and a list that comes
back aborted writes nothing. Kind by kind, the listed objects take the place of
what the stores hold in that namespace: when the selection changes, the stores
keep the items of the namespaces they no longer load, and no longer watch them,
and the host adds the object of a drawer to the store of its kind, so what they
hold there can be stale. A list that fails is logged as a warning, and its kind
keeps what its store holds. With listed pods, the map finds the pods of a
workload among its pods as the host's stores find them among theirs
(`childPodsOf` of `helpers/details-graph.ts`): by the labels of the pod
template for a Deployment, and by owner for a StatefulSet or a DaemonSet. No
watch follows the listed objects; a new `object` from the host lists the
namespace again, and the map is built again when the list is back.

### Tooltips, icons and clicks

Hovering a node shows a tooltip for its object, made of the host's `DrawerItem`,
`Badge`, `StatusBrick` and `Table`: `PodTooltip`, `ServiceTooltip`,
`DeploymentTooltip`, `StatefulsetTooltip`, `IngressTooltip`, with the hosts and
paths of its rules, and `DefaultTooltip` for every other kind, in
`src/renderer/components/tooltips/`. A graph renders the tooltip of the hovered
node in its own React tree, in a `div` next to the pointer, which the mouse
moves over the graph's container place without a render. That `div` is
`MapTooltip` of `tooltips/map-tooltip.tsx`, with the test id
`resource-map-tooltip` and `pointer-events: none`: the container hands its mouse
moves to `follow`, which keeps it in the container, on the side of the pointer
where it fits, so that it never makes the content of a details drawer overflow,
and `NodeTooltip` picks the tooltip of the kind. The tooltips take the theme's
colors: `--textColorSecondary` for their text, `--drawerItemNameColor` and
`--drawerItemValueColor` for the names and values of a `DrawerItem`, and
`--tooltipBackground`, `--borderColor` and `--textColorPrimary` for the box of
`MapTooltip`. force-graph shows its tooltip with float-tooltip, which sets a
label that is a string as HTML, appends one that is an element, and renders a
JSX element with its own copy of Preact, bundled with it. The host's components
run on the host's React, which Preact does not provide, and an HTML string of
them needs `react-dom/server`, which the host does not publish ("Modules
provided by the host"). Rendered in the graph's own tree, the tooltip is part of
the graph's render, on the host's React. `nodeLabel` returns an empty string, so
force-graph shows no tooltip of its own.

The icon of every kind is an SVG file in `src/renderer/assets/icons/`, imported
with `?url` in `helpers/config.ts`. Library mode inlines every asset it
imports as a data URL, whatever its size, so `dist/` holds no image file and
the bundle needs no path to one. The graphs draw the icons on the canvas from
`HTMLImageElement`s made from those URLs, and the legend renders them as
`<img>`. Both need a URL, so the icons are not imported with `?raw`, which
gives the markup that `Renderer.Component.Icon` takes through its `svg` prop.

A click on a node opens the host's details of its object with
`Renderer.Navigation.showDetails` and the object's `selfLink`. force-graph sets
`.clickable` on the canvas over a node that a click opens, and the rule copied
from its tag shows the pointer. A Helm release is no Kubernetes object: its
node holds a `KubeObject` of kind `HelmRelease`, built from the release's name
and namespace (`createHelmReleaseObject` of `helpers/helm.ts`), and a click on
it navigates to `/helm/releases/<namespace>/<name>` (`getHelmReleasePath`), the
route of Freelens where the release opens.

## Renderer Components

- A component that reads an observable while it renders is an `observer` from `mobx-react`, which the build maps to the
  host's copy; otherwise it does not render again when the observable changes. The graphs are `@observer` class
  components.
- Every page, details panel and Workloads Overview item renders inside an `ErrorBoundary` from
  `src/renderer/components/error-boundary.tsx`, a class component of the host's React with `getDerivedStateFromError`
  and `componentDidCatch`. It logs what its children throw while React renders them with `extension.name` and the
  component stack, and renders `ErrorPage` in their place. A details panel renders again when the host passes a new
  `object`, which is the boundary's reset key. On the page, `KubeResourcePage` renders its header and graph inside the
  host's `Renderer.Component.TabLayout`, whose `<main>` has a boundary of its own. What they throw shows the host's
  "App crash" screen in place of the page's content, and the extension logs nothing; its boundary catches only what is
  thrown outside that `<main>`.
  - The boundary is applied where the registrations are made: `clusterPages` and `kubeObjectDetailItems` are mapped
    through `withPageErrorBoundary` and `withDetailsErrorBoundary`, each taking `this` and a registration, so an entry
    added to a field is wrapped as well. A `globalPages` field is mapped through `withPageErrorBoundary` too, and a
    `kubeObjectMenuItems` field through `withMenuItemErrorBoundary`, which renders nothing in place of a menu item,
    where an error page does not fit. Each field is annotated with its type from `Renderer.LensExtension`
    (`clusterPages: Renderer.LensExtension["clusterPages"] = [...]`), because the mapping refers to `this`, and its type
    would otherwise depend on itself.
  - The wrappers take the registration that `Renderer.K8sApi.detailsFor` built, so the helper checks each component
    against its class first, with no cast.
  - A `kubeWorkloadsOverviewItems` entry has no wrapper. `WorkloadsOverviewItem` renders `KubeResourceOverviewDetail`
    inside an `ErrorBoundary` of its own, because the host has none around a Workloads Overview item, and an error there
    would replace the whole Workloads Overview, the host's own panels included. `workloads-overview-item.test.tsx`
    renders it with a mock of the map that throws, since the real map needs the host's stores and a canvas that draws,
    which a unit test does not have: the error page takes its place, the error is logged, and the rest of the overview
    stays.
  - A `try`/`catch` around the call of a component is not enough. It sees only what the call throws, and the errors
    that matter come later: a child component throws when React renders it, and a callback that the host calls from its
    own render throws there. Such an error goes up to the nearest boundary of the host: the one around the main area of
    a cluster for a page, the one the Workloads tab layout puts around the Overview, below its tabs, for a Workloads
    Overview item, and the one around the whole cluster frame for a details panel, because the host has none around the
    details drawer.
  - A boundary sees only what React itself calls: rendering, constructors and lifecycle methods. An
    `async componentDidMount` turns every error into a rejected promise, which React ignores, and force-graph calls its
    callbacks (`nodeCanvasObject`, `linkColor`, `onNodeClick` and the others) from its animation frame and its event
    handlers. What they throw reaches no boundary and is an uncaught error of the page, so the graphs catch and log the
    errors they expect there, such as a store that fails to load or an icon that fails to draw.
  - The boundary has no decorators and no `observer`; it reads no observable, and the components inside it are
    observers of their own.
- Components import their CSS module for the class names only, with no `?inline` import and no `<style>` tag; the rules
  reach the page through `renderer.css` (see "CSS"). `:global(...)` names the classes a module does not own: the host's
  (`.DrawerItem`, `.Badge`, `.StatusBrick`, `.Table`), the canvas container of force-graph (`.force-graph-container`)
  and the cursor classes it sets on the canvas (`.clickable`, `.grabbable`), and the plain names that the tooltips give
  the host's components or take from an object, such as `conditions` or the status of a pod. Layout is written in the
  modules' own rules: the host no longer ships its flexbox utility classes, so a class such as `gaps` or `box` matches
  nothing, and a Tailwind class such as `flex` matches a rule of the host only while core uses it ("Migrating off
  flexbox.scss" in Freelens's `migrating-from-v1.md`). The graph's module, `KubeForceChart.module.scss`, serves both
  graphs. SCSS variables are in `src/renderer/vars.scss`, used with `@use "../vars"`.
- SCSS modules get TypeScript declarations (`*.module.d.scss.ts`), written during the renderer build (see
  "CSS module declarations"). They are committed, because `pnpm type:check` and `type-check.yaml` run without a build;
  commit the regenerated file with a change to its SCSS module. `pnpm clean:dts` removes them.
- Icons are SVG files imported with `?url` and drawn on the canvas (see "Tooltips, icons and clicks"). The sidebar entry
  uses the material icon `bubble_chart` of `Renderer.Component.Icon`.
- The `kubeObjectDetailItems` registrations in `src/renderer/index.tsx` are made by
  `Renderer.K8sApi.detailsFor(Renderer.K8sApi.Pod, { priority: 10, Details: (props) => <KubePodChart {...props} /> })`
  and the like, not written out with `kind` and `apiVersions`. The helper takes `kind` from the host's class and
  `apiVersions` from the group and version of its `apiBase`, unless the registration names them, as the one of
  `Ingress` does with `networking.k8s.io/v1` and `extensions/v1beta1`, as the host's own details of an Ingress. It
  types the props of `Details` from the class,
  so a wrapper that passes them on needs no props annotation, and a component written for another kind fails the type
  check.
- The host passes a details panel `Renderer.Component.KubeObjectDetailsProps<K>`, with `K` the class of the
  registration: `object` and an optional `className`. `KubeResourceChart` takes the class of its object as a type
  parameter, in `KubeResourceChartProps<K>`, and each subclass names the class it draws: `KubePodChart` a `Pod`,
  `KubeServiceChart` a `Service`, `KubeIngressChart` an `Ingress`, and `KubeControllerChart` a `Deployment`,
  `DaemonSet` or `StatefulSet`. So a subclass registered for another kind fails the type check, and the subclasses
  read their object with no cast.
- The host renders a cluster page with `params` only, and a Workloads Overview item with no props. A component that
  needs the extension gets it from the registration, as `WorkloadsOverviewItem` does
  (`Details: () => <WorkloadsOverviewItem extension={this} />`), with the component created once, outside the
  registration; `KubeResourcePage` needs nothing (`Page: () => <KubeResourcePage />`). `PageComponents.Page` is typed
  with the props the host passes, `Common.Types.PageComponentProps`, so the type check rejects a page that requires
  another prop. It does not reject one that declares another prop as optional next to `params`; that prop is
  `undefined`.
- The type check rejects `clusterPages` and `globalPages` registrations that would get `undefined` at runtime:
  - a component that requires props, passed as the page itself: `Page: MyPage` where `MyPage` takes `extension`;
  - a wrapper that declares the prop instead of passing it: `Page: (props: { extension: ... }) => <MyPage {...props} />`;
  - a page whose props type names its parameters (`{ params?: { query: PageParam } }`).

  Pass what the page needs from the registration, as above, rather than loosening the props type. A page that reads a
  named parameter takes `Common.Types.PageComponentProps` and reads `params.<name>.get()`: the host knows the names
  only from the registration's `params`, at runtime. The other registered components are typed the same way:
  `appPreferences` `Input` and `Hint` and a `kubeWorkloadsOverviewItems` `Details` get no props, and a
  `kubeObjectMenuItems` `MenuItem` gets `object` and `toolbar`.

## Rules That Fail Silently

Most of these compile when they are broken, and break the extension at runtime
or not visibly at all. The sections named in parentheses explain the
mechanism; this is the list to check a change against.

- **The host's React and mobx, one copy each.** Import `react`, `react-dom`,
  `mobx` and `mobx-react` by their bare module ids. A second React throws
  `invalid hook call`; a second mobx throws nothing, and the host never reacts
  to its observables. The build maps the bare ids to the host's copies, in the
  bundled libraries too, and fails on the other ways a second copy gets in
  ("Modules provided by the host").
- **Standard decorators.** An observable field is `@observable accessor`, and
  the class does not call `makeObservable(this)`. Without `accessor` the
  production build of mobx leaves the field unobservable; a unit test that
  imports the class fails ("Decorators").
- **No Node or Electron in renderer and common code.** Nothing guarantees them
  in the renderer: they are reachable only while it is not context-isolated, and
  may go in any release. The build fails on an import, `pnpm type:check` on a
  global ("Process-specific settings").
- **One CSS asset, `dist/renderer.css`.** The host links `renderer.css`, or
  `style.css` when there is no `renderer.css`, and no other stylesheet: an
  asset with any other name leaves the extension unstyled, and the rules of a
  second asset never load. Only the integration tests can notice it, through the
  480 px height that the stylesheet gives the map of the Workloads Overview;
  look at `dist/` after a change to the CSS setup. The `<style>` tags that
  force-graph and float-tooltip insert at runtime are not assets of the build
  ("CSS").
- **One tsconfig per environment.** Each program has only its runtime's `lib`
  and `types`, and no declaration may load Node into the renderer or the DOM
  into main; otherwise a wrong API type-checks, and is `undefined` at runtime
  or, for Node in the renderer, works only until a release of the host drops it.
  The environment tests fail on a leak ("TypeScript").
- **`this.props` and `this.state` of an `@observer` class component outside a
  derivation.** Under mobx-react 10 they are not observable. A `@computed`
  getter, the expression of a `reaction`, or a method the host calls from its
  own derivations that reads them throws
  `[mobx-react] Cannot read "X.props" in a reactive context` under the
  development build of mobx-react, which Freelens dev and Vitest run. Thrown
  while a view renders, the error replaces the view; thrown in a `reaction`,
  it is logged, and the reaction never runs its effect. The production build,
  which a packaged Freelens runs, has no such check: nothing throws, and the
  derivation reads the value without tracking it, so a new prop does not run
  it again. The type check, the build and unit tests in a Node environment
  pass. Read the values in `render()` or in a lifecycle method and hand them
  on: the details maps follow a new `object` in `componentDidUpdate` for this
  reason ("MobX 7 and mobx-react 10 (standard decorators only)" in Freelens's
  `migrating-from-v1.md`).
- **A memo over a store's items is keyed on something that changes with
  them.** The host keeps one observable array per store and updates it in
  place, with `replace` and `splice`, so `store.items` stays the same array
  while the objects in it change. A `useMemo` keyed on it, or on a prop that
  holds it, is computed once, and an open view keeps the objects it was opened
  with; a `reaction` that returns the array itself misses the changes in the
  same way. An `observer` that reads the items while it renders follows them;
  a memo needs a key such as the ids and `resourceVersion`s of the objects,
  and a reaction an expression that reads every item, as
  `store.items.toJSON()` does ("Data"). It shows only on a cluster whose
  objects change while the view is open.
- **A reaction started inside another reaction runs later.** Inside the effect
  of a reaction, or in an action, MobX runs a new reaction, its first run with
  `fireImmediately` included, only when the outer one ends. A value that its
  callback sets is not there on the next line, and code that reads it there
  works on what it was before: `namespaceStore.onContextChange` called from a
  store's reaction gives no selection until that reaction ends. Register the
  reaction once, outside other reactions, and keep what it is given, as the
  page and the panel keep the selection; or do the work in the callback. The type check, the
  build and a test that calls the code outside a reaction pass.
- **An effect creates what its cleanup aborts or releases.** Freelens dev
  renders in `React.StrictMode`, which runs an effect, cleans it up and runs
  it again on the same instance; a class component gets `componentDidMount`,
  `componentWillUnmount` and `componentDidMount` again in the same way. An
  `AbortController` kept in a `useRef` is aborted by the first cleanup, and
  every request of the second run with it; the host takes an aborted
  `loadAll` for no failure, so the view shows nothing and logs nothing. Create
  the controller, and the list of watches to release, inside the effect. The
  production build of React, which a packaged Freelens runs, ignores
  `StrictMode`, so only Freelens dev shows it, and only in a view that loads
  stores no other page has loaded before it.
- **Every page, details panel and Workloads Overview item inside an error
  boundary.** A `try`/`catch` around the call of a component catches only what
  the call throws, not what a child throws when React renders it. Such an
  error replaces the main area with the host's error, or, from a Workloads
  Overview item, the whole Workloads Overview below its tabs, or, from a
  details panel, the whole cluster view with the host's crash page. Map
  `clusterPages` and `kubeObjectDetailItems` through their wrappers in
  `error-boundary.tsx`, and render a Workloads Overview item inside an
  `ErrorBoundary` of its own, as `WorkloadsOverviewItem` does ("Renderer
  Components").
- **A cluster page, or a Workloads Overview item, gets the extension from its
  registration.** The host passes `params` only to a page, and no props to a
  Workloads Overview item. The type check rejects a component that requires
  another prop, but not one that declares it optional ("Renderer
  Components").
- **An ESM `main`, manifest entries that name the bundles, and no change to
  them while `pnpm dev` runs.** `main` and `renderer` in `package.json` name
  `dist/main.js` and `dist/renderer.js`; an entry that names another file
  passes `pnpm build` and `pnpm type:check`, and the extension does not load.
  The host refuses to reload a CommonJS main and logs why, and it watches only
  the entries it started with, so a manifest change needs Freelens restarted.
- **A bundled CommonJS package loads in the ESM main.** Main is built for
  Rolldown's `node` platform, which gives it a `require`, and defines
  `__dirname` and `__filename`. Without either, the package throws when
  Freelens evaluates `dist/main.js`, and the extension does not activate;
  `pnpm build` and `pnpm type:check` pass ("Process-specific settings").

Neither `pnpm build` nor `pnpm dev` runs the type check, so a Node global in
renderer code passes them; `pnpm type:check` and `type-check.yaml` catch it.

## Build

`vite.config.mjs` builds one entry point per run, in library mode, as ESM:
`vite build` builds the renderer and empties `dist/`, and `vite build --mode
main` builds main next to it. The two runs share no chunk; each bundle carries
its own copy of the `src/common/` code it imports. Nothing is minified.

`pnpm dev` runs the same two builds in watch mode, side by side, for a
directory install: the host reloads the extension when either entry is
rewritten. Its renderer run passes `--no-emptyOutDir`. In watch mode Vite
empties the output directory again before every rebuild, so a renderer rebuild
would delete `dist/main.js`, and the host would have no main entry to reload.

### Modules provided by the host

The host publishes its singletons on `globalThis.FreelensExtensionApi`, and
each process publishes only the ones it has. This is contract C3 of the
Freelens extension API (`docs/extensions/api.md`):

| Module id           | Global            | Published in |
| ------------------- | ----------------- | ------------ |
| `react`             | `React`           | renderer     |
| `react-dom`         | `ReactDom`        | renderer     |
| `react/jsx-runtime` | `ReactJsxRuntime` | renderer     |
| `mobx`              | `Mobx`            | both         |
| `mobx-react`        | `MobxReact`       | renderer     |
| `monaco-editor`     | `MonacoEditor`    | renderer     |

`build/vite-plugin-host-modules.mjs` replaces a bare import of one of these
with a module that reads the global, in the extension's code and in every
library it bundles: `react-kapsule`, with which `react-force-graph-2d` wraps
force-graph in a React component, imports `react` and gets the host's copy.
Its named exports are the members of the copy installed as a devDependency,
which is pinned to the host's version, so an import of a name the host's
version lacks fails the build. The plugin also fails the build on an import of
a host module that the process does not publish (`react` in main), and on a
subpath of a host package that the host does not publish (`react-dom/client`,
`react-dom/server`, `react/jsx-dev-runtime`). Both would otherwise either read
`undefined` at runtime or bundle a second copy. A second React throws
`invalid hook call`; a second mobx throws nothing, and the host simply never
reacts to its observables.

Everything else is bundled. That includes `@freelensapp/extensions`, a shim of
three lines that reads `Common`, `Main` and `Renderer` off the same global; it
must not be mapped. The host installs no dependencies of an extension, so
whatever the code needs at runtime and the host does not provide has to be in
the bundle: `react-force-graph-2d`, with force-graph, float-tooltip and its
Preact, and the d3 modules they use, and `d3-force` are in `dist/renderer.js`.

### Process-specific settings

- **Renderer**: nothing is external. Renderer code gets no Node or Electron, and
  an import of a Node builtin or of `electron` fails the build (Vite would
  otherwise replace it with an empty module and only warn).
  `process.env.NODE_ENV` is replaced at build time, because library mode
  leaves it for a consumer's bundler and nothing guarantees the page a
  `process`; bundled code reads it, such as `prop-types`, which
  `react-force-graph-2d` imports.
- **Main**: Node builtins (`node:*` and bare) and `electron` stay external.
  Bundled packages resolve with Vite's server conditions, so main gets their
  Node builds rather than their browser builds. Main is built for Rolldown's
  `node` platform (`build.rolldownOptions.platform`), the renderer for
  `browser`, the default of a Vite client build. A bundled CommonJS package
  `require()`s the builtins, and an ES module has no `require`: for the
  `browser` platform Rolldown turns the call into a `__require` shim that
  throws ``Calling `require` for "node:assert" in an environment that doesn't
  expose the `require` function`` as soon as the bundle is evaluated, and for
  `node` it defines `__require` with `createRequire(import.meta.url)`.
  `__dirname` and `__filename` are the other half: Node passes them to a
  CommonJS module, Rolldown leaves them as they are on either platform, and
  the ES module throws `ReferenceError: __dirname is not defined in ES module
  scope`. Main defines them (`define`) as `import.meta.dirname` and
  `import.meta.filename`, the directory and file of `dist/main.js`, not of the
  package: a library that loads a file next to itself, such as a `.wasm`,
  finds it only when the build puts it in `dist/`.
  `pnpm build` and `pnpm type:check` pass either way, and nothing before
  Freelens evaluates `dist/main.js`, so on the wrong platform the extension
  fails only when Freelens loads it. A main bundle without CommonJS is the
  same on both platforms, byte for byte.

### Decorators

MobX 7 supports standard decorators only, and Oxc, which transpiles TypeScript
for Vite, passes them through unlowered, while neither Node nor Chromium runs
them yet. `build/vite-plugin-standard-decorators.mjs`, copied from Freelens,
hands every module with a decorator to esbuild first, which lowers the
decorators and their `accessor` fields. Both `vite.config.mjs` and
`vitest.config.ts` use it. A decorator that reaches the host or a test
unlowered is a syntax error when the module is evaluated.

An observable field is an `accessor` (`@observable accessor isReady = false;`),
and the class does not call `makeObservable(this)`. `@observable` on a plain
field type-checks and builds; the development build of mobx throws when the
class is defined, and the production build leaves the field unobservable.

### CSS

The host links one stylesheet next to the renderer entry: the one named after
it, `renderer.css` next to `renderer.js`, or `style.css` when there is no
`renderer.css`. Library mode extracts the CSS of the whole bundle into
`renderer.css` (`build.lib.cssFileName`). The rules of a second CSS asset never
load, and a build whose CSS has any other name leaves the extension unstyled.
A component imports its CSS module for the class names only and renders no
`<style>` tag; the rules reach the page through `renderer.css`. CSS modules
use `camelCaseOnly` class names.

The packages `force-graph` and `float-tooltip`, which come with
`react-force-graph-2d`, insert `<style>` tags of their own when the bundle is
evaluated, with the rules of the graph's canvas and of force-graph's tooltip.
They are third-party code and stay as they are: they add no CSS asset, and the
build emits `renderer.css` alone. The extension's own rules go into its CSS
modules. The rules of force-graph's tag, all under its container (the
canvas's `display`, `user-select`, `outline` and tap highlight, and the
cursors of `.clickable` and `.grabbable`), are copied into
`KubeForceChart.module.scss`, so that the look of the graph does not depend on
the tag.

### CSS module declarations

`build/vite-plugin-css-module-declarations.mjs` writes `x.module.d.scss.ts`
next to every `x.module.scss` the renderer build imports, in `vite build` and
in watch mode. It takes the class names from Vite's own `preprocessCSS`, with
the build's resolved config, so they are the names the bundle exports, after
`localsConvention`; a class inside `:global(...)` is not one of them.

The plugin is written so that a build cannot leave a committed declaration
empty or partial, whether it fails, is interrupted or is killed:

- it awaits its work in `transform`, so the build does not end while a write is
  pending;
- it writes a declaration only when the content changed, so a build that
  changes no stylesheet touches no file;
- it writes to a temporary `*.tmp` file next to the declaration and renames it
  over the declaration, which replaces it whole or not at all.

The plugin has no options and no dependency other than Vite, and it refers to
no path of this repository, so other extensions copy it unchanged.

## TypeScript

Main code runs in Node, renderer code in a browser page, and common code in
both. Each is type-checked in a program of its own, so that an API the runtime
does not have fails `pnpm type:check` rather than the extension:

| Config                       | lib                       | types                             | Files                                                              |
| ---------------------------- | ------------------------- | --------------------------------- | ------------------------------------------------------------------ |
| `src/main/tsconfig.json`     | ES2024                    | `node`                            | `src/main/`, `src/common/`                                         |
| `src/renderer/tsconfig.json` | ES2024, DOM, DOM.Iterable | `vite/client`                     | `src/renderer/`, `src/common/`                                     |
| `src/common/tsconfig.json`   | ES2024, WebWorker         | none                              | `src/common/`                                                      |
| `src/tsconfig.json`          | ES2024, DOM, DOM.Iterable | `node`, `vite/client`             | `*.test.ts(x)` under `src/`, and `test/`                           |
| `integration/tsconfig.json`  | ES2024, DOM, DOM.Iterable | `node`, `@freelensapp/extensions` | `integration/`                                                     |
| `tsconfig.json`              | ES2024                    | `node`                            | `vite.config.mjs`, the Vitest configs, `svgo.config.mjs`, `build/` |

All of them extend `tsconfig.base.json`, which has the compiler options of
Freelens's fixture extension: `strict`, `moduleResolution: Bundler`,
`useDefineForClassFields`, `noUncheckedSideEffectImports` and `skipLibCheck`
among them. `skipLibCheck` is required: `extension-api.d.ts` is one declaration
for both processes and names DOM types and the `Electron` namespace, which no
single program has. Write `types` in every config; it decides which `@types`
packages a program sees.

### Main, renderer and common

The main and renderer configs both include `src/common/`. Compiled as main,
common code fails on the DOM; compiled as renderer, it fails on Node. What
passes both is valid in both, and that is the check that decides. Common code
uses only what both runtimes have: `globalThis.crypto`, `TextEncoder` and
`TextDecoder`, `URL` and `URLSearchParams`, `AbortController`,
`structuredClone`, and the timers, with the timer handle kept opaque.

`src/common/tsconfig.json` is for the editor, which gives a file to one config
only. Its `WebWorker` lib is the closest single match and an approximation:
`self` and `postMessage` compile there and fail in the main program.

The common program is not compiled on its own. `environment-tests/tsconfig.json`
extends `src/common/tsconfig.json` and keeps its `include`, so
`tsc -p environment-tests`, in `pnpm type:check:environments`, compiles
`src/common/` with the common settings, together with the probes. A program of
`src/common/` alone has no input when the directory has no source file, as in
this repository, and `tsc` stops on that (TS18003); the environment tests
always have their probes, so `pnpm type:check` passes with an empty
`src/common/`. Keep `src/common/tsconfig.json` even then: the editor uses it,
and the environment tests extend it.

The split does not cover the API namespaces: `Main` and `Renderer` compile in
every program, and the one the process does not have is `undefined` at runtime.
Common code uses `Common`.

### Asset imports

The renderer program has `vite/client`, which declares `*?url`, `*?raw`,
`*?inline` and the CSS modules and brings no Node into the program; an icon
imported with `?url` is a `string`. With `allowArbitraryExtensions`,
`import styles from "./x.module.scss"` resolves to the generated
`x.module.d.scss.ts`, so a class name that the stylesheet lacks fails the
check. Without that file, after `pnpm clean:dts`, the import falls back to the
untyped declaration of `vite/client`.

### Environment tests

`types` and `lib` alone do not keep an environment pure. A declaration file
with `/// <reference types="node" />` loads all of `@types/node` into any
program that reaches it, whatever `types` says, and one with
`/// <reference lib="dom" />` loads the DOM. `environment-tests/` proves the
split holds:

| File             | Compiled with          | Must                      |
| ---------------- | ---------------------- | ------------------------- |
| `node-apis.ts`   | renderer, common       | fail on every marked line |
| `dom-apis.ts`    | main, common           | fail on every marked line |
| `worker-apis.ts` | main                   | fail on every marked line |
| `shared-apis.ts` | main, renderer, common | pass                      |

Each line that must fail carries `// @ts-expect-error`, so a program that
starts accepting it fails with an unused directive. The configs there extend
the source configs and keep their `include`, so the probes are compiled
together with the sources and every declaration the sources reach. Compiled
alone, they would not see a declaration that a dependency of the sources brings
in.

When a declaration leaks, the environment tests fail; keep the leak out rather
than relax a probe. For Node
in the renderer, point `typeRoots` of the renderer config at a directory with
an empty `node` package, which a reference directive resolves to first. For
the DOM in main, remove the directive from the declaration with `pnpm patch`.

### Tests and tooling

Tests are not in the environment programs. Vitest runs them in Node, with
jsdom for files that ask for it, so `src/tsconfig.json` gives them the DOM and
Node. It sits in `src/` so that an editor finds it for a test file: the
environment config next to the test excludes it, and the editor goes on to the
next `tsconfig.json` up the tree. Tests compile against the real
`@freelensapp/extensions` declaration, while Vitest replaces the package with
`test/freelens-extensions.ts` at runtime.

No config declares the Vitest globals. TypeScript has no per-file globals, so
declaring `describe` or `vi` for tests would declare them for every file in the
program. Test and test-support files import what they use:

```ts
import { describe, expect, it, vi } from "vitest";
```

The module resolves from every program, so Biome keeps it out of the
extension's code: `style/noRestrictedImports` rejects an import of `vitest`
outside `src/**/*.test.*`, `test/` and `integration/`. The same rule rejects
there the testing helpers of React: the `act` named import of `react`,
`react-dom/test-utils` and `@testing-library/*`. They type-check and pass the
unit tests, which run the development build of React. The renderer build fails
on `react-dom/test-utils`, a subpath the host does not publish, and on
`@testing-library/react`, which imports it and `react-dom/client`. It fails on
`act` with "is not exported by": `vite build` sets `NODE_ENV` to `production`,
so the build takes the names of `react` from its production build, which
leaves `act` out. `globals: true` stays on in
`vitest.config.ts` at runtime only, because React Testing Library registers its
automatic cleanup only when `afterEach` is a global.

`@freelensapp/extensions` is stubbed because the real package cannot run in a
test: it is a shim that reads `Common`, `Main` and `Renderer` off
`globalThis.FreelensExtensionApi`, which only the host sets, and it ships no
mocks. The `alias` in `vitest.config.ts` points the import at
`test/freelens-extensions.ts`, for the tests and for the extension code they
import. The stub covers only what the tests use, at runtime only; the type
check still uses the real declaration. So a test that reaches a member the stub
lacks compiles and fails on `undefined`: add the member to the stub, as small as
the test needs. The other host modules are not stubbed: `react`, `mobx` and
`mobx-react` resolve to the devDependencies, the host's versions.

Vitest runs the development build of mobx, so a test that imports a class with
`@observable` on a field without `accessor` fails when the class is defined.

The root `tsconfig.json` checks the tooling files. It has `checkJs`, so the
Vite config and the build plugins are type-checked too; give their function
parameters JSDoc types.

## Lint and CI

### Biome

`biome.jsonc` has the formatter, import groups and rules of Freelens. Two
overrides are specific to how the extension is laid out:

- `style/noRestrictedImports` keeps `vitest` and the testing helpers of React
  out of the extension's code (see "Tests and tooling").
- `correctness/noNodejsModules` rejects a Node builtin import in
  `src/renderer/` and `src/common/`, tests left out. It flags the import in the
  editor, before `pnpm type:check` does; it does not see Node globals such as
  `Buffer` or `process`, which only the type check catches.

Every path in an override starts with `**/`. Trunk runs Biome from a sandbox
outside the repository, with `--config-path` pointing back at `biome.jsonc`,
and there a path anchored at the repository root matches no file, so the
override silently does nothing. A plain `biome check` matches both forms, so
only `trunk check` shows the difference.

In that sandbox, Biome also cannot apply `vcs.useIgnoreFile`: from 2.5.15 on it
matches every target against the repository's `.gitignore` and panics on a
path outside the repository root, so every file fails. The Biome commands in
`.trunk/trunk.yaml` pass `--vcs-use-ignore-file=false`, because Trunk applies
`.gitignore` itself before it picks the targets; `biome.jsonc` keeps the
setting on for `pnpm biome` and editors.

Renovate updates Biome, in the `biome` script and in `.trunk/trunk.yaml`, but
cannot run `biome migrate`. `biome-migrate.yaml` runs it on the Renovate
branch and commits the migrated `biome.jsonc` there, so that the update and its
migration are one pull request. The commit is by `github-actions[bot]`, which
`gitIgnoredAuthors` in `.renovaterc.json` lists, so that Renovate does not take
it for a manual edit and stop updating the branch.

Biome formats SCSS, YAML and Markdown too, as in Freelens, so Trunk runs no
Prettier or markdownlint; yamllint still checks YAML. Kubernetes manifests are
the exception: their sequences stay unindented, as kubectl writes them, which
Biome cannot do. `biome.jsonc` leaves out the directories meant for them,
`integration/fixtures/` and `examples/`, and the ignore rules of
`.trunk/trunk.yaml` give them to yamlfmt only, which formats them with the
`.yamlfmt.yaml` of their directory: the test objects of the integration tests
and the local chart in `integration/fixtures/`.
`biome.jsonc` also leaves out `pnpm-lock.yaml` and `pnpm-workspace.yaml`,
which pnpm writes, and `.trunk/`, whose `trunk.yaml` `trunk upgrade` rewrites.

The Markdown rules are in `nursery`. `markdown.parser.frontmatter` is on for
a Markdown file that starts with YAML frontmatter; without it Biome reads the
opening `---` as a thematic break and inserts a blank line after it. Biome does
not rewrap a paragraph, so a paragraph keeps the line breaks it is written
with.

### Knip

`pnpm knip:check` runs knip twice, for unused files and for dependencies: a
development pass over everything, and a `--production --strict` pass over the
code that reaches the bundles, which are the entries marked with `!` in
`knip.jsonc`. In the production pass only `dependencies` count, so a bundled
library that the extension's code imports belongs there, as
`react-force-graph-2d` and `d3-force` do. The host-provided modules are
devDependencies, for their types, and are ignored.

A file is unused when no entry reaches it: a leftover module, a barrel that
nothing imports. The production pass starts from the `!` entries only, so it
also reports a module that only tests import. The fix is to remove the file,
not to ignore it. The check does not include unused exports and types: on this
tree they are mostly the props types that the components export, and
`withMenuItemErrorBoundary`, which only its test uses while the extension has
no menu item.

`knip.jsonc` lists the entries knip cannot find: the two source entries, the
Vitest alias target `test/freelens-extensions.ts`, the probes in
`environment-tests/`, and `vite.config.mjs`, which the Vite plugin would
otherwise find. That plugin is off: it adds the renderer entry of
`vite.config.mjs` as a development entry, which displaces
`src/renderer/index.tsx!`, and the production pass then skips the renderer.
`--no-config-hints` is set because one config serves both passes, and an entry
that only the production pass needs is reported as redundant by the other.

One more setting keeps the file check to real findings. `project` leaves out
the CSS module declarations with `!src/**/*.d.scss.ts`: TypeScript reaches them
through `allowArbitraryExtensions`, while knip resolves
`import styles from "./x.module.scss"` to the stylesheet, so nothing would
import them. The negation has no trailing `!`, which would apply it to the
production pass only.

`svgo.config.mjs` comes from the template, and nothing runs it: the `svgo`
linter of `.trunk/trunk.yaml` is disabled. The SVGO plugin of knip is on
(`"svgo": true`), because no dependency turns it on, so the file is an entry
and the file check does not report it.

`ignore` leaves out `dist/**`. The `main` field of `package.json` makes
`dist/main.js` an entry once it exists, and the `knip` script runs with
`--no-gitignore`, so after `pnpm build`, which `check.yaml` runs first, knip
would analyse that bundle and report what it inlines from the libraries it
bundles, such as a binary that a bundled library spawns; this extension's main
bundles none but the shim of `@freelensapp/extensions`. Run `pnpm knip:check`
after a build when changing `knip.jsonc`, as `check.yaml` does; without
`dist/` the problem does not show.

### Workflows

| Workflow                 | Runs                                                                          |
| ------------------------ | ----------------------------------------------------------------------------- |
| `type-check.yaml`        | `pnpm type:check`                                                             |
| `check.yaml`             | `pnpm build`, `pnpm lint:check`, `pnpm knip:check`                            |
| `unit-tests.yaml`        | `pnpm test:unit`                                                              |
| `trunk-check.yaml`       | `trunk check --all`                                                           |
| `integration-tests.yaml` | the integration tests in `integration/`, against Freelens dev                 |
| `mise-lock-check.yaml`   | on a change to `mise.lock`: no checksum changed for an unchanged tool version |
| `osv-scanner.yaml`       | OSV-Scanner on the dependencies, also weekly; a finding does not fail it      |

The type check has a workflow of its own, on pull requests and on pushes to
`main`, as in Freelens. It runs every program, tests, tooling and environment
tests included, which no build reaches, and a type error shows as its own
failed check rather than as a failed build. `check.yaml` builds without the
type check for the same reason, so it does not run twice.

`osv-scanner.yaml` checks the dependencies in `pnpm-lock.yaml` against the OSV
database on pull requests, on pushes to `main` and once a week, and uploads
what it finds to code scanning (`security-events: write`). The extension
bundles libraries that the host does not provide, `react-force-graph-2d` with
its dependencies and `d3-force`, so a vulnerability in one of them ships in
`dist/renderer.js`. The scan sets `fail-on-vuln: false`: a finding does not
block a pull request, and Renovate opens the fixes it can
(`osvVulnerabilityAlerts` and `vulnerabilityAlerts` in `.renovaterc.json`,
with no `minimumReleaseAge`).

The integration tests are not part of the extension API contract. They run in
this repository, under its own Vitest (`vitest.integration.config.ts`,
`pnpm test:integration`), against Freelens started with `pnpm dev` from a
freelensapp/freelens checkout. They attach to
it with Playwright's `chromium.connectOverCDP` on the port that script opens
(see "Checking the Extension in Freelens Dev"), so they need no package of
Freelens and no file of its checkout; Freelens dev is the only dependency, and
it is not in `package.json`. `playwright` is a devDependency at the version of
Freelens's catalog. The workflow builds the extension, checks out Freelens at
each release tag of its matrix (`v2.0.0`), starts a kind cluster, applies the
test objects of `integration/fixtures/resource-map` and installs the local
chart `integration/fixtures/charts/catalog` with `helm`, starts
`pnpm dev` in the Freelens checkout in the background under `xvfb-run`, with
its output in a file and a fresh profile in `FREELENS_INTEGRATION_TESTING_DIR`,
waits until the CDP endpoint answers, and runs `pnpm test:integration` here. A
profile of Freelens dev syncs no kubeconfig by default, so the workflow seeds
the fresh one with a single sync entry, a file with the kind cluster alone,
and the catalog lists that cluster and nothing else. Every test file is a
session of its own on the one app, and fails on any error logged by either
process:

- `extensions.tests.ts` uninstalls whatever installation of the extension the
  app has, installs this checkout in place from the Extensions page and waits
  until the table lists it as enabled. It needs no cluster. The extension has
  no `appPreferences`, so the session opens no preferences page.
- `resource-map-page.tests.ts` opens the Resource Map page as the first view of
  the extension after the kind cluster connects, and selects the two test
  namespaces. It checks the nodes of the test objects, the two Deployments
  named `web` as two nodes and the four Ingresses included, one canvas, that
  the map follows a change of the selection, the tooltip of a node under a real
  pointer, and that a click on the node of the Helm release opens it at
  `/helm/releases/shop/catalog`.
- `workloads-overview.tests.ts` connects the kind cluster, which opens on the
  host's Cluster Overview, and opens Workloads > Overview. The two load pods,
  workloads, events and nodes, but no Services or Ingresses: the session checks
  that the "Resources" panel draws them, that its map is 480 px high and as
  wide as the panel, and one canvas.
- `details-drawers.tests.ts` connects the kind cluster, which opens on the
  host's Cluster Overview, selects the test namespaces through the namespace
  store, and opens the details of the test objects with
  `Renderer.Navigation.showDetails`, run in the cluster frame. The first
  drawer is a Service's, whose map loads the stores that no host view has
  loaded yet; then a Deployment, a StatefulSet, a DaemonSet, an Ingress and a
  pod. In each drawer it checks the "Resources" title, one canvas, the nodes
  the map should hold and no error page of the boundary. Then it opens the
  Deployment of `inventory`, which the selection leaves out, and checks that
  its map draws the objects of that namespace and that the stores of the
  Services and the ConfigMaps, which no host view loads there, hold none of
  them. It clicks the node of a Deployment in the map of the Service and checks
  that the drawer shows the Deployment, still a second later, and the node of
  the Helm release in the map of its Deployment, which opens the release.

One canvas in the container of a map shows that the guard of react-kapsule
against the double mount of `React.StrictMode`, which Freelens dev renders in,
holds. The test objects are the same Deployment, Service and ConfigMap in the
namespaces `shop` and `billing`, an Ingress with a TLS secret and a service
backend, one without rules, one whose rule has no `http` and one with a
`resource` backend, a StatefulSet with its headless Service and a DaemonSet,
all in `shop`, the release `catalog` of the local chart in `shop`, a
Deployment and a Service that Helm marks with its label and annotation, and a
Deployment with its Service and ConfigMap in `inventory`, a namespace that no
session selects. The pods run a pause container:
the map reads specs, and needs no ingress controller. The drawers of a
Deployment, a DaemonSet and a StatefulSet list their pods with the metrics of
their namespace, which the host asks `metrics.k8s.io` for; kind has no metrics
server, and Chromium logs the 404 of each request as an error. The error
collector leaves out that one error by its status and URL, with an exact
pattern, and no other error of the renderer.

The tests are deterministic, so nothing retries them: the config sets no
`retry`, and the workflow runs the step once, under `timeout 600`. A retry
repeats the same failure, and every view of a session waits its full timeout
before it fails. Vitest runs the files one at a time
(`fileParallelism: false`), because they drive one app, in no set order, and
none depends on another having run.

The sessions reach the app through its renderer only; the main process, and
with it the application menu, is out of reach of CDP. They navigate the root
frame with `Renderer.Navigation.navigate` of the extension API, find the kind
cluster with `Renderer.Catalog.catalogEntities` by its name, `kind-<name>`,
and connect it by navigating to `/cluster/<id>` and disconnect it with the
entity's `disconnect()`. `browser.close()` of a browser connected over CDP
closes only the connection, so a session ends with it and the app keeps
running. The renderer's console carries the errors of the root frame and of
every cluster frame; the main log is read from the file that
`FREELENS_MAIN_LOG` names, from its size when the session started, and every
line that starts with `error:` counts, also after a task prefix that turbo
may add, such as `freelens:dev:`, except
`proxy_server.go:… Error while proxying request: context canceled`, which the
Kubernetes proxy of Freelens logs for a request that the renderer aborts.
Freelens dev renders in `React.StrictMode`, which mounts every view twice and
aborts the requests of the first mount, so the line comes and goes with the
timing of a run; it names no request and says nothing about the extension.
Without the variable only the renderer is checked. A renderer error carries its location, line and column included,
and the worker that logged it. Its text is the preview of its arguments, which
is empty for some objects and only the class name for others, such as
`ErrorEvent`; such an error is described from its arguments, read from the
page, and an empty one without arguments, which the browser itself logs, gets
its time, to find it in the main log.
The workflow sets `TURBO_LOG_ORDER=stream` for `pnpm dev`: in GitHub Actions
turbo otherwise groups the output of a task until it ends, and the persistent
`dev` task never ends, so the log would stay empty.

The helpers connect the kind cluster without opening a view of the extension
(`connectKindCluster`), so that a session opens its own as the first one after
`disconnectKindCluster`; the cluster frame opens on the host's Cluster
Overview, which loads pods, events and nodes. They open the Resource Map page
from its sidebar entry,
by the test id that the `clusterPageMenus` id `resource-map` gives it
(`openResourceMap`), and Workloads > Overview at its route `/workloads`
(`openWorkloadsOverview`), since its group of the sidebar may be collapsed.
`selectNamespaces` selects the namespaces it is given, the test namespaces
`shop` and `billing` or `shop` alone, in the namespace filter of the open view,
unless it shows them already: the first one alone, and the others with the key
of a multiple selection held, Meta on macOS
and Control elsewhere. The filter is the host's, and the app keeps its selection
for every view of the cluster. `settledNodes` waits for the `data-settled` mark
of the map and reads its hidden list of the nodes, and `nodePoint` gives the
point of a node on the screen: its point on the canvas plus the position of the
canvas, scrolled into view first, which Playwright gives in the coordinates of
the page for an element of the cluster frame too. `selectNamespacesInStore`
selects namespaces through the namespace store, for a view with no filter,
`openDetails` opens the details of an object by its selfLink, and `podSelfLink`
finds the selfLink of a pod in the host's store, since the names of pods end
with a random suffix. The helpers wait with `until`, which, unlike
`expect.poll`, also runs in the hooks of a session. A session opens no page of
the host whose requests log errors of their own: the Pods page asks for the pod
metrics of the whole cluster, and kind has no metrics server. The drawers of a
Deployment, a DaemonSet and a StatefulSet ask for those of one namespace, whose
404 the error collector leaves out. The sessions change nothing in the
cluster.

The code the sessions share is in `integration/__tests__/extension-helpers.ts`:
connecting to the app with the error collector, installing the extension,
connecting and disconnecting the kind cluster, opening the views, selecting
the namespaces, reading the nodes of a map, opening the details of an object,
and the selectors. Its name does not match
`*.tests.ts`, so Vitest does not collect it. `integration/tsconfig.json`
compiles the directory with Node and the DOM, because the callbacks of
`page.evaluate` run in the page, and with the types of
`@freelensapp/extensions`, which declare `globalThis.FreelensExtensionApi` for
them.

Three variables configure the sessions. `FREELENS_CDP_URL` is the CDP
endpoint (`http://127.0.0.1:9223` by default), `FREELENS_MAIN_LOG` the main
log, and `TEST_KIND_CLUSTER_NAME` names the kind cluster (`kind` by default,
`freelens` in the workflow); every kubectl call names its context,
`kind-<name>`, so a run never acts on the current context. The checkout to
install is found from the location of the helpers. Outside CI a session skips
with a warning when Freelens dev does not answer or, for a session that needs
it, the cluster is not reachable; in CI (`CI` set) the run fails instead, so
that a mistake in the workflow does not turn into a silent skip.

Run locally, the tests act on the profile of Freelens dev, `FreelensDev`,
which is apart from that of an installed Freelens: they navigate its window,
and leave this checkout installed in place, uninstalling another installation
of the extension. They touch no cluster of the catalog but the kind cluster.
The profile lists the kind cluster only once its kubeconfig is in "Kubeconfig
Syncs" (see "Checking the Extension in Freelens Dev"); without it a session
that needs the cluster fails on the timeout of finding it.

## Checking the Extension in Freelens Dev

The functional checks of a change run against Freelens started with
`pnpm dev` from a freelensapp/freelens checkout. That script starts Electron
with `--remoteDebuggingPort 9223`, so an agent can drive the app over the
Chrome DevTools Protocol. How to attach Playwright MCP to it is in Freelens's
`DEVELOPMENT.md`, "Inspecting the running dev app from an AI agent"; start
Freelens before the session connects. Playwright MCP writes its snapshots to
`.playwright-mcp/`, which is git-ignored. Added to a Claude Code session that
is already running, the server is listed as connected, but its tools appear
only in a new session.

Without the MCP server, or until that new session, a script with
`chromium.connectOverCDP("http://127.0.0.1:9223")` of `playwright`, a
devDependency, does the same, as the integration tests do. `browser.close()`
of such a browser closes only the connection; the app belongs to Freelens and
keeps running.

A profile of Freelens dev syncs no kubeconfig until one is added in
"Kubeconfig Syncs" of the Kubernetes preferences, so its catalog lists none of
the developer's clusters; `KUBECONFIG` does not change that. For the checks,
add a kubeconfig with the test cluster alone, such as the output of
`kubectl config view --minify --flatten --context kind-kind`. A fresh profile,
in a `FREELENS_INTEGRATION_TESTING_DIR` under the system's temporary
directory, can start with it already in place: `integration-tests.yaml` seeds
`FreelensDev/lens-user-store.json` there with
`preferences.syncKubeconfigEntries`, whose `filePath` is absolute ("Kubeconfig
syncs of the dev profile" in Freelens's `DEVELOPMENT.md`).

### Installing the checkout

1. `pnpm install`, then `pnpm build`. After a branch switch, `node_modules`
   can still hold another stack, and Freelens loads the extension from
   `dist/`.
2. On the Extensions page, enter the checkout's directory and press
   "Install". Freelens then asks whether to load the extension in place;
   confirm that too. The table lists the extension as enabled, with
   "development" in the version column and `Loaded from <directory>` in its
   title.
3. A rebuild, by `pnpm build` or by `pnpm dev` of the extension, reloads it
   once in the root frame and once in each cluster frame.

### Driving the UI

- Every cluster renders in a cross-origin `<clusterId>.renderer.freelens.app`
  iframe. The page, the Workloads Overview panel and the details maps of the
  extension live in that frame, not in the main page.
- Pages of the extension have URLs like `/extension/<name>/<pageId>`, with the
  package name's `@` dropped and `/` turned into `--`: the Resource Map is
  `/extension/freelensapp--resource-map-extension/resource-map`. The sidebar
  entries navigate in `onClick`; their `href` is not the page URL. A click on
  an entry's `[data-testid="sidebar-item-…"]` element does not navigate; a DOM
  `click()` on the link inside it, `[data-testid="link-for-sidebar-item-…"]`,
  does. Neither does `history.pushState` in the cluster frame. The link of the
  Resource Map is
  `[data-testid="link-for-sidebar-item-freelensapp--resource-map-extension-resource-map"]`.
- The root frame navigates with `Renderer.Navigation.navigate(url)` of the
  extension API, run in its page: `/extensions`, `/catalog`, `/cluster/<id>`.
  The application menu belongs to the main process, which CDP does not reach.
- Playwright's actionability checks can fail on the hotbar, where
  `#ScrollSpyRoot` intercepts pointer events; a DOM `click()` on the element
  works.
- Views fill in once the host's stores have loaded. Wait for the expected
  content, not a fixed time, before deciding that a page is empty.
- The graph is a `<canvas>` inside `.force-graph-container`. Its nodes are not
  DOM elements; once the graph has settled (`data-settled` on its container),
  the visually hidden list `[data-testid="resource-map-nodes"]` has an item
  per node, with its kind, namespace, name and point on the canvas, which a
  script reads, as the integration tests do. The tooltip of a node shows only
  while the pointer is on it.

### Reading the console

The renderer console also carries the output of Freelens's terminal dock
(`%cMESSAGE` lines), which can include the user's shell prompt, account names
and paths. Keep only warnings, errors, page errors and the extension's own
lines, and never paste the full console into a PR, an issue or a report.
React reports key problems as console errors ("Each child in a list should
have a unique key", "Encountered two children with the same key"); they count
as failures of the "no error in DevTools" check.

The renderer's requests to Kubernetes go through Chromium, which logs every
response that is not a success as a console error,
`Failed to load resource: the server responded with a status of N`, also one
that the code that sent it handles. The text names no URL; the location of the
message does, and the error collector of the integration tests appends it. An
extension whose tests expect such a response on purpose, a 404 or a 409, leaves
out that one error by its status and URL, not every "Failed to load resource".

The main process logs to the terminal running Freelens, and to a file. On
macOS it is `~/Library/Logs/Freelens/lens.log`, with the renderer's
`lens-renderer-*.log` next to it; when the terminal is not at hand, it shows
the extension's activation, its reloads and its own lines. Filter it as the
console.

## Code Style

- **Biome** formats **TypeScript/TSX, JS, JSON, CSS, SCSS, HTML, YAML, Markdown**: double quotes, semicolons, trailing commas, 2-space indent, 120 char line width; use `pnpm biome:fix`
- **Trunk** formats **TOML and shell scripts**, and with yamlfmt the Kubernetes manifests of `integration/fixtures/`, which Biome leaves out, and runs the linters for formats not covered by Biome (yamllint, actionlint, shellcheck); use `pnpm trunk:fix`
- Import order (enforced by biome organizeImports): every value import first, in one block: built-in modules → packages → relative paths; then the `import type` lines: built-in modules → `@freelensapp/**` → packages → relative paths, with a blank line before each of the last three groups
- React 19; JSX compiles to `react/jsx-runtime` imports, which the build maps to the host's React
- **No emoji** in Markdown files (`.md`), comments, or any source code

## Security

Never read, display, reference, or include the contents of the following files in any response or context, even if they are open in the editor:

- `.env`
- `.env.*`
- `.envrc`
- `.npmrc`
- `*.jks`
- `*.keystore`
- `*.p12`
- `*.pfx`
- `*.pem`
- `*.key`

The same list is git-ignored in `.gitignore` and enforced for Claude Code by
the `permissions.deny` rules in `.claude/settings.json`, which block reading
and editing these files. Change all three together. The rules are native
permissions rather than a hook on purpose: a hook runs a process in the
working tree, which may be an untrusted pull request, and an interpreter such
as `python3 -c` imports modules from that tree before the hook's own code.

## Electron Multi-Process

Extensions run in the same multi-process model as the Freelens host:

- **Main process** (`src/main/`): Node.js environment, extension lifecycle, cluster connectivity
- **Renderer process** (`src/renderer/`): Chromium browser, UI components

Code in `src/common/` is shared between both processes. This extension's main
entry is empty, and all its code runs in the renderer.

## Troubleshooting

### Changes Not Appearing

1. Check that files are not in ignored output directories (`dist/`, `node_modules/`)
2. Full clean and rebuild: `pnpm clean:all && pnpm install && pnpm build`
3. With a directory install and `pnpm dev` running, look for a refused reload in the Freelens log, and restart
   Freelens after a change to `main` or `renderer` in `package.json`; reinstall an extension installed from a tarball

### Build Failures

1. Check for TypeScript errors: `pnpm type:check`
2. Check for linting errors: `pnpm lint:check`
3. Verify dependencies: `pnpm install`
4. Check Node.js version matches the `engines` field in `package.json`

### Runtime Errors

1. Open Freelens DevTools and check the Console tab for renderer errors
2. Check the terminal where Freelens was launched for main process errors
3. Look for stack traces with file:line numbers
4. Look for the extension's own lines, which carry `[@freelensapp/resource-map-extension]:`; the graphs log a store
   that fails to load and an icon that fails to draw, and the error boundary logs what a view throws
5. Validate both with `pnpm type:check` **and** `pnpm build`: runtime failures can appear only in bundled `dist/` code

## Best Practices

1. **Use semantic search** to find examples and patterns in the codebase
2. **Follow existing patterns:** grep for similar implementations before creating new ones
3. **Test changes** before committing
4. **Run validation before committing:** `pnpm lint:fix && pnpm type:check && pnpm test:unit`
5. **For TypeScript/TSX, JS, JSON, CSS, SCSS, HTML, YAML and Markdown files:** run `pnpm biome:fix` (or `biome check --fix` directly if `biome` is installed locally)
6. **For other formats, and the Kubernetes manifests of `integration/fixtures/`:** run `pnpm trunk:fix` (or `trunk check --fix` directly if `trunk` is installed locally)
7. **Full build** when in doubt about cached state: `pnpm clean:all && pnpm install && pnpm build`

## GitHub Actions (Claude Code Action) Rules

This project has a Claude Code workflow (`.github/workflows/claude.yaml`) triggered
via `@claude` comments on issues, PR comments, and reviews. When operating via that
workflow, follow these rules:

### Code Review

When reviewing code and proposing fixes:

1. **Show the diff first:** present every proposed change as a unified diff
   block using the `diff` language tag:

   ```diff
   --- a/path/to/file.ts
   +++ b/path/to/file.ts
   @@ -10,7 +10,7 @@
    const oldLine = "before";
   -const changedLine = "after";
   +const changedLine = "the fix";
    const unchangedLine = "same";
   ```

   You can generate this from the terminal with:

   ```bash
   git diff -u -- path/to/file
   ```

   If the change spans multiple files, group them under a single commit
   subject and show each file's diff sequentially.

2. **Propose a commit subject first:** before any code change, output a
   single line with the proposed commit subject:

   ```text
   **Proposed commit:** <short description>
   ```

   Do **not** use Conventional Commits prefixes (e.g. `fix:`, `feat:`,
   `chore:`, `refactor:`, `docs:`, `test:`, `ci:`). This project prefers
   plain, descriptive commit messages and PR titles without any prefix.

   Wait for the user to confirm (or adjust) the subject before applying the
   change.

3. **Comment style:**
   - Keep review comments concise and actionable
   - Reference specific lines (file + line number) when pointing out issues
   - Offer a concrete fix suggestion rather than just flagging a problem
   - Do **not** use emoji in any Markdown, comments, commit messages, or
     PR descriptions. The only exception is emoji that already appears
     inside code strings (e.g. application logs, user-facing messages).
   - Use GitHub's `suggestion` block for small targeted fixes, in an inline comment on the lines to change, so the PR
     author can accept the change with a single click. The block holds the new text of those lines, with no diff
     markers or file headers, because GitHub commits its content in their place:

     ```suggestion
     const changedLine = "the fix";
     ```

   - For larger multi-file changes, use `diff -u` blocks in a regular
     comment instead, with the proposed commit subject shown first

### Making Changes to a PR

When asked to implement a change on a PR:

1. Propose the commit subject (as above)
2. Describe what will change and why
3. After confirmation, apply the changes with commits on the PR branch
4. **One commit per fix:** when a review surfaces more than one issue or
   the plan includes more than one fix, apply and commit each fix
   separately. Do not batch multiple independent fixes into a single
   commit. This keeps the history bisectable and makes each change easy
   to revert individually.

### Force-Pushing a Rewritten Branch

When you are asked to rebase a pull request branch, or to rewrite its
history in another way (amend, squash, drop a commit), push the result with:

```bash
git push --force-with-lease origin HEAD
```

The push wrapper the action names in its instructions, `git-push.sh`, accepts
no flags, so it cannot do this; `git` itself is allowed in this workflow.
Do not fall back to merging `main` into the branch instead: a merge commit is
not what was asked for.

Force-push only the pull request branch the run was invoked on, and only when
the request calls for a rewrite. Never force-push `main` or any other branch,
and never rewrite a history you were not asked to.

### Modifying GitHub Actions Workflows

Claude cannot push changes to files under `.github/workflows/` directly,
because the GitHub token used by the action lacks the `workflows` permission.
Any patch to a workflow file MUST therefore be delivered as a new, complete
file under the `github-workflow-fix/` directory in the repository root instead
of editing the file in place:

1. Write the full, final contents of the workflow to
   `github-workflow-fix/<workflow-file-name>`, with the same file name as in
   `.github/workflows/` (e.g. `github-workflow-fix/check.yaml`). Do **not**
   edit the original file under `.github/workflows/`.
2. Make it a **complete** file (the entire workflow as it should look after
   the change, not just a diff or fragment), so it can be copied verbatim.
3. Commit it with the change that needs it, and list it in the report. In the
   PR description, note it as a proposed workflow change that a maintainer
   must move from `github-workflow-fix/` to `.github/workflows/`.

A maintainer moves the file into `.github/workflows/` in a separate commit and
removes `github-workflow-fix/`. Pull before continuing on the branch, as it may
have gained such a commit.

### Branch Naming Conventions

When creating a branch from an issue, use a human-readable name that includes
the issue number and a short slug derived from the issue title:

```text
claude/issue-<number>-<short-slug>
```

- `<number>` is the GitHub issue number
- `<short-slug>` is a kebab-case summary of the issue title, kept short
  (3 to 6 words maximum, omit articles and filler words)

Do **not** use auto-generated timestamp suffixes (e.g.
`claude/issue-1957-20260612-2108`): these are not human-readable and make
branch lists hard to scan.

### Fork PRs: Review Only

A PR from a fork (different owner than `freelensapp`) gets a review and
nothing else: no commits, no pushes, no branches. Its code is untrusted, and
the head of a fork PR can change between the moment a maintainer looks at it
and the moment the workflow checks it out, so nothing taken from the checkout
may reach `freelensapp/freelens-resource-map-extension`.

When a fork PR needs changes, a maintainer first copies the exact commit they
reviewed to a branch in this repository. From then on it is a
same-repository PR, which gets the full setup and the normal workflow. The
copy is made either locally (`gh pr checkout <N>`, then push the branch) or
by the Claude Task workflow, following "Copying a Fork PR" below.

### Copying a Fork PR

This applies to a Claude Task run whose prompt asks to copy a fork PR and
names the PR number and the full commit SHA to copy. It is a git-only task:
do not check out, read, build or run any of the PR's files, and do not
describe its changes, because they are untrusted input.

1. `git fetch origin refs/pull/<N>/head`.
2. Verify that `FETCH_HEAD` equals the given SHA. If it does not, or no full
   SHA was given, stop and report the actual head without pushing anything.
3. `git push origin <sha>:refs/heads/claude/pr-<N>`.
4. Open a PR from `claude/pr-<N>` to `main`. It MUST use the **exact same
   title** as the original PR, copied verbatim with no prefix, and its body
   is `Copy of #<N> at <sha>.` followed by the usual footer.
5. Comment on the original PR with a link to the new one.
