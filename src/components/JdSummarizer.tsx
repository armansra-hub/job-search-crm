"use client";

import { useState } from "react";
import { apiPost } from "@/lib/client-api";

// Small helper that summarizes a JD from the URL field, or from pasted text.
// Honest about the URL limitation (JS-rendered pages won't extract).
export function JdSummarizer({
  url,
  onSummary,
}: {
  url: string;
  onSummary: (s: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState("");

  async function summarize(body: { url?: string; text?: string }) {
    setBusy(true);
    setError(null);
    try {
      const res = await apiPost("/api/summarize-jd", body);
      onSummary(res.summary);
      setPasting(false);
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Summarize failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="-mt-1 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || !url.trim()}
          onClick={() => summarize({ url })}
          className="rounded bg-slate-100 px-2 py-1 font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-40"
        >
          {busy ? "Summarizing…" : "Summarize from URL"}
        </button>
        <button
          type="button"
          onClick={() => setPasting((p) => !p)}
          className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100"
        >
          {pasting ? "Cancel paste" : "…or paste JD text"}
        </button>
      </div>
      {pasting && (
        <div className="mt-1.5 space-y-1.5">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="Paste the full job description here (works even when the URL is JS-rendered)…"
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 outline-none focus:border-slate-500"
          />
          <button
            type="button"
            disabled={busy || text.trim().length < 40}
            onClick={() => summarize({ text })}
            className="rounded bg-slate-900 px-2 py-1 font-medium text-white hover:bg-slate-700 disabled:opacity-40"
          >
            Summarize pasted text
          </button>
        </div>
      )}
      {error && <p className="mt-1 text-red-600">{error}</p>}
    </div>
  );
}
