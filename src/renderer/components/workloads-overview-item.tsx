import { ErrorBoundary } from "./error-boundary";
import { KubeResourceOverviewDetail } from "./KubeResourcePage";

import type { Renderer } from "@freelensapp/extensions";

export interface WorkloadsOverviewItemProps {
  extension: Renderer.LensExtension;
}

/**
 * The Resource Map in the Workloads Overview, inside an error boundary of its own: the host has none around a
 * Workloads Overview item, and the template's registration wrappers do not cover this kind of registration, so an
 * error of the map would otherwise replace the whole Workloads Overview, the host's own panels included.
 */
export function WorkloadsOverviewItem({ extension }: WorkloadsOverviewItemProps) {
  return (
    <ErrorBoundary extension={extension}>
      <KubeResourceOverviewDetail />
    </ErrorBoundary>
  );
}
