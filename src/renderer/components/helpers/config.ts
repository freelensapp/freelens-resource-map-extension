import cmSvg from "../../assets/icons/cm.svg?url";
import deploySvg from "../../assets/icons/deploy.svg?url";
import dsSvg from "../../assets/icons/ds.svg?url";
import helmSvg from "../../assets/icons/helm.svg?url";
import ingSvg from "../../assets/icons/ing.svg?url";
import podSvg from "../../assets/icons/pod.svg?url";
import pvcSvg from "../../assets/icons/pvc.svg?url";
import secretSvg from "../../assets/icons/secret.svg?url";
import stsSvg from "../../assets/icons/sts.svg?url";
import svcSvg from "../../assets/icons/svc.svg?url";

type ConfigItem = {
  /** The name of the kind, for people. */
  label: string;
  color?: string;
  icon?: string;
  size?: number;
  img?: HTMLImageElement;
};

type Config = {
  [key: string]: ConfigItem;
};

export const config: Config = {
  deployment: {
    label: "Deployment",
    color: "#6771dc",
    icon: deploySvg,
    size: 25,
  },
  daemonset: {
    label: "Daemon Set",
    color: "#a367dc",
    icon: dsSvg,
    size: 25,
  },
  statefulset: {
    label: "Stateful Set",
    color: "#dc67ce",
    icon: stsSvg,
    size: 25,
  },
  service: {
    label: "Service",
    color: "#808af5",
    icon: svcSvg,
    size: 20,
  },
  secret: {
    label: "Secret",
    color: "#ff9933",
    icon: secretSvg,
    size: 20,
  },
  configmap: {
    label: "Config Map",
    color: "#ff9933",
    icon: cmSvg,
    size: 20,
  },
  pod: {
    label: "Pod",
    color: "#80f58e",
    icon: podSvg,
    size: 20,
  },
  ingress: {
    label: "Ingress",
    color: "#67dcbb",
    icon: ingSvg,
    size: 20,
  },
  helmrelease: {
    label: "Helm Release",
    color: "#0f1689",
    icon: helmSvg,
    size: 30,
  },
  persistentvolumeclaim: {
    label: "Persistent Volume Claim",
    color: "#cdff93",
    icon: pvcSvg,
    size: 20,
  },
};
