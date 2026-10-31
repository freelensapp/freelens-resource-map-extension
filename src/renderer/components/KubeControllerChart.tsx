import { KubeResourceChart } from "./KubeResourceChart";

import type { Renderer } from "@freelensapp/extensions";

export class KubeControllerChart extends KubeResourceChart<
  Renderer.K8sApi.Deployment | Renderer.K8sApi.DaemonSet | Renderer.K8sApi.StatefulSet
> {
  registerStores() {
    this.kubeObjectStores = [
      this.podsStore,
      this.serviceStore,
      this.ingressStore,
      this.pvcStore,
      this.configMapStore,
      this.secretStore,
      this.deploymentStore,
      this.daemonsetStore,
      this.statefulsetStore,
    ];
  }

  generateChartDataSeries = () => {
    const nodes = [...this.nodes];
    const links = [...this.links];

    this.generateControllerNode(this.props.object);
    this.generateIngresses();

    if (nodes.length != this.nodes.length || links.length != this.links.length) {
      this.updateState(this.nodes, this.links);
    }
  };
}
