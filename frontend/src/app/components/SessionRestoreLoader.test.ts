import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  SessionLoadingIndicator,
  SessionRestoreLoader,
  markLoginIntroSeen,
  shouldPlayLoginIntro,
  shouldPreviewSessionLoading,
  shouldPreviewSessionRestore,
} from "./SessionRestoreLoader";

describe("SessionRestoreLoader", () => {
  it("renders the branded accessible session-restoration state", () => {
    const markup = renderToStaticMarkup(
      React.createElement(SessionRestoreLoader),
    );

    expect(markup).toContain('role="status"');
    expect(markup).toContain("Previewing the Libro Espresso introduction");
    expect(markup).toContain("session-restore-coffee");
    expect(markup).toContain('clip-path="url(#libro-cup-clip)"');
    expect(markup).toContain("session-restore-coffee-surface");
    expect(markup).toContain("session-restore-pour");
    expect(markup).toContain("session-restore-droplet--one");
    expect(markup).toContain("session-restore-saucer");
    expect(markup).toContain("session-restore-book-back-cover");
    expect(markup).toContain("session-restore-book-page-stack");
    expect(markup).toContain("session-restore-book-front-cover");
    expect(markup).toContain("session-restore-book-spine");
    expect(markup).not.toContain("session-restore-book-closed");
    expect(markup).not.toContain("session-restore-book-open");
    expect(markup).not.toContain("session-restore-original-logo");
    expect(markup).toContain("Preparing your workspace...");
  });

  it("allows continuous preview only in development", () => {
    expect(shouldPreviewSessionRestore("?previewSessionLoader=1", true)).toBe(
      true,
    );
    expect(shouldPreviewSessionRestore("?previewSessionLoader=1", false)).toBe(
      false,
    );
    expect(shouldPreviewSessionRestore("", true)).toBe(false);
    expect(
      shouldPreviewSessionLoading("?previewSessionLoader=spinner", true),
    ).toBe(true);
    expect(
      shouldPreviewSessionLoading("?previewSessionLoader=spinner", false),
    ).toBe(false);
  });

  it("plays the login introduction only once and skips expired-session messaging", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    expect(shouldPlayLoginIntro(storage)).toBe(true);
    markLoginIntroSeen(storage);
    expect(shouldPlayLoginIntro(storage)).toBe(false);

    values.clear();
    values.set("libro.auth.message", "Your session has expired.");
    expect(shouldPlayLoginIntro(storage)).toBe(false);
  });

  it("renders a minimal accessible indicator for session restoration", () => {
    const markup = renderToStaticMarkup(
      React.createElement(SessionLoadingIndicator),
    );
    expect(markup).toContain('role="status"');
    expect(markup).toContain("session-loading-spinner");
    expect(markup).not.toContain("session-restore-coffee");
  });
});
