// @vitest-environment jsdom

import { Common } from "@freelensapp/extensions";
import { cleanup, render, waitFor } from "@testing-library/react";
import { observable } from "mobx";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deployment, kubeObject, pod } from "../../../test/kube-objects";
import { KubeControllerChart } from "./KubeControllerChart";
import { KubePodChart } from "./KubePodChart";
import { KubeServiceChart } from "./KubeServiceChart";

import type { Renderer } from "@freelensapp/extensions";

import type { IObservableArray } from "mobx";

import type { ChartDataSeries, LinkObject } from "./helpers/types";

type KubeObject = Renderer.K8sApi.KubeObject;

// A store of the host, as far as a details map uses it: whether it has
// loaded, its items, its loads, and the subscriptions and watches it got. As
// in the host, the function a subscription returns aborts its controller.
// With `objects`, the objects of its kind in the cluster, a load puts those of
// the namespaces of the filter in place of what it holds there, as the host's
// loadAll does; without, a load leaves the items as they are.
interface FakeStore {
  api: { kind: string };
  items: IObservableArray<KubeObject>;
  objects?: KubeObject[];
  isLoaded: boolean;
  loads: number;
  subscriptions: number;
  watches: number;
  // The handler of a failed list that the last watch got, which the host calls when a watch lists again.
  watchFailure?: (error: unknown) => void;
  loadAll(params?: Renderer.K8sApi.KubeObjectStoreLoadAllParams): Promise<KubeObject[] | undefined>;
  subscribe(params?: Renderer.K8sApi.KubeObjectStoreSubscribeParams): () => void;
  getChildPods(): Renderer.K8sApi.Pod[];
}

function fakeStore(kind: string): FakeStore {
  const store: FakeStore = {
    api: { kind },
    items: observable.array<KubeObject>([], { deep: false }),
    isLoaded: false,
    loads: 0,
    subscriptions: 0,
    watches: 0,
    async loadAll(params) {
      store.loads++;
      if (params?.reqInit?.signal?.aborted) return undefined;
      if (store.objects) {
        const selected = (object: KubeObject) =>
          host.selected.length === 0 || host.selected.includes(object.getNs() ?? "");
        store.items.replace([...store.items.filter((item) => !selected(item)), ...store.objects.filter(selected)]);
      }
      store.isLoaded = true;
      return store.items.slice();
    },
    subscribe(params) {
      const controller = params?.abortController ?? new AbortController();
      if (controller.signal.aborted) return () => {};
      store.watchFailure = params?.onLoadFailure;
      store.subscriptions++;
      store.watches++;
      controller.signal.addEventListener("abort", () => store.watches--, { once: true });
      return () => controller.abort();
    },
    getChildPods: () => [],
  };
  return store;
}

// An API of the host, as far as a details map uses it: its kind, and the list
// of the objects of one namespace among those it is given. It keeps the
// namespace and the signal of every list.
interface FakeApi {
  kind: string;
  objects: KubeObject[];
  lists: string[];
  signals: AbortSignal[];
  list(options?: Renderer.K8sApi.KubeApiListOptions): Promise<KubeObject[] | null>;
}

function fakeApi(kind: string): FakeApi {
  const api: FakeApi = {
    kind,
    objects: [],
    lists: [],
    signals: [],
    async list(options) {
      api.lists.push(options?.namespace ?? "");
      if (options?.reqInit?.signal) api.signals.push(options.reqInit.signal);
      return api.objects.filter((object) => object.getNs() === options?.namespace);
    },
  };
  return api;
}

interface GraphProps {
  graphData: { nodes: ChartDataSeries[]; links: LinkObject[] };
}

// jsdom has no canvas: the graph keeps the props the map hands to it.
const graph = vi.hoisted(() => ({ props: undefined as GraphProps | undefined }));
vi.mock("react-force-graph-2d", () => ({
  default: (props: GraphProps) => {
    graph.props = props;
    return <canvas />;
  },
}));

const host = vi.hoisted(() => ({
  stores: {} as Record<string, FakeStore>,
  apis: {} as Record<string, FakeApi>,
  // The namespaces that the filter selects; selecting none selects them all.
  selected: [] as string[],
}));
vi.mock("./helpers/stores", () => ({
  getMapStores: () => host.stores,
  getMapApis: () => host.apis,
  getNamespaceStore: () => ({
    areAllSelectedImplicitly: host.selected.length === 0,
    hasContext: (namespace: string) => host.selected.includes(namespace),
  }),
  canListMapStore: () => true,
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

// jsdom has no ResizeObserver; the size of the map does not matter here.
class NoResizeObserver {
  observe() {}
  disconnect() {}
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("ResizeObserver", NoResizeObserver);
  host.stores = Object.fromEntries(Object.entries(kinds).map(([key, kind]) => [key, fakeStore(kind)]));
  host.apis = Object.fromEntries(Object.entries(kinds).map(([key, kind]) => [key, fakeApi(kind)]));
  host.selected = [];
  graph.props = undefined;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const stores = () => Object.values(host.stores);
const apis = () => Object.values(host.apis);
const linkIds = () =>
  graph.props?.graphData.links
    .map((link) => `${(link.source as ChartDataSeries).id} -> ${(link.target as ChartDataSeries).id}`)
    .sort();

describe("KubeResourceChart", () => {
  it.each([
    ["have loaded already", true],
    ["load with the map", false],
  ])(
    "watches each store once under React.StrictMode when the stores %s, and none after the unmount",
    async (_case, loaded) => {
      const web1 = pod("web-1", "shop");
      host.stores.pods.items.replace([web1]);
      for (const store of stores()) store.isLoaded = loaded;

      const { unmount } = render(
        <React.StrictMode>
          <KubePodChart object={web1} />
        </React.StrictMode>,
      );
      await waitFor(() => expect(graph.props?.graphData.nodes.map((node) => node.id)).toEqual(["Pod/shop/web-1"]));

      expect(stores().map((store) => store.subscriptions)).toEqual(stores().map(() => 1));
      expect(stores().map((store) => store.watches)).toEqual(stores().map(() => 1));

      unmount();

      expect(stores().map((store) => store.watches)).toEqual(stores().map(() => 0));
    },
  );

  it("loads again a store that has loaded for an earlier selection, and draws the objects of the namespace selected since", async () => {
    // The stores loaded shop, then the filter moved to billing while no view of the host followed them.
    host.selected = ["billing"];
    const webPod = (namespace: string) => pod(`web-${namespace}`, namespace, { labels: { app: "web" } });
    const webService = (namespace: string) =>
      kubeObject<Renderer.K8sApi.Service>(
        "Service",
        { name: "web", namespace },
        { spec: { selector: { app: "web" } } },
      );
    const loadedFor = {
      pods: webPod,
      deployments: (ns: string) => deployment("web", ns, { app: "web" }),
      services: webService,
    };
    for (const [key, make] of Object.entries(loadedFor)) {
      const store = host.stores[key];
      store.items.replace([make("shop")]);
      store.objects = [make("shop"), make("billing")];
    }
    for (const store of stores()) store.isLoaded = true;

    render(<KubePodChart object={webPod("billing")} />);

    await waitFor(() =>
      expect(linkIds()).toEqual([
        "Deployment/billing/web -> Pod/billing/web-billing",
        "Pod/billing/web-billing -> Service/billing/web",
      ]),
    );
    expect(stores().map((store) => store.loads)).toEqual(stores().map(() => 1));
    expect(apis().flatMap((api) => api.lists)).toEqual([]);
  });

  it("logs a list that a watch sends again and that fails as a warning", async () => {
    const web1 = pod("web-1", "shop");
    host.stores.pods.items.replace([web1]);
    render(<KubePodChart object={web1} />);
    await waitFor(() => expect(graph.props?.graphData.nodes.map((node) => node.id)).toEqual(["Pod/shop/web-1"]));

    host.stores.configMaps.watchFailure?.(new Error("Failed to load api/v1/configmaps"));

    expect(Common.logger.warn).toHaveBeenCalledWith(
      "[@freelensapp/resource-map-extension]: cannot list the ConfigMap objects",
      new Error("Failed to load api/v1/configmaps"),
    );
  });

  it("builds the map again for a new instance of its object", async () => {
    const before = pod("web-1", "shop", { labels: { app: "web" } });
    host.stores.pods.items.replace([before]);
    host.stores.services.items.replace([
      kubeObject("Service", { name: "web", namespace: "shop" }, { spec: { selector: { app: "web" } } }),
    ]);
    const { rerender } = render(<KubePodChart object={before} />);
    await waitFor(() => expect(linkIds()).toEqual(["Pod/shop/web-1 -> Service/shop/web"]));

    rerender(<KubePodChart object={pod("web-1", "shop", { labels: { app: "api" } })} />);

    expect(linkIds()).toEqual([]);
  });

  describe("for an object of a namespace that the stores do not load", () => {
    const stock = () => deployment("stock", "inventory", { app: "stock" });
    const stockLinks = [
      "Deployment/inventory/stock -> Pod/inventory/stock-1",
      "Pod/inventory/stock-1 -> Service/inventory/stock",
    ];

    const stockService = () =>
      kubeObject<Renderer.K8sApi.Service>(
        "Service",
        { name: "stock", namespace: "inventory" },
        { spec: { selector: { app: "stock" } } },
      );

    beforeEach(() => {
      host.selected = ["shop"];
      host.apis.deployments.objects = [stock()];
      host.apis.pods.objects = [pod("stock-1", "inventory", { labels: { app: "stock" } })];
      host.apis.services.objects = [stockService()];
    });

    it.each([
      ["have loaded already", true],
      ["load with the map", false],
    ])(
      "lists the namespace once under React.StrictMode when the stores %s, and draws its objects without adding them to the stores",
      async (_case, loaded) => {
        const object = stock();
        // The host puts the object of a panel that its stores do not hold in the store of its kind.
        host.stores.deployments.items.replace([object]);
        for (const store of stores()) store.isLoaded = loaded;

        render(
          <React.StrictMode>
            <KubeControllerChart object={object} />
          </React.StrictMode>,
        );
        await waitFor(() => expect(linkIds()).toEqual(stockLinks));

        expect(apis().map((api) => api.lists)).toEqual(apis().map(() => ["inventory"]));
        expect(stores().map((store) => store.loads)).toEqual(stores().map(() => 1));
        expect(stores().map((store) => store.items.slice())).toEqual(
          stores().map((store) => (store === host.stores.deployments ? [object] : [])),
        );
      },
    );

    it.each([
      ["selects it", ["shop", "inventory"]],
      ["selects none, and the stores load every namespace", []],
    ])("lists nothing when the filter %s", async (_case, selected) => {
      host.selected = selected;

      render(<KubeControllerChart object={stock()} />);
      await waitFor(() =>
        expect(graph.props?.graphData.nodes.map((node) => node.id)).toEqual(["Deployment/inventory/stock"]),
      );

      expect(apis().flatMap((api) => api.lists)).toEqual([]);
    });

    it("lists the namespace again for a new instance of its object, and draws what the list returns", async () => {
      const { rerender } = render(<KubeControllerChart object={stock()} />);
      await waitFor(() => expect(linkIds()).toEqual(stockLinks));
      host.apis.pods.objects.push(pod("stock-2", "inventory", { labels: { app: "stock" } }));

      rerender(<KubeControllerChart object={stock()} />);

      await waitFor(() =>
        expect(linkIds()).toEqual([
          "Deployment/inventory/stock -> Pod/inventory/stock-1",
          "Deployment/inventory/stock -> Pod/inventory/stock-2",
          "Pod/inventory/stock-1 -> Service/inventory/stock",
          "Pod/inventory/stock-2 -> Service/inventory/stock",
        ]),
      );
      expect(host.apis.pods.lists).toEqual(["inventory", "inventory"]);
    });

    it("draws the listed objects of the namespace in place of those that the stores still hold there", async () => {
      // Loaded for an earlier selection of the filter, and deleted since.
      host.stores.pods.items.replace([pod("stock-0", "inventory", { labels: { app: "stock" } })]);

      render(<KubeServiceChart object={stockService()} />);

      await waitFor(() => expect(linkIds()).toEqual(stockLinks));
    });

    it("logs a list that fails as a warning, and keeps for its kind what the store holds in the namespace", async () => {
      const forbidden = new Error("services is forbidden");
      host.apis.services.list = async () => {
        throw forbidden;
      };
      // Loaded for an earlier selection of the filter.
      host.stores.services.items.replace([stockService()]);

      render(<KubeControllerChart object={stock()} />);
      await waitFor(() => expect(linkIds()).toEqual(stockLinks));

      expect(Common.logger.warn).toHaveBeenCalledWith(
        "[@freelensapp/resource-map-extension]: cannot list the Service objects of the namespace inventory",
        forbidden,
      );
    });

    it("aborts a list that has not come back when it unmounts, and logs nothing", async () => {
      const { pods } = host.apis;
      pods.list = (options) => {
        const signal = options?.reqInit?.signal;
        pods.lists.push(options?.namespace ?? "");
        if (signal) pods.signals.push(signal);
        return new Promise((_resolve, reject) => signal?.addEventListener("abort", () => reject(signal.reason)));
      };
      const { unmount } = render(<KubeControllerChart object={stock()} />);
      await waitFor(() => expect(pods.lists).toEqual(["inventory"]));

      unmount();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(pods.signals.map((signal) => signal.aborted)).toEqual([true]);
      expect(Common.logger.warn).not.toHaveBeenCalled();
    });
  });
});
