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

/** The host's namespace store, whose selection the page and the panel follow. */
export function getNamespaceStore() {
  return Renderer.K8sApi.namespaceStore;
}
