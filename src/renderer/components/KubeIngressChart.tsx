import { buildIngressMap } from "./helpers/details-graph";
import { KubeResourceChart } from "./KubeResourceChart";

import type { Renderer } from "@freelensapp/extensions";

import type { DetailsGraph, DetailsGraphObjects } from "./helpers/details-graph";

/**
 * The map of an Ingress: its TLS secrets, the Services of its backends, and
 * the pods they select, with the other Services that select them and their
 * controllers.
 */
export class KubeIngressChart extends KubeResourceChart<Renderer.K8sApi.Ingress> {
  protected buildGraph(objects: DetailsGraphObjects, previous: DetailsGraph) {
    return buildIngressMap(this.props.object, objects, previous);
  }
}
