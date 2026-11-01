import * as d3 from "d3-force";

import type React from "react";
import type { ForceGraphMethods } from "react-force-graph-2d";

import type { ChartDataSeries, LinkObject } from "./types";

/** The methods of the graph of a map, which `ForceGraph2D` puts in its ref. */
export type GraphMethods = ForceGraphMethods<ChartDataSeries, LinkObject>;

/**
 * Sets the forces of a map on its graph, the links, the charge, the collision
 * and the center, the last three from `d3-force`, and zooms in on it.
 */
export function applyMapForces(graph: GraphMethods) {
  graph.zoom(1.3, 1000);
  graph
    .d3Force("link")
    ?.strength(1.3)
    .distance(() => 60);
  graph.d3Force("charge", d3.forceManyBody().strength(-60).distanceMax(250));
  graph.d3Force("collide", d3.forceCollide(40));
  graph.d3Force("center", d3.forceCenter());
}

/**
 * The margin, in px, that a map keeps around its nodes when it fits its graph
 * to the canvas. The box of the nodes that force-graph gives holds their
 * circles, and a map draws the name of a node below its circle, 10 px under it
 * in a font that the zoom scales: the names of the bottom row reach up to 20 px
 * past the box.
 */
export const fitPadding = 32;

/** The largest zoom of the fit of a graph of ten nodes or fewer, which would otherwise fill the canvas. */
export const smallGraphZoom = 1.2;

/**
 * Fits a graph to its canvas: centers the view on the box of its nodes, and
 * zooms so that the box, with `fitPadding` around it, fills the canvas, up to
 * `maxZoom`. force-graph's `zoomToFit` keeps 10 px around the box, which cut
 * the names of the bottom row, and takes no largest zoom: on a small graph it
 * zooms in as far as the `maxZoom` of the graph.
 */
export function fitGraph(
  graph: GraphMethods | undefined,
  size: { width: number; height: number },
  maxZoom: number,
  durationMs: number,
) {
  const box = graph?.getGraphBbox();
  if (!graph || !box || size.width <= 2 * fitPadding || size.height <= 2 * fitPadding) return;
  const [left, right] = box.x;
  const [top, bottom] = box.y;
  const zoom = Math.min(
    maxZoom,
    (size.width - 2 * fitPadding) / Math.max(1, right - left),
    (size.height - 2 * fitPadding) / Math.max(1, bottom - top),
  );
  graph.centerAt((left + right) / 2, (top + bottom) / 2, durationMs);
  graph.zoom(zoom, durationMs);
}

/**
 * A ref object that hands to `onSet` what React puts in it, `null` included:
 * `react-force-graph-2d` takes no callback ref, and a map sets the forces of
 * its graph once the graph has put its methods there.
 */
export function refWithSetter<T>(onSet: (value: T | null | undefined) => void): React.MutableRefObject<T | undefined> {
  let current: T | undefined;
  return {
    get current() {
      return current;
    },
    set current(value) {
      current = value ?? undefined;
      onSet(value);
    },
  };
}

/** A node drawn on the canvas, at the point of the canvas where it settled. */
export interface NodePoint {
  id: string;
  kind: string;
  namespace?: string;
  name: string;
  x: number;
  y: number;
}

/** The points of the nodes on the canvas of a graph, from its zoom transform, for the hidden list of its map. */
export function nodePointsOf(graph: GraphMethods | undefined, nodes: readonly ChartDataSeries[]): NodePoint[] {
  return nodes.map(({ id, kind, namespace, name, x = 0, y = 0 }) => {
    const point = graph?.graph2ScreenCoords(x, y) ?? { x: 0, y: 0 };
    return { id, kind, namespace, name, x: Math.round(point.x), y: Math.round(point.y) };
  });
}
