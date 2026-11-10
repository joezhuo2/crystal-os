import type { ComponentType, ElementType } from "react";

export interface ModuleManifest<Id extends string = string> {
  id: Id;
  label: string;
  icon: ElementType;
  description: string;
  /** Core modules are always installed. */
  core?: boolean;
  /** Needs the desktop app. */
  desktopOnly?: boolean;
  /** Shown in the phone bottom bar. */
  phone?: boolean;
  /** Starts in the sidebar group pinned to the bottom. */
  bottom?: boolean;
  /** The page; typed loosely so manifests don't depend on TabId (viewLoader narrows it). */
  load: () => Promise<{ default: ComponentType<never> }>;
}
