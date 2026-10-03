/**
 * Full-window "Crystal OS / Loading…" splash. index.html shows the same markup
 * (and holds the `boot-splash*` styles) before the bundle loads; this keeps it
 * on screen while the saved session is restored, so start-up goes from splash
 * straight to the app with no blank frame.
 */
export default function AppSplash({ status = "Loading…" }: { status?: string }) {
  return (
    <div className="boot-splash" role="status" aria-label="Loading Crystal OS">
      <svg className="boot-splash-gem" viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="app-splash-gem" x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
            <stop stopColor="#a5b4fc" />
            <stop offset="0.55" stopColor="#6366f1" />
            <stop offset="1" stopColor="#38bdf8" />
          </linearGradient>
        </defs>
        <path
          d="M20 8h24l14 16-26 32L6 24 20 8Z"
          fill="url(#app-splash-gem)"
          fillOpacity="0.22"
          stroke="url(#app-splash-gem)"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <path
          d="M6 24h52M20 8l12 48M44 8 32 56M20 8l-2 16M44 8l2 16"
          stroke="url(#app-splash-gem)"
          strokeWidth="1.5"
          strokeLinejoin="round"
          opacity="0.8"
        />
      </svg>
      <h1 className="boot-splash-title">Crystal OS</h1>
      <div className="boot-splash-bar" />
      <p className="boot-splash-status">{status}</p>
    </div>
  );
}
