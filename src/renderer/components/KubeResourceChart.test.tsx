// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { observable } from "mobx";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pod } from "../../../test/kube-objects";
import { KubePodChart } from "./KubePodChart";

import type { Renderer } from "@freelensapp/extensions";

import type { IObservableArray } from "mobx";

import type { ChartDataSeries, LinkObject } from "./helpers/types";

type KubeObject = Renderer.K8sApi.KubeObject;

// A store of the host, as far as a details map uses it: whether it has
// loaded, its items, its loads, and the subscriptions and watches it got. As
// in the host, the function a subscription returns aborts its controller.
interface FakeStore {
  api: { kind: string };
  items: IObservableArray<KubeObject>;
  isLoaded: boolean;
  loads: number;
  subscriptions: number;
  watches: number;
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
      store.isLoaded = true;
      return store.items.slice();
    },
    subscribe(params) {
      const controller = params?.abortController ?? new AbortController();
      if (controller.signal.aborted) return () => {};
      store.subscriptions++;
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
}

// jsdom has no canvas: the graph keeps the props the map hands to it.
const graph = vi.hoisted(() => ({ props: undefined as GraphProps | undefined }));
vi.mock("react-force-graph-2d", () => ({
  default: (props: GraphProps) => {
    graph.props = props;
    return <canvas />;
  },
}));

const host = vi.hoisted(() => ({ stores: {} as Record<string, FakeStore> }));
vi.mock("./helpers/stores", () => ({
  getMapStores: () => host.stores,
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
  vi.stubGlobal("ResizeObserver", NoResizeObserver);
  host.stores = Object.fromEntries(Object.entries(kinds).map(([key, kind]) => [key, fakeStore(kind)]));
  graph.props = undefined;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const stores = () => Object.values(host.stores);

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
});
