import { Suspense } from "react";
import LoginForm from "./login-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold text-white">
            U
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Sign in to Unify CRM</h1>
          <p className="mt-1 text-sm text-slate-500">
            Leads, WhatsApp, calls and email — in one place.
          </p>
        </div>
        <div className="card p-6">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">
          Demo: admin@unifycrm.dev / password123
        </p>
      </div>
    </div>
  );
}
