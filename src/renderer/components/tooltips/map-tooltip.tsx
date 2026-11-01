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
 * `follow`, which places it next to the pointer without a render, on the side
 * where it fits in the container: a tooltip past the edge would make the
 * content of a details drawer overflow, and its scrollbar would narrow the map.
 */
export class MapTooltip extends React.Component<MapTooltipProps> {
  private readonly element = React.createRef<HTMLDivElement>();
  // The container and the point of the pointer in it, at its last move.
  private pointer?: { container: HTMLElement; x: number; y: number };

  follow = (event: React.MouseEvent<HTMLElement>) => {
    const container = event.currentTarget;
    const bounds = container.getBoundingClientRect();
    this.pointer = { container, x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    this.place();
  };

  // The graph reports the node under the pointer after the move that reached
  // it, so the tooltip shows its content, of another size, once it has been
  // placed: it is placed again for it.
  componentDidUpdate(prevProps: MapTooltipProps) {
    if (prevProps.object !== this.props.object) this.place();
  }

  private place() {
    const tooltip = this.element.current;
    if (!tooltip || !this.pointer) return;
    const { container, x, y } = this.pointer;
    const offset = 12;
    const left =
      x + offset + tooltip.offsetWidth > container.clientWidth ? x - offset - tooltip.offsetWidth : x + offset;
    const top =
      y + offset + tooltip.offsetHeight > container.clientHeight ? y - offset - tooltip.offsetHeight : y + offset;
    tooltip.style.left = `${Math.max(0, left)}px`;
    tooltip.style.top = `${Math.max(0, top)}px`;
  }

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
