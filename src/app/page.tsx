import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getApplications,
  getFieldDefs,
  getNeedsReviewEvents,
} from "@/lib/data";
import { Header } from "@/components/Header";
import { Board } from "@/components/Board";

// The board is always live data — never cache it.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware should have redirected, but guard anyway.
  if (!user) redirect("/login");

  const [applications, fieldDefs, needsReview] = await Promise.all([
    getApplications(),
    getFieldDefs(),
    getNeedsReviewEvents(),
  ]);

  return (
    <div className="min-h-screen">
      <Header email={user.email ?? null} />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Board
          applications={applications}
          fieldDefs={fieldDefs}
          needsReview={needsReview}
        />
      </main>
    </div>
  );
}
