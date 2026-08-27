import Link from "next/link";
import PageHeader from "@/components/page-header";

const SECTIONS = [
  { href: "/settings/users", title: "Users & roles", desc: "Add sales agents, managers and admins." },
  {
    href: "/settings/integrations",
    title: "Integrations",
    desc: "Connect WhatsApp, Zoom Phone, email and SMS.",
  },
  { href: "/settings/templates", title: "Templates", desc: "Reusable WhatsApp/SMS/Email quick replies." },
];

export default function SettingsPage() {
  return (
    <div>
      <PageHeader title="Settings" />
      <div className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} className="card block p-5 hover:border-indigo-300">
            <h2 className="text-sm font-semibold text-slate-900">{s.title}</h2>
            <p className="mt-1 text-sm text-slate-500">{s.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
