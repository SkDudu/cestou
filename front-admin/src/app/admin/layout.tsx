"use client";

import { useEffect } from "react";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

/** Trava scroll do documento — só o <main> rola (evita scrollbar dupla). */
function useLockDocumentScroll() {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, []);
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useLockDocumentScroll();

  return (
    <div className="flex h-dvh overflow-hidden bg-[var(--ds-color-muted)] text-[var(--ds-color-foreground)]">
      <AdminSidebar />
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-8 py-7">
        {children}
      </main>
    </div>
  );
}
