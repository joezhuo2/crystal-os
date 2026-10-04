import { BackdropActiveContext } from "@/lib/backdropSlot";

/**
 * Holds one page backdrop. While `active` is false the backdrop stays mounted
 * but is hidden with `visibility`, its CSS animations are paused
 * (`.backdrop-slot[data-inactive]` in index.css) and its JS loops stop
 * (useBackdropStill), so returning to the tab shows it at once.
 */
export default function BackdropSlot({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <div className="backdrop-slot" data-inactive={active ? undefined : ""} style={active ? undefined : { visibility: "hidden" }}>
      <BackdropActiveContext.Provider value={active}>{children}</BackdropActiveContext.Provider>
    </div>
  );
}
