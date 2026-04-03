import "./KubeResourcePage.scss";
import { Renderer } from "@freelensapp/extensions";
import React from "react";
import { KubeForceChart } from "./KubeForceChart";
import { KubeResourceChartLegend } from "./KubeResourceChartLegend";

export class KubeResourcePage extends React.Component {
  render() {
    return (
      <Renderer.Component.TabLayout className="KubeResourcePage">
        <header
          className="flex gaps align-center"
          style={{ padding: "0 10px 5px 10px", margin: "10px 0", borderBottom: "1px solid" }}
        >
          <h2 className="flex gaps align-center">
            <span>Resource Map</span>
            <Renderer.Component.Icon material="info" tooltip={<KubeResourceChartLegend />} />
          </h2>
          <div className="box right">
            <Renderer.Component.NamespaceSelectFilter id="resource-map-namespace-filter" />
          </div>
        </header>

        <KubeForceChart />
      </Renderer.Component.TabLayout>
    );
  }
}
