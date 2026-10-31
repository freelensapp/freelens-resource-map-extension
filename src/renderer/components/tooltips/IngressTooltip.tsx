import { Common, Renderer } from "@freelensapp/extensions";
import React from "react";
import styles from "./tooltip.module.scss";

export interface IngressTooltipProps {
  obj: Renderer.K8sApi.Ingress;
}

export class IngressTooltip extends React.Component<IngressTooltipProps> {
  render() {
    const obj = this.props.obj;
    return (
      <div className={Common.Util.cssNames(styles.tooltip, styles.ingress)}>
        <div>
          <b>
            {obj.kind} - {obj.getName()}
          </b>
        </div>
        <hr />
        <Renderer.Component.DrawerItem name="Namespace">{obj.getNs()}</Renderer.Component.DrawerItem>
        {this.renderPaths(obj)}
      </div>
    );
  }

  renderPaths(ingress: Renderer.K8sApi.Ingress) {
    const {
      spec: { rules },
    } = ingress;

    if (!rules || !rules.length) return null;

    return rules.map((rule, index) => {
      return (
        <div className={styles.rules} key={index}>
          {rule.host && <div className={styles.hostTitle}>Host: {rule.host}</div>}
          {rule.http && (
            <Renderer.Component.Table className="paths">
              {rule.http.paths.map((path, index) => {
                const backend = Renderer.K8sApi.getBackendServiceNamePort(path.backend);

                return (
                  <Renderer.Component.TableRow key={index}>
                    <Renderer.Component.TableCell className="path">{path.path || ""}</Renderer.Component.TableCell>
                    <Renderer.Component.TableCell className="backends">
                      <p key={backend}>{backend}</p>
                    </Renderer.Component.TableCell>
                  </Renderer.Component.TableRow>
                );
              })}
            </Renderer.Component.Table>
          )}
        </div>
      );
    });
  }
}
