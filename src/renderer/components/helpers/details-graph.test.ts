import { describe, expect, it } from "vitest";
import { deployment, kubeObject, pod, secret } from "../../../../test/kube-objects";
import { buildControllerMap, buildIngressMap, buildPodMap, buildServiceMap, childPodsOf } from "./details-graph";

import type { Renderer } from "@freelensapp/extensions";

import type { DetailsGraph, DetailsGraphObjects } from "./details-graph";
import type { ChartDataSeries } from "./types";

const objects = (overrides: Partial<DetailsGraphObjects>): DetailsGraphObjects => ({
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

const linkIds = (graph: DetailsGraph) =>
  graph.links.map((link) => `${(link.source as ChartDataSeries).id} -> ${(link.target as ChartDataSeries).id}`).sort();

const service = (name: string, namespace: string, selector?: Record<string, string>) =>
  kubeObject<Renderer.K8sApi.Service>("Service", { name, namespace }, { spec: { selector } });

const ingress = (name: string, spec: object) =>
  kubeObject<Renderer.K8sApi.Ingress>("Ingress", { name, namespace: "shop" }, { spec });

describe("the builders of the details maps", () => {
  it("build the maps of a Deployment, a pod, a Service and of each Ingress, whatever the rules of the Ingresses", () => {
    const web = deployment("web", "shop", { app: "web" });
    const web1 = pod("web-1", "shop", { labels: { app: "web" } });
    const storefront = ingress("storefront", {
      rules: [{ http: { paths: [{ path: "/", backend: { service: { name: "web" } } }] } }],
    });
    const oddIngresses = [
      ingress("landing", { defaultBackend: { service: { name: "web", port: { number: 80 } } } }),
      ingress("redirect", { rules: [{ host: "old.example.com" }] }),
      ingress("assets", {
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
    ];
    const webService = service("web", "shop", { app: "web" });
    const input = objects({
      pods: [web1],
      deployments: [web],
      services: [webService],
      ingresses: [...oddIngresses, storefront],
      childPods: (controller) => (controller === web ? [web1] : []),
    });
    const servesWeb = "Ingress/shop/storefront -> Service/shop/web";

    expect(linkIds(buildControllerMap(web, input))).toEqual([
      "Deployment/shop/web -> Pod/shop/web-1",
      servesWeb,
      "Pod/shop/web-1 -> Service/shop/web",
    ]);
    expect(linkIds(buildPodMap(web1, input))).toEqual([
      "Deployment/shop/web -> Pod/shop/web-1",
      servesWeb,
      "Pod/shop/web-1 -> Service/shop/web",
    ]);
    expect(linkIds(buildServiceMap(webService, input))).toEqual([
      "Deployment/shop/web -> Pod/shop/web-1",
      servesWeb,
      "Pod/shop/web-1 -> Service/shop/web",
    ]);
    expect(linkIds(buildIngressMap(storefront, input))).toEqual([
      "Deployment/shop/web -> Pod/shop/web-1",
      servesWeb,
      "Pod/shop/web-1 -> Service/shop/web",
    ]);
    for (const odd of oddIngresses) {
      expect(buildIngressMap(odd, input).links).toEqual([]);
    }
  });

  it("take no Deployment of another namespace for one of the same name", () => {
    const billingWeb = deployment("web", "billing", { app: "web" });
    const shopWeb = deployment("web", "shop", { app: "api" });
    const front = service("front", "shop", { tier: "front" });
    const input = objects({
      pods: [
        pod("web-1", "shop", { labels: { app: "web", tier: "front" } }),
        pod("api-1", "shop", { labels: { app: "api", tier: "front" } }),
      ],
      deployments: [billingWeb, shopWeb],
      services: [front],
    });

    expect(linkIds(buildServiceMap(front, input))).toEqual([
      "Deployment/shop/web -> Pod/shop/api-1",
      "Pod/shop/api-1 -> Service/shop/front",
      "Pod/shop/web-1 -> Service/shop/front",
    ]);
  });

  it("take as the Deployment of a pod one of its namespace, and no Deployment without matchLabels", () => {
    const web1 = pod("web-1", "shop", { labels: { app: "web" } });
    const api1 = pod("api-1", "shop", { labels: { app: "api" } });
    const input = objects({
      pods: [web1, api1],
      deployments: [
        deployment("web", "billing", { app: "web" }),
        deployment("everything", "shop"),
        deployment("web", "shop", { app: "web" }),
      ],
    });

    expect(linkIds(buildPodMap(web1, input))).toEqual(["Deployment/shop/web -> Pod/shop/web-1"]);
    expect(linkIds(buildPodMap(api1, input))).toEqual([]);
  });

  it("find the pods of a workload among the pods they are given, as the host's stores do", () => {
    const web = deployment("web", "shop", { app: "web" });
    const db = kubeObject<Renderer.K8sApi.StatefulSet>("StatefulSet", { name: "db", namespace: "shop" });
    const agent = kubeObject<Renderer.K8sApi.DaemonSet>("DaemonSet", { name: "agent", namespace: "shop" });
    const pods = [
      pod("web-1", "shop", { labels: { app: "web", tier: "front" } }),
      pod("web-2", "billing", { labels: { app: "web" } }),
      pod("api-1", "shop", { labels: { app: "api" } }),
      pod("db-0", "shop", { owner: { kind: "StatefulSet", name: "db" } }),
      pod("agent-1", "shop", { owner: { kind: "DaemonSet", name: "agent" } }),
    ];
    const names = (found: readonly Renderer.K8sApi.Pod[]) => found.map((item) => item.getName());

    expect(names(childPodsOf(web, pods))).toEqual(["web-1"]);
    expect(names(childPodsOf(db, pods))).toEqual(["db-0"]);
    expect(names(childPodsOf(agent, pods))).toEqual(["agent-1"]);
  });
  describe("on what the maps draw", () => {
    const web1 = pod("web-1", "shop", {
      labels: { app: "web", "app.kubernetes.io/instance": "catalog" },
      containers: [
        {
          name: "web",
          env: [{ name: "DB_PASSWORD", valueFrom: { secretKeyRef: { name: "db-credentials", key: "password" } } }],
          envFrom: [{ configMapRef: { name: "web-config" } }],
        },
      ],
      volumes: [{ name: "data", persistentVolumeClaim: { claimName: "web-data" } }],
    });
    const web = Object.assign(deployment("web", "shop", { app: "web" }), {
      metadata: {
        name: "web",
        namespace: "shop",
        labels: { "app.kubernetes.io/managed-by": "Helm" },
        annotations: { "meta.helm.sh/release-name": "catalog" },
      },
    });
    const webService = service("web", "shop", { app: "web" });
    const storefront = kubeObject<Renderer.K8sApi.Ingress>(
      "Ingress",
      { name: "storefront", namespace: "shop" },
      {
        spec: {
          tls: [{ secretName: "storefront-tls" }],
          rules: [{ http: { paths: [{ path: "/", backend: { service: { name: "web" } } }] } }],
        },
      },
    );
    const input = objects({
      pods: [web1],
      deployments: [web],
      services: [webService],
      ingresses: [storefront],
      secrets: [secret("db-credentials", "shop"), secret("storefront-tls", "shop", "kubernetes.io/tls")],
      configMaps: [kubeObject<Renderer.K8sApi.ConfigMap>("ConfigMap", { name: "web-config", namespace: "shop" })],
      pvcs: [
        kubeObject<Renderer.K8sApi.PersistentVolumeClaim>("PersistentVolumeClaim", {
          name: "web-data",
          namespace: "shop",
        }),
      ],
      childPods: (controller) => (controller === web ? [web1] : []),
    });
    const podLinks = [
      "PersistentVolumeClaim/shop/web-data -> Pod/shop/web-1",
      "Pod/shop/web-1 -> ConfigMap/shop/web-config",
      "Pod/shop/web-1 -> Secret/shop/db-credentials",
    ];
    const around = [
      "Deployment/shop/web -> HelmRelease/shop/catalog",
      "Deployment/shop/web -> Pod/shop/web-1",
      "Ingress/shop/storefront -> Secret/shop/storefront-tls",
      "Ingress/shop/storefront -> Service/shop/web",
      "Pod/shop/web-1 -> Service/shop/web",
    ];

    it("draw a workload with its pods and what they use, their Services, the Ingress and the Helm release", () => {
      expect(linkIds(buildControllerMap(web, input))).toEqual([...around, ...podLinks].sort());
    });

    it("draw a pod with what it uses, its Services, its controller, the Ingress and the Helm release", () => {
      expect(linkIds(buildPodMap(web1, input))).toEqual([...around, ...podLinks].sort());
    });

    it("draw a Service with its pods but not what they use, their controllers and the Ingresses that name it", () => {
      expect(linkIds(buildServiceMap(webService, input))).toEqual(around);
    });

    it("draw an Ingress with its TLS Secret, its Services and their pods, without what they use", () => {
      expect(linkIds(buildIngressMap(storefront, input))).toEqual(around);
    });

    it("keep the node and link objects of the previous graph", () => {
      const first = buildControllerMap(web, input);
      const second = buildControllerMap(web, input, first);

      expect(second.nodes).toEqual(first.nodes);
      second.nodes.forEach((node, i) => expect(node).toBe(first.nodes[i]));
      second.links.forEach((link, i) => expect(link).toBe(first.links[i]));
    });
  });
});
