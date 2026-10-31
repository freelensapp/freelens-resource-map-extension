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

/** The host's namespace store, whose selection the page and the panel follow. */
export function getNamespaceStore() {
  return Renderer.K8sApi.namespaceStore;
}
