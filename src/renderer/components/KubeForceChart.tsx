import { Common, Renderer } from "@freelensapp/extensions";
import * as d3 from "d3-force";
import { compareStructural, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import React from "react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";
import { config } from "./helpers/config";
import styles from "./KubeForceChart.module.scss";
import { DefaultTooltip, DeploymentTooltip, PodTooltip, ServiceTooltip, StatefulsetTooltip } from "./tooltips";

import type { ChartDataSeries, LinkObject } from "./helpers/types";

export interface KubeForceChartProps {
  id?: string; // html-id to bind chart
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

  static defaultProps: KubeForceChartProps = {
    id: "kube-resources-map",
  };

  static config = config;

  protected links: LinkObject[] = [];
  protected nodes: ChartDataSeries[] = [];

  protected config = KubeForceChart.config;
  private chartRef: React.MutableRefObject<ForceGraphMethods<ChartDataSeries, LinkObject> | undefined> = {
    current: undefined,
  };
  private tooltipRef = React.createRef<HTMLDivElement>();

  protected namespaceStore = Renderer.K8sApi.namespaceStore;
  protected podsStore = Renderer.K8sApi.podsStore;
  protected deploymentStore = Renderer.K8sApi.deploymentStore;
  protected statefulsetStore = Renderer.K8sApi.statefulSetStore;
  protected daemonsetStore = Renderer.K8sApi.daemonSetStore;
  protected secretStore = Renderer.K8sApi.secretsStore;
  protected serviceStore = Renderer.K8sApi.serviceStore;
  protected pvcStore = Renderer.K8sApi.pvcStore;
  protected ingressStore = Renderer.K8sApi.ingressStore;
  protected configMapStore = Renderer.K8sApi.configMapStore;

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
    this.kubeObjectStores = [
      this.podsStore,
      this.deploymentStore,
      this.statefulsetStore,
      this.daemonsetStore,
      this.serviceStore,
      this.ingressStore,
      this.pvcStore,
      this.configMapStore,
      this.secretStore,
    ];
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
    this.disposers.push(
      this.namespaceStore.onContextChange(() => {
        this.namespaceChanged();
      }),
      reaction(
        () => this.podsStore.items.toJSON(),
        () => this.refreshItems(this.podsStore),
        reactionOpts,
      ),
      reaction(
        () => this.daemonsetStore.items.toJSON(),
        () => this.refreshItems(this.daemonsetStore),
        reactionOpts,
      ),
      reaction(
        () => this.statefulsetStore.items.toJSON(),
        () => this.refreshItems(this.statefulsetStore),
        reactionOpts,
      ),
      reaction(
        () => this.deploymentStore.items.toJSON(),
        () => this.refreshItems(this.deploymentStore),
        reactionOpts,
      ),
      reaction(
        () => this.serviceStore.items.toJSON(),
        () => this.refreshItems(this.serviceStore),
        reactionOpts,
      ),
      reaction(
        () => this.secretStore.items.toJSON(),
        () => this.refreshItems(this.secretStore),
        reactionOpts,
      ),
      reaction(
        () => this.pvcStore.items.toJSON(),
        () => this.refreshItems(this.pvcStore),
        reactionOpts,
      ),
      reaction(
        () => this.ingressStore.items.toJSON(),
        () => this.refreshItems(this.ingressStore),
        reactionOpts,
      ),
      reaction(
        () => this.configMapStore.items.toJSON(),
        () => this.refreshItems(this.configMapStore),
        reactionOpts,
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
    const elem = this.props.id ? document.getElementById(this.props.id) : null;
    if (elem) {
      elem.style.cursor = node ? "pointer" : "";
    }
    if (node) {
      this.getLinksForNode(node).forEach((link) => highlightLinks.add(link));
    }
    this.setState({ highlightLinks: highlightLinks, hoverNode: node ?? undefined });
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
    const nodes = [...this.nodes];
    const links = [...this.links];
    this.generatePods();
    this.generateSecrets();
    this.generateVolumeClaims();
    this.generateDeployments();
    this.generateStatefulSets();
    this.generateDaemonSets();
    this.generateServices();
    this.generateIngresses();

    if (!nodes.length || nodes.length != this.nodes.length || links.length != this.links.length) {
      this.setState({
        data: {
          nodes: this.nodes,
          links: this.links,
        },
        highlightLinks: new Set<LinkObject>(),
      });
    }
  };

  protected refreshItems(store: MapStore) {
    // remove deleted objects
    this.nodes
      .filter((node) => node.kind == store.api.kind)
      .forEach((node) => {
        if (!store.items.includes(node.object)) {
          if (["DaemonSet", "StatefulSet", "Deployment"].includes(node.kind)) {
            const helmReleaseName = this.getHelmReleaseName(node.object);
            if (helmReleaseName && node.namespace) {
              const helmReleaseNode = this.getHelmReleaseChartNode(helmReleaseName, node.namespace);
              if (this.getLinksForNode(helmReleaseNode).length === 1) {
                this.deleteNode({ node: helmReleaseNode });
              }
            }
          }
          this.deleteNode({ node });
        }
      });
    this.generateChartDataSeries();
  }

  protected unsubscribeStores() {
    this.watchDisposers.forEach((dispose) => dispose());
    this.watchDisposers.length = 0;
  }

  protected generatePods() {
    const { podsStore } = this;
    this.namespaceStore.onContextChange(
      (selectedNamespaces) => {
        podsStore.getAllByNs(selectedNamespaces).forEach((pod) => {
          this.getPodNode(pod);
        });
      },
      { fireImmediately: true },
    );
  }

  protected generateDeployments() {
    const { deploymentStore } = this;
    this.namespaceStore.onContextChange(
      (selectedNamespaces) => {
        deploymentStore.getAllByNs(selectedNamespaces).forEach((deployment) => {
          const pods = deploymentStore.getChildPods(deployment);
          this.getControllerChartNode(deployment, pods);
        });
      },
      { fireImmediately: true },
    );
  }

  protected generateStatefulSets() {
    const { statefulsetStore } = this;
    this.namespaceStore.onContextChange(
      (selectedNamespaces) => {
        statefulsetStore.getAllByNs(selectedNamespaces).forEach((statefulset) => {
          const pods = statefulsetStore.getChildPods(statefulset);
          this.getControllerChartNode(statefulset, pods);
        });
      },
      { fireImmediately: true },
    );
  }

  protected generateDaemonSets() {
    const { daemonsetStore } = this;
    this.namespaceStore.onContextChange(
      (selectedNamespaces) => {
        daemonsetStore.getAllByNs(selectedNamespaces).forEach((daemonset) => {
          const pods = daemonsetStore.getChildPods(daemonset);
          this.getControllerChartNode(daemonset, pods);
        });
      },
      { fireImmediately: true },
    );
  }

  protected generateSecrets() {
    const { secretStore } = this;
    this.namespaceStore.onContextChange(
      (selectedNamespaces) => {
        secretStore.getAllByNs(selectedNamespaces).forEach((secret) => {
          // Ignore service account tokens and tls secrets
          if (["kubernetes.io/service-account-token", "kubernetes.io/tls"].includes(secret.type.toString())) return;

          const secretNode = this.generateNode(secret);

          if (secret.type.toString() === "helm.sh/release.v1") {
            const releaseName = secret.metadata.labels?.name;
            const namespace = secret.getNs();
            if (releaseName && namespace) {
              const helmReleaseNode = this.getHelmReleaseChartNode(releaseName, namespace);
              this.addLink({ source: secretNode, target: helmReleaseNode });
            }
          }

          // search for container links
          this.nodes
            .filter((node) => node.kind === "Pod" && node.namespace == secret.getNs())
            .forEach((podNode) => {
              const pod = podNode.object as Renderer.K8sApi.Pod;
              pod.getContainers().forEach((container) => {
                container.env?.forEach((env) => {
                  const secretName = env.valueFrom?.secretKeyRef?.name;
                  if (secretName == secret.getName()) {
                    this.addLink({
                      source: podNode.id,
                      target: secretNode.id,
                    });
                  }
                });
                container.envFrom?.forEach((envFrom) => {
                  const secretName = envFrom.secretRef?.name;
                  if (secretName && secretName == secret.getName()) {
                    this.addLink({
                      source: podNode.id,
                      target: secretNode.id,
                    });
                  }
                });
              });
            });
        });
      },
      { fireImmediately: true },
    );
  }

  protected generateVolumeClaims() {
    const { pvcStore } = this;
    this.namespaceStore.onContextChange(
      (selectedNamespaces) => {
        pvcStore.getAllByNs(selectedNamespaces).forEach((pvc) => {
          this.generateNode(pvc);
        });
      },
      { fireImmediately: true },
    );
  }

  protected generateIngresses() {
    const { ingressStore } = this;
    this.namespaceStore.onContextChange(
      (selectedNamespaces) => {
        ingressStore.getAllByNs(selectedNamespaces).forEach((ingress) => {
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
          ingress.spec.rules?.forEach((rule) => {
            rule.http?.paths.forEach((path) => {
              const backend = path.backend as { serviceName?: string; service?: { name?: string } } | undefined;
              const serviceName = backend?.serviceName || backend?.service?.name;
              if (serviceName) {
                const service = this.serviceStore.getByName(serviceName, ingress.getNs());
                if (service) {
                  const serviceNode = this.generateNode(service);
                  if (serviceNode) {
                    this.addLink({ source: ingressNode, target: serviceNode });
                  }
                }
              }
            });
          });
        });
      },
      { fireImmediately: true },
    );
  }

  protected generateServices() {
    const { serviceStore, podsStore } = this;
    this.namespaceStore.onContextChange(
      (selectedNamespaces) => {
        serviceStore.getAllByNs(selectedNamespaces).forEach((service) => {
          const serviceNode = this.generateNode(service);
          const selector = service.spec.selector;
          if (selector) {
            const pods = podsStore.items.filter((item) => {
              const itemLabels = item.metadata.labels || {};
              let matches = item.getNs() == service.getNs();
              if (matches) {
                matches = Object.entries(selector).every(([key, value]) => {
                  return itemLabels[key] === value;
                });
              }
              return matches;
            });
            pods.forEach((pod) => {
              const podNode = this.findNode(pod);
              if (podNode) {
                const serviceLink = { source: podNode.id, target: serviceNode.id };
                this.addLink(serviceLink);
              }
            });
          }
        });
      },
      { fireImmediately: true },
    );
  }

  protected addLink(link: LinkObject) {
    const linkExists = this.findLink(link);
    if (!linkExists) {
      // Convert string IDs to node objects if needed
      const sourceNode = typeof link.source === "string" ? this.nodes.find((n) => n.id === link.source) : link.source;
      const targetNode = typeof link.target === "string" ? this.nodes.find((n) => n.id === link.target) : link.target;

      if (sourceNode && targetNode) {
        this.links.push({
          source: sourceNode,
          target: targetNode,
        });
      }
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

  getControllerChartNode(object: Renderer.K8sApi.KubeObject, pods: Renderer.K8sApi.Pod[]): ChartDataSeries {
    const controllerNode = this.generateNode(object);
    pods.forEach((pod) => {
      const podNode = this.getPodNode(pod);
      this.addLink({ source: controllerNode, target: podNode });
    });
    const releaseName = this.getHelmReleaseName(object);
    const namespace = object.getNs();

    if (releaseName && namespace) {
      const release = this.getHelmReleaseChartNode(releaseName, namespace);
      this.addLink({ target: release.id, source: controllerNode.id });
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

  getPodNode(pod: Renderer.K8sApi.Pod): ChartDataSeries {
    const podNode = this.generateNode(pod);
    if (["Running", "Succeeded"].includes(pod.getStatusMessage())) {
      podNode.color = "#4caf50";
    } else if (["Terminating", "Terminated", "Completed"].includes(pod.getStatusMessage())) {
      podNode.color = "#9dabb5";
    } else if (["Pending", "ContainerCreating"].includes(pod.getStatusMessage())) {
      podNode.color = "#2F4F4F";
    } else if (["CrashLoopBackOff", "Failed", "Error"].includes(pod.getStatusMessage())) {
      podNode.color = "#ce3933";
    }
    pod.getContainers().forEach((container) => {
      container.env?.forEach((env) => {
        const secretName = env.valueFrom?.secretKeyRef?.name;
        if (secretName) {
          const secret = this.secretStore.getByName(secretName, pod.getNs());
          if (secret) {
            const secretNode = this.generateNode(secret);
            this.addLink({
              source: podNode.id,
              target: secretNode.id,
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
              source: podNode.id,
              target: configMapNode.id,
            });
          }
        }

        const secretName = envFrom.secretRef?.name;
        if (secretName) {
          const secret = this.secretStore.getByName(secretName, pod.getNs());
          if (secret) {
            const secretNode = this.generateNode(secret);
            this.addLink({
              source: podNode.id,
              target: secretNode.id,
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
          this.addLink({ target: podNode.id, source: volumeClaimNode.id });
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
          this.addLink({ target: podNode.id, source: dataItem.id });
        }
      }
    });
    pod.getSecrets().forEach((secretName) => {
      const secret = this.secretStore.getByName(secretName, pod.getNs());
      if (secret && secret.type.toString() !== "kubernetes.io/service-account-token") {
        const dataItem = this.generateNode(secret);
        if (dataItem) {
          this.addLink({ target: podNode.id, source: dataItem.id });
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
    return <DefaultTooltip obj={obj} />;
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

    const theme = Renderer.Theme.activeTheme.get();

    const { id, width, height } = this.props;
    const { hoverNode } = this.state;
    const sidebarWidth =
      (document.querySelectorAll('[data-testid="cluster-sidebar"]')[0] as HTMLElement | undefined)?.offsetWidth || 200;

    return (
      <div id={id} className={styles.kubeForceChart} onMouseMove={this.handleMouseMove}>
        <div ref={this.tooltipRef} className={styles.tooltip} style={{ display: hoverNode ? "block" : "none" }}>
          {hoverNode ? this.renderTooltip(hoverNode.object) : null}
        </div>

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
              ctx.fillStyle = theme.colors["secondaryBackground"];
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
            ctx.fillStyle = theme.colors["textColorPrimary"];
            ctx.fillText(label, x, y + r + 10 / globalScale);
          }}
        />
      </div>
    );
  }
}
