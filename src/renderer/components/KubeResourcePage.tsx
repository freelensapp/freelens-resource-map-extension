import { Renderer } from "@freelensapp/extensions";
import React from "react";
import { KubeForceChart } from "./KubeForceChart";
import { KubeResourceChartLegend } from "./KubeResourceChartLegend";
import styles from "./KubeResourcePage.module.scss";

export class KubeResourcePage extends React.Component {
  render() {
    return (
      <Renderer.Component.TabLayout className={styles.kubeResourcePage}>
        <header className={styles.header}>
          <h2 className={styles.title}>
            <span>Resource Map</span>
            <Renderer.Component.Icon material="info" tooltip={<KubeResourceChartLegend />} />
          </h2>
          <div className={styles.namespaceFilter}>
            <Renderer.Component.NamespaceSelectFilter id="resource-map-namespace-filter" />
          </div>
        </header>

        <div className={styles.map}>
          <KubeForceChart />
        </div>
      </Renderer.Component.TabLayout>
    );
  }
}

/** The Resource Map in the Workloads Overview of a cluster. */
export function KubeResourceOverviewDetail() {
  return (
    <div className={styles.overviewDetail}>
      <div className={styles.overviewHeader}>
        <h5>Resources</h5>
      </div>
      <div className={styles.overviewContent}>
        <KubeForceChart />
      </div>
    </div>
  );
}
