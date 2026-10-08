import { redirect } from "next/navigation";
import { getCrmWs, getSession, getSwitchedCrmALogin } from "@/lib/auth";
import { CRM_B_PREFIX, crmPrefix } from "@/lib/crm";
import Sidebar from "@/components/sidebar";
import TimezoneCookieSync from "@/components/timezone-cookie-sync";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) {
    const ws = await getCrmWs();
    // Logged out of CRM A by the admin Switch — move them to CRM B, still
    // signed in, instead of asking them to log in again.
    if (ws === "a" && (await getSwitchedCrmALogin())) redirect(`${CRM_B_PREFIX}/api/auth/handoff`);
    redirect(`${crmPrefix(ws)}/login`);
  }

  return (
    <div className="flex min-h-screen w-full">
      <TimezoneCookieSync />
      <Sidebar session={session} />
      <main className="min-w-0 flex-1 overflow-x-hidden">{children}</main>
    </div>
  );
}
