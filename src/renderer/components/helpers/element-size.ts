import { observable, runInAction } from "mobx";

/**
 * The size of an element, which a `ResizeObserver` keeps up to date: a map
 * gives its graph the size of its own container, whatever the window, the
 * sidebar or the layout around it.
 */
export class ElementSize {
  @observable accessor width = 0;
  @observable accessor height = 0;

  private observer?: ResizeObserver;

  /** Follows the element in place of the one before; `null`, as React passes on unmount, follows none. */
  follow(element: Element | null) {
    this.observer?.disconnect();
    this.observer = undefined;
    if (!element) return;

    this.observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      runInAction(() => {
        this.width = Math.floor(width);
        this.height = Math.floor(height);
      });
    });
    this.observer.observe(element);
  }
}
