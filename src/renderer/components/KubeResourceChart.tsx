import { Common, Renderer } from "@freelensapp/extensions";
import { compareStructural, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import React from "react";
import ForceGraph2D from "react-force-graph-2d";
import { config } from "./helpers/config";
import { ElementSize } from "./helpers/element-size";
import { applyMapForces, type GraphMethods, refWithSetter } from "./helpers/graph-methods";
import { getHelmReleasePath, helmReleaseKind } from "./helpers/helm";
import { sameGraph } from "./helpers/namespace-graph";
import { canListMapStore, getMapStores, type MapStores } from "./helpers/stores";
import { getCanvasColors } from "./helpers/theme-colors";
import styles from "./KubeForceChart.module.scss";
import { MapTooltip } from "./tooltips/map-tooltip";

import type { DetailsGraph, DetailsGraphObjects } from "./helpers/details-graph";
import type { ChartDataSeries, LinkObject } from "./helpers/types";

type KubeObject = Renderer.K8sApi.KubeObject;

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
  readonly isLoaded: boolean;
  readonly api: { readonly kind: string };
  loadAll(params?: Renderer.K8sApi.KubeObjectStoreLoadAllParams): Promise<unknown>;
  subscribe(params?: Renderer.K8sApi.KubeObjectStoreSubscribeParams): () => void;
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
 * namespace, from the host's stores. Each subclass names the class of the
 * object that its registration draws, and builds its map with the builder of
 * `helpers/details-graph.ts` for that kind.
 */
@observer
export class KubeResourceChart<K extends KubeObject = KubeObject> extends React.Component<
  KubeResourceChartProps<K>,
  State
> {
  @observable accessor isReady = false;

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
  private watchDisposers: (() => void)[] = [];
  private disposers: (() => void)[] = [];

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
    if (prevProps.object.getId() !== this.props.object.getId()) {
      this.displayChart();
    } else {
      this.refreshChart();
    }
  }

  componentWillUnmount() {
    this.stopLoading();
    this.disposers.forEach((disposer) => disposer());
    this.disposers.length = 0;
    this.nodes = [];
    this.links = [];
  }

  /**
   * Loads, one after the other, the stores that have not loaded yet, and
   * watches every store, with one abort controller for the loads and the
   * watches: the unmount aborts it, and a load that comes back aborted writes
   * nothing. A list that fails reaches `onLoadFailure` and is logged as a
   * warning, and the map draws the rest.
   */
  private async load() {
    this.stopLoading();
    const controller = new AbortController();
    this.loading = controller;
    for (const key of this.listable) {
      const store: MapStore = this.stores[key];
      if (!store.isLoaded) {
        await store.loadAll({
          reqInit: { signal: controller.signal },
          onLoadFailure: (error) => {
            Common.logger.warn(`${logPrefix}: cannot list the ${store.api.kind} objects`, error);
          },
        });
        if (controller.signal.aborted) return;
      }
      this.watchDisposers.push(store.subscribe({ abortController: controller }));
    }
    runInAction(() => {
      this.isReady = true;
    });
    this.displayChart();
  }

  private stopLoading() {
    this.loading?.abort();
    this.loading = undefined;
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
      this.setState({
        data: graph,
        highlightLinks: new Set<LinkObject>(),
      });
    }
  };

  /** The nodes and the links of the map; a subclass builds them for its kind, and this class draws none. */
  protected buildGraph(_objects: DetailsGraphObjects, _previous: DetailsGraph): DetailsGraph {
    return { nodes: [], links: [] };
  }

  // The items of a store, or none for a kind that the user cannot list.
  private itemsOf<S extends keyof MapStores>(key: S): MapStores[S]["items"] | [] {
    return this.listable.has(key) ? this.stores[key].items : [];
  }

  private mapObjects(): DetailsGraphObjects {
    const { stores } = this;
    return {
      pods: this.itemsOf("pods"),
      deployments: this.itemsOf("deployments"),
      statefulSets: this.itemsOf("statefulSets"),
      daemonSets: this.itemsOf("daemonSets"),
      services: this.itemsOf("services"),
      ingresses: this.itemsOf("ingresses"),
      pvcs: this.itemsOf("pvcs"),
      configMaps: this.itemsOf("configMaps"),
      secrets: this.itemsOf("secrets"),
      childPods: (controller) => {
        if (controller instanceof Renderer.K8sApi.Deployment) return stores.deployments.getChildPods(controller);
        if (controller instanceof Renderer.K8sApi.StatefulSet) return stores.statefulSets.getChildPods(controller);
        return stores.daemonSets.getChildPods(controller);
      },
    };
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
          onMouseMove={(event) => this.tooltip.current?.follow(event)}
        >
          <MapTooltip ref={this.tooltip} object={hoverNode?.object} />
          <ForceGraph2D
            graphData={this.state.data}
            ref={this.chartRef}
            width={this.size.width}
            height={this.size.height}
            autoPauseRedraw={false}
            maxZoom={1.2}
            cooldownTicks={200}
            onEngineStop={() => {
              if (!this.initZoomDone) {
                if (this.nodes.length > 10) {
                  this.chart?.zoomToFit(400);
                } else {
                  this.chart?.zoom(1.2);
                }
                this.initZoomDone = true;
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
