import { Common, Renderer,} from "@freelensapp/extensions";
import React from "react";
import { hasTypedProperty, isString } from "@freelensapp/utilities";
import { RequireExactlyOne } from "type-fest";

export interface IngressTooltipProps {
  obj: Renderer.K8sApi.Ingress;
}


// extensions/v1beta1
interface ExtensionsBackend {
  serviceName?: string;
  servicePort?: number | string;
}

// networking.k8s.io/v1
interface NetworkingBackend {
  service?: IngressService;
}

interface TypedLocalObjectReference {
  apiGroup?: string;
  kind: string;
  name: string;
}

type IngressBackend = (ExtensionsBackend | NetworkingBackend) & {
  resource?: TypedLocalObjectReference;
};

interface IngressService {
  name: string;
  port: RequireExactlyOne<{
    name: string;
    number: number;
  }>;
}

const unknownPortString = "<unknown>";

function isExtensionsBackend(backend: IngressBackend): backend is ExtensionsBackend {
  return hasTypedProperty(backend, "serviceName", isString);
}

export class IngressTooltip extends React.Component<IngressTooltipProps> {
  render() {
    const obj = this.props.obj
    return (
      <div className="KubeResourceChartTooltip ingress-tooltip flex column">
        <div>
          <b>{obj.kind} - {obj.getName()}</b>
        </div>
        <hr/>
        <Renderer.Component.DrawerItem name="Namespace">
          {obj.getNs()}
        </Renderer.Component.DrawerItem>
        {/* <Renderer.Component.DrawerItem name="Created">
           {obj.getAge()} ago
        </Renderer.Component.DrawerItem> */}
        {this.renderPaths(obj)}

      </div>
    )
  }

  renderPaths(ingress: Renderer.K8sApi.Ingress) {
    const { spec: { rules } } = ingress;

    if (!rules || !rules.length) return null;

    return rules.map((rule, index) => {
      return (
        <div className="rules" key={index}>
          {rule.host && (
            <div className="host-title">
              <>Host: {rule.host}</>
            </div>
          )}
          {rule.http && (
            <Renderer.Component.Table className="paths">
              {
                rule.http.paths.map((path, index) => {
                  const backend = this.getBackendServiceNamePort(path.backend);
                  

                  return (
                    <Renderer.Component.TableRow key={index}>
                      <Renderer.Component.TableCell className="path">{path.path || ""}</Renderer.Component.TableCell>
                      <Renderer.Component.TableCell className="backends">
                        <p key={backend}>{backend}</p>
                      </Renderer.Component.TableCell>
                    </Renderer.Component.TableRow>
                  );
                })
              }
            </Renderer.Component.Table>
          )}
        </div>
      );
    });
  }

  getBackendServiceNamePort(backend: IngressBackend | undefined): string {
    if (!backend) {
      return unknownPortString;
    }
  
    if (isExtensionsBackend(backend)) {
      return `${backend.serviceName}:${backend.servicePort}`;
    }
  
    if (backend.service) {
      const { name, port } = backend.service;
  
      return `${name}:${port.number ?? port.name}`;
    }
  
    return unknownPortString;
  }

  
}
