import { useSyncExternalStore } from "react";

/** Label for the shortcut modifier key; "both" when the platform is unknown (server render). */
export type ModKey = "⌘" | "Ctrl" | "⌘/Ctrl";

export function modKeyFor(platform: string | undefined): ModKey {
  if (!platform) return "⌘/Ctrl";
  return /mac|iphone|ipad|ipod/i.test(platform) ? "⌘" : "Ctrl";
}

function clientPlatform() {
  const nav = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  return nav.userAgentData?.platform || nav.platform || undefined;
}

const subscribe = () => () => {};

/** Hydration-safe: the server and first client render show both keys. */
export function useModKey(): ModKey {
  return useSyncExternalStore(
    subscribe,
    () => modKeyFor(clientPlatform()),
    () => modKeyFor(undefined),
  );
}
