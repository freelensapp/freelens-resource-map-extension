import { Renderer } from "@freelensapp/extensions";
import { KubeResourceOverviewDetail, KubeResourcePage } from "./components";
import { ErrorBoundary, withDetailsErrorBoundary, withPageErrorBoundary } from "./components/error-boundary";
import { KubeControllerChart } from "./components/KubeControllerChart";
import { KubeIngressChart } from "./components/KubeIngressChart";
import { KubePodChart } from "./components/KubePodChart";
import { KubeServiceChart } from "./components/KubeServiceChart";

export default class KubeResourceMapRenderer extends Renderer.LensExtension {
  kubeObjectDetailItems: Renderer.LensExtension["kubeObjectDetailItems"] = [
    Renderer.K8sApi.detailsFor(Renderer.K8sApi.Deployment, {
      priority: 10,
      Details: (props) => <KubeControllerChart {...props} />,
    }),
    Renderer.K8sApi.detailsFor(Renderer.K8sApi.DaemonSet, {
      priority: 10,
      Details: (props) => <KubeControllerChart {...props} />,
    }),
    Renderer.K8sApi.detailsFor(Renderer.K8sApi.StatefulSet, {
      priority: 10,
      Details: (props) => <KubeControllerChart {...props} />,
    }),
    Renderer.K8sApi.detailsFor(Renderer.K8sApi.Pod, {
      priority: 10,
      Details: (props) => <KubePodChart {...props} />,
    }),
    Renderer.K8sApi.detailsFor(Renderer.K8sApi.Service, {
      priority: 10,
      Details: (props) => <KubeServiceChart {...props} />,
    }),
    Renderer.K8sApi.detailsFor(Renderer.K8sApi.Ingress, {
      apiVersions: ["networking.k8s.io/v1"],
      priority: 10,
      Details: (props) => <KubeIngressChart {...props} />,
    }),
  ].map((registration) => withDetailsErrorBoundary(this, registration));

  clusterPages: Renderer.LensExtension["clusterPages"] = [
    {
      id: "resource-map",
      components: {
        Page: () => <KubeResourcePage />,
      },
    },
  ].map((registration) => withPageErrorBoundary(this, registration));

  clusterPageMenus = [
    {
      target: { pageId: "resource-map" },
      title: "Resource Map",
      components: {
        Icon: (props: Renderer.Component.IconProps) => <Renderer.Component.Icon material="bubble_chart" {...props} />,
      },
    },
  ];

  // the host has no error boundary around a Workloads Overview item, and the template's wrappers do not cover it
  kubeWorkloadsOverviewItems: Renderer.LensExtension["kubeWorkloadsOverviewItems"] = [
    {
      priority: 25,
      components: {
        Details: () => (
          <ErrorBoundary extension={this}>
            <KubeResourceOverviewDetail />
          </ErrorBoundary>
        ),
      },
    },
  ];
}
