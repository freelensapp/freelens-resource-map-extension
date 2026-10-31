import { Renderer } from "@freelensapp/extensions";
import { KubeResourceChart } from "./KubeResourceChart";

export class KubeServiceChart extends KubeResourceChart {
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

    const { object: service } = this.props;
    const selector = (service as Renderer.K8sApi.Service).spec.selector;

    this.generateNode(service);

    if (selector) {
      this.podsStore
        .getAllByNs(service.getNs() ?? "")
        .filter((item) => {
          const itemLabels = item.metadata.labels || {};
          return Object.entries(selector).every(([key, value]) => {
            return itemLabels[key] === value;
          });
        })
        .forEach((pod) => this.generatePodNode(pod));
    }

    this.generateIngresses();

    if (nodes.length != this.nodes.length || links.length != this.links.length) {
      this.updateState(this.nodes, this.links);
    }
  };

  protected generateIngresses() {
    const { ingressStore } = this;
    const { object: service } = this.props;

    ingressStore.getAllByNs(service.getNs() ?? "").forEach((ingress) => {
      ingress.spec.rules?.forEach((rule) => {
        rule.http?.paths.forEach((path) => {
          const backend = path.backend as { serviceName?: string; service?: { name?: string } } | undefined;
          if (backend?.serviceName == service.getName() || backend?.service?.name == service.getName()) {
            const serviceNode = this.generateNode(service);
            const ingressNode = this.getIngressNode(ingress);
            if (serviceNode) {
              this.addLink({ source: ingressNode, target: serviceNode });
            }
          }
        });
      });
    });
  }

  protected generatePodNode(pod: Renderer.K8sApi.Pod) {
    this.getPodNode(pod, false);
    this.generateServices([pod]);

    const controller = this.getControllerObject(pod);

    if (controller) {
      this.getControllerChartNode(controller, [pod], false);
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
