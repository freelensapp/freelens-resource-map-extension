/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The "Resources" panel of Workloads > Overview, opened as the first view
// after the kind cluster connects. The overview loads pods and workloads, but
// no Services, Ingresses, persistent volume claims, config maps or secrets:
// the map loads them itself.

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
  openWorkloadsOverview,
  selectNamespaces,
  settledNodes,
  testNamespaces,
} from "./extension-helpers";

import type { Frame } from "playwright";

import type { AppSession } from "./extension-helpers";

const viewTimeout = { timeout: 60 * 1000 };

describe.skipIf(!(await appReady({ cluster: true })))("workloads overview tests", () => {
  let session: AppSession | undefined;
  let frame: Frame;

  beforeAll(async () => {
    session = await connectApp();
    await installExtension(session);
    await disconnectKindCluster(session);
    frame = await connectKindCluster(session);
    await countGraphInits(frame);
    await openWorkloadsOverview(frame);
  }, 300 * 1000);

  afterAll(async () => {
    expect((await session?.close()) ?? []).toEqual([]);
  });

  it("draws the Services and Ingresses of the selected namespaces in the panel", async () => {
    await selectNamespaces(frame, testNamespaces);

    await expect
      .poll(async () => (await settledNodes(frame)).map(nodeKey), viewTimeout)
      .toEqual(expect.arrayContaining(["Service shop/web", "Service billing/web", "Ingress shop/storefront"]));
  });

  it("has a canvas 480 px high and as wide as the panel, on a graph set up once", async () => {
    const map = mapOf(frame);
    const panel = await map.locator("..").boundingBox();
    const canvas = await map.locator("canvas").boundingBox();

    // The graph takes the size of its container, in whole pixels.
    expect(canvas?.height).toBe(480);
    expect(canvas?.width).toBe(Math.floor(panel?.width ?? 0));
    expect(await map.locator("canvas").count()).toBe(1);
    expect(await map.locator("canvas").isVisible()).toBe(true);
    expect(await graphInitsPerElement(frame)).toBe(1);
  });

  it("logs no error", () => {
    expect(session?.errors()).toEqual([]);
  });
});
