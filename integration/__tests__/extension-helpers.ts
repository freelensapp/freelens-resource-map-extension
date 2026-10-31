/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// The code the integration test sessions share. The sessions attach to
// Freelens started with `pnpm dev` from a freelensapp/freelens checkout, over
// the Chrome DevTools Protocol port that script opens, and drive its renderer
// with Playwright. Its name does not match `*.tests.ts`, so Vitest does not
// collect it as a test file.

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { chromium } from "playwright";

import type { Browser, ConsoleMessage, Frame, Locator, Page } from "playwright";

export const extensionName = "@freelensapp/resource-map-extension";

// The root of this checkout, which the sessions install in place.
const extensionDir = path.resolve(import.meta.dirname, "..", "..");

// The CDP endpoint of Freelens dev: `pnpm dev` of Freelens starts Electron
// with `--remoteDebuggingPort 9223`.
const cdpUrl = process.env.FREELENS_CDP_URL || "http://127.0.0.1:9223";

// The log of the main process, which CDP does not carry: the output of
// `pnpm dev` of Freelens, or its `lens.log`. Without it only the renderer's
// errors are checked.
const mainLogFile = process.env.FREELENS_MAIN_LOG;

// The kind cluster the sessions run against.
export const kindClusterName = process.env.TEST_KIND_CLUSTER_NAME || "kind";

// The namespaces of the test objects, which integration-tests.yaml applies
// from integration/fixtures before Freelens starts: the same names in both.
export const testNamespaces = ["shop", "billing"];

// The package name with `@` dropped and `/` turned into `--`
// (`sanitizeExtensionName` in Freelens's `lens-extension.ts`).
const sanitizedExtensionId = extensionName.replace("@", "").replace("/", "--");

// The link inside the sidebar item of the extension's cluster page: the
// `clusterPageMenus` id, after the sanitized package name. Only the link
// navigates.
const pageLinkTestId = `link-for-sidebar-item-${sanitizedExtensionId}-resource-map`;

const viewTimeout = { timeout: 60 * 1000 };

const ansiEscapePattern = /\u001b\[[0-9;]*m/g;

// The Kubernetes proxy of Freelens logs a request that the renderer aborts as
// an error. Freelens dev renders in React.StrictMode, which mounts every view
// twice and aborts the requests of the first mount, so the line comes and goes
// with the timing of a run. It names no request, and says nothing about the
// extension.
// The drawers of a Deployment, a DaemonSet and a StatefulSet list their pods
// with the metrics of their namespace, which the host asks metrics.k8s.io
// for, and handles the failure; kind has no metrics server, so each request
// gets a 404, which Chromium logs as an error. Only that one is left out.
const missingPodMetricsPattern =
  /^\[renderer\] Failed to load resource: the server responded with a status of 404 \((?:Not Found)?\) \(https:\/\/[0-9a-f]+\.renderer\.freelens\.app(?::\d+)?\/api-kube\/apis\/metrics\.k8s\.io\/v1beta1\/namespaces\/[a-z0-9-]+\/pods:0:0\)$/;

const abortedProxyRequestPattern = /proxy_server\.go:\d+\] Error while proxying request: context canceled$/;

/**
 * A connection to Freelens dev, with the errors that either process logs.
 */
export interface AppSession {
  browser: Browser;
  /** The root frame's page, where the catalog, the extensions and the preferences render. */
  window: Page;
  /** The errors logged so far. */
  errors(): string[];
  /** Stops collecting errors; returns every error logged until then. */
  stopCollecting(): Promise<string[]>;
  /** Stops collecting errors, unless stopped already, and closes the connection; returns every error collected. */
  close(): Promise<string[]>;
}

/**
 * Whether Freelens dev answers on its CDP endpoint and the kind cluster is
 * reachable. Outside CI a session skips with a warning otherwise; in CI the
 * run fails, so that a mistake in the workflow does not turn into a silent
 * skip.
 */
export async function appReady({ cluster }: { cluster: boolean }): Promise<boolean> {
  let reason: string | undefined;

  try {
    const response = await fetch(new URL("/json/version", cdpUrl), { signal: AbortSignal.timeout(5000) });

    if (!response.ok) {
      reason = `${cdpUrl} answered ${response.status}`;
    }
  } catch (error) {
    reason = `Freelens dev does not answer on ${cdpUrl}: ${error instanceof Error ? error.message : error}`;
  }

  if (!reason && cluster) {
    if (spawnSync("kubectl", ["--context", `kind-${kindClusterName}`, "get", "--raw", "/readyz"]).status !== 0) {
      reason = `the kind cluster ${kindClusterName} is not reachable`;
    }
  }

  if (!reason) {
    return true;
  }

  if (process.env.CI) {
    throw new Error(`Cannot run the integration tests: ${reason}`);
  }

  console.warn(`Skipping the integration tests: ${reason}`);

  return false;
}

/**
 * Describes the arguments of a console message, read in the page: an `Error`
 * by its stack, an `ErrorEvent` by its message, location and error, another
 * `Event` by its type and target, anything else as JSON.
 */
async function describeConsoleArgs(msg: ConsoleMessage): Promise<string> {
  const descriptions = await Promise.all(
    msg.args().map((arg) =>
      arg
        .evaluate((value) => {
          if (value instanceof Error) {
            return value.stack ?? `${value.name}: ${value.message}`;
          }

          if (value instanceof ErrorEvent) {
            const stack = value.error instanceof Error ? ` ${value.error.stack}` : "";

            return `${value.type} event: ${value.message} (${value.filename}:${value.lineno}:${value.colno})${stack}`;
          }

          if (value instanceof Event) {
            return `${value.type} event of ${value.target?.constructor.name ?? "no target"}`;
          }

          try {
            return JSON.stringify(value) ?? String(value);
          } catch {
            return String(value);
          }
        })
        .catch((error) => `<argument not readable: ${error instanceof Error ? error.message : error}>`),
    ),
  );

  // A message of the browser itself, such as a resource or a worker that
  // failed to load, has no arguments; its time ties it to the main log.
  return descriptions.length
    ? descriptions.join(" ")
    : `<empty message without arguments, at ${new Date(msg.timestamp()).toISOString()}>`;
}

/**
 * Collects the errors of the renderer's console, of every frame, and the
 * lines of the main log written after the session started.
 */
function collectErrors(window: Page) {
  const errorLogs: string[] = [];
  const pendingDescriptions: Promise<void>[] = [];
  let mainLogOffset = mainLogFile && fs.existsSync(mainLogFile) ? fs.statSync(mainLogFile).size : 0;

  // Chromium logs every response that is not a success as "Failed to load
  // resource", whose text has no URL, so the location of the message is added.
  // The text of a message is the preview of its arguments: the class name of
  // an object, such as `ErrorEvent`, or nothing at all. Such a message is
  // described from its arguments, read from the page after the event, and
  // `settle()` waits for that. A message of a worker names the worker.
  const onConsole = (msg: ConsoleMessage) => {
    if (msg.type() === "error") {
      const { url, lineNumber, columnNumber } = msg.location();
      const worker = msg.worker();
      const location = `${url ? ` (${url}:${lineNumber}:${columnNumber})` : ""}${worker ? ` (worker ${worker.url()})` : ""}`;
      const text = msg.text().replaceAll(ansiEscapePattern, "");
      const entry = `[renderer] ${text}${location}`;

      if (missingPodMetricsPattern.test(entry)) {
        return;
      }

      const index = errorLogs.push(entry) - 1;

      if (!text.trim() || /^[A-Z]\w*$/.test(text)) {
        pendingDescriptions.push(
          describeConsoleArgs(msg).then((description) => {
            errorLogs[index] = `[renderer] ${description}${location}`;
          }),
        );
      }
    }
  };

  const onPageError = (error: Error) => {
    errorLogs.push(`[renderer] ${error.stack ?? error.message}`);
  };

  // A line of the main log starts with its level, in the file and on the
  // console alike, after the task prefix that turbo adds to the output of
  // `pnpm dev` when it streams it (`freelens:dev: `).
  const readMainLog = () => {
    if (!mainLogFile || !fs.existsSync(mainLogFile)) {
      return;
    }

    const size = fs.statSync(mainLogFile).size;

    // A rotated log starts again from the beginning.
    if (size < mainLogOffset) {
      mainLogOffset = 0;
    }

    if (size === mainLogOffset) {
      return;
    }

    const fd = fs.openSync(mainLogFile, "r");

    try {
      const buffer = Buffer.alloc(size - mainLogOffset);

      fs.readSync(fd, buffer, 0, buffer.length, mainLogOffset);
      mainLogOffset = size;

      for (const line of buffer.toString("utf8").split("\n")) {
        const text = line.replaceAll(ansiEscapePattern, "");

        if (/^(?:[\w@/.-]+:[\w:-]+: )?\s*error:/.test(text) && !abortedProxyRequestPattern.test(text.trim())) {
          errorLogs.push(`[main] ${text.trim()}`);
        }
      }
    } finally {
      fs.closeSync(fd);
    }
  };

  window.on("console", onConsole);
  window.on("pageerror", onPageError);

  return {
    errors: () => {
      readMainLog();

      return [...errorLogs];
    },
    settle: async () => {
      await Promise.all(pendingDescriptions);
    },
    stop: () => {
      window.off("console", onConsole);
      window.off("pageerror", onPageError);
    },
  };
}

/**
 * Connects to Freelens dev and collects the errors either process logs until
 * the session stops collecting or is closed. Closing a browser connected over
 * CDP closes only the connection; the app keeps running.
 */
export async function connectApp(): Promise<AppSession> {
  const browser = await chromium.connectOverCDP(cdpUrl);

  try {
    const window = await rootPage(browser);
    const collector = collectErrors(window);
    let collected: Promise<string[]> | undefined;

    const stopCollecting = () => {
      collected ??= (async () => {
        await collector.settle();

        const errors = collector.errors();

        collector.stop();

        return errors;
      })();

      return collected;
    };

    return {
      browser,
      window,
      errors: collector.errors,
      stopCollecting,
      close: async () => {
        const errors = await stopCollecting();

        await browser.close();

        return errors;
      },
    };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

/**
 * The page of the root frame: `https://renderer.freelens.app`, on the port of
 * the app's proxy. A cluster renders in an iframe of it, on
 * `<clusterId>.renderer.freelens.app`.
 */
async function rootPage(browser: Browser): Promise<Page> {
  const deadline = Date.now() + viewTimeout.timeout;

  while (Date.now() < deadline) {
    const page = browser
      .contexts()
      .flatMap((context) => context.pages())
      .find((page) => URL.canParse(page.url()) && new URL(page.url()).hostname === "renderer.freelens.app");

    if (page) {
      await page.waitForFunction(() => globalThis.FreelensExtensionApi?.Renderer !== undefined, null, viewTimeout);

      return page;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`No Freelens window on ${cdpUrl}`);
}

/**
 * Navigates the root frame with `Renderer.Navigation.navigate` of the
 * extension API: the application menu, which the packaged-app tests click,
 * belongs to the main process, which CDP does not reach.
 */
async function navigate(window: Page, url: string) {
  console.log(`navigate to ${url}`);
  await window.evaluate((url) => {
    const renderer = globalThis.FreelensExtensionApi.Renderer;

    if (!renderer) {
      throw new Error("The page has no Renderer API");
    }

    renderer.Navigation.navigate(url);
  }, url);
}

/**
 * Dismisses the notifications, so that one still in its enter animation does
 * not intercept pointer events on the elements behind it.
 */
async function dismissNotifications(window: Page) {
  const notificationCloseSelector =
    'i[data-testid*="close-notification-for-notification_"], div[class*="close-button-module__closeButton--"][aria-label="Close"]';

  for (let attempt = 0; attempt < 10; attempt++) {
    const closeButtons = await window.$$(notificationCloseSelector);

    if (closeButtons.length === 0) break;

    for (const closeButton of closeButtons) {
      await closeButton.click({ force: true }).catch(() => {});
    }

    await window.waitForTimeout(200);
  }
}

/**
 * Uninstalls the extension from the Extensions page, from wherever it was
 * installed. An extension installed in place is forgotten, its directory
 * stays.
 */
async function uninstallExtension(window: Page, row: Locator) {
  console.log(`uninstall ${extensionName}`);
  await row.locator('[id^="menu-actions-for-installed-extensions-for-"]').click();
  await window.locator(".MenuActions .MenuItem").getByText("Uninstall", { exact: true }).click();
  await window.getByTestId("confirmation-dialog").getByTestId("confirm").click();
  await row.waitFor({ state: "detached", ...viewTimeout });
}

/**
 * Installs this checkout in place from the Extensions page and waits until it
 * is enabled. An installation of the checkout that is already enabled is
 * kept, unless `reinstall` is set; any other installation of the extension is
 * uninstalled first.
 */
export async function installExtension({ window }: AppSession, { reinstall = false } = {}) {
  await navigate(window, "/extensions");

  const table = window.getByTestId("extensions-table");
  const row = table.locator("tbody tr", { hasText: extensionName });
  const enabled = row.locator("td").nth(2).getByText("Enabled", { exact: true });

  // Once the extensions are discovered, the page shows the table, or a notice
  // in its place when no extension is installed, as in a fresh profile.
  await table.or(window.getByText("There are no extensions installed.", { exact: true })).waitFor(viewTimeout);

  if (await row.count()) {
    // An extension loaded in place reads "development" in the version column,
    // with the directory in its title.
    const inPlace = await row.locator(`[title="Loaded from ${extensionDir}"]`).count();

    if (!reinstall && inPlace && (await enabled.count())) {
      console.log(`${extensionName} is installed from ${extensionDir}`);

      return;
    }

    await uninstallExtension(window, row);
  }

  console.log(`install ${extensionDir}`);
  await window.getByPlaceholder("Name, URL, or path to a package or directory").fill(extensionDir);
  await window.getByRole("button", { name: "Install", exact: true }).click();

  // A directory is loaded in place only after a confirmation.
  await window.getByTestId("confirmation-dialog").getByTestId("confirm").click(viewTimeout);

  // The status column reads "Incompatible" if the host refuses
  // `engines.freelens`.
  await enabled.waitFor(viewTimeout);
  await dismissNotifications(window);
}

/**
 * The catalog id of the kind cluster, looked up by its name.
 */
async function kindClusterId(window: Page): Promise<string> {
  const id = await window.waitForFunction(
    (name) =>
      globalThis.FreelensExtensionApi.Renderer?.Catalog.catalogEntities
        .getItemsForApiKind("entity.k8slens.dev/v1alpha1", "KubernetesCluster")
        .find((entity) => entity.getName() === name)
        ?.getId(),
    `kind-${kindClusterName}`,
    viewTimeout,
  );

  return id.jsonValue() as Promise<string>;
}

/**
 * The phase of the kind cluster in the catalog: `connected`, `connecting`,
 * `disconnected`.
 */
async function kindClusterPhase(window: Page, id: string): Promise<string | undefined> {
  return window.evaluate(
    (id) => globalThis.FreelensExtensionApi.Renderer?.Catalog.catalogEntities.getById(id)?.status.phase,
    id,
  );
}

/**
 * Disconnects the kind cluster if it is connected, and waits until it is
 * disconnected, so that a session can make its view the first one that the
 * cluster opens after it connects. Only the kind cluster is touched; the app
 * may have others.
 */
export async function disconnectKindCluster({ window }: AppSession) {
  const id = await kindClusterId(window);

  if ((await kindClusterPhase(window, id)) === "disconnected") {
    return;
  }

  console.log(`disconnect kind-${kindClusterName}`);
  await navigate(window, "/catalog");
  await window.evaluate(async (id) => {
    const entity = globalThis.FreelensExtensionApi.Renderer?.Catalog.catalogEntities.getById(id);

    if (!entity || !("disconnect" in entity) || typeof entity.disconnect !== "function") {
      throw new Error(`The catalog has no cluster ${id}`);
    }

    await entity.disconnect();
  }, id);
  await window.waitForFunction(
    (id) =>
      globalThis.FreelensExtensionApi.Renderer?.Catalog.catalogEntities.getById(id)?.status.phase === "disconnected",
    id,
    viewTimeout,
  );
}

/**
 * Connects the kind cluster and returns the cluster's frame, where the
 * extension's page, the Workloads Overview and the details render. It opens
 * no view of the extension, so that a session opens its own as the first one.
 */
export async function connectKindCluster({ window }: AppSession): Promise<Frame> {
  const id = await kindClusterId(window);

  await navigate(window, `/cluster/${id}`);

  const element = await window.waitForSelector(`#cluster-frame-${id}`, viewTimeout);
  const frame = await element.contentFrame();

  if (!frame) {
    throw new Error(`No iframe for kind-${kindClusterName}`);
  }

  await frame.waitForSelector("[data-testid=cluster-sidebar]", viewTimeout);

  return frame;
}

/**
 * Clicks a sidebar item of the cluster frame. The entries navigate in their
 * `onClick`, and a dispatched click reaches it even while the cluster overview
 * re-lays out over the click point (`clickSidebarItem` in Freelens's
 * integration helpers).
 */
async function clickSidebarItem(frame: Frame, testId: string) {
  await frame.dispatchEvent(`[data-testid="${testId}"]`, "click");
}

/** Opens the Resource Map page from its sidebar entry. */
export async function openResourceMap(frame: Frame) {
  await frame.waitForSelector(`[data-testid="${pageLinkTestId}"]`, viewTimeout);
  await clickSidebarItem(frame, pageLinkTestId);
  await frame.locator("h2").getByText("Resource Map", { exact: true }).waitFor(viewTimeout);
}

/**
 * Opens Workloads > Overview, at its route in the cluster frame: the group of
 * the sidebar may be collapsed, and its entry is then not on the page.
 */
export async function openWorkloadsOverview(frame: Frame) {
  await frame.evaluate(() => globalThis.FreelensExtensionApi.Renderer?.Navigation.navigate("/workloads"));
  await frame.locator("h5").getByText("Resources", { exact: true }).waitFor(viewTimeout);
}

/**
 * Waits until `read` gives a value that `accept` takes, and returns it, or
 * fails after the timeout of a view with the last value. Unlike `expect.poll`,
 * it also runs in the hooks of a session.
 */
async function until<T>(what: string, read: () => T | Promise<T>, accept: (value: T) => boolean): Promise<T> {
  const deadline = Date.now() + viewTimeout.timeout;

  for (;;) {
    const value = await read();

    if (accept(value)) {
      return value;
    }

    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${what}, last ${JSON.stringify(value)}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

/** The namespaces of the cluster context, which the filter shows. */
async function selectedNamespaces(frame: Frame): Promise<string[]> {
  return frame.evaluate(() =>
    [...(globalThis.FreelensExtensionApi.Renderer?.K8sApi.namespaceStore.contextNamespaces ?? [])].sort(),
  );
}

/**
 * Selects the namespaces in the namespace filter of the open view, the host's
 * `NamespaceSelectFilter`, unless it shows them already. The first one is
 * chosen alone; the others are added with the key of a multiple selection,
 * Meta on macOS and Control elsewhere, held while the option is chosen. The
 * app keeps the selection for every view of the cluster.
 */
export async function selectNamespaces(frame: Frame, namespaces: readonly string[]) {
  const wanted = [...namespaces].sort();

  if ((await selectedNamespaces(frame)).join() === wanted.join()) {
    return;
  }

  console.log(`select namespaces ${namespaces.join(", ")}`);
  const filter = frame.locator('[data-testid="namespace-select-filter"]');
  const input = filter.locator("input");
  const multipleSelectionKey = process.platform === "darwin" ? "Meta" : "Control";
  const { keyboard } = frame.page();

  await filter.click();

  for (const [index, namespace] of namespaces.entries()) {
    await input.pressSequentially(namespace);

    if (index === 0) {
      await input.press("Enter");
    } else {
      await keyboard.down(multipleSelectionKey);
      await input.press("Enter");
      await keyboard.up(multipleSelectionKey);
    }
  }

  await until(
    `the namespaces ${wanted.join(", ")}`,
    () => selectedNamespaces(frame),
    (selected) => selected.join() === wanted.join(),
  );
  await input.press("Escape");
}

/** The map of the open view: the container of the graph, with its hidden list of the nodes. */
export function mapOf(frame: Frame): Locator {
  return frame.locator(':has(> [data-testid="resource-map-nodes"])');
}

/** A node of the map, at its point on the canvas when the graph settled. */
export interface MapNode {
  kind: string;
  namespace: string;
  name: string;
  x: number;
  y: number;
}

/**
 * Waits until the graph of the map has settled, and returns its nodes from
 * the hidden list that the map fills then. A node stays at its point until the
 * graph gets new data.
 */
export async function settledNodes(frame: Frame): Promise<MapNode[]> {
  const map = mapOf(frame);
  await frame.locator('[data-settled]:has(> [data-testid="resource-map-nodes"])').waitFor(viewTimeout);

  return map.locator('[data-testid="resource-map-nodes"] li').evaluateAll((items) =>
    items.map((item) => {
      const { kind = "", namespace = "", name = "", x = "0", y = "0" } = (item as HTMLElement).dataset;
      return { kind, namespace, name, x: Number(x), y: Number(y) };
    }),
  );
}

/** The node of an object, as `<kind> <namespace>/<name>`. */
export function nodeKey({ kind, namespace, name }: Pick<MapNode, "kind" | "namespace" | "name">) {
  return `${kind} ${namespace}/${name}`;
}

/**
 * The point of a node on the screen: its point on the canvas plus the position
 * of the canvas, which Playwright gives in the coordinates of the page, also
 * for an element of the cluster frame. The canvas is scrolled into view first:
 * the map of a details panel can be below the end of the drawer.
 */
export async function nodePoint(frame: Frame, node: MapNode): Promise<{ x: number; y: number }> {
  const canvas = mapOf(frame).locator("canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();

  if (!box) {
    throw new Error("The map has no visible canvas");
  }

  return { x: box.x + node.x, y: box.y + node.y };
}

/**
 * Selects the namespaces through the host's namespace store, in the cluster
 * frame, for a session whose first view has no namespace filter.
 */
export async function selectNamespacesInStore(frame: Frame, namespaces: readonly string[]) {
  await frame.evaluate(
    (names) => globalThis.FreelensExtensionApi.Renderer?.K8sApi.namespaceStore.selectNamespaces(names),
    [...namespaces],
  );
  const wanted = [...namespaces].sort();
  await until(
    `the namespaces ${wanted.join(", ")}`,
    () => selectedNamespaces(frame),
    (selected) => selected.join() === wanted.join(),
  );
}

/** The selfLink of the object whose details the drawer shows, from the location of the cluster frame. */
export function shownDetails(frame: Frame): string | null {
  return new URL(frame.url()).searchParams.get("kube-details");
}

/**
 * Opens the details of an object with `Renderer.Navigation.showDetails`, run
 * in the cluster frame, and waits for the map of the extension in the drawer.
 */
export async function openDetails(frame: Frame, selfLink: string): Promise<Locator> {
  console.log(`show details of ${selfLink}`);
  await frame.evaluate((link) => globalThis.FreelensExtensionApi.Renderer?.Navigation.showDetails(link), selfLink);
  await until(
    `the details of ${selfLink}`,
    () => shownDetails(frame),
    (shown) => shown === selfLink,
  );
  const drawer = frame.locator(".Drawer.KubeObjectDetails");
  await drawer.getByText("Resources", { exact: true }).waitFor(viewTimeout);
  return drawer;
}

/** The selfLink of a pod of the namespace whose name starts with the prefix, from the host's store of the pods. */
export async function podSelfLink(frame: Frame, namespace: string, prefix: string): Promise<string> {
  const selfLink = await frame.evaluate(
    ([ns, start]) =>
      globalThis.FreelensExtensionApi.Renderer?.K8sApi.podsStore.items.find(
        (pod) => pod.getNs() === ns && pod.getName().startsWith(start),
      )?.selfLink,
    [namespace, prefix] as const,
  );

  if (!selfLink) {
    throw new Error(`No pod ${namespace}/${prefix}* in the store of the pods`);
  }

  return selfLink;
}
