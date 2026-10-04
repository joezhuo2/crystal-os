/**
 * Page backdrops stay mounted for a while after their tab is left (see
 * BackdropSlot), hidden and paused, so switching back does not rebuild a WebGL
 * context, restart a canvas loop or re-decode an image. This says whether the
 * backdrop around the caller is the one on screen.
 */
import { createContext, useContext } from "react";
import { useAppActivity } from "@/lib/appActivity";

export const BackdropActiveContext = createContext(true);

/** False while the surrounding backdrop is kept mounted but hidden. */
export function useBackdropActive(): boolean {
  return useContext(BackdropActiveContext);
}

/**
 * `useAppActivity().still`, plus still while the backdrop is hidden, so its
 * loops stop without unmounting. Outside a BackdropSlot it is plain `still`.
 */
export function useBackdropStill(): boolean {
  const { still } = useAppActivity();
  const active = useBackdropActive();
  return still || !active;
}
