import { NextResponse } from "next/server";
import { requireUser, badRequest, serverError } from "@/lib/api";
import { anthropic, MODEL_REASONING, textOf } from "@/lib/anthropic";

// POST /api/summarize-jd
// Body: { url?: string, text?: string }  (at least one)
// Returns { summary }.
//
// HONEST CAVEAT: fetching a URL only retrieves the server-rendered HTML. Many
// job boards (Greenhouse/Lever/Workday widgets, SPA career pages) render the
// description client-side, so the fetch may come back nearly empty. In that
// case, paste the JD text directly — that always works.
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  let body: { url?: string; text?: string };
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }

  let source = (body.text || "").trim();
  let fetchedFromUrl = false;

  if (!source && body.url) {
    try {
      const res = await fetch(body.url, {
        headers: { "User-Agent": "Mozilla/5.0 (JobSearchCRM JD summarizer)" },
        signal: AbortSignal.timeout(12_000),
      });
      const html = await res.text();
      source = stripHtml(html).slice(0, 16_000);
      fetchedFromUrl = true;
    } catch (e) {
      return serverError(
        `Could not fetch the URL (${msg(e)}). Paste the JD text instead.`,
      );
    }
  }

  if (!source || source.length < 40) {
    return badRequest(
      fetchedFromUrl
        ? "The page returned almost no text (likely JS-rendered). Paste the JD text instead."
        : "Provide a JD url or text.",
    );
  }

  try {
    const message = await anthropic().messages.create({
      model: MODEL_REASONING,
      max_tokens: 500,
      system:
        "Summarize this job description in 3-5 tight sentences for a personal job tracker. Cover: the role, the must-have skills/experience, and any signal about what the team values or seeks. No preamble, no bullet headers — just the summary prose. Do not invent details not present.",
      messages: [{ role: "user", content: source }],
    });
    return NextResponse.json({ summary: textOf(message) });
  } catch (e) {
    return serverError(msg(e));
  }
}

// Minimal, dependency-free HTML -> text.
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
