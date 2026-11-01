/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The Resource Map page, opened as the first view of the extension after the
// kind cluster connects, on the test objects of integration/fixtures.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  appReady,
  connectApp,
  connectKindCluster,
  countGraphInits,
  disconnectKindCluster,
  graphInitsPerElement,
  installExtension,
  mapOf,
  nodeKey,
  nodePoint,
  openResourceMap,
  selectNamespaces,
  settledNodes,
  testNamespaces,
} from "./extension-helpers";

import type { Frame } from "playwright";

import type { AppSession, MapNode } from "./extension-helpers";

const viewTimeout = { timeout: 60 * 1000 };

describe.skipIf(!(await appReady({ cluster: true })))("resource map page tests", () => {
  let session: AppSession | undefined;
  let frame: Frame;

  const nodes = async () => settledNodes(frame);
  const find = async (key: string): Promise<MapNode> => {
    const node = (await nodes()).find((candidate) => nodeKey(candidate) === key);

    if (!node) {
      throw new Error(`No node ${key} on the map`);
    }

    return node;
  };

  beforeAll(async () => {
    session = await connectApp();
    await installExtension(session);
    await disconnectKindCluster(session);
    frame = await connectKindCluster(session);
    await countGraphInits(frame);
    await openResourceMap(frame);
  }, 300 * 1000);

  afterAll(async () => {
    expect((await session?.close()) ?? []).toEqual([]);
  });

  it("draws the objects of the selected namespaces", async () => {
    await selectNamespaces(frame, testNamespaces);

    await expect
      .poll(async () => (await nodes()).map(nodeKey), viewTimeout)
      .toEqual(
        expect.arrayContaining([
          "Deployment shop/web",
          "Deployment billing/web",
          "Service shop/web",
          "Service billing/web",
          "ConfigMap shop/web-config",
          "ConfigMap billing/web-config",
          "Ingress shop/storefront",
          "Ingress shop/landing",
          "Ingress shop/redirect",
          "Ingress shop/assets",
          "Secret shop/storefront-tls",
          "Deployment shop/catalog",
          "HelmRelease shop/catalog",
        ]),
      );
  });

  it("draws one canvas, on a graph set up once", async () => {
    const canvas = mapOf(frame).locator("canvas");

    expect(await canvas.count()).toBe(1);
    expect(await canvas.isVisible()).toBe(true);
    expect(await graphInitsPerElement(frame)).toBe(1);
  });

  it("follows a change of the selection", async () => {
    await selectNamespaces(frame, ["shop"]);

    await expect
      .poll(async () => (await nodes()).filter((node) => node.namespace === "billing").map(nodeKey), viewTimeout)
      .toEqual([]);
    expect((await nodes()).map(nodeKey)).toContain("Deployment shop/web");
  });

  it("shows the tooltip of the node under the pointer", async () => {
    const point = await nodePoint(frame, await find("Deployment shop/web"));

    await frame.page().mouse.move(point.x, point.y);

    const tooltip = frame.locator('[data-testid="resource-map-tooltip"]');
    await tooltip.waitFor({ state: "visible", ...viewTimeout });
    expect(await tooltip.textContent()).toContain("Deployment - web");
  });

  it("opens a Helm release on its route when its node is clicked", async () => {
    const point = await nodePoint(frame, await find("HelmRelease shop/catalog"));

    await frame.page().mouse.click(point.x, point.y);

    await expect.poll(() => new URL(frame.url()).pathname, viewTimeout).toBe("/helm/releases/shop/catalog");
  });

  it("logs no error", () => {
    expect(session?.errors()).toEqual([]);
  });
});
