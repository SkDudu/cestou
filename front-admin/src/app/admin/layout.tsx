import { AdminSidebar } from "@/components/admin/AdminSidebar";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-dvh overflow-hidden bg-[var(--ds-color-muted)] text-[var(--ds-color-foreground)]">
      <AdminSidebar />
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto px-8 py-7">{children}</main>
    </div>
  );
}
