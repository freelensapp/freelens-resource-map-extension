import { Common, Renderer } from "@freelensapp/extensions";
import { compareStructural, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import React from "react";
import ForceGraph2D from "react-force-graph-2d";
import { config } from "./helpers/config";
import { ElementSize } from "./helpers/element-size";
import { applyMapForces, type GraphMethods, refWithSetter } from "./helpers/graph-methods";
import { getHelmReleasePath, helmReleaseKind } from "./helpers/helm";
import { buildNamespaceGraph, type NamespaceGraphObjects, sameGraph } from "./helpers/namespace-graph";
import { canListMapStore, getMapStores, getNamespaceStore, type MapStores } from "./helpers/stores";
import { getCanvasColors } from "./helpers/theme-colors";
import styles from "./KubeForceChart.module.scss";
import { MapTooltip } from "./tooltips/map-tooltip";

import type { ChartDataSeries, LinkObject } from "./helpers/types";

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
  readonly items: readonly Renderer.K8sApi.KubeObject[];
  loadAll(
    params?: Renderer.K8sApi.KubeObjectStoreLoadAllParams,
  ): Promise<readonly Renderer.K8sApi.KubeObject[] | undefined>;
  subscribe(params?: Renderer.K8sApi.KubeObjectStoreSubscribeParams): () => void;
}

/** A node drawn on the canvas, at the point of the canvas where it settled. */
interface NodePoint {
  id: string;
  kind: string;
  namespace?: string;
  name: string;
  x: number;
  y: number;
}

const logPrefix = "[@freelensapp/resource-map-extension]";

const pick = ({ id, kind, namespace, name }: ChartDataSeries) => ({ id, kind, namespace, name });

@observer
export class KubeForceChart extends React.Component<object, State> {
  @observable accessor isReady = false;
  @observable accessor noResourcesFound = false;
  /** The graph has stopped moving and has its first zoom: its nodes stay where they are. */
  @observable accessor settled = false;
  @observable accessor nodePoints: readonly NodePoint[] = [];

  static config = config;

  protected links: LinkObject[] = [];
  protected nodes: ChartDataSeries[] = [];

  protected config = KubeForceChart.config;
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

  private readonly namespaceStore = getNamespaceStore();
  private readonly stores = getMapStores();

  private listable = new Set<keyof MapStores>();
  // The selection of the filter, which the one reaction of the view keeps.
  private namespaces?: string[];
  private kubeObjectStores: MapStore[] = [];
  private loading?: AbortController;
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

  initZoomDone = false;

  constructor(props: object) {
    super(props);
    this.generateImages();
  }

  // Everything a mount starts, its next unmount stops: React.StrictMode, in
  // Freelens dev, mounts, unmounts and mounts again the same instance.
  componentDidMount() {
    const keys = Object.keys(this.stores) as (keyof MapStores)[];
    this.listable = new Set(keys.filter((key) => canListMapStore(key)));
    const listed = [...this.listable].map((key) => this.stores[key]);
    this.kubeObjectStores = listed;

    this.disposers.push(
      this.namespaceStore.onContextChange(
        (namespaces) => {
          const changed = this.namespaces !== undefined;
          this.namespaces = namespaces;
          if (changed) {
            this.namespaceChanged();
          }
        },
        { fireImmediately: true },
      ),
      ...listed.map((store) =>
        reaction(
          () => store.items.toJSON(),
          () => this.generateChartDataSeries(),
          { equals: compareStructural },
        ),
      ),
    );
    void this.load();
  }

  componentWillUnmount() {
    this.stopLoading();
    this.disposers.forEach((dispose) => dispose());
    this.disposers.length = 0;
    this.namespaces = undefined;
    clearTimeout(this.settleTimer);
  }

  namespaceChanged = () => {
    this.isReady = false;
    void this.load();
  };

  displayChart = () => {
    this.nodes = [];
    this.links = [];
    this.initZoomDone = false;
    this.generateChartDataSeries();
  };

  getLinksForNode(node: ChartDataSeries): LinkObject[] {
    return this.links.filter((link) => link.source == node || link.target == node);
  }

  handleNodeHover(node: ChartDataSeries | null) {
    const highlightLinks = new Set<LinkObject>();
    if (node) {
      this.getLinksForNode(node).forEach((link) => highlightLinks.add(link));
    }
    this.setState({ highlightLinks: highlightLinks, hoverNode: node ?? undefined });
  }

  generateImages() {
    Object.entries(this.config).forEach(([kind, configItem]) => {
      const img = new Image();
      img.src = configItem.icon ?? "";
      this.config[kind].img = img;
    });
  }

  /**
   * Loads the stores one after the other and watches each one, with one abort
   * controller for the loads and the watches: a new load or the unmount aborts
   * it, and a load that comes back aborted writes nothing. The host takes an
   * aborted load for no failure; a list that fails reaches `onLoadFailure` and
   * is logged as a warning, and the map draws the rest.
   */
  private async load() {
    this.stopLoading();
    const controller = new AbortController();
    this.loading = controller;
    let totalItems = 0;
    for (const store of this.kubeObjectStores) {
      const items = await store.loadAll({
        reqInit: { signal: controller.signal },
        onLoadFailure: (error) => {
          Common.logger.warn(`${logPrefix}: cannot list the ${store.api.kind} objects`, error);
        },
      });
      if (controller.signal.aborted) return;
      if (store.api.kind !== "ConfigMap") {
        totalItems += items?.length ?? 0;
      }
      this.watchDisposers.push(store.subscribe({ abortController: controller }));
    }
    runInAction(() => {
      this.noResourcesFound = totalItems === 0;
      this.isReady = true;
    });
    this.displayChart();
  }

  private stopLoading() {
    this.loading?.abort();
    this.loading = undefined;
    this.unsubscribeStores();
  }

  generateChartDataSeries = () => {
    const previous = { nodes: this.nodes, links: this.links };
    const graph = buildNamespaceGraph(this.mapObjects(), this.namespaces ?? [], previous);
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
    const { chart } = this;
    runInAction(() => {
      this.nodePoints = this.nodes.map((node) => {
        const point = chart?.graph2ScreenCoords(node.x ?? 0, node.y ?? 0) ?? { x: 0, y: 0 };
        return { ...pick(node), x: Math.round(point.x), y: Math.round(point.y) };
      });
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

  // The items of a store, or none for a kind that the user cannot list.
  private itemsOf<K extends keyof MapStores>(key: K): MapStores[K]["items"] | [] {
    return this.listable.has(key) ? this.stores[key].items : [];
  }

  private mapObjects(): NamespaceGraphObjects {
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

  protected unsubscribeStores() {
    this.watchDisposers.forEach((dispose) => dispose());
    this.watchDisposers.length = 0;
  }

  render() {
    if (!this.isReady) {
      return (
        <div className={styles.status}>
          <Renderer.Component.Spinner />
        </div>
      );
    }

    if (this.noResourcesFound) {
      return (
        <div className={styles.status}>
          <h3 className={styles.noResources}>No visualizable resources found in this namespace.</h3>
        </div>
      );
    }

    const colors = getCanvasColors();

    const { hoverNode } = this.state;

    return (
      <div
        ref={this.followContainer}
        className={styles.kubeForceChart}
        data-settled={this.settled || undefined}
        onMouseMove={(event) => this.tooltip.current?.follow(event)}
      >
        <MapTooltip ref={this.tooltip} object={hoverNode?.object} />
        <ul className={styles.nodeList} data-testid="resource-map-nodes" aria-label="Resources on the map">
          {this.nodePoints.map((point) => (
            <li
              key={point.id}
              data-kind={point.kind}
              data-namespace={point.namespace}
              data-name={point.name}
              data-x={point.x}
              data-y={point.y}
            >
              {point.kind} {point.namespace ? `${point.namespace}/` : ""}
              {point.name}
            </li>
          ))}
        </ul>

        <ForceGraph2D
          graphData={this.state.data}
          ref={this.chartRef}
          width={this.size.width}
          height={this.size.height}
          autoPauseRedraw={false}
          linkWidth={(link) => (this.state.highlightLinks.has(link) ? 2 : 1)}
          maxZoom={2}
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
          onNodeHover={(node) => this.handleNodeHover(node)}
          onNodeDrag={(node) => this.handleNodeHover(node)}
          nodeVal="value"
          nodeLabel={() => ""}
          nodeVisibility={"visible"}
          linkColor={(link) => {
            return (link.source as ChartDataSeries).color ?? "";
          }}
          onNodeClick={(node) => {
            if (node.object) {
              if (node.object.kind === helmReleaseKind) {
                Renderer.Navigation.navigate(getHelmReleasePath(node.object));
              } else {
                Renderer.Navigation.showDetails(node.object.selfLink);
              }
            }
          }}
          nodeCanvasObject={(node, ctx, globalScale) => {
            const padAmount = 0;
            const label = node.name;
            const fontSize = 8;
            const x = node.x ?? 0;
            const y = node.y ?? 0;

            const r = Math.sqrt(Math.max(0, node.value || 10)) * 4 + padAmount;

            // draw outer circle
            if (["Deployment", "DaemonSet", "StatefulSet"].includes(node.kind)) {
              ctx.beginPath();
              ctx.lineWidth = 2;
              ctx.arc(x, y, r + 3, 0, 2 * Math.PI, false);
              ctx.strokeStyle = node.color ?? "";
              ctx.stroke();
              ctx.fillStyle = colors.background;
              ctx.fill();
              ctx.closePath();
            }

            // draw circle
            const size = hoverNode == node ? r + 1 : r;

            ctx.beginPath();
            ctx.arc(x, y, size, 0, 2 * Math.PI, false);
            ctx.fillStyle = node.color || "rgba(31, 120, 180, 0.92)";
            ctx.fill();

            // draw icon
            const image = node.image;
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
    );
  }
}
