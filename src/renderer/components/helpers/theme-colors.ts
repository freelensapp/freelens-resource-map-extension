import { Renderer } from "@freelensapp/extensions";

/** The colours that the maps paint on their canvas. */
export interface CanvasColors {
  /** The fill of the outer ring of a controller. */
  background: string;
  /** The labels of the nodes. */
  text: string;
}

/**
 * The canvas colours of the active theme. `activeTheme` is a mobx computed:
 * read while an observer renders, a theme change renders it again, and the
 * canvas is painted with the new colours.
 */
export function getCanvasColors(): CanvasColors {
  const { colors } = Renderer.Theme.activeTheme.get();
  return {
    background: colors.secondaryBackground,
    text: colors.textColorPrimary,
  };
}
