import type { ComponentProps } from "react";
import { GlassTip } from "@/components/ui/glass-tooltip";
import { useHarness } from "@/hooks/useHarness";

/**
 * A GlassTip in the user's Nebula palette. The card renders into <body>,
 * outside the page root that carries the --nebula-* variables, so the
 * colours are read from the theme and passed in directly.
 */
export default function NebulaTip(props: Omit<ComponentProps<typeof GlassTip>, "colors" | "tone">) {
  const [a, , c] = useHarness().theme.colors;
  return <GlassTip {...props} colors={[a, c]} />;
}
