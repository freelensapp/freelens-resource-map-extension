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
