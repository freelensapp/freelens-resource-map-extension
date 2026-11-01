import { config } from "./config";
import { createHelmReleaseObject, getHelmReleaseName } from "./helm";

import type { Renderer } from "@freelensapp/extensions";

import type { ChartDataSeries, LinkObject } from "./types";

type KubeObject = Renderer.K8sApi.KubeObject;
type Pod = Renderer.K8sApi.Pod;
type Controller = Renderer.K8sApi.Deployment | Renderer.K8sApi.StatefulSet | Renderer.K8sApi.DaemonSet;

/** The objects that the graph of the selected namespaces is built from, as the host's stores hold them. */
export interface NamespaceGraphObjects {
  readonly pods: readonly Pod[];
  readonly deployments: readonly Renderer.K8sApi.Deployment[];
  readonly statefulSets: readonly Renderer.K8sApi.StatefulSet[];
  readonly daemonSets: readonly Renderer.K8sApi.DaemonSet[];
  readonly services: readonly Renderer.K8sApi.Service[];
  readonly ingresses: readonly Renderer.K8sApi.Ingress[];
  readonly pvcs: readonly Renderer.K8sApi.PersistentVolumeClaim[];
  readonly configMaps: readonly Renderer.K8sApi.ConfigMap[];
  readonly secrets: readonly Renderer.K8sApi.Secret[];
  /** The pods of a controller, as the host's store of its kind finds them. */
  childPods(controller: Controller): readonly Pod[];
}

export interface NamespaceGraph {
  nodes: ChartDataSeries[];
  links: LinkObject[];
}

/**
 * Builds the nodes and the links of the graph of the selected namespaces, for
 * the page and the panel, from the objects of the stores alone: it reads no
 * store and starts no reaction. An empty selection takes every object, as the
 * stores' `getAllByNs` does.
 *
 * The objects of `previous` are reused: a node whose id is built again is the
 * same node object, with its object and colour refreshed, and so is a link
 * whose ends are built again. force-graph keeps the position of a node, and
 * the picking colour of a node or a link, on the object itself, so the layout
 * does not start again and its colour registry, which frees nothing, does not
 * fill up with copies.
 */
export function buildNamespaceGraph(
  objects: NamespaceGraphObjects,
  namespaces: readonly string[],
  previous: NamespaceGraph = { nodes: [], links: [] },
): NamespaceGraph {
  const builder = new NamespaceGraphBuilder(objects, previous);
  const selected = <K extends KubeObject>(items: readonly K[]) =>
    namespaces.length ? items.filter((item) => namespaces.includes(item.getNs() ?? "")) : items;

  for (const pod of selected(objects.pods)) builder.addPod(pod);
  for (const secret of selected(objects.secrets)) builder.addSecret(secret);
  for (const pvc of selected(objects.pvcs)) builder.addNode(pvc);
  for (const controller of [
    ...selected(objects.deployments),
    ...selected(objects.statefulSets),
    ...selected(objects.daemonSets),
  ]) {
    builder.addController(controller);
  }
  for (const service of selected(objects.services)) builder.addService(service);
  for (const ingress of selected(objects.ingresses)) builder.addIngress(ingress);

  return { nodes: builder.nodes, links: builder.links };
}

// The id of the node of an object: its kind, namespace and name.
function nodeId(object: KubeObject) {
  return `${object.kind}/${object.getNs() ?? ""}/${object.getName()}`;
}

// The ids of the ends of a link, which force-graph turns from ids into nodes.
function linkKey(link: LinkObject) {
  const id = (end: LinkObject["source"]) => (typeof end === "object" ? end.id : end);
  return `${id(link.source)} ${id(link.target)}`;
}

const byName = <K extends KubeObject>(items: readonly K[], name: string, namespace: string | undefined) =>
  items.find((item) => item.getName() === name && (!namespace || item.getNs() === namespace));

class NamespaceGraphBuilder {
  readonly nodes: ChartDataSeries[] = [];
  readonly links: LinkObject[] = [];
  private readonly linkKeys = new Set<string>();
  private readonly nodesById = new Map<string, ChartDataSeries>();
  private readonly previousNodes: Map<string, ChartDataSeries>;
  private readonly previousLinks: Map<string, LinkObject>;

  constructor(
    private readonly objects: NamespaceGraphObjects,
    previous: NamespaceGraph,
  ) {
    this.previousNodes = new Map(previous.nodes.map((node) => [node.id, node]));
    this.previousLinks = new Map(previous.links.map((link) => [linkKey(link), link]));
  }

  findNode(object: KubeObject) {
    return this.nodesById.get(nodeId(object));
  }

  addNode(object: KubeObject): ChartDataSeries {
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

  addLink(link: LinkObject) {
    const source = typeof link.source === "string" ? this.nodes.find((n) => n.id === link.source) : link.source;
    const target = typeof link.target === "string" ? this.nodes.find((n) => n.id === link.target) : link.target;
    if (typeof source !== "object" || typeof target !== "object") return;

    const key = `${source.id} ${target.id}`;
    if (this.linkKeys.has(key)) return;
    this.linkKeys.add(key);
    this.links.push(Object.assign(this.previousLinks.get(key) ?? {}, { source, target }));
  }

  addHelmRelease(name: string, namespace: string) {
    return this.addNode(createHelmReleaseObject(name, namespace));
  }

  addPod(pod: Pod): ChartDataSeries {
    const { secrets, configMaps, pvcs } = this.objects;
    const namespace = pod.getNs();
    const podNode = this.addNode(pod);
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

    pod.getContainers().forEach((container) => {
      container.env?.forEach((env) => {
        const secretName = env.valueFrom?.secretKeyRef?.name;
        const secret = secretName ? byName(secrets, secretName, namespace) : undefined;
        if (secret) {
          this.addLink({ source: podNode.id, target: this.addNode(secret).id });
        }
      });
      container.envFrom?.forEach((envFrom) => {
        const configMapName = envFrom.configMapRef?.name;
        const configMap = configMapName ? byName(configMaps, configMapName, namespace) : undefined;
        if (configMap) {
          this.addLink({ source: podNode.id, target: this.addNode(configMap).id });
        }

        const secretName = envFrom.secretRef?.name;
        const secret = secretName ? byName(secrets, secretName, namespace) : undefined;
        if (secret) {
          this.addLink({ source: podNode.id, target: this.addNode(secret).id });
        }
      });
    });

    pod.getVolumes().forEach((volume) => {
      const claimName = volume.persistentVolumeClaim?.claimName;
      const pvc = claimName ? byName(pvcs, claimName, namespace) : undefined;
      if (pvc) {
        this.addLink({ target: podNode.id, source: this.addNode(pvc).id });
      }
    });
    pod.getVolumes().forEach((volume) => {
      const configMapName = volume.configMap?.name;
      const configMap = configMapName ? byName(configMaps, configMapName, namespace) : undefined;
      if (configMap) {
        this.addLink({ target: podNode.id, source: this.addNode(configMap).id });
      }
    });
    pod.getSecrets().forEach((secretName) => {
      const secret = byName(secrets, secretName, namespace);
      if (secret && secret.type.toString() !== "kubernetes.io/service-account-token") {
        this.addLink({ target: podNode.id, source: this.addNode(secret).id });
      }
    });

    return podNode;
  }

  addSecret(secret: Renderer.K8sApi.Secret) {
    // service account tokens and TLS secrets are left out
    if (["kubernetes.io/service-account-token", "kubernetes.io/tls"].includes(secret.type.toString())) return;

    const secretNode = this.addNode(secret);
    const namespace = secret.getNs();

    if (secret.type.toString() === "helm.sh/release.v1") {
      const releaseName = secret.metadata.labels?.name;
      if (releaseName && namespace) {
        this.addLink({ source: secretNode, target: this.addHelmRelease(releaseName, namespace) });
      }
    }

    // the pods of its namespace that read it in their environment
    this.nodes
      .filter((node) => node.kind === "Pod" && node.namespace == namespace)
      .forEach((podNode) => {
        (podNode.object as Pod).getContainers().forEach((container) => {
          container.env?.forEach((env) => {
            if (env.valueFrom?.secretKeyRef?.name == secret.getName()) {
              this.addLink({ source: podNode.id, target: secretNode.id });
            }
          });
          container.envFrom?.forEach((envFrom) => {
            const secretName = envFrom.secretRef?.name;
            if (secretName && secretName == secret.getName()) {
              this.addLink({ source: podNode.id, target: secretNode.id });
            }
          });
        });
      });
  }

  addController(controller: Controller) {
    const controllerNode = this.addNode(controller);
    this.objects.childPods(controller).forEach((pod) => {
      this.addLink({ source: controllerNode, target: this.addPod(pod) });
    });

    const releaseName = getHelmReleaseName(controller);
    const namespace = controller.getNs();
    if (releaseName && namespace) {
      this.addLink({ target: this.addHelmRelease(releaseName, namespace).id, source: controllerNode.id });
    }
  }

  addService(service: Renderer.K8sApi.Service) {
    const serviceNode = this.addNode(service);
    const selector = service.spec.selector;
    if (!selector) return;

    this.objects.pods
      .filter((pod) => {
        const labels = pod.metadata.labels || {};
        return (
          pod.getNs() == service.getNs() && Object.entries(selector).every(([key, value]) => labels[key] === value)
        );
      })
      .forEach((pod) => {
        const podNode = this.findNode(pod);
        if (podNode) {
          this.addLink({ source: podNode.id, target: serviceNode.id });
        }
      });
  }

  addIngress(ingress: Renderer.K8sApi.Ingress) {
    const { secrets, services } = this.objects;
    const namespace = ingress.getNs();
    const ingressNode = this.addNode(ingress);

    ingress.spec.tls
      ?.filter((tls) => tls.secretName)
      .forEach((tls) => {
        const secret = byName(secrets, tls.secretName ?? "", namespace);
        if (secret) {
          this.addLink({ source: ingressNode, target: this.addNode(secret) });
        }
      });
    ingress.spec.rules?.forEach((rule) => {
      rule.http?.paths.forEach((path) => {
        const backend = path.backend as { serviceName?: string; service?: { name?: string } } | undefined;
        const serviceName = backend?.serviceName || backend?.service?.name;
        const service = serviceName ? byName(services, serviceName, namespace) : undefined;
        if (service) {
          this.addLink({ source: ingressNode, target: this.addNode(service) });
        }
      });
    });
  }
}

/** Whether two graphs have the same nodes, by id, and the same links. */
export function sameGraph(a: NamespaceGraph, b: NamespaceGraph): boolean {
  const nodeIds = new Set(b.nodes.map((node) => node.id));
  const linkKeys = new Set(b.links.map(linkKey));
  return (
    a.nodes.length === b.nodes.length &&
    a.links.length === b.links.length &&
    a.nodes.every((node) => nodeIds.has(node.id)) &&
    a.links.every((link) => linkKeys.has(linkKey(link)))
  );
}
