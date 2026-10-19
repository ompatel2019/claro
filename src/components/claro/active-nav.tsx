"use client";

import { createContext, useContext, useEffect, useState } from "react";

// Overrides are scoped to the mounted route and cannot affect administrator nav.
type StudentNavHref = "/student/mark";
type Override = { href: StudentNavHref; path: string } | null;
const ActiveNavContext = createContext<{
  override: Override;
  setOverride: (value: Override) => void;
} | null>(null);

export function ActiveNavProvider({ children }: { children: React.ReactNode }) {
  const [override, setOverride] = useState<Override>(null);
  return (
    <ActiveNavContext.Provider value={{ override, setOverride }}>
      {children}
    </ActiveNavContext.Provider>
  );
}

export function useActiveNav(path: string) {
  const context = useContext(ActiveNavContext);
  return context?.override?.path === path ? context.override.href : undefined;
}

export function ActiveNav({
  href,
  path,
}: {
  href: StudentNavHref;
  path: string;
}) {
  const setOverride = useContext(ActiveNavContext)?.setOverride;
  useEffect(() => {
    setOverride?.({ href, path });
    return () => setOverride?.(null);
  }, [href, path, setOverride]);
  return null;
}
