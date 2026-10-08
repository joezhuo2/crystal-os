/**
 * Full-window "Crystal OS / Loading…" splash. index.html shows the same markup
 * (and holds the `boot-*` styles) before the bundle loads; this keeps it
 * on screen while the saved session is restored, so start-up goes from splash
 * straight to the app with no blank frame.
 */
export default function AppSplash({ status = "Loading…" }: { status?: string }) {
  return (
    <div className="boot-splash boot-scene" role="status" aria-label="Loading Crystal OS">
      <div className="boot-splash-panel boot-glass">
        <CrystalGem id="app-splash-gem" />
        <h1 className="boot-splash-title">Crystal OS</h1>
        <div className="boot-splash-bar" />
        <p className="boot-splash-status">{status}</p>
      </div>
    </div>
  );
}

/** The splash's crystal, in the Orbit's ice, cyan and mauve. `id` must be unique on the page. */
export function CrystalGem({ id, className = "boot-splash-gem" }: { id: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f0fbff" />
          <stop offset="0.5" stopColor="#67d4f0" />
          <stop offset="1" stopColor="#c9a9d8" />
        </linearGradient>
      </defs>
      <path
        d="M20 8h24l14 16-26 32L6 24 20 8Z"
        fill={`url(#${id})`}
        fillOpacity="0.22"
        stroke={`url(#${id})`}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M6 24h52M20 8l12 48M44 8 32 56M20 8l-2 16M44 8l2 16"
        stroke={`url(#${id})`}
        strokeWidth="1.5"
        strokeLinejoin="round"
        opacity="0.8"
      />
    </svg>
  );
}
