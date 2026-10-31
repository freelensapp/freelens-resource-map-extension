// @vitest-environment jsdom

import { Common, Renderer } from "@freelensapp/extensions";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { compareShallow, observable, reaction, runInAction } from "mobx";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pod, secret } from "../../../test/kube-objects";
import { KubeForceChart } from "./KubeForceChart";

import type { IObservableArray } from "mobx";

import type { ChartDataSeries, LinkObject } from "./helpers/types";

type KubeObject = Renderer.K8sApi.KubeObject;

// A store of the host, as far as the map uses it: its items in an observable
// array, its loads and its watches. As in the host, a watch with an aborted
// controller does not start, and the function a watch returns aborts it.
interface FakeStore {
  api: { kind: string };
  items: IObservableArray<KubeObject>;
  loads: number;
  watches: number;
  // When set, a load waits for it, and then fails with it when it is an error.
  pending?: Promise<Error | undefined>;
  loadAll(params?: Renderer.K8sApi.KubeObjectStoreLoadAllParams): Promise<KubeObject[] | undefined>;
  subscribe(params?: Renderer.K8sApi.KubeObjectStoreSubscribeParams): () => void;
  getChildPods(): Renderer.K8sApi.Pod[];
}

function fakeStore(kind: string): FakeStore {
  const store: FakeStore = {
    api: { kind },
    items: observable.array<KubeObject>([], { deep: false }),
    loads: 0,
    watches: 0,
    async loadAll(params) {
      store.loads++;
      const failure = await store.pending;
      if (params?.reqInit?.signal?.aborted) return undefined;
      if (failure) {
        params?.onLoadFailure?.(failure);
        return [];
      }
      return store.items.slice();
    },
    subscribe(params) {
      const controller = params?.abortController ?? new AbortController();
      if (controller.signal.aborted) return () => {};
      store.watches++;
      controller.signal.addEventListener("abort", () => store.watches--, { once: true });
      return () => controller.abort();
    },
    getChildPods: () => [],
  };
  return store;
}

interface GraphProps {
  graphData: { nodes: ChartDataSeries[]; links: LinkObject[] };
  onNodeHover(node: ChartDataSeries | null, previous: ChartDataSeries | null): void;
  onEngineStop(): void;
  onNodeClick(node: ChartDataSeries, event: MouseEvent): void;
  ref?: { current: unknown };
}

// jsdom has no canvas: the graph is replaced by a component that keeps the
// props the map hands to it and puts methods that record their calls in its
// ref, as the graph does when it mounts.
const graph = vi.hoisted(() => ({
  props: undefined as GraphProps | undefined,
  methods: {} as Record<string, (...args: never[]) => unknown>,
}));
vi.mock("react-force-graph-2d", () => ({
  default: (props: GraphProps) => {
    graph.props = props;
    if (props.ref && props.ref.current !== graph.methods) {
      props.ref.current = graph.methods;
    }
    return <canvas />;
  },
}));

// The tooltips of the kinds render the host's components, which a unit test
// does not have. The stand-ins of the models are no instances of the host's
// classes, so every node gets the default tooltip.
vi.mock("./tooltips/DefaultTooltip", () => ({
  DefaultTooltip: ({ obj }: { obj: KubeObject }) => <p>default {obj.getName()}</p>,
}));

// The host's stores, its namespace store, whose onContextChange is a reaction
// to the selection as in the host, and the kinds that the user may list.
const host = vi.hoisted(() => ({
  stores: {} as Record<string, FakeStore>,
  namespaceStore: {} as object,
  listable: new Set<string>(),
}));
vi.mock("./helpers/stores", () => ({
  getMapStores: () => host.stores,
  getNamespaceStore: () => host.namespaceStore,
  canListMapStore: (key: string) => host.listable.has(key),
}));
vi.mock("./helpers/theme-colors", () => ({
  getCanvasColors: () => ({ background: "#1e2124", text: "#ffffff" }),
}));

const kinds = {
  pods: "Pod",
  deployments: "Deployment",
  statefulSets: "StatefulSet",
  daemonSets: "DaemonSet",
  services: "Service",
  ingresses: "Ingress",
  pvcs: "PersistentVolumeClaim",
  configMaps: "ConfigMap",
  secrets: "Secret",
};

let selection: IObservableArray<string>;

beforeEach(() => {
  host.stores = Object.fromEntries(Object.entries(kinds).map(([key, kind]) => [key, fakeStore(kind)]));
  host.listable = new Set(Object.keys(kinds));
  selection = observable.array(["shop"]);
  host.namespaceStore = {
    onContextChange: (callback: (namespaces: string[]) => void, opts: { fireImmediately?: boolean } = {}) =>
      reaction(() => selection.slice(), callback, { fireImmediately: opts.fireImmediately, equals: compareShallow }),
  };
  const force = { strength: vi.fn(() => force), distance: vi.fn(() => force) };
  graph.props = undefined;
  graph.methods = {
    zoom: vi.fn(),
    zoomToFit: vi.fn(),
    d3Force: vi.fn(() => force),
    graph2ScreenCoords: vi.fn((x: number, y: number) => ({ x: x + 400, y: y + 300 })),
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const drawnIds = () => graph.props?.graphData.nodes.map((node) => node.id).sort();
const stores = () => Object.values(host.stores);

describe("KubeForceChart", () => {
  it("draws the selected namespaces when a store changes, and nothing of the others", async () => {
    host.stores.pods.items.replace([pod("web-1", "shop"), pod("ledger-1", "billing")]);
    render(<KubeForceChart />);
    await waitFor(() => expect(drawnIds()).toEqual(["Pod/shop/web-1"]));

    act(() => {
      runInAction(() => host.stores.pods.items.push(pod("web-2", "shop")));
    });

    expect(drawnIds()).toEqual(["Pod/shop/web-1", "Pod/shop/web-2"]);
  });

  it("draws the namespaces of a new selection", async () => {
    host.stores.pods.items.replace([pod("web-1", "shop"), pod("ledger-1", "billing")]);
    render(<KubeForceChart />);
    await waitFor(() => expect(drawnIds()).toEqual(["Pod/shop/web-1"]));

    act(() => {
      selection.replace(["billing"]);
    });

    await waitFor(() => expect(drawnIds()).toEqual(["Pod/billing/ledger-1"]));
  });

  it("shows the tooltip of the hovered node, and hides it when the pointer leaves", async () => {
    host.stores.pods.items.replace([pod("web-1", "shop")]);
    render(<KubeForceChart />);
    await waitFor(() => expect(drawnIds()).toEqual(["Pod/shop/web-1"]));
    const tooltip = screen.getByTestId("resource-map-tooltip");
    expect(tooltip.style.display).toBe("none");

    act(() => graph.props?.onNodeHover(graph.props.graphData.nodes[0], null));

    expect(tooltip.textContent).toBe("default web-1");
    expect(tooltip.style.display).toBe("block");

    act(() => graph.props?.onNodeHover(null, null));

    expect(tooltip.style.display).toBe("none");
  });

  it("opens a Helm release on its route when its node is clicked", async () => {
    host.stores.secrets.items.replace([
      secret("sh.helm.release.v1.storefront.v1", "shop", "helm.sh/release.v1", { name: "storefront" }),
    ]);
    render(<KubeForceChart />);
    await waitFor(() => expect(drawnIds()).toContain("HelmRelease/shop/storefront"));
    const release = graph.props?.graphData.nodes.find((node) => node.kind === "HelmRelease");

    act(() => release && graph.props?.onNodeClick(release, new MouseEvent("click")));

    expect(Renderer.Navigation.navigate).toHaveBeenCalledWith("/helm/releases/shop/storefront");
  });

  it("watches each store once under React.StrictMode, and stops every watch when it unmounts", async () => {
    host.stores.pods.items.replace([pod("web-1", "shop")]);
    const { unmount } = render(
      <React.StrictMode>
        <KubeForceChart />
      </React.StrictMode>,
    );
    await waitFor(() => expect(drawnIds()).toEqual(["Pod/shop/web-1"]));

    expect(stores().map((store) => store.watches)).toEqual(stores().map(() => 1));

    unmount();

    expect(stores().map((store) => store.watches)).toEqual(stores().map(() => 0));
  });

  it("writes nothing and watches nothing for a load that comes back after the unmount", async () => {
    let release = () => {};
    host.stores.pods.pending = new Promise((resolve) => {
      release = () => resolve(undefined);
    });
    host.stores.pods.items.replace([pod("web-1", "shop")]);
    const { unmount } = render(<KubeForceChart />);
    await waitFor(() => expect(host.stores.pods.loads).toBe(1));

    unmount();
    release();
    await act(async () => {
      await host.stores.pods.pending;
    });

    expect(stores().map((store) => store.watches)).toEqual(stores().map(() => 0));
    expect(host.stores.deployments.loads).toBe(0);
    expect(graph.props).toBeUndefined();
  });

  it("neither loads nor watches nor draws a kind that the user cannot list", async () => {
    host.listable.delete("secrets");
    host.stores.pods.items.replace([pod("web-1", "shop")]);
    host.stores.secrets.items.replace([secret("db-credentials", "shop")]);
    render(<KubeForceChart />);
    await waitFor(() => expect(drawnIds()).toEqual(["Pod/shop/web-1"]));

    expect(host.stores.secrets.loads).toBe(0);
    expect(host.stores.secrets.watches).toBe(0);
    expect(host.stores.pods.watches).toBe(1);
  });

  it("logs a list that fails as a warning, and draws the other kinds", async () => {
    host.stores.secrets.pending = Promise.resolve(new Error("Failed to load api/v1/secrets"));
    host.stores.pods.items.replace([pod("web-1", "shop")]);
    render(<KubeForceChart />);
    await waitFor(() => expect(drawnIds()).toEqual(["Pod/shop/web-1"]));

    expect(Common.logger.warn).toHaveBeenCalledWith(
      "[@freelensapp/resource-map-extension]: cannot list the Secret objects",
      new Error("Failed to load api/v1/secrets"),
    );
    expect(Common.logger.error).not.toHaveBeenCalled();
  });

  it("sets its forces on the graph once the graph has mounted", async () => {
    host.stores.pods.items.replace([pod("web-1", "shop")]);
    render(<KubeForceChart />);
    await waitFor(() => expect(drawnIds()).toEqual(["Pod/shop/web-1"]));

    expect(graph.methods.d3Force).toHaveBeenCalledWith("charge", expect.any(Function));
    expect(graph.methods.d3Force).toHaveBeenCalledWith("collide", expect.any(Function));
    expect(graph.methods.d3Force).toHaveBeenCalledWith("center", expect.any(Function));
  });

  it("marks itself settled, with the points of its nodes, when the graph stops, and not when its data changes", async () => {
    host.stores.pods.items.replace([pod("web-1", "shop")]);
    const { container } = render(<KubeForceChart />);
    await waitFor(() => expect(drawnIds()).toEqual(["Pod/shop/web-1"]));
    const map = () => container.querySelector("[data-settled]");
    expect(map()).toBeNull();

    act(() => graph.props?.onEngineStop());

    expect(map()).not.toBeNull();
    const item = screen.getByTestId("resource-map-nodes").querySelector("li");
    expect(item?.dataset).toMatchObject({ kind: "Pod", namespace: "shop", name: "web-1", x: "400", y: "300" });

    act(() => {
      runInAction(() => host.stores.pods.items.push(pod("web-2", "shop")));
    });

    expect(map()).toBeNull();
    expect(screen.getByTestId("resource-map-nodes").children).toHaveLength(0);
  });
});
