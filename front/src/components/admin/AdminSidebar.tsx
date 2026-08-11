import Link from "next/link";

const nav = [
  { href: "/admin", label: "Overview", section: "main" },
  { href: "/admin/products", label: "Products", section: "data" },
  { href: "/admin/prices", label: "Prices", section: "data" },
  { href: "/admin/validation", label: "Validation", section: "data" },
  { href: "/admin/supermarkets", label: "Supermarkets", section: "data" },
  { href: "/admin/runs", label: "Runs", section: "scraper" },
  { href: "/admin/errors", label: "Errors", section: "scraper" },
];

export function AdminSidebar() {
  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950 text-zinc-100">
      <div className="border-b border-zinc-800 px-4 py-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
          Scraper Dashboard
        </p>
        <p className="mt-1 text-sm font-medium text-zinc-200">Smart Grocery</p>
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
          Data
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
          Scraper
        </p>
        {nav
          .filter((i) => i.section === "scraper")
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
