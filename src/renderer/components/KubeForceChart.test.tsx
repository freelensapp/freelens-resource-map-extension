// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from "@testing-library/react";
import { compareShallow, observable, reaction, runInAction } from "mobx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pod } from "../../../test/kube-objects";
import { KubeForceChart } from "./KubeForceChart";

import type { Renderer } from "@freelensapp/extensions";

import type { IObservableArray } from "mobx";

import type { ChartDataSeries, LinkObject } from "./helpers/types";

type KubeObject = Renderer.K8sApi.KubeObject;

interface FakeStore {
  api: { kind: string };
  items: IObservableArray<KubeObject>;
  loadAll(): Promise<KubeObject[]>;
  subscribe(): () => void;
  getChildPods(): Renderer.K8sApi.Pod[];
}

// jsdom has no canvas: the graph is replaced by a component that keeps the
// data the map hands to it.
const graph = vi.hoisted(() => ({ data: undefined as { nodes: ChartDataSeries[]; links: LinkObject[] } | undefined }));
vi.mock("react-force-graph-2d", () => ({
  default: (props: { graphData: typeof graph.data }) => {
    graph.data = props.graphData;
    return <canvas />;
  },
}));

// The host's stores, as observable arrays, and its namespace store, whose
// onContextChange is a reaction to the selection as in the host.
const host = vi.hoisted(() => ({
  stores: {} as Record<string, FakeStore>,
  namespaceStore: {} as object,
}));
vi.mock("./helpers/stores", () => ({
  getMapStores: () => host.stores,
  getNamespaceStore: () => host.namespaceStore,
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
  host.stores = Object.fromEntries(
    Object.entries(kinds).map(([key, kind]) => {
      const items = observable.array<KubeObject>([], { deep: false });
      const store: FakeStore = {
        api: { kind },
        items,
        loadAll: async () => items.slice(),
        subscribe: () => () => {},
        getChildPods: () => [],
      };
      return [key, store];
    }),
  );
  selection = observable.array(["shop"]);
  host.namespaceStore = {
    onContextChange: (callback: (namespaces: string[]) => void, opts: { fireImmediately?: boolean } = {}) =>
      reaction(() => selection.slice(), callback, { fireImmediately: opts.fireImmediately, equals: compareShallow }),
  };
  graph.data = undefined;
});

afterEach(() => {
  cleanup();
});

const drawnIds = () => graph.data?.nodes.map((node) => node.id).sort();

describe("KubeForceChart", () => {
  it("draws the selected namespaces when a store changes, and nothing of the others", async () => {
    host.stores.pods.items.replace([pod("web-1", "shop"), pod("ledger-1", "billing")]);
    render(<KubeForceChart />);
    await waitFor(() => expect(drawnIds()).toEqual(["Pod-web-1"]));

    act(() => {
      runInAction(() => host.stores.pods.items.push(pod("web-2", "shop")));
    });

    expect(drawnIds()).toEqual(["Pod-web-1", "Pod-web-2"]);
  });

  it("draws the namespaces of a new selection", async () => {
    host.stores.pods.items.replace([pod("web-1", "shop"), pod("ledger-1", "billing")]);
    render(<KubeForceChart />);
    await waitFor(() => expect(drawnIds()).toEqual(["Pod-web-1"]));

    act(() => {
      selection.replace(["billing"]);
    });

    await waitFor(() => expect(drawnIds()).toEqual(["Pod-ledger-1"]));
  });
});
