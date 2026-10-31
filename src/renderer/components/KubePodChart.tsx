import { Renderer } from "@freelensapp/extensions";
import { KubeResourceChart } from "./KubeResourceChart";

export class KubePodChart extends KubeResourceChart<Renderer.K8sApi.Pod> {
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

    this.generatePodNode();
    this.generateIngresses();

    if (nodes.length != this.nodes.length || links.length != this.links.length) {
      this.updateState(this.nodes, this.links);
    }
  };

  protected generatePodNode() {
    const { object: pod } = this.props;

    this.getPodNode(pod);
    this.generateServices([pod]);

    const controller = this.getControllerObject(pod);

    if (controller) {
      this.getControllerChartNode(controller, [pod]);
    }
  }

  getControllerObject(pod: Renderer.K8sApi.Pod) {
    if (pod.getOwnerRefs()[0]?.kind == "StatefulSet") {
      return this.statefulsetStore.getByName(pod.getOwnerRefs()[0].name, pod.getNs());
    } else if (pod.getOwnerRefs()[0]?.kind == "DaemonSet") {
      return this.daemonsetStore.getByName(pod.getOwnerRefs()[0].name, pod.getNs());
    }
    return this.deploymentStore.items.find((deployment) =>
      deployment.getSelectors().every((label) => pod.getLabels().includes(label)),
    );
  }
}
