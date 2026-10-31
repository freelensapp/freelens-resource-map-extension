import React from "react";
import { KubeForceChart } from "./KubeForceChart";
import styles from "./KubeResourceChartLegend.module.scss";

interface Props {
  iconSize?: number;
}

export class KubeResourceChartLegend extends React.Component<Props> {
  static defaultProps: Props = {
    iconSize: 32,
  };

  render() {
    const { iconSize } = this.props;
    return (
      <div className={styles.legend}>
        <p className={styles.title}>Legend:</p>
        {Object.entries(KubeForceChart.config).map(([kind, configItem]) => {
          const style = { "--color": configItem.color } as React.CSSProperties;
          return (
            <div key={kind} className={styles.resource} style={style}>
              <img className={styles.icon} src={configItem.icon} width={iconSize} height={iconSize} alt={kind} />
              <span className={styles.kind}>{kind}</span>
            </div>
          );
        })}
      </div>
    );
  }
}
