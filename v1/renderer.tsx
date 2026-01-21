import React from "react"
import { Renderer } from "@freelensapp/extensions";
import { KubeForceChart, KubeResourcePage } from "./components"
import { KubeControllerChart } from "./components/KubeControllerChart";
import { KubePodChart } from "./components/KubePodChart";
import { KubeIngressChart } from "./components/KubeIngressChart";
import { KubeServiceChart } from "./components/KubeServiceChart";

export default class KubeResourceMapRenderer extends Renderer.LensExtension {
  kubeObjectDetailItems = [
    {
      kind: "Deployment",
      apiVersions: ["apps/v1"],
      priority: 10,
      components: {
        Details: (props: Renderer.Component.KubeObjectDetailsProps<Renderer.K8sApi.Deployment>) => <KubeControllerChart {...props} />
      }
    },
    {
      kind: "DaemonSet",
      apiVersions: ["apps/v1"],
      priority: 10,
      components: {
        Details: (props: Renderer.Component.KubeObjectDetailsProps<Renderer.K8sApi.DaemonSet>) => <KubeControllerChart {...props} />
      }
    },
    {
      kind: "StatefulSet",
      apiVersions: ["apps/v1"],
      priority: 10,
      components: {
        Details: (props: Renderer.Component.KubeObjectDetailsProps<Renderer.K8sApi.StatefulSet>) => <KubeControllerChart {...props} />
      }
    },
    {
      kind: "Pod",
      apiVersions: ["v1"],
      priority: 10,
      components: {
        Details: (props: Renderer.Component.KubeObjectDetailsProps<Renderer.K8sApi.Pod>) => <KubePodChart {...props} />
      }
    },
    {
      kind: "Service",
      apiVersions: ["v1"],
      priority: 10,
      components: {
        Details: (props: Renderer.Component.KubeObjectDetailsProps<Renderer.K8sApi.Service>) => <KubeServiceChart {...props} />
      }
    },
    {
      kind: "Ingress",
      apiVersions: ["networking.k8s.io/v1"],
      priority: 10,
      components: {
        Details: (props: Renderer.Component.KubeObjectDetailsProps<Renderer.K8sApi.Pod>) => <KubeIngressChart {...props} />
      }
    }

  ];

  clusterPages = [
    {
      id: "resource-map",
      components: {
        Page: () => <KubeResourcePage />,
      }
    },
  ]

  clusterPageMenus = [
    {
      target: { pageId: "resource-map" },
      title: "Resource Map",
      components: {
        Icon: (props: Renderer.Component.IconProps) => (
          <Renderer.Component.Icon material="bubble_chart" {...props} />
        ),
      },
    }
  ]

  

  kubeWorkloadsOverviewItems = [
    {
      priority: 25,
      components : {
        Details: () => { return (
          <div className="ResourceMapOverviewDetail">
            <div className="header flex gaps align-center">
              <h5 className="box grow">Resources</h5>
            </div>
            <div className="content">
              <KubeForceChart height={480} />
            </div>
          </div>
        )}
      }
    }
  ]
}


