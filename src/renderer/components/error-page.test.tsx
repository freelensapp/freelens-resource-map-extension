// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ErrorPage } from "./error-page";

// Example of testing a React component. This file opts into the jsdom
// environment (see the comment on the first line) so the component can render
// into a DOM.

afterEach(() => {
  cleanup();
});

describe("ErrorPage", () => {
  it("renders the error message", () => {
    render(<ErrorPage error={new Error("boom")} />);

    expect(screen.getByText("Error: boom")).toBeDefined();
  });

  it("renders children when there is no error", () => {
    render(
      <ErrorPage>
        <span>child content</span>
      </ErrorPage>,
    );

    expect(screen.getByText("child content")).toBeDefined();
  });
});
