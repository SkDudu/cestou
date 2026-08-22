import Link from "next/link";

const nav = [
  { href: "/admin", label: "Overview", section: "main" },
  { href: "/admin/supermarkets", label: "Supermercados", section: "data" },
  { href: "/admin/flyers", label: "Encartes", section: "data" },
  { href: "/admin/offers", label: "Ofertas", section: "data" },
  { href: "/admin/validation", label: "Validação", section: "data" },
  { href: "/admin/scraper", label: "Flow Builder", section: "ops" },
  { href: "/admin/errors", label: "Erros", section: "ops" },
];

export function AdminSidebar() {
  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950 text-zinc-100">
      <div className="border-b border-zinc-800 px-4 py-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
          Flyer Dashboard
        </p>
        <p className="mt-1 text-sm font-medium text-zinc-200">Cestou</p>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-4 text-sm">
        <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
          Overview
        </p>
        {nav
          .filter((i) => i.section === "main")
          .map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="mb-1 block rounded-md px-2 py-2 text-zinc-300 hover:bg-zinc-900 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        <p className="mt-4 px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
          Dados
        </p>
        {nav
          .filter((i) => i.section === "data")
          .map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="mb-1 block rounded-md px-2 py-2 text-zinc-300 hover:bg-zinc-900 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        <p className="mt-4 px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
          Ops
        </p>
        {nav
          .filter((i) => i.section === "ops")
          .map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="mb-1 block rounded-md px-2 py-2 text-zinc-300 hover:bg-zinc-900 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
      </nav>
    </aside>
  );
}
