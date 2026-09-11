"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { adminApi } from "@/lib/api";

export function AdminSessionGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void adminApi.me().then(
      () => active && setReady(true),
      () => router.replace(`/login?next=${encodeURIComponent(pathname)}`),
    );
    return () => {
      active = false;
    };
  }, [pathname, router]);

  if (!ready) {
    return (
      <p className="grid min-h-dvh place-items-center bg-[var(--ds-color-muted)] text-sm text-[var(--ds-color-muted-foreground)]">
        Verificando sessão…
      </p>
    );
  }
  return <>{children}</>;
}
