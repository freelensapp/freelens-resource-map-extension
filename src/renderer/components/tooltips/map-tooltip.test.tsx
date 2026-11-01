// @vitest-environment jsdom

import { Renderer } from "@freelensapp/extensions";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MapTooltip } from "./map-tooltip";

type KubeObject = Renderer.K8sApi.KubeObject;

// The tooltips of the kinds render the host's components, which a unit test
// does not have; the test is about which one the map shows, and where.
vi.mock("./PodTooltip", () => ({ PodTooltip: ({ obj }: { obj: KubeObject }) => <p>pod {obj.getName()}</p> }));
vi.mock("./ServiceTooltip", () => ({
  ServiceTooltip: ({ obj }: { obj: KubeObject }) => <p>service {obj.getName()}</p>,
}));
vi.mock("./DeploymentTooltip", () => ({
  DeploymentTooltip: ({ obj }: { obj: KubeObject }) => <p>deployment {obj.getName()}</p>,
}));
vi.mock("./StatefulsetTooltip", () => ({
  StatefulsetTooltip: ({ obj }: { obj: KubeObject }) => <p>stateful set {obj.getName()}</p>,
}));
vi.mock("./IngressTooltip", () => ({
  IngressTooltip: ({ obj }: { obj: Renderer.K8sApi.Ingress }) => (
    <p>
      ingress {obj.getName()} for {obj.spec.rules?.map((rule) => rule.host).join(", ")}
    </p>
  ),
}));
vi.mock("./DefaultTooltip", () => ({
  DefaultTooltip: ({ obj }: { obj: KubeObject }) => <p>default {obj.getName()}</p>,
}));

const metadata = (name: string) => ({ name, namespace: "shop", selfLink: `/api/v1/namespaces/shop/objects/${name}` });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("MapTooltip", () => {
  it.each([
    ["a Pod", new Renderer.K8sApi.Pod({ apiVersion: "v1", kind: "Pod", metadata: metadata("web-1") }), "pod web-1"],
    [
      "a Service",
      new Renderer.K8sApi.Service({ apiVersion: "v1", kind: "Service", metadata: metadata("web") }),
      "service web",
    ],
    [
      "a Deployment",
      new Renderer.K8sApi.Deployment({ apiVersion: "apps/v1", kind: "Deployment", metadata: metadata("web") }),
      "deployment web",
    ],
    [
      "a StatefulSet",
      new Renderer.K8sApi.StatefulSet({ apiVersion: "apps/v1", kind: "StatefulSet", metadata: metadata("db") }),
      "stateful set db",
    ],
    [
      "an Ingress",
      new Renderer.K8sApi.Ingress({
        apiVersion: "networking.k8s.io/v1",
        kind: "Ingress",
        metadata: metadata("storefront"),
        spec: { tls: [], rules: [{ host: "shop.example.com" }, { host: "www.example.com" }] },
      }),
      "ingress storefront for shop.example.com, www.example.com",
    ],
    [
      "a ConfigMap",
      new Renderer.K8sApi.KubeObject({ apiVersion: "v1", kind: "ConfigMap", metadata: metadata("web-config") }),
      "default web-config",
    ],
  ])("shows the tooltip of %s", (_kind, object, text) => {
    render(<MapTooltip object={object} />);

    const tooltip = screen.getByTestId("resource-map-tooltip");
    expect(tooltip.textContent).toBe(text);
    expect(tooltip.style.display).toBe("block");
  });

  it("is hidden and empty while no node is hovered", () => {
    render(<MapTooltip />);

    const tooltip = screen.getByTestId("resource-map-tooltip");
    expect(tooltip.style.display).toBe("none");
    expect(tooltip.textContent).toBe("");
  });

  // jsdom lays nothing out: the sizes of the container and the tooltip are set by hand.
  const renderInMap = () => {
    const tooltipRef = React.createRef<MapTooltip>();
    const object = new Renderer.K8sApi.Pod({ apiVersion: "v1", kind: "Pod", metadata: metadata("web-1") });
    render(
      <div data-testid="map" onMouseMove={(event) => tooltipRef.current?.follow(event)}>
        <MapTooltip ref={tooltipRef} object={object} />
      </div>,
    );
    const map = screen.getByTestId("map");
    const tooltip = screen.getByTestId("resource-map-tooltip");
    Object.defineProperties(map, { clientWidth: { value: 800 }, clientHeight: { value: 600 } });
    Object.defineProperties(tooltip, { offsetWidth: { value: 300 }, offsetHeight: { value: 120 } });
    return { map, tooltip };
  };

  it("follows the pointer over the container of the map", () => {
    const { map } = renderInMap();
    vi.spyOn(map, "getBoundingClientRect").mockReturnValue({
      x: 40,
      y: 30,
      left: 40,
      top: 30,
      right: 840,
      bottom: 630,
      width: 800,
      height: 600,
      toJSON: () => ({}),
    });

    fireEvent.mouseMove(map, { clientX: 140, clientY: 80 });

    const tooltip = screen.getByTestId("resource-map-tooltip");
    expect(tooltip.style.left).toBe("112px");
    expect(tooltip.style.top).toBe("62px");
  });

  it("stays inside the container, on the side of the pointer where it fits", () => {
    const { map, tooltip } = renderInMap();
    vi.spyOn(map, "getBoundingClientRect").mockReturnValue({
      x: 40,
      y: 30,
      left: 40,
      top: 30,
      right: 840,
      bottom: 630,
      width: 800,
      height: 600,
      toJSON: () => ({}),
    });

    fireEvent.mouseMove(map, { clientX: 740, clientY: 530 });

    expect(tooltip.style.left).toBe("388px");
    expect(tooltip.style.top).toBe("368px");

    fireEvent.mouseMove(map, { clientX: 50, clientY: 40 });

    expect(tooltip.style.left).toBe("22px");
    expect(tooltip.style.top).toBe("22px");
  });

  it("places itself again for a node that it shows after the last move of the pointer", () => {
    const tooltipRef = React.createRef<MapTooltip>();
    const view = (object?: KubeObject) => (
      <div data-testid="map" onMouseMove={(event) => tooltipRef.current?.follow(event)}>
        <MapTooltip ref={tooltipRef} object={object} />
      </div>
    );
    const { rerender } = render(view());
    const map = screen.getByTestId("map");
    const tooltip = screen.getByTestId("resource-map-tooltip");
    // Hidden, the tooltip has no size; with the content of a node, 300 by 120 px.
    const size = { width: 0, height: 0 };
    Object.defineProperties(map, { clientWidth: { value: 800 }, clientHeight: { value: 600 } });
    Object.defineProperties(tooltip, {
      offsetWidth: { get: () => size.width },
      offsetHeight: { get: () => size.height },
    });
    vi.spyOn(map, "getBoundingClientRect").mockReturnValue({
      x: 40,
      y: 30,
      left: 40,
      top: 30,
      right: 840,
      bottom: 630,
      width: 800,
      height: 600,
      toJSON: () => ({}),
    });
    // The move that reaches a node near the corner, before the graph reports the node.
    fireEvent.mouseMove(map, { clientX: 740, clientY: 530 });
    expect(tooltip.style.left).toBe("712px");

    Object.assign(size, { width: 300, height: 120 });
    rerender(view(new Renderer.K8sApi.Pod({ apiVersion: "v1", kind: "Pod", metadata: metadata("web-1") })));

    expect(tooltip.style.left).toBe("388px");
    expect(tooltip.style.top).toBe("368px");
  });
});
