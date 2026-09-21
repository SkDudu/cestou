"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "./SessionProvider";

const PUBLIC_PATHS = new Set(["/entrar", "/cadastro"]);

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, loading } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = PUBLIC_PATHS.has(pathname);

  useEffect(() => {
    if (loading) return;
    if (!session && !isPublic) {
      router.replace(`/entrar?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (session && isPublic) {
      router.replace("/");
    }
  }, [loading, session, isPublic, pathname, router]);

  if (loading) {
    return (
      <p className="grid min-h-dvh place-items-center bg-[var(--ds-color-muted)] text-sm text-[var(--ds-color-muted-foreground)]">
        Verificando sessão…
      </p>
    );
  }

  if (!session && !isPublic) return null;
  if (session && isPublic) return null;

  return <>{children}</>;
}
