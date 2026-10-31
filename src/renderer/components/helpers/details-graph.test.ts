import { describe, expect, it } from "vitest";
import { deployment, kubeObject, pod } from "../../../../test/kube-objects";
import { buildControllerMap, buildIngressMap, buildPodMap, buildServiceMap } from "./details-graph";

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

  it("draw two objects of the same kind and name from two namespaces as two nodes", () => {
    // The Deployment of a pod is the first in the store whose selectors the pod carries, in any namespace.
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
      "Deployment/billing/web -> Pod/shop/web-1",
      "Deployment/shop/web -> Pod/shop/api-1",
      "Pod/shop/api-1 -> Service/shop/front",
      "Pod/shop/web-1 -> Service/shop/front",
    ]);
  });
});
