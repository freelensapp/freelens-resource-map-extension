// Stand-ins for the host's models in unit tests: plain objects with the kind,
// the metadata and the methods that the maps call. The type check sees the
// real models of `@freelensapp/extensions`; at runtime the stub of the
// package has no model to build them with.
import type { Renderer } from "@freelensapp/extensions";

type KubeObject = Renderer.K8sApi.KubeObject;

export interface Metadata {
  name: string;
  namespace: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
}

/** An object of `kind`, with the members the maps read added to it. */
export function kubeObject<T extends KubeObject>(kind: string, metadata: Metadata, members: object = {}): T {
  return { kind, metadata, getName: () => metadata.name, getNs: () => metadata.namespace, ...members } as T;
}

export interface PodSpec {
  /** One of the values the host's `Pod.getStatusMessage()` returns, `Running` by default. */
  status?: string;
  labels?: Record<string, string>;
  containers?: unknown[];
  volumes?: { name: string; secret?: { secretName?: string }; [source: string]: unknown }[];
}

/** A pod; like the host's, it takes the names of its secrets from its secret volumes. */
export function pod(name: string, namespace: string, spec: PodSpec = {}) {
  const volumes = spec.volumes ?? [];
  return kubeObject<Renderer.K8sApi.Pod>(
    "Pod",
    { name, namespace, labels: spec.labels },
    {
      getStatusMessage: () => spec.status ?? "Running",
      getContainers: () => spec.containers ?? [],
      getVolumes: () => volumes,
      getSecrets: () => volumes.flatMap((volume) => (volume.secret?.secretName ? [volume.secret.secretName] : [])),
    },
  );
}

export function secret(name: string, namespace: string, type = "Opaque", labels?: Record<string, string>) {
  return kubeObject<Renderer.K8sApi.Secret>("Secret", { name, namespace, labels }, { type });
}
