"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
  const pathname = usePathname();
  const router = useRouter();
  const visibleNav = NAV.filter((item) => canAccess(session.role, item.href));
  const [switching, setSwitching] = useState(false);
  // Users never live in CRM B, so a session whose data org differs from
  // its home org means the admin Switch has everyone in CRM B right now.
  const inCrmB = session.orgId !== session.homeOrgId;

  // Follow an admin Switch even on a page that's just sitting open — the
  // next request would pick it up anyway, this just doesn't wait for one.
  useEffect(() => {
    const timer = setInterval(async () => {
      const res = await fetch("/api/workspace").catch(() => null);
      if (!res?.ok) return;
      const { orgId } = (await res.json()) as { orgId: string };
      if (orgId !== session.orgId) window.location.reload();
    }, 20_000);
    return () => clearInterval(timer);
  }, [session.orgId]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  async function switchCrm() {
    const target = inCrmB ? "A" : "B";
    if (
      !confirm(
        `This moves every user — every lead entry agent, every sales agent, and you — to CRM ${target} right now. Everyone stays logged in. Continue?`
      )
    ) {
      return;
    }
    setSwitching(true);
    try {
      await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });
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
        <span
          className={`ml-auto rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
            inCrmB ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"
          }`}
        >
          {inCrmB ? "CRM B" : "CRM A"}
        </span>
      </div>
      {isAdmin(session.role) && (
        <div className="px-3 pb-3">
          <button
            onClick={switchCrm}
            disabled={switching}
            title="Move every user — lead entry, sales, everyone — to the other CRM"
            className="w-full rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
          >
            {switching ? "Switching…" : inCrmB ? "🔁 Switch back to CRM A" : "🔁 Switch to CRM B"}
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
