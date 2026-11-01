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
