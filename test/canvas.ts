// Stand-ins for the canvas of a map, which jsdom does not have: a context that
// records what a map draws for a node, and the methods of force-graph that a
// map fits its graph to the canvas with.
import { vi } from "vitest";

import type { ChartDataSeries } from "../src/renderer/components/helpers/types";

type DrawNode = (node: ChartDataSeries, ctx: CanvasRenderingContext2D, globalScale: number) => void;

/**
 * How far below its circle, in px on the screen, the `nodeCanvasObject` of a
 * map draws the name of `node` at the zoom `zoom`. The circle is the last arc
 * drawn for the node, after the ring of a workload. The name is centered on
 * its point (`textBaseline` "middle"), and a descender reaches about 0.6 em
 * below it.
 */
export function nameBelowCircle(drawNode: DrawNode, node: ChartDataSeries, zoom: number): number {
  let radius = 0;
  let nameY = 0;
  const ctx = {
    font: "",
    beginPath() {},
    closePath() {},
    fill() {},
    stroke() {},
    drawImage() {},
    arc(_x: number, _y: number, r: number) {
      radius = r;
    },
    fillText(_text: string, _x: number, y: number) {
      nameY = y;
    },
  };
  drawNode({ ...node, x: 0, y: 0 }, ctx as unknown as CanvasRenderingContext2D, zoom);
  return (nameY + 0.6 * Number.parseFloat(ctx.font) - radius) * zoom;
}

/** A box in the coordinates of a graph, as force-graph's `getGraphBbox` gives it. */
export interface GraphBox {
  x: [number, number];
  y: [number, number];
}

/**
 * The methods of force-graph that a map fits its graph with, for a graph whose
 * nodes have the box `box()`, that of their circles, on a canvas of
 * `canvas()`. `centerAt` and `zoom` record their calls, and `zoomToFit`
 * centers and zooms as force-graph's does, with a margin of 10 px unless it is
 * given one.
 */
export function fakeFitMethods(box: () => GraphBox, canvas: () => { width: number; height: number }) {
  const centerAt = vi.fn((_x: number, _y: number, _durationMs?: number) => {});
  const zoom = vi.fn((_scale: number, _durationMs?: number) => {});
  const zoomToFit = vi.fn((durationMs?: number, padding = 10) => {
    const [left, right] = box().x;
    const [top, bottom] = box().y;
    const { width, height } = canvas();
    centerAt((left + right) / 2, (top + bottom) / 2, durationMs);
    zoom(Math.min((width - 2 * padding) / (right - left), (height - 2 * padding) / (bottom - top)), durationMs);
  });
  return { centerAt, zoom, zoomToFit, getGraphBbox: vi.fn(() => box()) };
}

/**
 * Where `box` lands on a canvas of `width` by `height` px, in px, with the
 * center and the zoom that the map last gave the graph through `methods`.
 * force-graph keeps the zoom within its `maxZoom`, and starts with the origin
 * of the graph at the center of the canvas.
 */
export function boxOnCanvas(
  methods: ReturnType<typeof fakeFitMethods>,
  box: GraphBox,
  { width, height, maxZoom }: { width: number; height: number; maxZoom: number },
) {
  const [x, y] = methods.centerAt.mock.lastCall ?? [0, 0];
  const zoom = Math.min(maxZoom, methods.zoom.mock.lastCall?.[0] ?? 1);
  return {
    zoom,
    left: width / 2 + (box.x[0] - x) * zoom,
    right: width / 2 + (box.x[1] - x) * zoom,
    top: height / 2 + (box.y[0] - y) * zoom,
    bottom: height / 2 + (box.y[1] - y) * zoom,
  };
}
