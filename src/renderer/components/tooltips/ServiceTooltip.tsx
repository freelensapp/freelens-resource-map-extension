import { Renderer } from "@freelensapp/extensions";
import React from "react";
import styles from "./tooltip.module.scss";

export interface ServiceTooltipProps {
  obj: Renderer.K8sApi.Service;
}

export class ServiceTooltip extends React.Component<ServiceTooltipProps> {
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
          {obj.getSelector().map((selector) => {
            return (
              <div key={selector}>
                <Renderer.Component.Badge key={selector} label={selector} />
              </div>
            );
          })}
        </Renderer.Component.DrawerItem>
      </div>
    );
  }
}
