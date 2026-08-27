"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { SessionPayload } from "@/lib/auth";

const NAV = [
  { href: "/", label: "Dashboard", icon: "🏠" },
  { href: "/leads", label: "Leads", icon: "🧑‍💼" },
  { href: "/pipeline", label: "Pipeline", icon: "🧭" },
  { href: "/inbox", label: "Inbox", icon: "💬" },
  { href: "/calls", label: "Calls", icon: "📞" },
  { href: "/tasks", label: "Follow-ups", icon: "✅" },
  { href: "/reports", label: "Reports", icon: "📊" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

export default function Sidebar({ session }: { session: SessionPayload }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
          U
        </div>
        <span className="text-sm font-semibold text-slate-900">Unify CRM</span>
      </div>
      <nav className="flex-1 space-y-0.5 px-3">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <span aria-hidden>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-slate-200 p-3">
        <div className="flex items-center gap-2 rounded-lg px-2 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
            {session.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">{session.name}</p>
            <p className="truncate text-xs text-slate-500">{session.role}</p>
          </div>
        </div>
        <button onClick={logout} className="btn-ghost mt-1 w-full justify-start text-xs">
          Sign out
        </button>
      </div>
    </aside>
  );
}
