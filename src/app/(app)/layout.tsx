import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import Sidebar from "@/components/sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="flex min-h-screen w-full">
      <Sidebar session={session} />
      <main className="min-w-0 flex-1 overflow-x-hidden">{children}</main>
    </div>
  );
}
