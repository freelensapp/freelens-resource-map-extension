// @vitest-environment jsdom

import { Common, type Renderer } from "@freelensapp/extensions";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkloadsOverviewItem } from "./workloads-overview-item";

const overviewDetail = vi.hoisted(() => ({ broken: false }));

// The map itself needs the host's stores and a canvas; the test is about the boundary around it.
vi.mock("./KubeResourcePage", () => ({
  KubeResourceOverviewDetail: () => {
    if (overviewDetail.broken) throw new Error("broken map");
    return <p>resource map</p>;
  },
}));

const extension = { name: "@freelensapp/resource-map-extension" } as Renderer.LensExtension;

beforeEach(() => {
  // React reports an error that a boundary caught on the console as well.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  overviewDetail.broken = false;
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("WorkloadsOverviewItem", () => {
  it("renders the map", () => {
    render(<WorkloadsOverviewItem extension={extension} />);

    expect(screen.getByText("resource map")).toBeDefined();
    expect(Common.logger.error).not.toHaveBeenCalled();
  });

  it("keeps an error of the map inside the item, logs it, and leaves the rest of the overview rendered", () => {
    overviewDetail.broken = true;

    render(
      <>
        <WorkloadsOverviewItem extension={extension} />
        <p>workloads</p>
      </>,
    );

    expect(screen.getByText("Error: broken map")).toBeDefined();
    expect(screen.getByText("workloads")).toBeDefined();
    expect(Common.logger.error).toHaveBeenCalledWith(
      "[@freelensapp/resource-map-extension]: Error: broken map",
      expect.any(String),
    );
  });
});
