import styles from "./KubeForceChart.module.scss";

import type { NodePoint } from "./helpers/graph-methods";

export interface MapNodeListProps {
  points: readonly NodePoint[];
}

/**
 * The nodes of a map that has settled, in a list out of sight, for assistive
 * technology and the integration tests: each item has the kind, namespace and
 * name of its node, and its point on the canvas.
 */
export function MapNodeList({ points }: MapNodeListProps) {
  return (
    <ul className={styles.nodeList} data-testid="resource-map-nodes" aria-label="Resources on the map">
      {points.map((point) => (
        <li
          key={point.id}
          data-kind={point.kind}
          data-namespace={point.namespace}
          data-name={point.name}
          data-x={point.x}
          data-y={point.y}
        >
          {point.kind} {point.namespace ? `${point.namespace}/` : ""}
          {point.name}
        </li>
      ))}
    </ul>
  );
}
