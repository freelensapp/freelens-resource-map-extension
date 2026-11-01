import { Common, Renderer } from "@freelensapp/extensions";
import { compareStructural, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import React from "react";
import ForceGraph2D from "react-force-graph-2d";
import { config } from "./helpers/config";
import { childPodsOf, type DetailsGraph, type DetailsGraphObjects } from "./helpers/details-graph";
import { ElementSize } from "./helpers/element-size";
import {
  applyMapForces,
  type GraphMethods,
  type NodePoint,
  nodePointsOf,
  refWithSetter,
} from "./helpers/graph-methods";
import { getHelmReleasePath, helmReleaseKind } from "./helpers/helm";
import { sameGraph } from "./helpers/namespace-graph";
import { canListMapStore, getMapApis, getMapStores, getNamespaceStore, type MapStores } from "./helpers/stores";
import { getCanvasColors } from "./helpers/theme-colors";
import styles from "./KubeForceChart.module.scss";
import { MapNodeList } from "./map-node-list";
import { MapTooltip } from "./tooltips/map-tooltip";

import type { ChartDataSeries, LinkObject } from "./helpers/types";

type KubeObject = Renderer.K8sApi.KubeObject;
type Controller = Renderer.K8sApi.Deployment | Renderer.K8sApi.StatefulSet | Renderer.K8sApi.DaemonSet;

export interface KubeResourceChartProps<K extends KubeObject = KubeObject> {
  /** The object of the details panel, of the class that the registration names. */
  object: K;
}

interface State {
  data: {
    nodes: ChartDataSeries[];
    links: LinkObject[];
  };
  highlightLinks: Set<LinkObject>;
  hoverNode?: ChartDataSeries;
}

/** What the map needs of a store of the host. */
interface MapStore {
  readonly api: { readonly kind: string };
  loadAll(params?: Renderer.K8sApi.KubeObjectStoreLoadAllParams): Promise<unknown>;
  subscribe(params?: Renderer.K8sApi.KubeObjectStoreSubscribeParams): () => void;
}

/** What the map needs of an API of the host: its kind, and the list of the objects of one namespace. */
interface MapApi<T extends KubeObject> {
  readonly kind: string;
  list(options?: Renderer.K8sApi.KubeApiListOptions): Promise<T[] | null>;
}

/** The objects of the kinds of the stores, as a details map lists them for a namespace; a kind whose list failed has none. */
type MapObjects = Partial<Omit<DetailsGraphObjects, "childPods">>;

// Whether the stores hold the objects of a namespace: a map loads them for the
// namespaces that the filter selects, and for all of them when it selects none.
function storesLoad(namespace: string) {
  const namespaceStore = getNamespaceStore();
  return namespaceStore.areAllSelectedImplicitly || namespaceStore.hasContext(namespace);
}

// The items of a store, where the listed objects of its kind, when its list
// came back, take the place of those the store holds in the listed namespace.
// The store does not watch that namespace: what it holds there is what a view
// loaded once, such as the object of a panel, or what the stores loaded for an
// earlier selection of the filter, which they keep when it changes.
function withListed<T extends KubeObject>(
  held: readonly T[],
  namespace: string,
  listed: readonly T[] | undefined,
): readonly T[] {
  if (!listed) return held;
  return [...held.filter((object) => object.getNs() !== namespace), ...listed];
}

// The store of the kind of the object of a panel: its changes, with those of
// the pods, build the map again.
const storeOfKind: Partial<Record<string, keyof MapStores>> = {
  Pod: "pods",
  Service: "services",
  Ingress: "ingresses",
  Deployment: "deployments",
  DaemonSet: "daemonSets",
  StatefulSet: "statefulSets",
};

const logPrefix = "[@freelensapp/resource-map-extension]";

/**
 * The map in the details panel of an object: the objects around it in its
 * namespace, from the host's stores, or listed by the map when the stores do
 * not load that namespace. Each subclass names the class of the object that
 * its registration draws, and builds its map with the builder of
 * `helpers/details-graph.ts` for that kind.
 */
@observer
export class KubeResourceChart<K extends KubeObject = KubeObject> extends React.Component<
  KubeResourceChartProps<K>,
  State
> {
  @observable accessor isReady = false;
  /** The graph has stopped moving and has its first zoom: its nodes stay where they are. */
  @observable accessor settled = false;
  @observable accessor nodePoints: readonly NodePoint[] = [];

  protected links: LinkObject[] = [];
  protected nodes: ChartDataSeries[] = [];
  protected initZoomDone = false;

  protected config = config;
  private chart?: GraphMethods;
  // The graph sets its methods in this ref when it mounts, so the forces go on
  // a simulation that exists.
  private readonly chartRef = refWithSetter<GraphMethods>((chart) => {
    this.chart = chart ?? undefined;
    if (chart) {
      applyMapForces(chart);
    }
  });
  private readonly tooltip = React.createRef<MapTooltip>();
  // The size of the container, which the graph takes.
  private readonly size = new ElementSize();
  private readonly followContainer = (element: HTMLDivElement | null) => this.size.follow(element);

  private readonly stores = getMapStores();
  private listable = new Set<keyof MapStores>();
  private loading?: AbortController;
  private listing?: AbortController;
  // The objects of the namespace of the object, listed when the stores do not load it.
  private listed?: { namespace: string; objects: MapObjects };
  private watchDisposers: (() => void)[] = [];
  private disposers: (() => void)[] = [];
  private settleTimer?: ReturnType<typeof setTimeout>;

  state: Readonly<State> = {
    data: {
      nodes: [],
      links: [],
    },
    highlightLinks: new Set<LinkObject>(),
  };

  constructor(props: KubeResourceChartProps<K>) {
    super(props);
    this.generateImages();
  }

  // Everything a mount starts, its next unmount stops: React.StrictMode, in
  // Freelens dev, mounts, unmounts and mounts again the same instance.
  componentDidMount() {
    const keys = Object.keys(this.stores) as (keyof MapStores)[];
    this.listable = new Set(keys.filter((key) => canListMapStore(key)));
    const followed = new Set<keyof MapStores>(["pods"]);
    const own = storeOfKind[this.props.object.kind];
    if (own) followed.add(own);

    this.disposers.push(
      ...[...followed]
        .filter((key) => this.listable.has(key))
        .map((key) =>
          reaction(
            () => this.stores[key].items.toJSON(),
            () => this.refreshChart(),
            { equals: compareStructural },
          ),
        ),
    );
    void this.load();
  }

  // mobx-react 10 does not let a reaction read this.props, so a new object of the host is handled here
  componentDidUpdate(prevProps: KubeResourceChartProps<K>) {
    if (prevProps.object === this.props.object) return;
    // A new object lists its namespace again, when the stores do not load it,
    // and the map is built again once the list is back.
    const listing = this.listNamespace();
    if (prevProps.object.getId() !== this.props.object.getId()) {
      this.displayChart();
    } else {
      this.refreshChart();
    }
    void listing.then((listed) => {
      if (listed && this.isReady) this.refreshChart();
    });
  }

  componentWillUnmount() {
    this.stopLoading();
    this.listed = undefined;
    this.disposers.forEach((disposer) => disposer());
    this.disposers.length = 0;
    clearTimeout(this.settleTimer);
    this.nodes = [];
    this.links = [];
  }

  /**
   * Loads the stores one after the other, for the namespaces of the filter,
   * as the page does, and watches each one, with one abort controller for the
   * loads and the watches: the unmount aborts it, and a load that comes back
   * aborted writes nothing. It loads a store that has loaded already too: a
   * store holds and watches the namespaces of its last load, and the host
   * loads it again for a new selection only while one of its own views
   * follows it, so a store loaded for an earlier selection would hold none of
   * the objects of a namespace selected since. A list that fails reaches
   * `onLoadFailure` and is logged as a warning, and the map draws the rest;
   * the watches get the same handler, for the list that a watch sends again
   * after a 410 Gone, which empties the shared store when it fails without one.
   * Meanwhile it lists the namespace of the object, when the filter does not
   * select it, and draws the map once both are done.
   */
  private async load() {
    this.stopLoading();
    const controller = new AbortController();
    this.loading = controller;
    // React.StrictMode unmounts the first mount at once: one turn first lets
    // that mount stop before it sends a request.
    await Promise.resolve();
    if (controller.signal.aborted) return;
    const listing = this.listNamespace();
    for (const key of this.listable) {
      const store: MapStore = this.stores[key];
      // A list that fails, the load's own or one that the watch sends again
      // after the API server answered 410 Gone, is logged as a warning.
      const onLoadFailure = (error: unknown) => {
        Common.logger.warn(`${logPrefix}: cannot list the ${store.api.kind} objects`, error);
      };
      await store.loadAll({ reqInit: { signal: controller.signal }, onLoadFailure });
      if (controller.signal.aborted) return;
      this.watchDisposers.push(store.subscribe({ abortController: controller, onLoadFailure }));
    }
    await listing;
    if (controller.signal.aborted) return;
    runInAction(() => {
      this.isReady = true;
    });
    this.displayChart();
  }

  /**
   * Lists the objects of the namespace of the object when the stores do not
   * load it: the filter selects other namespaces, and the panel shows an
   * object opened from elsewhere, such as a pod from the details of its node.
   * The objects are the map's own: the stores keep the namespaces of the
   * filter, as the host's views expect them, and no watch follows the listed
   * objects. Resolves to whether it listed them, and no newer listing, nor
   * the unmount, aborted it.
   */
  private async listNamespace(): Promise<boolean> {
    this.listing?.abort();
    this.listing = undefined;
    const namespace = this.props.object.getNs();
    if (!namespace || storesLoad(namespace)) {
      this.listed = undefined;
      return false;
    }
    const controller = new AbortController();
    this.listing = controller;
    const objects = await this.listObjects(namespace, controller.signal);
    if (controller.signal.aborted) return false;
    this.listing = undefined;
    this.listed = { namespace, objects };
    return true;
  }

  // The objects of every kind that the user may list, in one namespace, with
  // the host's APIs. A list that fails is logged as a warning, and the map
  // keeps what the store of its kind holds there.
  private async listObjects(namespace: string, signal: AbortSignal): Promise<MapObjects> {
    const apis = getMapApis();
    const list = async <T extends KubeObject>(key: keyof MapStores, api: MapApi<T>): Promise<T[] | undefined> => {
      if (!this.listable.has(key)) return undefined;
      try {
        return (await api.list({ namespace, reqInit: { signal } })) ?? [];
      } catch (error) {
        if (!signal.aborted) {
          Common.logger.warn(`${logPrefix}: cannot list the ${api.kind} objects of the namespace ${namespace}`, error);
        }
        return undefined;
      }
    };
    const [pods, deployments, statefulSets, daemonSets, services, ingresses, pvcs, configMaps, secrets] =
      await Promise.all([
        list("pods", apis.pods),
        list("deployments", apis.deployments),
        list("statefulSets", apis.statefulSets),
        list("daemonSets", apis.daemonSets),
        list("services", apis.services),
        list("ingresses", apis.ingresses),
        list("pvcs", apis.pvcs),
        list("configMaps", apis.configMaps),
        list("secrets", apis.secrets),
      ]);
    return { pods, deployments, statefulSets, daemonSets, services, ingresses, pvcs, configMaps, secrets };
  }

  private stopLoading() {
    this.loading?.abort();
    this.loading = undefined;
    this.listing?.abort();
    this.listing = undefined;
    this.watchDisposers.forEach((dispose) => dispose());
    this.watchDisposers.length = 0;
  }

  displayChart = () => {
    this.initZoomDone = false;
    this.nodes = [];
    this.links = [];
    this.generateChartDataSeries();
  };

  refreshChart = () => {
    this.generateChartDataSeries();
  };

  generateChartDataSeries = () => {
    const previous = { nodes: this.nodes, links: this.links };
    const graph = this.buildGraph(this.mapObjects(), previous);
    if (!previous.nodes.length || !sameGraph(graph, previous)) {
      this.nodes = graph.nodes;
      this.links = graph.links;
      this.unsettle();
      this.setState({
        data: graph,
        highlightLinks: new Set<LinkObject>(),
      });
    }
  };

  // The graph reached its first zoom and stopped: the points of its nodes, for
  // the hidden list, and the data-settled mark.
  private settle() {
    runInAction(() => {
      this.nodePoints = nodePointsOf(this.chart, this.nodes);
      this.settled = true;
    });
  }

  private unsettle() {
    clearTimeout(this.settleTimer);
    runInAction(() => {
      this.settled = false;
      this.nodePoints = [];
    });
  }

  /** The nodes and the links of the map; a subclass builds them for its kind, and this class draws none. */
  protected buildGraph(_objects: DetailsGraphObjects, _previous: DetailsGraph): DetailsGraph {
    return { nodes: [], links: [] };
  }

  // The items of a store, or none for a kind that the user cannot list.
  private itemsOf<S extends keyof MapStores>(key: S): MapStores[S]["items"] | [] {
    return this.listable.has(key) ? this.stores[key].items : [];
  }

  // The items of the stores, with the objects listed for the namespace of the
  // object. The builders look in that namespace only, so the objects of the
  // namespace of a previous object, until the list of the new one is back,
  // add nothing.
  private mapObjects(): DetailsGraphObjects {
    const { namespace = "", objects: listed = {} } = this.listed ?? {};
    const pods = withListed(this.itemsOf("pods"), namespace, listed.pods);
    return {
      pods,
      deployments: withListed(this.itemsOf("deployments"), namespace, listed.deployments),
      statefulSets: withListed(this.itemsOf("statefulSets"), namespace, listed.statefulSets),
      daemonSets: withListed(this.itemsOf("daemonSets"), namespace, listed.daemonSets),
      services: withListed(this.itemsOf("services"), namespace, listed.services),
      ingresses: withListed(this.itemsOf("ingresses"), namespace, listed.ingresses),
      pvcs: withListed(this.itemsOf("pvcs"), namespace, listed.pvcs),
      configMaps: withListed(this.itemsOf("configMaps"), namespace, listed.configMaps),
      secrets: withListed(this.itemsOf("secrets"), namespace, listed.secrets),
      // The stores' methods see the pods of the store alone: with listed pods,
      // those of a workload are found among the pods of the map in their way.
      childPods: (controller) => (listed.pods ? childPodsOf(controller, pods) : this.heldChildPods(controller)),
    };
  }

  // The pods of a workload among the items of the store of the pods, as the store of its kind finds them.
  private heldChildPods(controller: Controller) {
    const { stores } = this;
    if (controller instanceof Renderer.K8sApi.Deployment) return stores.deployments.getChildPods(controller);
    if (controller instanceof Renderer.K8sApi.StatefulSet) return stores.statefulSets.getChildPods(controller);
    return stores.daemonSets.getChildPods(controller);
  }

  getLinksForNode(node: ChartDataSeries): LinkObject[] {
    return this.links.filter(
      (link) => (link.source as ChartDataSeries).id == node.id || (link.target as ChartDataSeries).id == node.id,
    );
  }

  handleNodeHover(node: ChartDataSeries | null) {
    const highlightLinks = new Set<LinkObject>();
    if (node) {
      this.getLinksForNode(node).forEach((link) => highlightLinks.add(link));
    }
    this.setState({ highlightLinks, hoverNode: node ?? undefined });
  }

  generateImages() {
    Object.entries(this.config).forEach(([kind, configItem]) => {
      const img = new Image();
      img.src = configItem.icon ?? "";
      this.config[kind].img = img;
    });
  }

  render() {
    if (!this.isReady) {
      return <Renderer.Component.Spinner />;
    }

    const colors = getCanvasColors();
    const { hoverNode } = this.state;
    return (
      <>
        <Renderer.Component.DrawerTitle>Resources</Renderer.Component.DrawerTitle>
        <div
          ref={this.followContainer}
          className={`${styles.kubeForceChart} ${styles.details}`}
          data-settled={this.settled || undefined}
          onMouseMove={(event) => this.tooltip.current?.follow(event)}
        >
          <MapTooltip ref={this.tooltip} object={hoverNode?.object} />
          <MapNodeList points={this.nodePoints} />
          <ForceGraph2D
            graphData={this.state.data}
            ref={this.chartRef}
            width={this.size.width}
            height={this.size.height}
            autoPauseRedraw={false}
            maxZoom={1.2}
            cooldownTicks={200}
            onEngineStop={() => {
              if (this.initZoomDone) {
                this.settle();
              } else if (this.nodes.length > 10) {
                this.initZoomDone = true;
                this.chart?.zoomToFit(400);
                this.settleTimer = setTimeout(() => this.settle(), 400);
              } else {
                this.initZoomDone = true;
                this.chart?.zoom(1.2);
                this.settle();
              }
            }}
            linkWidth={(link) => (this.state.highlightLinks.has(link) ? 2 : 1)}
            onNodeHover={(node) => this.handleNodeHover(node)}
            onNodeDrag={(node) => this.handleNodeHover(node)}
            nodeVal="value"
            nodeLabel={() => ""}
            nodeVisibility={"visible"}
            linkColor={(link) => {
              return (link.source as ChartDataSeries).color ?? "";
            }}
            onNodeClick={(node) => {
              const { object } = node;
              if (object) {
                if (object.kind === helmReleaseKind) {
                  Renderer.Navigation.navigate(getHelmReleasePath(object));
                } else {
                  Renderer.Navigation.showDetails(object.selfLink);
                }
              }
            }}
            nodeCanvasObject={(node, ctx, globalScale) => {
              const padAmount = 0;
              const { name, value, color, image, object } = node;
              const label = name;
              const fontSize = 9;
              const x = node.x ?? 0;
              const y = node.y ?? 0;

              const r = Math.sqrt(Math.max(0, value || 10)) * 4 + padAmount;

              // draw outer circle
              if (object.getId() === this.props.object.getId()) {
                ctx.beginPath();
                ctx.lineWidth = 2;
                ctx.arc(x, y, r + 3, 0, 2 * Math.PI, false);
                ctx.strokeStyle = color ?? "";
                ctx.stroke();
                ctx.fillStyle = colors.background;
                ctx.fill();
                ctx.closePath();
              }

              // draw circle
              const size = hoverNode == node ? r + 1 : r;

              ctx.beginPath();
              ctx.arc(x, y, size, 0, 2 * Math.PI, false);
              ctx.fillStyle = color || "rgba(31, 120, 180, 0.92)";
              ctx.fill();

              // draw icon
              if (image) {
                try {
                  ctx.drawImage(image, x - 15, y - 15, 30, 30);
                } catch (error) {
                  Common.logger.error(`${logPrefix}: cannot draw the icon of ${node.kind}`, error);
                }
              }

              // draw label
              ctx.textAlign = "center";
              ctx.font = `${fontSize}px Arial`;
              ctx.textBaseline = "middle";
              ctx.fillStyle = colors.text;
              ctx.fillText(label, x, y + r + 10 / globalScale);
            }}
          />
        </div>
      </>
    );
  }
}
