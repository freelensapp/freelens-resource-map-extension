// Minimal stub of `@freelensapp/extensions` for unit tests.
//
// The published package is a shim that reads `Common`, `Main` and `Renderer`
// off `globalThis.FreelensExtensionApi`, which the Freelens host sets before it
// loads an extension. A Vitest process has no host, so importing the real
// package throws. `vitest.config.ts` aliases the import to this file instead.
// The package ships no mocks of its own to use in its place.
//
// Only the surface the tests exercise is stubbed here, and only at runtime: the
// tests are type-checked against the real declaration of the package. Extend it
// as your tests need more of the host API.
import { vi } from "vitest";

// The host's `KubeObject`, as far as the maps build one: the node of a Helm
// release stands on an object made with it.
class KubeObject {
  declare kind: string;
  declare metadata: { name: string; namespace?: string };

  constructor(data: object) {
    Object.assign(this, data);
  }

  getName() {
    return this.metadata.name;
  }

  getNs() {
    return this.metadata.namespace;
  }
}

// The models that the tooltip of a node tells apart with `instanceof`.
class Pod extends KubeObject {}

class Service extends KubeObject {}

class Deployment extends KubeObject {}

class StatefulSet extends KubeObject {}

export const Renderer = {
  K8sApi: { KubeObject, Pod, Service, Deployment, StatefulSet },
  // The spinner that a map shows until its stores have loaded.
  Component: { Spinner: () => null },
};

export const Common = {
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
};
