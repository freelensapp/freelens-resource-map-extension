// ========================= Imports & Decorators ========================= 

import "./KubeForceChart.scss";
import { Renderer } from "@freelensapp/extensions";
import { action, comparer, makeObservable, observable, reaction } from "mobx";
import { disposeOnUnmount, observer } from "mobx-react";
import React, { createRef, Fragment, MutableRefObject } from "react";
import ForceGraph2D from 'react-force-graph-2d';
import * as d3 from "d3-force";
import ReactDOM from "react-dom";
import { PodTooltip, ServiceTooltip, DeploymentTooltip, StatefulsetTooltip, DefaultTooltip} from "./tooltips";
import { ChartDataSeries, LinkObject, NodeObject } from "./helpers/types";
import { config } from "./helpers/config";


// ========================= Interfaces =========================
export interface KubeForceChartProps {
  id?: string; // html-id to bind chart
  width?: number;
  height?: number;
  widthRef?: string;
}

interface State {
  data: {
    nodes: ChartDataSeries[];
    links: LinkObject[];
  };
  highlightLinks?: Set<LinkObject>;
  hoverNode?: NodeObject;
}

@observer 
export class KubeForceChart extends React.Component<KubeForceChartProps, State> {
  @observable static  isReady = false;
  @observable isUnmounting = false;
  @observable data: State;
  @observable noResourcesFound = false;


// ========================= Default Props & Config =========================
  static defaultProps: KubeForceChartProps = {
    id: "kube-resources-map"
  }

  static config = config;

// ========================= Internal References & State =========================

  protected links: LinkObject[] = [];
  protected nodes: ChartDataSeries[] = [];
  protected highlightLinks: Set<LinkObject> = new Set<LinkObject>();


  protected images: {[key: string]: HTMLImageElement; } = {}
  protected config = KubeForceChart.config
  private chartRef: MutableRefObject<any>;
  protected secretsData: any = [];
  protected configMapsData: any = [];
  protected helmData: any = [];

// ========================= Kubernetes Stores =========================

  protected namespaceStore = (Renderer.K8sApi.apiManager.getStore(Renderer.K8sApi.namespacesApi) as unknown) as Renderer.K8sApi.NamespaceStore;
  protected podsStore = Renderer.K8sApi.apiManager.getStore(Renderer.K8sApi.podsApi) as Renderer.K8sApi.PodsStore;
  protected deploymentStore = Renderer.K8sApi.apiManager.getStore(Renderer.K8sApi.deploymentApi) as Renderer.K8sApi.DeploymentStore;
  protected statefulsetStore = Renderer.K8sApi.apiManager.getStore(Renderer.K8sApi.statefulSetApi) as Renderer.K8sApi.StatefulSetStore;
  protected daemonsetStore = Renderer.K8sApi.apiManager.getStore(Renderer.K8sApi.daemonSetApi) as Renderer.K8sApi.DaemonSetStore;
  protected secretStore = Renderer.K8sApi.apiManager.getStore(Renderer.K8sApi.secretsApi) as Renderer.K8sApi.SecretsStore;
  protected serviceStore = Renderer.K8sApi.apiManager.getStore(Renderer.K8sApi.serviceApi) as Renderer.K8sApi.ServiceStore;
  protected pvcStore = Renderer.K8sApi.apiManager.getStore(Renderer.K8sApi.pvcApi) as Renderer.K8sApi.VolumeClaimStore;
  protected ingressStore =  Renderer.K8sApi.apiManager.getStore(Renderer.K8sApi.ingressApi) as Renderer.K8sApi.IngressStore;
  protected configMapStore = Renderer.K8sApi.apiManager.getStore(Renderer.K8sApi.configMapApi) as Renderer.K8sApi.ConfigMapsStore;

  private kubeObjectStores: Array<Partial<Renderer.K8sApi.KubeObjectStore>> = []
  private watchDisposers: Function[] = [];

  // ========================= React State & Constructor =========================
  state: Readonly<State> = {
    data: {
      nodes: [],
      links: []
    },
    highlightLinks: new Set<LinkObject>()
  }

  initZoomDone: boolean = false;

  constructor(props: KubeForceChartProps) {
    super(props);

    makeObservable(this);
    this.chartRef = createRef();
    this.generateImages();
  }

// ========================= Lifecycle Methods =========================
  async componentDidMount() {
        this.setState(this.state)
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
          console.error("loading data error", error);
        }
        this.displayChart();
        this.applyGraphForces();

        const reactionOpts = {
          equals: comparer.structural,
        }
        disposeOnUnmount(this, [
          this.namespaceStore.onContextChange((ns) => {
            console.log("[NAMESPACE CHANGED]: ", ns);
            this.namespaceChanged();
          }),
          reaction(() => this.podsStore.items.toJSON(), () => { this.refreshItems(this.podsStore) }, reactionOpts),
          reaction(() => this.daemonsetStore.items.toJSON(), () => { this.refreshItems(this.daemonsetStore) }, reactionOpts),
          reaction(() => this.statefulsetStore.items.toJSON(), () => { this.refreshItems(this.statefulsetStore) }, reactionOpts),
          reaction(() => this.deploymentStore.items.toJSON(), () => { this.refreshItems(this.deploymentStore) }, reactionOpts),
          reaction(() => this.serviceStore.items.toJSON(), () => { this.refreshItems(this.serviceStore) }, reactionOpts),
          reaction(() => this.secretStore.items.toJSON(), () => { this.refreshItems(this.secretStore) }, reactionOpts),
          reaction(() => this.pvcStore.items.toJSON(), () => { this.refreshItems(this.pvcStore) }, reactionOpts),
          reaction(() => this.ingressStore.items.toJSON(), () => { this.refreshItems(this.ingressStore) }, reactionOpts),
          reaction(() => this.configMapStore.items.toJSON(), () => { this.refreshItems(this.configMapStore) }, reactionOpts)
        ])
  }

  componentWillUnmount() {
    this.isUnmounting = true;
    this.unsubscribeStores();
  }

// ========================= Namespace Handling =========================

   namespaceChanged = () => {
    KubeForceChart.isReady = false;
     this.loadData().then(() => {
      this.displayChart();
      this.applyGraphForces()
    })
    .catch((err) => {
      console.log(err);  // Prints: Error
    });
  }

// ========================= Chart Display & Interaction =========================

  displayChart = () => {
    this.nodes = [];
    this.links = [];
    this.initZoomDone = false;
    this.generateChartDataSeries();
  }

  applyGraphForces = () => {
    const fg = this.chartRef.current;
    fg?.zoom(1.3, 1000);
    fg?.d3Force('link').strength(1.3).distance(() => 60);
    fg?.d3Force('charge', d3.forceManyBody().strength(-60).distanceMax(250));
    fg?.d3Force('collide', d3.forceCollide(40));
    fg?.d3Force("center", d3.forceCenter());
  };

  getLinksForNode(node: ChartDataSeries): LinkObject[] {
    return this.links.filter((link) => link.source == node || link.target == node )
  }

  handleNodeHover(node: ChartDataSeries) {
    const highlightLinks = new Set<LinkObject>();
    const elem = document.getElementById(this.props.id);
    elem.style.cursor = node ? 'pointer' : null
    if (node) {
      this.getLinksForNode(node).forEach(link => highlightLinks.add(link));
    }
    this.setState({ highlightLinks: highlightLinks, hoverNode: node})
  }

  // ========================= Image & Data Initialization =========================

  generateImages() {
    Object.entries(this.config).forEach(value => {
      const img = new Image();
      img.src = value[1].icon;
      this.config[value[0]].img = img;
    })
  }


  @action
  protected async loadData() {
    this.unsubscribeStores();
    let totalItems = 0;
    for (const store of this.kubeObjectStores) {
      try {
        
          
          const items = await store.loadAll();
          if ( store.api.kind !== "ConfigMap") {
            totalItems += items.length;
          }
          
        const unsuscribe = store.subscribe();
        this.watchDisposers.push(unsuscribe);
      } catch (error) {
        console.error("loading store error", error);
      }
    }
    this.noResourcesFound = totalItems === 0;
    KubeForceChart.isReady = true;
  }

  // ========================= Data Processing =========================

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

    if (!nodes.length || nodes.length != this.nodes.length || links.length != this.links.length) { // TODO: Improve the logic
      this.setState({
        data: {
          nodes: this.nodes,
          links: this.links,
        },
        highlightLinks: new Set<LinkObject>()
      })
    }

  }

  protected refreshItems(store: Partial<Renderer.K8sApi.KubeObjectStore>) {
    // remove deleted objects
    this.nodes.filter(node => node.kind == store.api.kind).forEach(node => {
      if (!store.items.includes(node.object as Renderer.K8sApi.KubeObject)) {
        if (["DaemonSet", "StatefulSet", "Deployment"].includes(node.kind)) {
          const helmReleaseName = this.getHelmReleaseName(node.object)
          if (helmReleaseName) {
            const helmReleaseNode = this.getHelmReleaseChartNode(helmReleaseName, node.namespace)
            if (this.getLinksForNode(helmReleaseNode).length === 1) {
              this.deleteNode({ node: helmReleaseNode })
            }
          }
        }
        this.deleteNode(node);
      }
    })
    this.generateChartDataSeries()
  }

  protected unsubscribeStores() {
    this.watchDisposers.forEach(dispose => dispose());
    this.watchDisposers.length = 0;
  }

   // ========================= Resource Generators (Pods, Deployments, etc.) =========================

  protected generatePods() {
    const { podsStore } = this;
    this.namespaceStore.onContextChange((selectedNamespaces) => {
      podsStore.getAllByNs(selectedNamespaces).map((pod: Renderer.K8sApi.Pod) => {
          this.getPodNode(pod);
      });
  }, {fireImmediately: true});
  }

  protected generateDeployments() {
    const { deploymentStore } = this;
    this.namespaceStore.onContextChange((selectedNamespaces) => {
    deploymentStore.getAllByNs(selectedNamespaces).map((deployment: Renderer.K8sApi.Deployment) => {
      const pods = deploymentStore.getChildPods(deployment)
      this.getControllerChartNode(deployment, pods);
    });
  }, {fireImmediately: true});
  }

  protected generateStatefulSets() {
    const { statefulsetStore } = this;
    this.namespaceStore.onContextChange((selectedNamespaces) => {
    statefulsetStore.getAllByNs(selectedNamespaces).map((statefulset: Renderer.K8sApi.StatefulSet) => {
      const pods = statefulsetStore.getChildPods(statefulset)
      this.getControllerChartNode(statefulset, pods);
    });
  }, {fireImmediately: true});
  }

  protected generateDaemonSets() {
    const { daemonsetStore } = this;
    this.namespaceStore.onContextChange((selectedNamespaces) => {
    daemonsetStore.getAllByNs(selectedNamespaces).map((daemonset: Renderer.K8sApi.DaemonSet) => {
      const pods = daemonsetStore.getChildPods(daemonset)
      this.getControllerChartNode(daemonset, pods)
    });
  }, {fireImmediately: true});
  }

  protected generateSecrets() {
    const { secretStore } = this;
    this.namespaceStore.onContextChange((selectedNamespaces) => {
    secretStore.getAllByNs(selectedNamespaces).forEach((secret: Renderer.K8sApi.Secret) => {
      // Ignore service account tokens and tls secrets
      if (["kubernetes.io/service-account-token", "kubernetes.io/tls"].includes(secret.type.toString())) return;

      const secretNode = this.generateNode(secret);

      if (secret.type.toString() === "helm.sh/release.v1") {
        const helmReleaseNode = this.getHelmReleaseChartNode(secret.metadata.labels.name, secret.getNs())
        this.addLink({source: secretNode, target: helmReleaseNode});
      }

      // search for container links
      this.nodes.filter(node => node.kind === "Pod" && node.namespace == secret.getNs()).forEach((podNode) => {
        const pod = (podNode.object as Renderer.K8sApi.Pod)
        pod.getContainers().forEach((container) => {
          container.env?.forEach((env) => {
            const secretName = env.valueFrom?.secretKeyRef?.name;
            if (secretName == secret.getName()) {
              this.addLink({
                source: podNode.id, target: secretNode.id
              })
            }
          })
          container.envFrom?.map(envFrom => {
            const secretName = envFrom.secretRef?.name;
            if (secretName && secretName == secret.getName()) {
              this.addLink({
                source: podNode.id, target: secretNode.id
              })
            }
          })
        })
      })
    })
  }, {fireImmediately: true});
  }

  protected generateVolumeClaims() {
    const { pvcStore } = this;
    this.namespaceStore.onContextChange((selectedNamespaces) => {
    pvcStore.getAllByNs(selectedNamespaces).forEach((pvc: Renderer.K8sApi.PersistentVolumeClaim) => {
      this.generateNode(pvc);
    })
  }, {fireImmediately: true});
  }

  protected generateIngresses() {
    const { ingressStore } = this
    this.namespaceStore.onContextChange((selectedNamespaces) => {
    ingressStore.getAllByNs(selectedNamespaces).forEach((ingress: Renderer.K8sApi.Ingress) => {

      const ingressNode = this.generateNode(ingress);
      ingress.spec.tls?.filter(tls => tls.secretName).forEach((tls) => {
        const secret = this.secretStore.getByName(tls.secretName, ingress.getNs());
        if (secret) {
          const secretNode = this.generateNode(secret)
          if (secretNode) {
            this.addLink({ source: ingressNode, target: secretNode })
          }
        }
      })
      ingress.spec.rules.forEach((rule) => {
        rule.http.paths.forEach((path) => {
          const serviceName = (path.backend as any).serviceName || (path.backend as any).service.name
          if (serviceName) {
            const service = this.serviceStore.getByName(serviceName, ingress.getNs());
            if (service) {
              const serviceNode = this.generateNode(service)
              if (serviceNode) {
                this.addLink({ source: ingressNode, target: serviceNode });
              }
            }
          }
        })
      })
    })
  }, {fireImmediately: true});
  }

  protected generateServices() {
    const { serviceStore, podsStore} = this
    this.namespaceStore.onContextChange((selectedNamespaces) => {
    serviceStore.getAllByNs(selectedNamespaces).forEach((service: Renderer.K8sApi.Service) => {
      const serviceNode = this.generateNode(service);
      const selector = service.spec.selector;
      if (selector) {
        const pods = podsStore.items.filter((item: Renderer.K8sApi.Pod) => {
          const itemLabels = item.metadata.labels || {};
          let matches = item.getNs() == service.getNs()
          if (matches) {
            matches = Object.entries(selector)
              .every(([key, value]) => {
                return itemLabels[key] === value
              });
          }
          return matches
        });
        pods.forEach((pod: Renderer.K8sApi.Pod) => {
          const podNode = this.findNode(pod)
          if (podNode) {
            const serviceLink = { source: podNode.id, target: serviceNode.id}
            this.addLink(serviceLink);
          }
        })
      }
    })
  }, {fireImmediately: true});
  }

  protected addLink(link: LinkObject) {
    const linkExists = this.findLink(link);
    if (!linkExists) {
      // Convert string IDs to node objects if needed
      const sourceNode = typeof link.source === 'string' ? this.nodes.find(n => n.id === link.source) : link.source;
      const targetNode = typeof link.target === 'string' ? this.nodes.find(n => n.id === link.target) : link.target;
      
      if (sourceNode && targetNode) {
        this.links.push({
          source: sourceNode,
          target: targetNode
        });
      }
    }
  }

  protected findLink(link: LinkObject) {
    return this.links.find(existingLink => (existingLink.source === link.source || (existingLink.source as NodeObject).id === link.source) && (existingLink.target === link.target || (existingLink.target as NodeObject).id === link.target))
  }
  protected findNode(object: Renderer.K8sApi.KubeObject) {
    if (!object) {
      return null;
    }

    return this.nodes.find(node => node.kind == object.kind && node.namespace && object.getNs() && node.name == object.getName())
  }

  protected deleteNode(opts: {node?: ChartDataSeries; object?: Renderer.K8sApi.KubeObject}) {
    const node = opts.node || this.findNode(opts.object);

    if(!node) {
      return;
    }

    this.getLinksForNode(node).forEach(link => {
      this.links.splice(this.links.indexOf(link), 1);
    })

    this.nodes.splice(this.nodes.indexOf(node), 1);
  }

  generateNode(object: Renderer.K8sApi.KubeObject): ChartDataSeries {
    const existingNode = this.findNode(object);

    if (existingNode) {
      return existingNode;
    }

    const id = `${object.kind}-${object.getName()}`
    const { color, img, size } = this.config[object.kind.toLowerCase()]

    const chartNode: ChartDataSeries = {
      id: id,
      object: object,
      kind: object.kind,
      name: object.getName(),
      namespace: object.getNs(),
      value: size,
      color: color,
      image: img,
      visible: true
    }

    this.nodes.push(chartNode)

    return chartNode;
  }

  getControllerChartNode(object: Renderer.K8sApi.KubeObject, pods: Renderer.K8sApi.Pod[]): ChartDataSeries {
    const controllerNode = this.generateNode(object);
    pods.forEach((pod: Renderer.K8sApi.Pod) => {
      const podNode = this.getPodNode(pod)
      this.addLink({ source: controllerNode, target: podNode})
    })
    const releaseName = this.getHelmReleaseName(object);

    if (releaseName) {
      const release = this.getHelmReleaseChartNode(releaseName, object.getNs())
      this.addLink({target: release.id, source: controllerNode.id})
    }
    return controllerNode
  }

  getHelmReleaseName(object: Renderer.K8sApi.KubeObject): string {
    if (object.metadata?.labels?.heritage === "Helm" && object.metadata?.labels?.release) {
      return object.metadata.labels.release
    }
    if (object.metadata?.labels && object.metadata?.annotations && object.metadata?.labels["app.kubernetes.io/managed-by"] == "Helm" && object.metadata?.annotations["meta.helm.sh/release-name"]) {
      return object.metadata.annotations["meta.helm.sh/release-name"]
    }
    return null
  }

  getPodNode(pod: Renderer.K8sApi.Pod): ChartDataSeries {
    const podNode = this.generateNode(pod);
    if (["Running", "Succeeded"].includes(pod.getStatusMessage())) {
      podNode.color = "#4caf50";
    }
    else if (["Terminating", "Terminated", "Completed"].includes(pod.getStatusMessage())) {
      podNode.color = "#9dabb5";
    }
    else if (["Pending", "ContainerCreating"].includes(pod.getStatusMessage())) {
      podNode.color = "#2F4F4F" // #ff9800"
    }
    else if (["CrashLoopBackOff", "Failed", "Error"].includes(pod.getStatusMessage())) {
      podNode.color = "#ce3933"
    }
    pod.getContainers().forEach((container) => {
      container.env?.forEach((env) => {
        const secretName = env.valueFrom?.secretKeyRef?.name;
        if (secretName) {
          const secret = this.secretStore.getByName(secretName, pod.getNs());
          if (secret) {
            const secretNode = this.generateNode(secret)
            this.addLink({
              source: podNode.id, target: secretNode.id
            })
          }
        }
      })
      container.envFrom?.forEach((envFrom) => {
        const configMapName = envFrom.configMapRef?.name;
        if (configMapName) {
          const configMap = this.configMapStore.getByName(configMapName, pod.getNs());
          if (configMap) {
            const configMapNode = this.generateNode(configMap);
            this.addLink({
              source: podNode.id, target: configMapNode.id
            })
          }
        }

        const secretName = envFrom.secretRef?.name;
        if (secretName) {
          const secret = this.secretStore.getByName(secretName, pod.getNs());
          if (secret) {
            const secretNode = this.generateNode(secret);
            this.addLink({
              source: podNode.id, target: secretNode.id
            })
          }
        }
      })
    })


    pod.getVolumes().filter(volume => volume.persistentVolumeClaim?.claimName).forEach((volume) => {
      const volumeClaim = this.pvcStore.getByName(volume.persistentVolumeClaim.claimName, pod.getNs())
      if (volumeClaim) {
        const volumeClaimNode = this.generateNode(volumeClaim);

        if (volumeClaimNode) {
          this.addLink({ target: podNode.id, source: volumeClaimNode.id});
        }
      }
    })


    pod.getVolumes().filter(volume => volume.configMap?.name).forEach((volume) => {
      const configMap = this.configMapStore.getByName(volume.configMap.name, pod.getNs());
      if (configMap) {
        const dataItem = this.generateNode(configMap);
        if (dataItem) {
          this.addLink({target: podNode.id, source: dataItem.id});
        }
      }
    })
    pod.getSecrets().forEach((secretName) => {
      const secret = this.secretStore.getByName(secretName, pod.getNs());
      if (secret && secret.type.toString() !== "kubernetes.io/service-account-token") {
        const dataItem = this.generateNode(secret)
        if (dataItem) {
          this.addLink({target: podNode.id, source: dataItem.id});
        }
      }
    })

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
        selfLink: `api/v1/helmreleases/${name}`
      }
    })
    const releaseData = this.generateNode(releaseObject);
    return releaseData;
  }

  renderTooltip(obj: Renderer.K8sApi.KubeObject) {
    if (!obj) return;

    const tooltipElement = document.getElementById("KubeForceChart-tooltip");

    if (tooltipElement) {
      if (obj instanceof Renderer.K8sApi.Pod) {
        ReactDOM.render(<PodTooltip obj={obj} />, tooltipElement)
      }
      else if (obj instanceof Renderer.K8sApi.Service) {
        ReactDOM.render(<ServiceTooltip obj={obj} />, tooltipElement)
      }
      else if (obj instanceof Renderer.K8sApi.Deployment) {
        ReactDOM.render(<DeploymentTooltip obj={obj} />, tooltipElement)
      }
      else if (obj instanceof Renderer.K8sApi.StatefulSet) {
        ReactDOM.render(<StatefulsetTooltip obj={obj} />, tooltipElement)
      }
      else {
        ReactDOM.render(<DefaultTooltip obj={obj}/>, tooltipElement)
      }
      return tooltipElement.innerHTML;
    }
  }

  render() {
    if (!KubeForceChart.isReady) {
      return (
        <div className="KubeForceChart flex center">
          <Renderer.Component.Spinner />
        </div>
      )
    }

    if (this.noResourcesFound) {
      return (
        <div className="KubeForceChart flex center">
          <h3 style={{ color: "#8E9297" }}>
            No visualizable resources found in this namespace.
          </h3>
        </div>
      );
    }
    
    const theme = Renderer.Theme.getActiveTheme();

    const { id, width, height } = this.props;
    const sidebarWidth = (document.querySelectorAll('[data-testid="cluster-sidebar"]')[0] as HTMLElement)?.offsetWidth || 200;
    
    return (

    <div id={id} className="KubeForceChart">
      <div id="KubeForceChart-tooltip"/>
      
        
           <ForceGraph2D
          graphData={this.state.data}
          ref={this.chartRef}
          width={width || window.innerWidth - 70 - sidebarWidth }
          height={height || window.innerHeight}
          autoPauseRedraw={false}
          linkWidth={link => this.state.highlightLinks.has(link) ? 2 : 1}
          maxZoom={2}
          cooldownTicks={200}
          onEngineStop={() => {
            if (!this.initZoomDone) {
              if (this.nodes.length > 10) {
                this.chartRef.current.zoomToFit(400);
              } else {
                this.chartRef.current.zoom(1.2);
              }
              this.initZoomDone = true;
            }
          }}
          onNodeHover={this.handleNodeHover.bind(this)}
          onNodeDrag={this.handleNodeHover.bind(this)}
          nodeVal="value"
          nodeLabel={ (node: ChartDataSeries) => { return this.renderTooltip(node.object)} }
          nodeVisibility={"visible"}
          linkColor={(link) => { return (link.source as ChartDataSeries).color }}
          onNodeClick={(node: ChartDataSeries) => {
            if (node.object) {
              if (node.object.kind == "HelmRelease") {
                const path = `/apps/releases/${node.object.getNs()}/${node.object.getName()}?`
                Renderer.Navigation.navigate(path);
              } else {
                const detailsUrl = Renderer.Navigation.getDetailsUrl(node.object.selfLink);
                Renderer.Navigation.navigate(detailsUrl);
              }
            }
          }}
          nodeCanvasObject={(node: ChartDataSeries, ctx, globalScale) => {
            const padAmount = 0;
            const label = node.name;
            const fontSize = 8;

            const r = Math.sqrt(Math.max(0, node.value || 10)) * 4 + padAmount;

            // draw outer circle
            if (["Deployment", "DaemonSet", "StatefulSet"].includes(node.kind)) {
              ctx.beginPath();
              ctx.lineWidth = 2;
              ctx.arc(node.x , node.y, r + 3, 0, 2 * Math.PI, false);
              ctx.strokeStyle = node.color;
              ctx.stroke();
              ctx.fillStyle = theme.colors["secondaryBackground"];
              ctx.fill();
              ctx.closePath();
            }

            // draw circle
            const size = this.state.hoverNode == node ? r + 1 : r

            ctx.beginPath();
            ctx.arc(node.x, node.y, size, 0, 2 * Math.PI, false);
            ctx.fillStyle = node.color || 'rgba(31, 120, 180, 0.92)';
            ctx.fill();

            // draw icon
            const image = node.image;
            if (image) {
              try {
                ctx.drawImage(image, node.x - 15, node.y - 15, 30, 30);
              } catch (e) {
                console.error(e);
              }

            }

            // draw label
            ctx.textAlign = 'center';
            ctx.font = `${fontSize}px Arial`;
            ctx.textBaseline = 'middle';
            ctx.fillStyle = theme.colors["textColorPrimary"];
            ctx.fillText(label, node.x, node.y + r + (10 / globalScale));
          }}
        /> 
      
      </div>
    )
  }
}

