import "./KubeResourcePage.scss"
import React from "react";
import { Common, Renderer } from "@freelensapp/extensions";
import { KubeForceChart } from "./KubeForceChart"
import { KubeResourceChartLegend } from "./KubeResourceChartLegend";


export class KubeResourcePage extends React.Component {
  render() {
    return (

      
      <Renderer.Component.TabLayout className="KubeResourcePage">
        <header className="flex gaps align-center">
          <h2 className="flex gaps align-center">
            <span>Resource Map</span>
            <Renderer.Component.Icon material="info" tooltip={<KubeResourceChartLegend/>}/>
          </h2>
          <div className="box right">
          <Renderer.Component.NamespaceSelectFilter id="resource-map-namespace-filter"/>
          </div>
        </header>
        <KubeForceChart />
      </Renderer.Component.TabLayout>
    );
  }
}
