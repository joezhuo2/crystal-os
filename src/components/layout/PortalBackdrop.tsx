import StarCanvas from "@/components/layout/StarCanvas";
import type { PortalTheme } from "@/lib/portalStore";

/**
 * Full-screen themed backdrop for the Portal tab. The theme's colours come
 * from the `portal-theme-*` class on an ancestor (see index.css). Sits behind
 * the page (the parent must create a stacking context) and never takes
 * pointer events.
 */
export default function PortalBackdrop({ theme }: { theme: PortalTheme }) {
  return (
    <div aria-hidden="true" className="portal-backdrop fixed inset-0 -z-10 pointer-events-none overflow-hidden">
      <div className="portal-backdrop-glow" />
      {/* Faint twinkling star specks for the Stargate theme. */}
      {theme === "stargate" && <StarCanvas rgb="224 242 254" />}
    </div>
  );
}
