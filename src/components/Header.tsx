// Server component — top bar. The "New" button and voice bar are injected by
// the page as children (so client interactivity stays scoped).
export function Header({
  email,
  children,
}: {
  email: string | null;
  children?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold text-slate-900">
            Job-Search CRM
          </span>
        </div>
        <div className="flex items-center gap-3">
          {children}
          <span className="hidden text-xs text-slate-400 sm:inline">{email}</span>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
