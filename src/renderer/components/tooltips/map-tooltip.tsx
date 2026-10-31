import { Renderer } from "@freelensapp/extensions";
import React from "react";
import { DefaultTooltip } from "./DefaultTooltip";
import { DeploymentTooltip } from "./DeploymentTooltip";
import { IngressTooltip } from "./IngressTooltip";
import styles from "./map-tooltip.module.scss";
import { PodTooltip } from "./PodTooltip";
import { ServiceTooltip } from "./ServiceTooltip";
import { StatefulsetTooltip } from "./StatefulsetTooltip";

type KubeObject = Renderer.K8sApi.KubeObject;

export interface NodeTooltipProps {
  object: KubeObject;
}

/** The tooltip of the object of a node: the one of its kind, or the default one. */
export function NodeTooltip({ object }: NodeTooltipProps) {
  const { K8sApi } = Renderer;
  if (object instanceof K8sApi.Pod) {
    return <PodTooltip obj={object} />;
  }
  if (object instanceof K8sApi.Service) {
    return <ServiceTooltip obj={object} />;
  }
  if (object instanceof K8sApi.Deployment) {
    return <DeploymentTooltip obj={object} />;
  }
  if (object instanceof K8sApi.StatefulSet) {
    return <StatefulsetTooltip obj={object} />;
  }
  if (object instanceof K8sApi.Ingress) {
    return <IngressTooltip obj={object} />;
  }
  return <DefaultTooltip obj={object} />;
}

export interface MapTooltipProps {
  /** The object of the hovered node, if a node is hovered. */
  object?: KubeObject;
}

/**
 * The tooltip of the hovered node, in the map's own React tree, where the
 * host's components keep their context. The map renders it inside its
 * container, which is positioned, and hands the container's mouse moves to
 * `follow`, which places it next to the pointer without a render.
 */
export class MapTooltip extends React.Component<MapTooltipProps> {
  private readonly element = React.createRef<HTMLDivElement>();

  follow = (event: React.MouseEvent<HTMLElement>) => {
    const tooltip = this.element.current;
    if (!tooltip) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    tooltip.style.left = `${event.clientX - bounds.left + 12}px`;
    tooltip.style.top = `${event.clientY - bounds.top + 12}px`;
  };

  render() {
    const { object } = this.props;
    return (
      <div
        ref={this.element}
        className={styles.mapTooltip}
        data-testid="resource-map-tooltip"
        style={{ display: object ? "block" : "none" }}
      >
        {object ? <NodeTooltip object={object} /> : null}
      </div>
    );
  }
}
