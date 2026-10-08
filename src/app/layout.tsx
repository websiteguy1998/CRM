import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { getCrmWs } from "@/lib/auth";
import { crmPrefix } from "@/lib/crm";
import { CrmProvider } from "@/components/crm-context";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Unify CRM",
  description: "Unified sales CRM — leads, WhatsApp, calls and email in one timeline.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const prefix = crmPrefix(await getCrmWs());
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        <CrmProvider prefix={prefix}>{children}</CrmProvider>
      </body>
    </html>
  );
}
