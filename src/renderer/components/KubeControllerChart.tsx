import { buildControllerMap } from "./helpers/details-graph";
import { KubeResourceChart } from "./KubeResourceChart";

import type { Renderer } from "@freelensapp/extensions";

import type { DetailsGraph, DetailsGraphObjects } from "./helpers/details-graph";

/**
 * The map of a Deployment, a DaemonSet or a StatefulSet: its pods, with their
 * secrets, config maps and claims, its Helm release, the Services that select
 * the pods, and the first Ingress in front of those Services, which also takes
 * the links of the later ones.
 */
export class KubeControllerChart extends KubeResourceChart<
  Renderer.K8sApi.Deployment | Renderer.K8sApi.DaemonSet | Renderer.K8sApi.StatefulSet
> {
  protected buildGraph(objects: DetailsGraphObjects, previous: DetailsGraph) {
    return buildControllerMap(this.props.object, objects, previous);
  }
}
