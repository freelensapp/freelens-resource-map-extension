import { buildServiceMap } from "./helpers/details-graph";
import { KubeResourceChart } from "./KubeResourceChart";

import type { Renderer } from "@freelensapp/extensions";

import type { DetailsGraph, DetailsGraphObjects } from "./helpers/details-graph";

/**
 * The map of a Service: the pods it selects, with the other Services that
 * select them and their controllers, and the Ingresses whose backends name it.
 */
export class KubeServiceChart extends KubeResourceChart<Renderer.K8sApi.Service> {
  protected buildGraph(objects: DetailsGraphObjects, previous: DetailsGraph) {
    return buildServiceMap(this.props.object, objects, previous);
  }
}
