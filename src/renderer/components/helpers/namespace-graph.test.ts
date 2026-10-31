import { describe, expect, it } from "vitest";
import { kubeObject, pod, secret } from "../../../../test/kube-objects";
import { buildNamespaceGraph, sameGraph } from "./namespace-graph";

import type { Renderer } from "@freelensapp/extensions";

import type { NamespaceGraph, NamespaceGraphObjects } from "./namespace-graph";
import type { ChartDataSeries } from "./types";

type Pod = Renderer.K8sApi.Pod;
type Controller = Renderer.K8sApi.Deployment | Renderer.K8sApi.StatefulSet | Renderer.K8sApi.DaemonSet;

const objects = (overrides: Partial<NamespaceGraphObjects>): NamespaceGraphObjects => ({
  pods: [],
  deployments: [],
  statefulSets: [],
  daemonSets: [],
  services: [],
  ingresses: [],
  pvcs: [],
  configMaps: [],
  secrets: [],
  childPods: () => [],
  ...overrides,
});

const nodeIds = (graph: NamespaceGraph) => graph.nodes.map((node) => node.id).sort();
const linkIds = (graph: NamespaceGraph) =>
  graph.links.map((link) => `${(link.source as ChartDataSeries).id} -> ${(link.target as ChartDataSeries).id}`).sort();

// Every node once and every link once, whatever paths reach them.
function expectNoDuplicates(graph: NamespaceGraph) {
  expect(new Set(nodeIds(graph)).size).toBe(graph.nodes.length);
  expect(new Set(linkIds(graph)).size).toBe(graph.links.length);
}

const service = (name: string, namespace: string, selector?: Record<string, string>) =>
  kubeObject<Renderer.K8sApi.Service>("Service", { name, namespace }, { spec: { selector } });

describe("buildNamespaceGraph", () => {
  it("draws the objects of every kind in the selected namespaces, and every object when none is selected", () => {
    const of = (namespace: string, name: string) => ({
      pods: [pod(`${name}-1`, namespace)],
      secrets: [secret(`${name}-credentials`, namespace)],
      pvcs: [kubeObject<Renderer.K8sApi.PersistentVolumeClaim>("PersistentVolumeClaim", { name, namespace })],
      deployments: [kubeObject<Renderer.K8sApi.Deployment>("Deployment", { name, namespace })],
      statefulSets: [kubeObject<Renderer.K8sApi.StatefulSet>("StatefulSet", { name: `${name}-db`, namespace })],
      daemonSets: [kubeObject<Renderer.K8sApi.DaemonSet>("DaemonSet", { name: `${name}-agent`, namespace })],
      services: [service(name, namespace)],
      ingresses: [kubeObject<Renderer.K8sApi.Ingress>("Ingress", { name, namespace }, { spec: {} })],
    });
    const shop = of("shop", "web");
    const billing = of("billing", "ledger");
    const input = objects(
      Object.fromEntries(
        Object.entries(shop).map(([kind, items]) => [kind, [...items, ...billing[kind as keyof typeof billing]]]),
      ),
    );
    const shopIds = [
      "DaemonSet-web-agent",
      "Deployment-web",
      "Ingress-web",
      "PersistentVolumeClaim-web",
      "Pod-web-1",
      "Secret-web-credentials",
      "Service-web",
      "StatefulSet-web-db",
    ];

    expect(nodeIds(buildNamespaceGraph(input, ["shop"]))).toEqual(shopIds);
    expect(nodeIds(buildNamespaceGraph(input, []))).toHaveLength(2 * shopIds.length);
  });

  it("links a Service to the pods that its selector matches in its namespace", () => {
    const input = objects({
      pods: [
        pod("web-1", "shop", { labels: { app: "web", tier: "front" } }),
        pod("api-1", "shop", { labels: { app: "api" } }),
        pod("web-2", "billing", { labels: { app: "web" } }),
      ],
      services: [service("web", "shop", { app: "web" }), service("headless", "shop")],
    });

    const graph = buildNamespaceGraph(input, ["shop", "billing"]);

    expect(linkIds(graph)).toEqual(["Pod-web-1 -> Service-web"]);
    expect(nodeIds(graph)).toContain("Service-headless");
  });

  it("links an Ingress to the Services of its backends and to its TLS Secret", () => {
    const ingress = kubeObject<Renderer.K8sApi.Ingress>(
      "Ingress",
      { name: "storefront", namespace: "shop" },
      {
        spec: {
          tls: [{ hosts: ["shop.example.com"], secretName: "storefront-tls" }],
          rules: [
            {
              host: "shop.example.com",
              http: {
                paths: [
                  { path: "/", backend: { service: { name: "web", port: { number: 80 } } } },
                  { path: "/api", backend: { serviceName: "api", servicePort: 8080 } },
                ],
              },
            },
          ],
        },
      },
    );
    const input = objects({
      ingresses: [ingress],
      services: [service("web", "shop"), service("api", "shop")],
      secrets: [secret("storefront-tls", "shop", "kubernetes.io/tls")],
    });

    const graph = buildNamespaceGraph(input, ["shop"]);

    expect(nodeIds(graph)).toEqual(["Ingress-storefront", "Secret-storefront-tls", "Service-api", "Service-web"]);
    expect(linkIds(graph)).toEqual([
      "Ingress-storefront -> Secret-storefront-tls",
      "Ingress-storefront -> Service-api",
      "Ingress-storefront -> Service-web",
    ]);
  });

  it("takes an Ingress without rules, one whose rule has no http, and one with a resource backend", () => {
    const ingress = (name: string, spec: object) =>
      kubeObject<Renderer.K8sApi.Ingress>("Ingress", { name, namespace: "shop" }, { spec });
    const input = objects({
      ingresses: [
        ingress("no-rules", { defaultBackend: { service: { name: "web", port: { number: 80 } } } }),
        ingress("no-http", { rules: [{ host: "shop.example.com" }] }),
        ingress("bucket", {
          rules: [
            {
              http: {
                paths: [
                  {
                    path: "/static",
                    backend: { resource: { apiGroup: "k8s.example.com", kind: "Bucket", name: "assets" } },
                  },
                ],
              },
            },
          ],
        }),
        ingress("storefront", { rules: [{ http: { paths: [{ path: "/", backend: { service: { name: "web" } } }] } }] }),
      ],
      services: [service("web", "shop")],
    });

    const graph = buildNamespaceGraph(input, ["shop"]);

    expect(nodeIds(graph)).toEqual([
      "Ingress-bucket",
      "Ingress-no-http",
      "Ingress-no-rules",
      "Ingress-storefront",
      "Service-web",
    ]);
    expect(linkIds(graph)).toEqual(["Ingress-storefront -> Service-web"]);
  });

  it("links a controller to its pods, and to the Helm release named by its labels or its annotations", () => {
    const web = kubeObject<Renderer.K8sApi.Deployment>("Deployment", {
      name: "web",
      namespace: "shop",
      labels: { heritage: "Helm", release: "storefront" },
    });
    const db = kubeObject<Renderer.K8sApi.StatefulSet>("StatefulSet", {
      name: "db",
      namespace: "shop",
      labels: { "app.kubernetes.io/managed-by": "Helm" },
      annotations: { "meta.helm.sh/release-name": "storefront" },
    });
    const agent = kubeObject<Renderer.K8sApi.DaemonSet>("DaemonSet", { name: "agent", namespace: "shop" });
    const pods = new Map<Controller, Pod[]>([
      [web, [pod("web-1", "shop")]],
      [db, [pod("db-0", "shop")]],
      [agent, [pod("agent-x2k9p", "shop")]],
    ]);
    // As in the host, the pods store holds the pods that the controllers own.
    const input = objects({
      pods: [...pods.values()].flat(),
      deployments: [web],
      statefulSets: [db],
      daemonSets: [agent],
      childPods: (controller) => pods.get(controller) ?? [],
    });

    const graph = buildNamespaceGraph(input, ["shop"]);

    expect(linkIds(graph)).toEqual([
      "DaemonSet-agent -> Pod-agent-x2k9p",
      "Deployment-web -> HelmRelease-storefront",
      "Deployment-web -> Pod-web-1",
      "StatefulSet-db -> HelmRelease-storefront",
      "StatefulSet-db -> Pod-db-0",
    ]);
    expectNoDuplicates(graph);
  });

  it("links the release Secret of Helm to its release", () => {
    const input = objects({
      secrets: [secret("sh.helm.release.v1.storefront.v1", "shop", "helm.sh/release.v1", { name: "storefront" })],
    });

    expect(linkIds(buildNamespaceGraph(input, ["shop"]))).toEqual([
      "Secret-sh.helm.release.v1.storefront.v1 -> HelmRelease-storefront",
    ]);
  });

  it("links a pod to the Secrets, ConfigMaps and PersistentVolumeClaims it uses", () => {
    const configMap = (name: string) => kubeObject<Renderer.K8sApi.ConfigMap>("ConfigMap", { name, namespace: "shop" });
    const input = objects({
      pods: [
        pod("web-1", "shop", {
          containers: [
            {
              name: "web",
              env: [{ name: "DB_PASSWORD", valueFrom: { secretKeyRef: { name: "db-credentials", key: "password" } } }],
              envFrom: [{ configMapRef: { name: "web-config" } }, { secretRef: { name: "web-secrets" } }],
            },
          ],
          volumes: [
            { name: "data", persistentVolumeClaim: { claimName: "web-data" } },
            { name: "nginx", configMap: { name: "nginx-conf" } },
            { name: "certs", secret: { secretName: "web-certs" } },
          ],
        }),
      ],
      secrets: [secret("db-credentials", "shop"), secret("web-secrets", "shop"), secret("web-certs", "shop")],
      configMaps: [configMap("web-config"), configMap("nginx-conf")],
      pvcs: [
        kubeObject<Renderer.K8sApi.PersistentVolumeClaim>("PersistentVolumeClaim", {
          name: "web-data",
          namespace: "shop",
        }),
      ],
    });

    const graph = buildNamespaceGraph(input, ["shop"]);

    expect(linkIds(graph)).toEqual([
      "ConfigMap-nginx-conf -> Pod-web-1",
      "PersistentVolumeClaim-web-data -> Pod-web-1",
      "Pod-web-1 -> ConfigMap-web-config",
      "Pod-web-1 -> Secret-db-credentials",
      "Pod-web-1 -> Secret-web-secrets",
      "Secret-web-certs -> Pod-web-1",
    ]);
    expectNoDuplicates(graph);
  });

  it("leaves out service account tokens, even mounted, and the TLS Secrets that nothing references", () => {
    const input = objects({
      pods: [pod("web-1", "shop", { volumes: [{ name: "token", secret: { secretName: "default-token-7xk2p" } }] })],
      secrets: [
        secret("default-token-7xk2p", "shop", "kubernetes.io/service-account-token"),
        secret("storefront-tls", "shop", "kubernetes.io/tls"),
        secret("db-credentials", "shop"),
      ],
    });

    const graph = buildNamespaceGraph(input, ["shop"]);

    expect(nodeIds(graph)).toEqual(["Pod-web-1", "Secret-db-credentials"]);
    expect(graph.links).toEqual([]);
  });

  it("colours a pod by the status message that the host gives it", () => {
    // The values of Pod.getStatusMessage(): Evicted, Terminating, Finalizing,
    // the phase (Pending, Running, Succeeded, Failed, Unknown) or Waiting.
    const colors = {
      Running: "#4caf50",
      Succeeded: "#4caf50",
      Terminating: "#9dabb5",
      Pending: "#2F4F4F",
      Failed: "#ce3933",
      Evicted: "#80f58e",
      Finalizing: "#80f58e",
      Unknown: "#80f58e",
      Waiting: "#80f58e",
    };
    const statuses = Object.keys(colors);
    const input = objects({ pods: statuses.map((status, i) => pod(`web-${i}`, "shop", { status })) });

    const graph = buildNamespaceGraph(input, ["shop"]);

    expect(graph.nodes.map((node) => node.color)).toEqual(Object.values(colors));
  });

  it("keeps the node objects of the ids that were already there, with their position and a fresh object", () => {
    const first = buildNamespaceGraph(objects({ pods: [pod("web-1", "shop", { status: "Pending" })] }), ["shop"]);
    const [node] = first.nodes;
    node.x = 120;
    node.y = -40;
    const updated = pod("web-1", "shop", { status: "Running" });

    const second = buildNamespaceGraph(objects({ pods: [updated] }), ["shop"], first);

    expect(second.nodes[0]).toBe(node);
    expect(node).toMatchObject({ x: 120, y: -40, object: updated, color: "#4caf50" });
  });

  it("keeps the link objects whose ends are built again, and makes the new ones", () => {
    const web = kubeObject<Renderer.K8sApi.Deployment>("Deployment", { name: "web", namespace: "shop" });
    const web1 = pod("web-1", "shop");
    const web2 = pod("web-2", "shop");
    const input = (pods: Pod[]) => objects({ pods, deployments: [web], childPods: () => pods });
    const first = buildNamespaceGraph(input([web1]), ["shop"]);
    const [link] = first.links;

    const second = buildNamespaceGraph(input([web1, web2]), ["shop"], first);

    expect(second.links).toHaveLength(2);
    expect(second.links).toContain(link);
    expect(link.source).toBe(second.nodes.find((node) => node.id === "Deployment-web"));
    expect(link.target).toBe(second.nodes.find((node) => node.id === "Pod-web-1"));
  });
});

describe("sameGraph", () => {
  const input = objects({
    deployments: [kubeObject<Renderer.K8sApi.Deployment>("Deployment", { name: "web", namespace: "shop" })],
    childPods: () => [pod("web-1", "shop")],
  });

  it("tells a graph with the same nodes and links from one that changed", () => {
    const graph = buildNamespaceGraph(input, ["shop"]);
    const [deployment, web1] = graph.nodes;

    expect(sameGraph(buildNamespaceGraph(input, ["shop"], graph), graph)).toBe(true);
    expect(sameGraph({ nodes: graph.nodes, links: [{ source: web1, target: deployment }] }, graph)).toBe(false);
    expect(sameGraph({ nodes: graph.nodes, links: [] }, graph)).toBe(false);
    expect(sameGraph({ nodes: [deployment], links: graph.links }, graph)).toBe(false);
    expect(sameGraph({ nodes: [deployment, { ...web1, id: "Pod-web-2" }], links: graph.links }, graph)).toBe(false);
  });
});
