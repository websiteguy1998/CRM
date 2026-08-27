import SignupForm from "./signup-form";

export default function SignupPage() {
  return (
    <div className="flex min-h-screen flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold text-white">
            U
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Create your account</h1>
          <p className="mt-1 text-sm text-slate-500">A Super Admin approves every new account before it can log in.</p>
        </div>
        <div className="card p-6">
          <SignupForm />
        </div>
      </div>
    </div>
  );
}
