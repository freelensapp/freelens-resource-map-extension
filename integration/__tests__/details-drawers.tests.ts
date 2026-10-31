/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The maps in the details panels, opened with showDetails as the first views
// after the kind cluster connects. The cluster frame opens on the host's
// Cluster Overview, which loads the pods; the first drawer is a Service's,
// whose map loads the Services, Ingresses, Secrets, ConfigMaps, claims and
// controllers, which no host view has loaded yet.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  appReady,
  connectApp,
  connectKindCluster,
  disconnectKindCluster,
  installExtension,
  mapOf,
  nodeKey,
  nodePoint,
  openDetails,
  podSelfLink,
  selectNamespacesInStore,
  settledNodes,
  shownDetails,
  testNamespaces,
} from "./extension-helpers";

import type { Frame } from "playwright";

import type { AppSession, MapNode } from "./extension-helpers";

const viewTimeout = { timeout: 60 * 1000 };

const service = "/api/v1/namespaces/shop/services/web";
const webDeployment = "/apis/apps/v1/namespaces/shop/deployments/web";
const catalogDeployment = "/apis/apps/v1/namespaces/shop/deployments/catalog";
const statefulSet = "/apis/apps/v1/namespaces/shop/statefulsets/db";
const daemonSet = "/apis/apps/v1/namespaces/shop/daemonsets/agent";
const ingress = "/apis/networking.k8s.io/v1/namespaces/shop/ingresses/storefront";

// A node by its kind, namespace and the start of its name, for the pods, whose names end with a random suffix.
const has = (nodes: MapNode[], kind: string, name: string) =>
  nodes.some((node) => node.kind === kind && node.namespace === "shop" && node.name.startsWith(name));

describe.skipIf(!(await appReady({ cluster: true })))("details drawers tests", () => {
  let session: AppSession | undefined;
  let frame: Frame;

  const mapOfDetails = async (selfLink: string) => {
    const drawer = await openDetails(frame, selfLink);
    const nodes = await settledNodes(frame);
    const canvases = await mapOf(frame).locator("canvas").count();
    // The error page of the boundary, whose class the CSS module names `_errorPage_<hash>`.
    const errorPage = await drawer.locator('[class*="_errorPage_"]').count();
    return { nodes, canvases, errorPage };
  };

  beforeAll(async () => {
    session = await connectApp();
    await installExtension(session);
    await disconnectKindCluster(session);
    frame = await connectKindCluster(session);
    await selectNamespacesInStore(frame, testNamespaces);
  }, 300 * 1000);

  afterAll(async () => {
    expect((await session?.close()) ?? []).toEqual([]);
  });

  it("draws the map of a Service as the first view of its stores", async () => {
    const { nodes, canvases, errorPage } = await mapOfDetails(service);

    expect(nodes.map(nodeKey)).toEqual(
      expect.arrayContaining(["Service shop/web", "Deployment shop/web", "Ingress shop/storefront"]),
    );
    expect(has(nodes, "Pod", "web-")).toBe(true);
    expect(canvases).toBe(1);
    expect(errorPage).toBe(0);
  });

  it.each([
    [
      "a Deployment",
      webDeployment,
      [
        ["Deployment", "web"],
        ["Pod", "web-"],
        ["Service", "web"],
        ["ConfigMap", "web-config"],
        ["Ingress", "storefront"],
      ],
    ],
    [
      "a StatefulSet",
      statefulSet,
      [
        ["StatefulSet", "db"],
        ["Pod", "db-0"],
        ["Service", "db"],
      ],
    ],
    [
      "a DaemonSet",
      daemonSet,
      [
        ["DaemonSet", "agent"],
        ["Pod", "agent-"],
      ],
    ],
    [
      "an Ingress",
      ingress,
      [
        ["Ingress", "storefront"],
        ["Secret", "storefront-tls"],
        ["Service", "web"],
        ["Pod", "web-"],
        ["Deployment", "web"],
      ],
    ],
  ])("draws the map of %s", async (_kind, selfLink, expected) => {
    const { nodes, canvases, errorPage } = await mapOfDetails(selfLink as string);

    for (const [kind, name] of expected as string[][]) {
      expect(has(nodes, kind, name), `${kind} ${name}`).toBe(true);
    }
    expect(canvases).toBe(1);
    expect(errorPage).toBe(0);
  });

  it("draws the map of a pod", async () => {
    const { nodes, canvases, errorPage } = await mapOfDetails(await podSelfLink(frame, "shop", "web-"));

    for (const [kind, name] of [
      ["Pod", "web-"],
      ["Service", "web"],
      ["Deployment", "web"],
      ["ConfigMap", "web-config"],
    ]) {
      expect(has(nodes, kind, name), `${kind} ${name}`).toBe(true);
    }
    expect(canvases).toBe(1);
    expect(errorPage).toBe(0);
  });

  it("opens the object of a node clicked in a map, and stays open a second later", async () => {
    const { nodes } = await mapOfDetails(service);
    const deployment = nodes.find((node) => nodeKey(node) === "Deployment shop/web");
    if (!deployment) throw new Error("No node of the Deployment web");
    const point = await nodePoint(frame, deployment);

    await frame.page().mouse.click(point.x, point.y);

    await expect.poll(() => shownDetails(frame), viewTimeout).toBe(webDeployment);
    await frame.waitForTimeout(1000);
    expect(shownDetails(frame)).toBe(webDeployment);
    expect(await frame.locator(".Drawer.KubeObjectDetails").isVisible()).toBe(true);
  });

  it("opens a Helm release on its route from the map of its Deployment", async () => {
    const { nodes } = await mapOfDetails(catalogDeployment);
    const release = nodes.find((node) => nodeKey(node) === "HelmRelease shop/catalog");
    if (!release) throw new Error("No node of the Helm release catalog");
    const point = await nodePoint(frame, release);

    await frame.page().mouse.click(point.x, point.y);

    await expect.poll(() => new URL(frame.url()).pathname, viewTimeout).toBe("/helm/releases/shop/catalog");
  });

  it("logs no error", () => {
    expect(session?.errors()).toEqual([]);
  });
});
