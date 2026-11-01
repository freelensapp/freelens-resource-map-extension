// @vitest-environment jsdom

import { Common } from "@freelensapp/extensions";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { getObserverTree, observable, runInAction } from "mobx";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { boxOnCanvas, fakeFitMethods, nameBelowCircle } from "../../../test/canvas";
import { deployment, kubeObject, pod, secret } from "../../../test/kube-objects";
import { KubeControllerChart } from "./KubeControllerChart";
import { KubePodChart } from "./KubePodChart";
import { KubeServiceChart } from "./KubeServiceChart";

import type { Renderer } from "@freelensapp/extensions";

import type { IObservableArray } from "mobx";

import type { GraphBox } from "../../../test/canvas";
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
  width: number;
  height: number;
  onEngineStop(): void;
  nodeCanvasObject(node: ChartDataSeries, ctx: CanvasRenderingContext2D, globalScale: number): void;
  maxZoom: number;
  ref?: { current: unknown };
}

// jsdom has no canvas: the graph keeps the props the map hands to it, and puts
// methods that record their calls in its ref, as the graph does when it mounts.
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

const host = vi.hoisted(() => ({
  stores: {} as Record<string, FakeStore>,
  apis: {} as Record<string, FakeApi>,
  // The namespaces that the filter selects; selecting none selects them all.
  selected: [] as string[],
  // The kinds that the user may list.
  listable: new Set<string>(),
}));
vi.mock("./helpers/stores", () => ({
  getMapStores: () => host.stores,
  getMapApis: () => host.apis,
  getNamespaceStore: () => ({
    areAllSelectedImplicitly: host.selected.length === 0,
    hasContext: (namespace: string) => host.selected.includes(namespace),
  }),
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

// The box of the nodes that the graph gives, and the methods that fit the graph to its canvas.
let box: GraphBox;
let fit: ReturnType<typeof fakeFitMethods>;

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
  host.listable = new Set(Object.keys(kinds));
  const force = { strength: vi.fn(() => force), distance: vi.fn(() => force) };
  graph.props = undefined;
  box = { x: [-200, 200], y: [-100, 100] };
  fit = fakeFitMethods(
    () => box,
    () => ({ width: graph.props?.width ?? 0, height: graph.props?.height ?? 0 }),
  );
  graph.methods = {
    ...fit,
    d3Force: vi.fn(() => force),
    graph2ScreenCoords: vi.fn((x: number, y: number) => ({ x: x + 400, y: y + 200 })),
  };
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

  const fits: [string, number, GraphBox][] = [
    ["of more than ten nodes", 11, { x: [-300, 300], y: [-160, 160] }],
    ["of ten nodes or fewer, larger than the canvas at a zoom of 1.2", 1, { x: [-100, 100], y: [-250, 250] }],
    ["of ten nodes or fewer, smaller than the canvas", 1, { x: [-40, 40], y: [-30, 30] }],
  ];
  it.each(fits)(
    "fits to its canvas a map %s, the names below the nodes of the bottom row included",
    async (_case, count, nodesBox) => {
      let resize = (_width: number, _height: number) => {};
      vi.stubGlobal(
        "ResizeObserver",
        class {
          constructor(callback: ResizeObserverCallback) {
            resize = (width, height) =>
              callback([{ contentRect: { width, height } } as ResizeObserverEntry], this as unknown as ResizeObserver);
          }
          observe() {}
          disconnect() {}
        },
      );
      box = nodesBox;
      const web = webService();
      host.selected = ["shop"];
      host.stores.services.items.replace([web]);
      host.stores.pods.items.replace(
        Array.from({ length: count - 1 }, (_, index) => pod(`web-${index}`, "shop", { labels: { app: "web" } })),
      );
      render(<KubeServiceChart object={web} />);
      await waitFor(() => expect(graph.props?.graphData.nodes).toHaveLength(count));
      act(() => resize(800, 400));

      act(() => graph.props?.onEngineStop());

      const props = graph.props as GraphProps;
      const view = boxOnCanvas(fit, box, props);
      expect(view.zoom).toBeLessThanOrEqual(1.2);
      expect(view.left).toBeGreaterThanOrEqual(0);
      expect(view.right).toBeLessThanOrEqual(props.width);
      expect(view.top).toBeGreaterThanOrEqual(0);
      // The box holds the circles of the nodes: the name of a node of the bottom row reaches below it.
      const name = nameBelowCircle(props.nodeCanvasObject, props.graphData.nodes[0], view.zoom);
      expect(view.bottom + name).toBeLessThanOrEqual(props.height);
    },
  );

  it("takes the points of its nodes again when its container resizes, as the graph keeps the center of its view", async () => {
    let resize = (_width: number, _height: number) => {};
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          resize = (width, height) =>
            callback([{ contentRect: { width, height } } as ResizeObserverEntry], this as unknown as ResizeObserver);
        }
        observe() {}
        disconnect() {}
      },
    );
    const web1 = pod("web-1", "shop");
    host.stores.pods.items.replace([web1]);
    render(<KubePodChart object={web1} />);
    await waitFor(() => expect(graph.props?.graphData.nodes.map((node) => node.id)).toEqual(["Pod/shop/web-1"]));
    act(() => resize(800, 400));
    act(() => graph.props?.onEngineStop());
    const item = () => screen.getByTestId("resource-map-nodes").querySelector("li");
    expect(item()?.dataset).toMatchObject({ x: "400", y: "200" });

    // On a canvas 200 px narrower, the center of the view moves 100 px left.
    graph.methods.graph2ScreenCoords = vi.fn((x: number, y: number) => ({ x: x + 300, y: y + 200 }));
    act(() => resize(600, 400));

    expect(item()?.dataset).toMatchObject({ x: "300", y: "200" });
  });

  const webService = () =>
    kubeObject<Renderer.K8sApi.Service>(
      "Service",
      { name: "web", namespace: "shop" },
      { spec: { selector: { app: "web" } } },
    );

  it("builds the map again when a store that it follows replaces an object in its place, under React.StrictMode, and stops following it after the unmount", async () => {
    const service = webService();
    host.stores.services.items.replace([service]);
    host.stores.pods.items.replace([pod("web-1", "shop", { labels: { app: "web" } })]);
    const { unmount } = render(
      <React.StrictMode>
        <KubeServiceChart object={service} />
      </React.StrictMode>,
    );
    await waitFor(() => expect(linkIds()).toEqual(["Pod/shop/web-1 -> Service/shop/web"]));
    expect(getObserverTree(host.stores.pods.items).observers).toHaveLength(1);

    // The host replaces the object of a watch event where it is: the array keeps its length.
    act(() => runInAction(() => host.stores.pods.items.splice(0, 1, pod("web-1", "shop", { labels: { app: "api" } }))));

    expect(linkIds()).toEqual([]);

    unmount();

    expect(getObserverTree(host.stores.pods.items).observers ?? []).toHaveLength(0);
  });

  it("refreshes the node of an object that its store replaces with another status, and gives the graph no new data", async () => {
    const service = webService();
    host.stores.services.items.replace([service]);
    host.stores.pods.items.replace([pod("web-1", "shop", { labels: { app: "web" } })]);
    render(<KubeServiceChart object={service} />);
    await waitFor(() => expect(linkIds()).toEqual(["Pod/shop/web-1 -> Service/shop/web"]));
    const data = graph.props?.graphData;
    const failed = pod("web-1", "shop", { labels: { app: "web" }, status: "Failed" });

    act(() => runInAction(() => host.stores.pods.items.splice(0, 1, failed)));

    expect(graph.props?.graphData).toBe(data);
    const node = graph.props?.graphData.nodes.find((candidate) => candidate.id === "Pod/shop/web-1");
    expect(node?.object).toBe(failed);
    expect(node?.color).toBe("#ce3933");
  });

  describe("for a kind that the user cannot list", () => {
    const withCredentials = (name: string, namespace: string) =>
      pod(name, namespace, { volumes: [{ name: "credentials", secret: { secretName: "db-credentials" } }] });

    beforeEach(() => {
      host.listable.delete("secrets");
    });

    it("neither loads nor watches its store, and draws none of it", async () => {
      const web1 = withCredentials("web-1", "shop");
      host.stores.pods.items.replace([web1]);
      host.stores.secrets.items.replace([secret("db-credentials", "shop")]);

      render(<KubePodChart object={web1} />);

      await waitFor(() => expect(graph.props?.graphData.nodes.map((node) => node.id)).toEqual(["Pod/shop/web-1"]));
      expect(host.stores.secrets.loads).toBe(0);
      expect(host.stores.secrets.subscriptions).toBe(0);
      expect(host.stores.pods.subscriptions).toBe(1);
    });

    it("does not list it in a namespace that the filter does not select", async () => {
      host.selected = ["shop"];
      const stock1 = withCredentials("stock-1", "inventory");
      host.apis.pods.objects = [stock1];
      host.apis.secrets.objects = [secret("db-credentials", "inventory")];

      render(<KubePodChart object={stock1} />);

      await waitFor(() => expect(host.apis.pods.lists).toEqual(["inventory"]));
      await waitFor(() =>
        expect(graph.props?.graphData.nodes.map((node) => node.id)).toEqual(["Pod/inventory/stock-1"]),
      );
      expect(host.apis.secrets.lists).toEqual([]);
    });
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

    it("lists the namespace again, once, when a store that it follows changes there, and draws the change", async () => {
      // After the Nodes page, the pods store holds and watches the pods of every namespace.
      const stockPod = (name: string) => pod(name, "inventory", { labels: { app: "stock" } });
      host.stores.deployments.items.replace([stock()]);
      host.stores.pods.items.replace([stockPod("stock-1")]);
      render(<KubeControllerChart object={stock()} />);
      await waitFor(() => expect(linkIds()).toEqual(stockLinks));

      // A rollout replaces the pod, which the store follows, and so does the list.
      host.apis.pods.objects = [stockPod("stock-2")];
      host.stores.pods.items.replace([stockPod("stock-2")]);
      host.stores.pods.items.replace([stockPod("stock-2"), stockPod("stock-3")]);
      host.apis.pods.objects.push(stockPod("stock-3"));

      await waitFor(
        () =>
          expect(linkIds()).toEqual([
            "Deployment/inventory/stock -> Pod/inventory/stock-2",
            "Deployment/inventory/stock -> Pod/inventory/stock-3",
            "Pod/inventory/stock-2 -> Service/inventory/stock",
            "Pod/inventory/stock-3 -> Service/inventory/stock",
          ]),
        { timeout: 3000 },
      );
      expect(host.apis.pods.lists).toEqual(["inventory", "inventory"]);
    });

    it("keeps listing the namespace for a new instance of its object once the filter selects it", async () => {
      const { rerender } = render(<KubeControllerChart object={stock()} />);
      await waitFor(() => expect(linkIds()).toEqual(stockLinks));

      // The map loaded its stores for shop alone, and does not follow the selection.
      host.selected = ["shop", "inventory"];
      rerender(<KubeControllerChart object={stock()} />);

      await waitFor(() => expect(host.apis.services.lists).toEqual(["inventory", "inventory"]));
      await waitFor(() => expect(linkIds()).toEqual(stockLinks));
    });

    it("aborts the list of an earlier instance of its object, and draws the list of the newer one", async () => {
      const { pods } = host.apis;
      let first: (objects: KubeObject[]) => void = () => {};
      pods.list = (options) => {
        pods.lists.push(options?.namespace ?? "");
        if (options?.reqInit?.signal) pods.signals.push(options.reqInit.signal);
        // The first list comes back after the second, without minding its abort.
        if (pods.lists.length === 1) return new Promise((resolve) => (first = resolve));
        return Promise.resolve([pod("stock-2", "inventory", { labels: { app: "stock" } })]);
      };
      const { rerender } = render(<KubeControllerChart object={stock()} />);
      await waitFor(() => expect(pods.lists).toEqual(["inventory"]));

      rerender(<KubeControllerChart object={stock()} />);
      await waitFor(() => expect(pods.lists).toEqual(["inventory", "inventory"]));
      first([pod("stock-0", "inventory", { labels: { app: "stock" } })]);

      await waitFor(() =>
        expect(linkIds()).toEqual([
          "Deployment/inventory/stock -> Pod/inventory/stock-2",
          "Pod/inventory/stock-2 -> Service/inventory/stock",
        ]),
      );
      expect(pods.signals.map((signal) => signal.aborted)).toEqual([true, false]);
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
