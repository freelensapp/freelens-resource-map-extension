import { config } from "./config";
import { createHelmReleaseObject, getHelmReleaseName } from "./helm";

import type { Renderer } from "@freelensapp/extensions";

import type { NamespaceGraph, NamespaceGraphObjects } from "./namespace-graph";
import type { ChartDataSeries, LinkObject } from "./types";

type KubeObject = Renderer.K8sApi.KubeObject;
type Pod = Renderer.K8sApi.Pod;
type Service = Renderer.K8sApi.Service;
type Ingress = Renderer.K8sApi.Ingress;
type Controller = Renderer.K8sApi.Deployment | Renderer.K8sApi.StatefulSet | Renderer.K8sApi.DaemonSet;

/** The objects that a details map is built from, as the host's stores hold them. */
export type DetailsGraphObjects = NamespaceGraphObjects;

export type DetailsGraph = NamespaceGraph;

/**
 * Builders of the maps in the details panels, from the objects of the stores
 * alone, one per kind of map: a workload with its pods, a pod, a Service and
 * an Ingress. As on the page, a node whose id is built again, and a link
 * whose ends are built again, are the objects of `previous`, refreshed.
 */
export function buildControllerMap(controller: Controller, objects: DetailsGraphObjects, previous?: DetailsGraph) {
  const builder = new DetailsGraphBuilder(controller, objects, previous);
  builder.buildControllerMap(controller);
  return builder.graph();
}

export function buildPodMap(pod: Pod, objects: DetailsGraphObjects, previous?: DetailsGraph) {
  const builder = new DetailsGraphBuilder(pod, objects, previous);
  builder.buildPodMap(pod);
  return builder.graph();
}

export function buildServiceMap(service: Service, objects: DetailsGraphObjects, previous?: DetailsGraph) {
  const builder = new DetailsGraphBuilder(service, objects, previous);
  builder.buildServiceMap(service);
  return builder.graph();
}

export function buildIngressMap(ingress: Ingress, objects: DetailsGraphObjects, previous?: DetailsGraph) {
  const builder = new DetailsGraphBuilder(ingress, objects, previous);
  builder.buildIngressMap(ingress);
  return builder.graph();
}

const byName = <K extends KubeObject>(items: readonly K[], name: string, namespace: string | undefined) =>
  items.find((item) => item.getName() === name && (!namespace || item.getNs() === namespace));

// As the stores' getAllByNs with one namespace.
const inNamespace = <K extends KubeObject>(items: readonly K[], namespace: string) =>
  items.filter((item) => item.getNs() === namespace);

const selects = (selector: Partial<Record<string, string>>, pod: Pod) => {
  const labels = pod.metadata.labels || {};
  return Object.entries(selector).every(([key, value]) => labels[key] === value);
};

// The id of the node of an object: its kind, namespace and name.
function nodeId(object: KubeObject) {
  return `${object.kind}/${object.getNs() ?? ""}/${object.getName()}`;
}

// The ids of the ends of a link, which force-graph turns from ids into nodes.
function linkKey(link: LinkObject) {
  const id = (end: LinkObject["source"]) => (typeof end === "object" ? end.id : end);
  return `${id(link.source)} ${id(link.target)}`;
}

class DetailsGraphBuilder {
  readonly nodes: ChartDataSeries[] = [];
  readonly links: LinkObject[] = [];
  private readonly linkKeys = new Set<string>();
  private readonly nodesById = new Map<string, ChartDataSeries>();
  private readonly previousNodes: Map<string, ChartDataSeries>;
  private readonly previousLinks: Map<string, LinkObject>;
  // The namespace of the object of the panel, where the Services and the Ingresses are looked up.
  private readonly namespace: string;

  constructor(
    object: KubeObject,
    private readonly objects: DetailsGraphObjects,
    previous: DetailsGraph = { nodes: [], links: [] },
  ) {
    this.namespace = object.getNs() ?? "";
    this.previousNodes = new Map(previous.nodes.map((node) => [node.id, node]));
    this.previousLinks = new Map(previous.links.map((link) => [linkKey(link), link]));
  }

  graph(): DetailsGraph {
    return { nodes: this.nodes, links: this.links };
  }

  buildControllerMap(controller: Controller) {
    const pods = this.objects.childPods(controller);
    this.addController(controller, pods);
    this.addServices(pods);
    this.addIngresses();
  }

  buildPodMap(pod: Pod) {
    this.addPod(pod);
    this.addServices([pod]);
    const controller = this.controllerOf(pod);
    if (controller) {
      this.addController(controller, [pod]);
    }
    this.addIngresses();
  }

  buildServiceMap(service: Service) {
    this.addNode(service);
    const { selector } = service.spec;
    if (selector) {
      inNamespace(this.objects.pods, service.getNs() ?? "")
        .filter((pod) => selects(selector, pod))
        .forEach((pod) => this.addPodWithOwners(pod));
    }

    // the Ingresses whose backends name the Service
    inNamespace(this.objects.ingresses, service.getNs() ?? "").forEach((ingress) => {
      ingress.spec.rules?.forEach((rule) => {
        rule.http?.paths.forEach((path) => {
          const backend = path.backend as { serviceName?: string; service?: { name?: string } } | undefined;
          if (backend?.serviceName == service.getName() || backend?.service?.name == service.getName()) {
            const serviceNode = this.addNode(service);
            this.addLink({ source: this.addIngress(ingress), target: serviceNode });
          }
        });
      });
    });
  }

  buildIngressMap(ingress: Ingress) {
    const ingressNode = this.addIngress(ingress);
    ingress.spec.rules?.forEach((rule) => {
      rule.http?.paths.forEach((path) => {
        const backend = path.backend as { serviceName?: string; service?: { name?: string } } | undefined;
        const serviceName = backend?.serviceName || backend?.service?.name;
        const service = serviceName ? byName(this.objects.services, serviceName, ingress.getNs()) : undefined;
        if (!service) return;

        this.addLink({ source: ingressNode, target: this.addNode(service) });
        const { selector } = service.spec;
        if (selector) {
          inNamespace(this.objects.pods, ingress.getNs() ?? "")
            .filter((pod) => selects(selector, pod))
            .forEach((pod) => this.addPodWithOwners(pod));
        }
      });
    });
  }

  private findNode(object: KubeObject) {
    return this.nodesById.get(nodeId(object));
  }

  private addNode(object: KubeObject): ChartDataSeries {
    const id = nodeId(object);
    const existingNode = this.nodesById.get(id);
    if (existingNode) {
      return existingNode;
    }

    const { color, img, size } = config[object.kind.toLowerCase()];
    const node: ChartDataSeries = Object.assign(this.previousNodes.get(id) ?? {}, {
      id,
      object,
      kind: object.kind,
      name: object.getName(),
      namespace: object.getNs(),
      value: size,
      color,
      image: img,
      visible: true,
    });
    this.nodes.push(node);
    this.nodesById.set(id, node);
    return node;
  }

  private addLink(link: { source: ChartDataSeries; target: ChartDataSeries }) {
    const key = `${link.source.id} ${link.target.id}`;
    if (this.linkKeys.has(key)) return;
    this.linkKeys.add(key);
    this.links.push(Object.assign(this.previousLinks.get(key) ?? {}, link));
  }

  private addHelmRelease(name: string, namespace: string) {
    return this.addNode(createHelmReleaseObject(name, namespace));
  }

  private addController(controller: Controller, pods: readonly Pod[], podLinks = true) {
    const controllerNode = this.addNode(controller);
    controllerNode.object = controller;
    pods.forEach((pod) => {
      this.addLink({ source: controllerNode, target: this.addPod(pod, podLinks) });
    });
    const releaseName = getHelmReleaseName(controller);
    const namespace = controller.getNs();
    if (releaseName && namespace) {
      this.addLink({ target: this.addHelmRelease(releaseName, namespace), source: controllerNode });
    }
    return controllerNode;
  }

  // A pod of a Service or an Ingress, with the other Services that select it and its controller.
  private addPodWithOwners(pod: Pod) {
    this.addPod(pod, false);
    this.addServices([pod]);
    const controller = this.controllerOf(pod);
    if (controller) {
      this.addController(controller, [pod], false);
    }
  }

  // The StatefulSet or DaemonSet that owns the pod, or else the first Deployment of its namespace that has selectors,
  // all of which the pod carries.
  private controllerOf(pod: Pod): Controller | undefined {
    const [owner] = pod.getOwnerRefs();
    if (owner?.kind == "StatefulSet") {
      return byName(this.objects.statefulSets, owner.name, pod.getNs());
    }
    if (owner?.kind == "DaemonSet") {
      return byName(this.objects.daemonSets, owner.name, pod.getNs());
    }
    return this.objects.deployments.find((deployment) => {
      const selectors = deployment.getSelectors();
      return (
        deployment.getNs() === pod.getNs() &&
        selectors.length > 0 &&
        selectors.every((label) => pod.getLabels().includes(label))
      );
    });
  }

  private addIngress(ingress: Ingress) {
    const ingressNode = this.addNode(ingress);
    ingress.spec.tls
      ?.filter((tls) => tls.secretName)
      .forEach((tls) => {
        const secret = byName(this.objects.secrets, tls.secretName ?? "", ingress.getNs());
        if (secret) {
          this.addLink({ source: ingressNode, target: this.addNode(secret) });
        }
      });
    return ingressNode;
  }

  // The Services of the namespace of the panel that select one of the pods, linked to them.
  private addServices(pods: readonly Pod[]) {
    inNamespace(this.objects.services, this.namespace).forEach((service) => {
      const { selector } = service.spec;
      if (!selector) return;
      const selected = pods.filter((pod) => pod.getNs() == service.getNs() && selects(selector, pod));
      if (!selected.length) return;
      const serviceNode = this.addNode(service);
      selected.forEach((pod) => {
        const podNode = this.findNode(pod);
        if (podNode) {
          this.addLink({ source: podNode, target: serviceNode });
        }
      });
    });
  }

  // The Ingresses of the namespace of the panel whose backends name a Service on the map. The node of the first
  // Ingress that links is the node of every later one.
  private addIngresses() {
    let ingressNode: ChartDataSeries | undefined;
    inNamespace(this.objects.ingresses, this.namespace).forEach((ingress) => {
      ingress.spec.rules?.forEach((rule) => {
        rule.http?.paths.forEach((path) => {
          const backend = path.backend as { serviceName?: string; service?: { name?: string } } | undefined;
          const serviceName = backend?.serviceName || backend?.service?.name;
          if (!serviceName) return;
          const serviceNode = this.nodes.find(
            (node) => node.kind === "Service" && node.name === serviceName && node.namespace === ingress.getNs(),
          );
          if (serviceNode) {
            ingressNode ??= this.addIngress(ingress);
            this.addLink({ source: ingressNode, target: serviceNode });
          }
        });
      });
    });
  }

  private addPod(pod: Pod, links = true): ChartDataSeries {
    const { secrets, configMaps, pvcs } = this.objects;
    const namespace = pod.getNs();
    const podNode = this.addNode(pod);
    podNode.object = pod;
    const status = pod.getStatusMessage();
    if (["Running", "Succeeded"].includes(status)) {
      podNode.color = "#4caf50";
    } else if (["Terminating", "Terminated", "Completed"].includes(status)) {
      podNode.color = "#9dabb5";
    } else if (["Pending", "ContainerCreating"].includes(status)) {
      podNode.color = "#2F4F4F";
    } else if (["CrashLoopBackOff", "Failed", "Error"].includes(status)) {
      podNode.color = "#ce3933";
    }
    if (!links) {
      return podNode;
    }

    pod.getContainers().forEach((container) => {
      container.env?.forEach((env) => {
        const secretName = env.valueFrom?.secretKeyRef?.name;
        const secret = secretName ? byName(secrets, secretName, namespace) : undefined;
        if (secret) {
          this.addLink({ source: podNode, target: this.addNode(secret) });
        }
      });
      container.envFrom?.forEach((envFrom) => {
        const configMapName = envFrom.configMapRef?.name;
        const configMap = configMapName ? byName(configMaps, configMapName, namespace) : undefined;
        if (configMap) {
          this.addLink({ source: podNode, target: this.addNode(configMap) });
        }
        const secretName = envFrom.secretRef?.name;
        const secret = secretName ? byName(secrets, secretName, namespace) : undefined;
        if (secret) {
          this.addLink({ source: podNode, target: this.addNode(secret) });
        }
      });
    });
    pod.getVolumes().forEach((volume) => {
      const claimName = volume.persistentVolumeClaim?.claimName;
      const pvc = claimName ? byName(pvcs, claimName, namespace) : undefined;
      if (pvc) {
        this.addLink({ target: podNode, source: this.addNode(pvc) });
      }
    });
    pod.getVolumes().forEach((volume) => {
      const configMapName = volume.configMap?.name;
      const configMap = configMapName ? byName(configMaps, configMapName, namespace) : undefined;
      if (configMap) {
        this.addLink({ target: podNode, source: this.addNode(configMap) });
      }
    });
    pod.getSecrets().forEach((secretName) => {
      const secret = byName(secrets, secretName, namespace);
      if (secret) {
        this.addLink({ target: podNode, source: this.addNode(secret) });
      }
    });
    return podNode;
  }
}
