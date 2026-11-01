// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { KubeResourceChartLegend } from "./KubeResourceChartLegend";

afterEach(() => {
  cleanup();
});

describe("KubeResourceChartLegend", () => {
  it("names every kind for people, with none of the keys of the configuration", () => {
    const { container } = render(<KubeResourceChartLegend />);

    const names = [...container.querySelectorAll("span")].map((name) => name.textContent);
    expect(names).toEqual([
      "Deployment",
      "Daemon Set",
      "Stateful Set",
      "Service",
      "Secret",
      "Config Map",
      "Pod",
      "Ingress",
      "Helm Release",
      "Persistent Volume Claim",
    ]);
    expect(screen.queryByText("persistentvolumeclaim")).toBeNull();
    expect(screen.queryByText("helmrelease")).toBeNull();
  });
});
