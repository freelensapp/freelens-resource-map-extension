import { Renderer } from "@freelensapp/extensions";

/**
 * The host's stores of the kinds that the maps draw, in the order the maps
 * load them. They are the host's singletons: the maps load and watch them, and
 * read their items, but never replace them.
 */
export function getMapStores() {
  const { K8sApi } = Renderer;
  return {
    pods: K8sApi.podsStore,
    deployments: K8sApi.deploymentStore,
    statefulSets: K8sApi.statefulSetStore,
    daemonSets: K8sApi.daemonSetStore,
    services: K8sApi.serviceStore,
    ingresses: K8sApi.ingressStore,
    pvcs: K8sApi.pvcStore,
    configMaps: K8sApi.configMapStore,
    secrets: K8sApi.secretsStore,
  };
}

export type MapStores = ReturnType<typeof getMapStores>;

type KubeResource = Parameters<typeof Renderer.K8sApi.isAllowedResource>[0];

// The resource of the kind of each store, as the host names it.
const mapStoreResources: Record<keyof MapStores, KubeResource> = {
  pods: "pods",
  deployments: "deployments",
  statefulSets: "statefulsets",
  daemonSets: "daemonsets",
  services: "services",
  ingresses: "ingresses",
  pvcs: "persistentvolumeclaims",
  configMaps: "configmaps",
  secrets: "secrets",
};

/**
 * Whether the user may list the objects of the kind of a store in this
 * cluster. A map neither loads nor watches a store whose kind the user cannot
 * list, such as the secrets for a user of a restricted role, and draws the
 * other kinds without it.
 */
export function canListMapStore(key: keyof MapStores): boolean {
  return Renderer.K8sApi.isAllowedResource(mapStoreResources[key]);
}

/**
 * The host's APIs of the kinds of the stores. A details map lists with them
 * the objects of a namespace that the stores do not hold, which leaves the
 * stores as the host's own views expect them.
 */
export function getMapApis() {
  const { K8sApi } = Renderer;
  return {
    pods: K8sApi.podsApi,
    deployments: K8sApi.deploymentApi,
    statefulSets: K8sApi.statefulSetApi,
    daemonSets: K8sApi.daemonSetApi,
    services: K8sApi.serviceApi,
    ingresses: K8sApi.ingressApi,
    pvcs: K8sApi.pvcApi,
    configMaps: K8sApi.configMapApi,
    secrets: K8sApi.secretsApi,
  };
}

/** The host's namespace store, whose selection the maps follow. */
export function getNamespaceStore() {
  return Renderer.K8sApi.namespaceStore;
}
