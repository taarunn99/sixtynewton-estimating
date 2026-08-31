import Link from "next/link";
import { getProfile } from "@/lib/auth";
import { logout } from "@/app/login/actions";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/admin/products", label: "Products" },
  { href: "/admin/review", label: "Review queue" },
  { href: "/admin/families", label: "Product families" },
  { href: "/admin/stages", label: "Stages" },
  { href: "/admin/labour-tiers", label: "Labour tiers" },
  { href: "/admin/site-profiles", label: "Site profiles" },
  { href: "/admin/settings", label: "Settings" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();
  return (
    <div className="flex min-h-screen bg-neutral-100">
      <aside className="flex w-56 shrink-0 flex-col border-r border-neutral-300 bg-neutral-100 p-4">
        <div className="mb-6">
          <div className="font-serif text-base font-semibold">Sixty Newton</div>
          <div className="text-xs text-neutral-500">Estimating admin</div>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-200"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t border-neutral-300 pt-3 text-xs text-neutral-500">
          <div className="mb-2">
            {profile.full_name ?? "Signed in"} ({profile.role})
          </div>
          <form action={logout}>
            <Button variant="outline" size="sm" type="submit">
              Sign out
            </Button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-6">{children}</main>
    </div>
  );
}
