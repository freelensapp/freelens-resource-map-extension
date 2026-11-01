import { Renderer } from "@freelensapp/extensions";
import React from "react";
import styles from "./tooltip.module.scss";

export interface StatefulsetTooltipProps {
  obj: Renderer.K8sApi.StatefulSet;
}

export class StatefulsetTooltip extends React.Component<StatefulsetTooltipProps> {
  render() {
    const obj = this.props.obj;
    return (
      <div className={styles.tooltip}>
        <div>
          <b>
            {obj.kind} - {obj.getName()}
          </b>
        </div>
        <hr />
        <Renderer.Component.DrawerItem name="Namespace">{obj.getNs()}</Renderer.Component.DrawerItem>
        <Renderer.Component.DrawerItem name="Created">{obj.getAge()} ago</Renderer.Component.DrawerItem>
        <Renderer.Component.DrawerItem name="Selector" labelsOnly>
          {obj.getSelectors().map((selector: string) => {
            return (
              <div key={selector}>
                <Renderer.Component.Badge key={selector} label={selector} />
              </div>
            );
          })}
        </Renderer.Component.DrawerItem>
        <Renderer.Component.DrawerItem name="Replicas">{obj.getReplicas()}</Renderer.Component.DrawerItem>
      </div>
    );
  }
}
