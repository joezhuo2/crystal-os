import { useEffect } from "react";
import { bindingFor, bindingFromEvent, shortcutBlocked, useKeymapOverrides } from "@/lib/keymap";
import { PRIVACY_ACTION_ID } from "@/lib/keymaps/general";
import { createPrivacyKey } from "@/lib/privacySettings";

export function usePrivacyHotkey() {
  const overrides = useKeymapOverrides();

  useEffect(() => {
    const binding = bindingFor(PRIVACY_ACTION_ID);
    if (!binding) return;
    const key = createPrivacyKey();
    const onDown = (e: KeyboardEvent) => {
      if (e.repeat || bindingFromEvent(e) !== binding || shortcutBlocked(e)) return;
      e.preventDefault();
      key.down();
    };
    document.addEventListener("keydown", onDown);
    document.addEventListener("keyup", key.up);
    window.addEventListener("blur", key.cancel);
    return () => {
      document.removeEventListener("keydown", onDown);
      document.removeEventListener("keyup", key.up);
      window.removeEventListener("blur", key.cancel);
      key.cancel();
    };
  }, [overrides]);
}
