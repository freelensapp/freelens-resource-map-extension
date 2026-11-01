import { buildPodMap } from "./helpers/details-graph";
import { KubeResourceChart } from "./KubeResourceChart";

import type { Renderer } from "@freelensapp/extensions";

import type { DetailsGraph, DetailsGraphObjects } from "./helpers/details-graph";

/**
 * The map of a pod: its secrets, config maps and claims, the Services that
 * select it, its controller with its Helm release, and the first Ingress in
 * front of those Services, which also takes the links of the later ones.
 */
export class KubePodChart extends KubeResourceChart<Renderer.K8sApi.Pod> {
  protected buildGraph(objects: DetailsGraphObjects, previous: DetailsGraph) {
    return buildPodMap(this.props.object, objects, previous);
  }
}
