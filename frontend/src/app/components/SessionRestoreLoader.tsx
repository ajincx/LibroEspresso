import React, { useEffect, useState } from "react";
import "./SessionRestoreLoader.css";

const LOGIN_INTRO_STORAGE_KEY = "libro.login.intro.seen";
const LOGIN_INTRO_DURATION_MS = 8000;
const REDUCED_MOTION_INTRO_DURATION_MS = 500;

type SessionStorageLike = Pick<Storage, "getItem" | "setItem">;

function browserSessionStorage(): SessionStorageLike | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

export function shouldPlayLoginIntro(storage?: SessionStorageLike) {
  const activeStorage = storage ?? browserSessionStorage();
  return Boolean(
    activeStorage &&
      activeStorage.getItem(LOGIN_INTRO_STORAGE_KEY) !== "1" &&
      !activeStorage.getItem("libro.auth.message"),
  );
}

export function markLoginIntroSeen(storage?: SessionStorageLike) {
  const activeStorage = storage ?? browserSessionStorage();
  activeStorage?.setItem(LOGIN_INTRO_STORAGE_KEY, "1");
}

export function shouldPreviewSessionRestore(
  search: string,
  isDevelopment = import.meta.env.DEV,
) {
  return (
    isDevelopment &&
    new URLSearchParams(search).get("previewSessionLoader") === "1"
  );
}

export function shouldPreviewSessionLoading(
  search: string,
  isDevelopment = import.meta.env.DEV,
) {
  return (
    isDevelopment &&
    new URLSearchParams(search).get("previewSessionLoader") === "spinner"
  );
}

export function SessionRestoreLoader({
  mode = "preview",
}: {
  mode?: "intro" | "preview";
}) {
  const isIntro = mode === "intro";
  return (
    <main
      className={`session-restore-screen${isIntro ? " session-restore-screen--intro" : ""}`}
    >
      <div
        className={`session-restore-loader${isIntro ? " session-restore-loader--intro" : ""}`}
        role="status"
        aria-live="polite"
        aria-label={
          isIntro
            ? "Opening Libro Espresso"
            : "Previewing the Libro Espresso introduction"
        }
      >
        <svg
          className="session-restore-mark"
          viewBox="0 0 360 220"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <clipPath id="libro-cup-clip">
              <circle cx="160" cy="110" r="31" />
            </clipPath>
          </defs>

          <g className="session-restore-cup">
            <ellipse className="session-restore-object-shadow" cx="164" cy="116" rx="62" ry="58" fill="#eadbcf" />
            <circle className="session-restore-saucer" cx="160" cy="110" r="59" fill="#f3e2d2" stroke="#7b1e2b" strokeWidth="3.5" />
            <circle cx="160" cy="110" r="51" fill="#fffaf3" stroke="#d7bbaa" strokeWidth="2" />
            <path d="M119 143c18 17 58 19 80-2" fill="none" stroke="#ead3c3" strokeLinecap="round" strokeWidth="5" />
            <path d="M195 96c13-5 27 0 29 12 2 12-8 22-27 18l-4-8c14 3 21-2 20-9-1-7-8-9-18-5z" fill="#fffaf3" stroke="#7b1e2b" strokeLinejoin="round" strokeWidth="4" />
            <circle cx="160" cy="110" r="43" fill="#fffaf3" stroke="#7b1e2b" strokeWidth="4.5" />
            <circle cx="160" cy="110" r="34" fill="#f7e7da" stroke="#d7bbaa" strokeWidth="2" />
            <g clipPath="url(#libro-cup-clip)">
              <rect
                className="session-restore-coffee"
                x="128"
                y="78"
                width="64"
                height="64"
                fill="#6f3b2d"
              />
              <path className="session-restore-coffee-surface" d="M126 104q17-8 34 0t34 0v39h-68z" fill="#6f3b2d" />
              <g className="session-restore-ripples" fill="none" stroke="#b86d4c" strokeWidth="2">
                <ellipse cx="160" cy="101" rx="8" ry="3" />
                <ellipse cx="160" cy="101" rx="18" ry="7" />
              </g>
            </g>
            <circle cx="160" cy="110" r="32" fill="none" stroke="#e2cabc" strokeWidth="2" />
          </g>

          <path
            className="session-restore-pour"
            d="M160 0c2 18-2 39 0 77"
            fill="none"
            stroke="#6f3b2d"
            strokeLinecap="round"
            strokeWidth="7"
          />
          <g className="session-restore-droplets" fill="#6f3b2d">
            <circle className="session-restore-droplet session-restore-droplet--one" cx="160" cy="14" r="4" />
            <circle className="session-restore-droplet session-restore-droplet--two" cx="160" cy="14" r="3" />
          </g>

          <g className="session-restore-book" stroke="#7b1e2b" strokeLinejoin="round">
            <path className="session-restore-book-shadow" d="M253 80c17-11 39-12 62-5l-3 100c-24-6-45-2-61 10z" fill="#eadbcf" stroke="none" />
            <path className="session-restore-book-back-cover" d="M248 74c18-12 41-14 66-6l-3 105c-25-7-47-2-63 10z" fill="#7b1e2b" strokeWidth="4" />
            <path className="session-restore-book-page-stack" d="M248 78c16-10 36-12 60-5l-3 92c-22-5-42-1-57 10z" fill="#fffaf3" stroke="#7b1e2b" strokeWidth="3" />
            <g className="session-restore-book-right-lines" fill="none" stroke="#d7bbaa" strokeLinecap="round" strokeWidth="2">
              <path d="M259 98c12-5 25-7 37-4M259 113c12-5 25-7 37-4M259 128c12-5 24-7 36-4" />
            </g>
            <g className="session-restore-book-front-cover">
              <path className="session-restore-book-front-surface" d="M248 74c18-12 41-14 66-6l-3 105c-25-7-47-2-63 10z" fill="#8c2937" strokeWidth="4" />
              <path className="session-restore-book-front-border" d="M256 81c14-8 31-10 49-5l-2 87c-19-4-35 0-47 8z" fill="none" stroke="#c58b78" strokeWidth="2" />
              <g className="session-restore-book-front-lines" fill="none" stroke="#8c2937" strokeLinecap="round" strokeWidth="2">
                <path d="M259 98c12-5 25-7 37-4M259 113c12-5 25-7 37-4M259 128c12-5 24-7 36-4" />
              </g>
            </g>
            <path className="session-restore-book-spine" d="M248 74v109" fill="none" stroke="#5e1420" strokeWidth="4" />
          </g>
        </svg>

        <p className="session-restore-title">Libro Espresso</p>
        <p className="session-restore-subtitle">Preparing your workspace...</p>
        <span className="sr-only">
          {isIntro
            ? "Opening Libro Espresso. Please wait."
            : "Previewing the Libro Espresso introduction."}
        </span>
      </div>
    </main>
  );
}

export function LoginIntroGate({ children }: { children: React.ReactNode }) {
  const [showIntro, setShowIntro] = useState(() => shouldPlayLoginIntro());

  useEffect(() => {
    if (!showIntro) return;
    markLoginIntroSeen();
    const reduceMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const timer = window.setTimeout(
      () => setShowIntro(false),
      reduceMotion
        ? REDUCED_MOTION_INTRO_DURATION_MS
        : LOGIN_INTRO_DURATION_MS,
    );
    return () => window.clearTimeout(timer);
  }, [showIntro]);

  return showIntro ? <SessionRestoreLoader mode="intro" /> : children;
}

export function SessionLoadingIndicator() {
  return (
    <main className="session-loading-screen">
      <div
        className="session-loading-indicator"
        role="status"
        aria-live="polite"
        aria-label="Restoring your session"
      >
        <span className="session-loading-spinner" aria-hidden="true" />
        <span className="sr-only">Restoring your session. Please wait.</span>
      </div>
    </main>
  );
}
