"use client";

import { useEffect, useState } from "react";
import { Link, useCrmPath, useCrmPrefix } from "@/components/crm-context";
import { usePathname, useRouter } from "next/navigation";
import type { SessionPayload } from "@/lib/auth";
import { canAccess, isAdmin } from "@/lib/access";

const NAV = [
  { href: "/", label: "Dashboard", icon: "🏠" },
  { href: "/leads", label: "Leads", icon: "🧑‍💼" },
  { href: "/sellers", label: "Sellers", icon: "🧑‍💻" },
  { href: "/lead-entry", label: "Lead Entry", icon: "📝" },
  { href: "/performance", label: "My Performance", icon: "📈" },
  { href: "/pipeline", label: "Pipeline", icon: "🧭" },
  { href: "/inbox", label: "Inbox", icon: "💬" },
  { href: "/calls", label: "Calls", icon: "📞" },
  { href: "/tasks", label: "Follow-ups", icon: "✅" },
  { href: "/reports", label: "Reports", icon: "📊" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

export default function Sidebar({ session }: { session: SessionPayload }) {
  const crmPath = useCrmPath();
  const prefix = useCrmPrefix();
  const rawPathname = usePathname();
  const pathname = prefix && rawPathname.startsWith(prefix) ? rawPathname.slice(prefix.length) || "/" : rawPathname;
  const router = useRouter();
  const visibleNav = NAV.filter((item) => canAccess(session.role, item.href));
  const [switching, setSwitching] = useState(false);
  const inCrmA = session.ws === "a";

  // Follow an admin Switch even on a CRM A page that's just sitting open:
  // once this login stops working, reload and let the app layout move
  // them to CRM B (or the login page).
  useEffect(() => {
    if (!inCrmA) return;
    const timer = setInterval(async () => {
      const res = await fetch("/api/workspace").catch(() => null);
      if (res?.status === 401) window.location.href = "/";
    }, 20_000);
    return () => clearInterval(timer);
  }, [inCrmA]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push(crmPath("/login"));
    router.refresh();
  }

  async function switchToCrmB() {
    if (
      !confirm(
        "This moves every user — every lead entry agent, every sales agent, and you — to CRM B right now. Everyone is logged out of CRM A; to get back into CRM A you'll have to sign in at its URL. Continue?"
      )
    ) {
      return;
    }
    setSwitching(true);
    try {
      await fetch("/api/workspace", { method: "POST" });
    } finally {
      window.location.href = "/";
    }
  }

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
          U
        </div>
        <span className="text-sm font-semibold text-slate-900">Unify CRM</span>
      </div>
      {inCrmA && isAdmin(session.role) && (
        <div className="px-3 pb-3">
          <button
            onClick={switchToCrmB}
            disabled={switching}
            title="Move every user — lead entry, sales, everyone — to CRM B"
            className="w-full rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
          >
            {switching ? "Switching…" : "🔁 Switch to CRM B"}
          </button>
        </div>
      )}
      <nav className="flex-1 space-y-0.5 px-3">
        {visibleNav.map((item) => {
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
