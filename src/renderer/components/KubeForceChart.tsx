import { Common, Renderer } from "@freelensapp/extensions";
import * as d3 from "d3-force";
import { compareStructural, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import React from "react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";
import { config } from "./helpers/config";
import { buildNamespaceGraph, type NamespaceGraphObjects, sameGraph } from "./helpers/namespace-graph";
import { getMapStores, getNamespaceStore } from "./helpers/stores";
import { getCanvasColors } from "./helpers/theme-colors";
import styles from "./KubeForceChart.module.scss";
import { MapTooltip } from "./tooltips/map-tooltip";

import type { ChartDataSeries, LinkObject } from "./helpers/types";

export interface KubeForceChartProps {
  width?: number;
  height?: number;
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
  readonly items: readonly Renderer.K8sApi.KubeObject[];
  loadAll(): Promise<readonly Renderer.K8sApi.KubeObject[] | undefined>;
  subscribe(): () => void;
}

const logPrefix = "[@freelensapp/resource-map-extension]";

@observer
export class KubeForceChart extends React.Component<KubeForceChartProps, State> {
  @observable accessor isReady = false;
  @observable accessor noResourcesFound = false;

  static config = config;

  protected links: LinkObject[] = [];
  protected nodes: ChartDataSeries[] = [];

  protected config = KubeForceChart.config;
  private chartRef: React.MutableRefObject<ForceGraphMethods<ChartDataSeries, LinkObject> | undefined> = {
    current: undefined,
  };
  private readonly tooltip = React.createRef<MapTooltip>();

  private readonly namespaceStore = getNamespaceStore();
  private readonly stores = getMapStores();

  private kubeObjectStores: MapStore[] = [];
  private watchDisposers: (() => void)[] = [];
  private disposers: (() => void)[] = [];

  state: Readonly<State> = {
    data: {
      nodes: [],
      links: [],
    },
    highlightLinks: new Set<LinkObject>(),
  };

  initZoomDone = false;

  constructor(props: KubeForceChartProps) {
    super(props);
    this.generateImages();
  }

  async componentDidMount() {
    this.kubeObjectStores = Object.values(this.stores);
    try {
      await this.loadData();
    } catch (error) {
      Common.logger.error(`${logPrefix}: loading data error`, error);
    }
    this.displayChart();
    this.applyGraphForces();

    this.disposers.push(
      this.namespaceStore.onContextChange(() => {
        this.namespaceChanged();
      }),
      ...Object.values(this.stores).map((store) =>
        reaction(
          () => store.items.toJSON(),
          () => this.generateChartDataSeries(),
          { equals: compareStructural },
        ),
      ),
    );
  }

  componentWillUnmount() {
    this.unsubscribeStores();
    this.disposers.forEach((dispose) => dispose());
    this.disposers.length = 0;
  }

  namespaceChanged = () => {
    this.isReady = false;
    this.loadData()
      .then(() => {
        this.displayChart();
        this.applyGraphForces();
      })
      .catch((error) => {
        Common.logger.error(`${logPrefix}: loading data error`, error);
      });
  };

  displayChart = () => {
    this.nodes = [];
    this.links = [];
    this.initZoomDone = false;
    this.generateChartDataSeries();
  };

  applyGraphForces = () => {
    const fg = this.chartRef.current;
    fg?.zoom(1.3, 1000);
    fg?.d3Force("link")
      ?.strength(1.3)
      .distance(() => 60);
    fg?.d3Force("charge", d3.forceManyBody().strength(-60).distanceMax(250));
    fg?.d3Force("collide", d3.forceCollide(40));
    fg?.d3Force("center", d3.forceCenter());
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

  protected async loadData() {
    this.unsubscribeStores();
    let totalItems = 0;
    for (const store of this.kubeObjectStores) {
      try {
        const items = await store.loadAll();
        if (store.api.kind !== "ConfigMap") {
          totalItems += items?.length ?? 0;
        }

        this.watchDisposers.push(store.subscribe());
      } catch (error) {
        Common.logger.error(`${logPrefix}: loading store error`, error);
      }
    }
    runInAction(() => {
      this.noResourcesFound = totalItems === 0;
      this.isReady = true;
    });
  }

  generateChartDataSeries = () => {
    // The build runs in the callback of a reaction to the selection, which is
    // never disposed: one more observer of the namespace store per build. Inside
    // a reaction or an action, such as a store reaction, MobX runs the callback
    // only when the outer one ends.
    this.namespaceStore.onContextChange(
      (namespaces) => {
        const previous = { nodes: this.nodes, links: this.links };
        const graph = buildNamespaceGraph(this.mapObjects(), namespaces, previous);
        if (!previous.nodes.length || !sameGraph(graph, previous)) {
          this.nodes = graph.nodes;
          this.links = graph.links;
          this.setState({
            data: graph,
            highlightLinks: new Set<LinkObject>(),
          });
        }
      },
      { fireImmediately: true },
    );
  };

  private mapObjects(): NamespaceGraphObjects {
    const { stores } = this;
    return {
      pods: stores.pods.items,
      deployments: stores.deployments.items,
      statefulSets: stores.statefulSets.items,
      daemonSets: stores.daemonSets.items,
      services: stores.services.items,
      ingresses: stores.ingresses.items,
      pvcs: stores.pvcs.items,
      configMaps: stores.configMaps.items,
      secrets: stores.secrets.items,
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

    const { width, height } = this.props;
    const { hoverNode } = this.state;
    const sidebarWidth =
      (document.querySelectorAll('[data-testid="cluster-sidebar"]')[0] as HTMLElement | undefined)?.offsetWidth || 200;

    return (
      <div className={styles.kubeForceChart} onMouseMove={(event) => this.tooltip.current?.follow(event)}>
        <MapTooltip ref={this.tooltip} object={hoverNode?.object} />

        <ForceGraph2D
          graphData={this.state.data}
          ref={this.chartRef}
          width={width || window.innerWidth - 70 - sidebarWidth}
          height={height || window.innerHeight}
          autoPauseRedraw={false}
          linkWidth={(link) => (this.state.highlightLinks.has(link) ? 2 : 1)}
          maxZoom={2}
          cooldownTicks={200}
          onEngineStop={() => {
            if (!this.initZoomDone) {
              if (this.nodes.length > 10) {
                this.chartRef.current?.zoomToFit(400);
              } else {
                this.chartRef.current?.zoom(1.2);
              }
              this.initZoomDone = true;
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
              if (node.object.kind == "HelmRelease") {
                const path = `/apps/releases/${node.object.getNs()}/${node.object.getName()}?`;
                Renderer.Navigation.navigate(path);
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
