import { Common, Renderer } from "@freelensapp/extensions";
import * as d3 from "d3-force";
import { compareStructural, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import React from "react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";
import { config } from "./helpers/config";
import styles from "./KubeForceChart.module.scss";
import {
  DefaultTooltip,
  DeploymentTooltip,
  IngressTooltip,
  PodTooltip,
  ServiceTooltip,
  StatefulsetTooltip,
} from "./tooltips";

import type { ChartDataSeries, LinkObject } from "./helpers/types";

type KubeObject = Renderer.K8sApi.KubeObject;

export interface KubeResourceChartProps<K extends KubeObject = KubeObject> {
  id?: string; // html-id to bind chart
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
  loadAll(): Promise<unknown>;
  subscribe(): () => void;
}

const logPrefix = "[@freelensapp/resource-map-extension]";

@observer
export class KubeResourceChart<K extends KubeObject = KubeObject> extends React.Component<
  KubeResourceChartProps<K>,
  State
> {
  @observable accessor isReady = false;

  static defaultProps: Partial<KubeResourceChartProps> = {
    id: "kube-resource-map",
  };

  protected links: LinkObject[] = [];
  protected nodes: ChartDataSeries[] = [];
  protected initZoomDone = false;

  protected config = config;
  private chartRef: React.MutableRefObject<ForceGraphMethods<ChartDataSeries, LinkObject> | undefined> = {
    current: undefined,
  };
  private tooltipRef = React.createRef<HTMLDivElement>();

  protected podsStore = Renderer.K8sApi.podsStore;
  protected deploymentStore = Renderer.K8sApi.deploymentStore;
  protected statefulsetStore = Renderer.K8sApi.statefulSetStore;
  protected daemonsetStore = Renderer.K8sApi.daemonSetStore;
  protected secretStore = Renderer.K8sApi.secretsStore;
  protected serviceStore = Renderer.K8sApi.serviceStore;
  protected pvcStore = Renderer.K8sApi.pvcStore;
  protected ingressStore = Renderer.K8sApi.ingressStore;
  protected configMapStore = Renderer.K8sApi.configMapStore;

  protected kubeObjectStores: MapStore[] = [];
  private watchDisposers: (() => void)[] = [];

  private disposers: (() => void)[] = [];

  state: Readonly<State> = {
    data: {
      nodes: [],
      links: [],
    },
    highlightLinks: new Set<LinkObject>(),
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

  constructor(props: KubeResourceChartProps<K>) {
    super(props);
    this.generateImages();
  }

  async componentDidMount() {
    this.registerStores();

    try {
      await this.loadData();
    } catch (error) {
      Common.logger.error(`${logPrefix}: loading data error`, error);
    }
    this.displayChart();

    this.applyGraphForces();

    const reactionOpts = {
      equals: compareStructural,
    };

    const { object } = this.props;
    const api = Renderer.K8sApi.apiManager.getApiByKind(object.kind, object.apiVersion);
    const store = api ? Renderer.K8sApi.apiManager.getStore(api) : undefined;

    this.disposers.push(
      reaction(
        () => this.podsStore.items.toJSON(),
        (values, previousValue) => {
          this.refreshItems(values, previousValue);
        },
        reactionOpts,
      ),
    );
    if (store) {
      this.disposers.push(
        reaction(
          () => store.items.toJSON(),
          (values, previousValue) => {
            this.refreshItems(values, previousValue);
          },
          reactionOpts,
        ),
      );
    }
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

  registerStores() {
    const object = this.props.object;

    this.kubeObjectStores = [
      this.podsStore,
      this.serviceStore,
      this.ingressStore,
      this.pvcStore,
      this.configMapStore,
      this.secretStore,
    ];
    if (object instanceof Renderer.K8sApi.Deployment) {
      this.kubeObjectStores.push(this.deploymentStore);
    } else if (object instanceof Renderer.K8sApi.DaemonSet) {
      this.kubeObjectStores.push(this.daemonsetStore);
    } else if (object instanceof Renderer.K8sApi.StatefulSet) {
      this.kubeObjectStores.push(this.statefulsetStore);
    }
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

  getLinksForNode(node: ChartDataSeries): LinkObject[] {
    return this.links.filter(
      (link) =>
        link.source == node.id ||
        link.target == node.id ||
        (link.source as ChartDataSeries).id == node.id ||
        (link.target as ChartDataSeries).id == node.id,
    );
  }

  handleNodeHover(node: ChartDataSeries | null) {
    const highlightLinks = new Set<LinkObject>();
    const elem = this.props.id ? document.getElementById(this.props.id) : null;
    if (elem) {
      elem.style.cursor = node ? "pointer" : "";
    }
    if (node) {
      const links = this.getLinksForNode(node);
      links.forEach((link) => highlightLinks.add(link));
    }
    this.setState({ highlightLinks, hoverNode: node ?? undefined });
  }

  /** Keeps the tooltip next to the pointer, without a render. */
  handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const tooltip = this.tooltipRef.current;
    if (!tooltip) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    tooltip.style.left = `${event.clientX - bounds.left + 12}px`;
    tooltip.style.top = `${event.clientY - bounds.top + 12}px`;
  };

  generateImages() {
    Object.entries(this.config).forEach(([kind, configItem]) => {
      const img = new Image();
      img.src = configItem.icon ?? "";
      this.config[kind].img = img;
    });
  }

  componentWillUnmount() {
    this.nodes = [];
    this.links = [];
    this.unsubscribeStores();

    this.disposers.forEach((disposer) => disposer());
    this.disposers.length = 0;
  }

  protected refreshItems(newValues: readonly KubeObject[], previousValues: readonly KubeObject[] = []) {
    const itemsToRemove = previousValues.filter((item) => !newValues.find((item2) => item.getId() === item2.getId()));

    itemsToRemove.forEach((object) => {
      if (["DaemonSet", "StatefulSet", "Deployment"].includes(object.kind)) {
        const helmReleaseName = this.getHelmReleaseName(object);
        const namespace = object.getNs();
        if (helmReleaseName && namespace) {
          const helmReleaseNode = this.getHelmReleaseChartNode(helmReleaseName, namespace);
          if (this.getLinksForNode(helmReleaseNode).length === 1) {
            this.deleteNode({ node: helmReleaseNode });
          }
        }
      }
      this.deleteNode({ object });
    });

    this.generateChartDataSeries();
  }

  protected unsubscribeStores() {
    this.watchDisposers.forEach((dispose) => dispose());
    this.watchDisposers.length = 0;
  }

  protected async loadData() {
    this.unsubscribeStores();
    for (const store of this.kubeObjectStores) {
      try {
        if (!store.isLoaded) {
          await store.loadAll();
        }
        this.watchDisposers.push(store.subscribe());
      } catch (error) {
        Common.logger.error(`${logPrefix}: loading store error`, error);
      }
    }
    runInAction(() => {
      this.isReady = true;
    });
  }

  generateChartDataSeries = () => {
    const nodes = [...this.nodes];
    const links = [...this.links];

    this.generateControllerNode(this.props.object);
    this.generateIngresses();

    if (nodes.length != this.nodes.length || links.length != this.links.length) {
      this.updateState(this.nodes, this.links);
    }
  };

  protected updateState(nodes: ChartDataSeries[], links: LinkObject[]) {
    this.setState({
      data: {
        nodes: nodes,
        links: links,
      },
      highlightLinks: new Set<LinkObject>(),
    });
  }

  protected generateControllerNode(object: KubeObject) {
    let pods: Renderer.K8sApi.Pod[] = [];
    if (object instanceof Renderer.K8sApi.Deployment) {
      pods = this.getDeploymentPods(object);
    } else if (object instanceof Renderer.K8sApi.DaemonSet) {
      pods = this.getDaemonSetPods(object);
    } else if (object instanceof Renderer.K8sApi.StatefulSet) {
      pods = this.getStatefulSetPods(object);
    }

    this.getControllerChartNode(object, pods);
    this.generateServices(pods);
  }

  protected getDeploymentPods(deployment: Renderer.K8sApi.Deployment) {
    return this.deploymentStore.getChildPods(deployment);
  }

  protected getDaemonSetPods(daemonset: Renderer.K8sApi.DaemonSet) {
    return this.daemonsetStore.getChildPods(daemonset);
  }

  protected getStatefulSetPods(statefulset: Renderer.K8sApi.StatefulSet) {
    return this.statefulsetStore.getChildPods(statefulset);
  }

  protected generateIngresses() {
    const { ingressStore } = this;
    const namespace = this.props.object.getNs() ?? "";
    let ingressNode: ChartDataSeries | undefined;
    ingressStore.getAllByNs(namespace).forEach((ingress) => {
      ingress.spec.rules?.forEach((rule) => {
        rule.http?.paths.forEach((path) => {
          const backend = path.backend as { serviceName?: string; service?: { name?: string } } | undefined;
          const serviceName = backend?.serviceName || backend?.service?.name;
          if (serviceName) {
            const serviceNode = this.nodes
              .filter((node) => node.kind === "Service")
              .find((node) => node.object.getName() === serviceName);

            if (serviceNode) {
              if (!ingressNode) {
                ingressNode = this.getIngressNode(ingress);
              }
              this.addLink({ source: ingressNode, target: serviceNode });
            }
          }
        });
      });
    });
  }

  protected generateServices(deploymentPods: Renderer.K8sApi.Pod[]) {
    const { serviceStore } = this;
    const namespace = this.props.object.getNs() ?? "";
    serviceStore.getAllByNs(namespace).forEach((service) => {
      const selector = service.spec.selector;
      if (selector) {
        const pods = deploymentPods.filter((item) => {
          const itemLabels = item.metadata.labels || {};
          let matches = item.getNs() == service.getNs();
          if (matches) {
            matches = Object.entries(selector).every(([key, value]) => {
              return itemLabels[key] === value;
            });
          }
          return matches;
        });
        if (pods.length) {
          const serviceNode = this.generateNode(service);
          pods.forEach((pod) => {
            const podNode = this.findNode(pod);
            if (podNode) {
              const serviceLink = { source: podNode, target: serviceNode };
              this.addLink(serviceLink);
            }
          });
        }
      }
    });
  }

  protected addLink(link: LinkObject) {
    const linkExists = this.findLink(link);

    if (!linkExists) {
      this.links.push(link);
    }
  }

  protected findLink(link: LinkObject) {
    return this.links.find(
      (existingLink) =>
        (existingLink.source === link.source || (existingLink.source as ChartDataSeries).id === link.source) &&
        (existingLink.target === link.target || (existingLink.target as ChartDataSeries).id === link.target),
    );
  }

  protected findNode(object: Renderer.K8sApi.KubeObject | undefined) {
    if (!object) {
      return undefined;
    }

    return this.nodes.find(
      (node) => node.kind == object.kind && node.namespace && object.getNs() && node.name == object.getName(),
    );
  }

  protected deleteNode(opts: { node?: ChartDataSeries; object?: Renderer.K8sApi.KubeObject }) {
    const node = opts.node || this.findNode(opts.object);

    if (!node) {
      return;
    }

    this.getLinksForNode(node).forEach((link) => {
      this.links.splice(this.links.indexOf(link), 1);
    });

    this.nodes.splice(this.nodes.indexOf(node), 1);
  }

  generateNode(object: Renderer.K8sApi.KubeObject): ChartDataSeries {
    const existingNode = this.findNode(object);

    if (existingNode) {
      return existingNode;
    }

    const id = `${object.kind}-${object.getName()}`;
    const { color, img, size } = this.config[object.kind.toLowerCase()];

    const chartNode: ChartDataSeries = {
      id: id,
      object: object,
      kind: object.kind,
      name: object.getName(),
      namespace: object.getNs(),
      value: size,
      color: color,
      image: img,
      visible: true,
    };

    this.nodes.push(chartNode);

    return chartNode;
  }

  getControllerChartNode(
    object: Renderer.K8sApi.KubeObject,
    pods: Renderer.K8sApi.Pod[],
    podLinks = true,
  ): ChartDataSeries {
    const controllerNode = this.generateNode(object);
    controllerNode.object = object;
    pods.forEach((pod) => {
      const podNode = this.getPodNode(pod, podLinks);
      this.addLink({ source: controllerNode, target: podNode });
    });
    const releaseName = this.getHelmReleaseName(object);
    const namespace = object.getNs();

    if (releaseName && namespace) {
      const release = this.getHelmReleaseChartNode(releaseName, namespace);
      this.addLink({ target: release, source: controllerNode });
    }
    return controllerNode;
  }

  getHelmReleaseName(object: Renderer.K8sApi.KubeObject): string | undefined {
    if (object.metadata?.labels?.heritage === "Helm" && object.metadata?.labels?.release) {
      return object.metadata.labels.release;
    }
    if (
      object.metadata?.labels &&
      object.metadata?.annotations &&
      object.metadata?.labels["app.kubernetes.io/managed-by"] == "Helm" &&
      object.metadata?.annotations["meta.helm.sh/release-name"]
    ) {
      return object.metadata.annotations["meta.helm.sh/release-name"];
    }
    return undefined;
  }

  getIngressNode(ingress: Renderer.K8sApi.Ingress) {
    const ingressNode = this.generateNode(ingress);

    ingress.spec.tls
      ?.filter((tls) => tls.secretName)
      .forEach((tls) => {
        const secret = this.secretStore.getByName(tls.secretName ?? "", ingress.getNs());
        if (secret) {
          const secretNode = this.generateNode(secret);
          if (secretNode) {
            this.addLink({ source: ingressNode, target: secretNode });
          }
        }
      });

    return ingressNode;
  }

  getPodNode(pod: Renderer.K8sApi.Pod, links = true): ChartDataSeries {
    const podNode = this.generateNode(pod);
    podNode.object = pod;
    if (["Running", "Succeeded"].includes(pod.getStatusMessage())) {
      podNode.color = "#4caf50";
    } else if (["Terminating", "Terminated", "Completed"].includes(pod.getStatusMessage())) {
      podNode.color = "#9dabb5";
    } else if (["Pending", "ContainerCreating"].includes(pod.getStatusMessage())) {
      podNode.color = "#2F4F4F";
    } else if (["CrashLoopBackOff", "Failed", "Error"].includes(pod.getStatusMessage())) {
      podNode.color = "#ce3933";
    }

    if (!links) {
      return podNode;
    }

    pod.getContainers().forEach((container) => {
      container.env?.forEach((env) => {
        const secretName = env.valueFrom?.secretKeyRef?.name;
        if (secretName) {
          const secret = this.secretStore.getByName(secretName, pod.getNs());
          if (secret) {
            const secretNode = this.generateNode(secret);
            this.addLink({
              source: podNode,
              target: secretNode,
            });
          }
        }
      });
      container.envFrom?.forEach((envFrom) => {
        const configMapName = envFrom.configMapRef?.name;
        if (configMapName) {
          const configMap = this.configMapStore.getByName(configMapName, pod.getNs());
          if (configMap) {
            const configMapNode = this.generateNode(configMap);
            this.addLink({
              source: podNode,
              target: configMapNode,
            });
          }
        }

        const secretName = envFrom.secretRef?.name;
        if (secretName) {
          const secret = this.secretStore.getByName(secretName, pod.getNs());
          if (secret) {
            const secretNode = this.generateNode(secret);
            this.addLink({
              source: podNode,
              target: secretNode,
            });
          }
        }
      });
    });

    pod.getVolumes().forEach((volume) => {
      const claimName = volume.persistentVolumeClaim?.claimName;
      if (!claimName) return;
      const volumeClaim = this.pvcStore.getByName(claimName, pod.getNs());
      if (volumeClaim) {
        const volumeClaimNode = this.generateNode(volumeClaim);

        if (volumeClaimNode) {
          this.addLink({ target: podNode, source: volumeClaimNode });
        }
      }
    });

    pod.getVolumes().forEach((volume) => {
      const configMapName = volume.configMap?.name;
      if (!configMapName) return;
      const configMap = this.configMapStore.getByName(configMapName, pod.getNs());
      if (configMap) {
        const dataItem = this.generateNode(configMap);
        if (dataItem) {
          this.addLink({ target: podNode, source: dataItem });
        }
      }
    });

    pod.getSecrets().forEach((secretName) => {
      const secret = this.secretStore.getByName(secretName, pod.getNs());
      if (secret) {
        const dataItem = this.generateNode(secret);
        if (dataItem) {
          this.addLink({ target: podNode, source: dataItem });
        }
      }
    });

    return podNode;
  }

  getHelmReleaseChartNode(name: string, namespace: string): ChartDataSeries {
    const releaseObject = new Renderer.K8sApi.KubeObject({
      apiVersion: "v1",
      kind: "HelmRelease",
      metadata: {
        uid: "",
        namespace: namespace,
        name: name,
        resourceVersion: "1",
        selfLink: `api/v1/helmreleases/${name}`,
      },
    });
    return this.generateNode(releaseObject);
  }

  renderTooltip(obj: Renderer.K8sApi.KubeObject) {
    if (obj instanceof Renderer.K8sApi.Pod) {
      return <PodTooltip obj={obj} />;
    }
    if (obj instanceof Renderer.K8sApi.Service) {
      return <ServiceTooltip obj={obj} />;
    }
    if (obj instanceof Renderer.K8sApi.Deployment) {
      return <DeploymentTooltip obj={obj} />;
    }
    if (obj instanceof Renderer.K8sApi.StatefulSet) {
      return <StatefulsetTooltip obj={obj} />;
    }
    if (obj instanceof Renderer.K8sApi.Ingress) {
      return <IngressTooltip obj={obj} />;
    }
    return <DefaultTooltip obj={obj} />;
  }

  render() {
    if (!this.isReady) {
      return <Renderer.Component.Spinner />;
    }

    const theme = Renderer.Theme.activeTheme.get();
    const { hoverNode } = this.state;
    return (
      <div id={this.props.id} className={styles.kubeForceChart} onMouseMove={this.handleMouseMove}>
        <div ref={this.tooltipRef} className={styles.tooltip} style={{ display: hoverNode ? "block" : "none" }}>
          {hoverNode ? this.renderTooltip(hoverNode.object) : null}
        </div>
        <Renderer.Component.DrawerTitle>Resources</Renderer.Component.DrawerTitle>

        <ForceGraph2D
          graphData={this.state.data}
          ref={this.chartRef}
          width={document.getElementById("kube-resource-map")?.parentElement?.firstElementChild?.clientWidth || 780}
          height={400}
          autoPauseRedraw={false}
          maxZoom={1.2}
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
              if (object.kind == "HelmRelease") {
                const path = `/apps/releases/${object.getNs()}/${object.getName()}?`;
                Renderer.Navigation.navigate(path);
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
              ctx.fillStyle = theme.colors["secondaryBackground"];
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
            ctx.fillStyle = theme.colors["textColorPrimary"];
            ctx.fillText(label, x, y + r + 10 / globalScale);
          }}
        />
      </div>
    );
  }
}
