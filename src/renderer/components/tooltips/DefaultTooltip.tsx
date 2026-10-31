import { Renderer } from "@freelensapp/extensions";
import React from "react";
import styles from "./tooltip.module.scss";

export interface DefaultTooltipProps {
  obj: Renderer.K8sApi.KubeObject;
}

export class DefaultTooltip extends React.Component<DefaultTooltipProps> {
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
        <Renderer.Component.DrawerItem name="Created">
          {obj.metadata.creationTimestamp && `${obj.getAge()} ago`}
        </Renderer.Component.DrawerItem>
      </div>
    );
  }
}
