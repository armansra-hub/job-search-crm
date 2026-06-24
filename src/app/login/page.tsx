"use client";

import { useFormState, useFormStatus } from "react-dom";
import { sendMagicLink } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
    >
      {pending ? "Sending…" : "Send magic link"}
    </button>
  );
}

export default function LoginPage() {
  const [state, formAction] = useFormState(sendMagicLink, null);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Job-Search CRM</h1>
        <p className="mt-1 text-sm text-slate-500">
          Sign in with a magic link. Your data syncs across every computer.
        </p>

        <form action={formAction} className="mt-6 space-y-3">
          <label className="block text-sm font-medium text-slate-700" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500"
          />
          <SubmitButton />
        </form>

        {state && (
          <p
            className={`mt-4 text-sm ${
              state.ok ? "text-emerald-600" : "text-red-600"
            }`}
          >
            {state.message}
          </p>
        )}
      </div>
    </main>
  );
}
