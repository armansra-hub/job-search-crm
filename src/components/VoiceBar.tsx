"use client";

import { useEffect, useRef, useState } from "react";
import { apiPost } from "@/lib/client-api";
import { CommandDiff } from "./CommandDiff";
import type { CommandPlan } from "@/lib/command";

// Voice + text command entry. Voice uses the browser Web Speech API
// (SpeechRecognition), which is reliable in Chrome/Edge and flaky-to-absent in
// Safari/Firefox — so the text box is ALWAYS available as a fallback.
export function VoiceBar({ onChanged }: { onChanged: () => void }) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<CommandPlan | null>(null);
  const [submitted, setSubmitted] = useState("");
  const recogRef = useRef<any>(null);

  useEffect(() => {
    const SR =
      (typeof window !== "undefined" &&
        ((window as any).SpeechRecognition ||
          (window as any).webkitSpeechRecognition)) ||
      null;
    setSupported(!!SR);
  }, []);

  function toggleListen() {
    if (listening) {
      recogRef.current?.stop();
      return;
    }
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const recog = new SR();
    recog.lang = "en-US";
    recog.interimResults = true;
    recog.continuous = false;
    let finalText = "";
    recog.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const chunk = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += chunk;
        else interim += chunk;
      }
      setText((finalText + interim).trim());
    };
    recog.onerror = (e: any) => {
      setError(`Mic error: ${e.error}. Type your command instead.`);
      setListening(false);
    };
    recog.onend = () => setListening(false);
    recogRef.current = recog;
    setError(null);
    setListening(true);
    recog.start();
  }

  async function submit() {
    const transcript = text.trim();
    if (!transcript) return;
    setLoading(true);
    setError(null);
    try {
      // Send the browser's clock so relative dates ("in 2 days") resolve in the
      // user's timezone, not the server's.
      const res = await apiPost("/api/parse-command", {
        transcript,
        now: new Date().toISOString(),
      });
      setPlan(res.plan as CommandPlan);
      setSubmitted(transcript);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not parse command.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full">
      <div className="flex items-center gap-2">
        {supported && (
          <button
            onClick={toggleListen}
            title="Voice (Chrome/Edge)"
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-lg ${
              listening
                ? "animate-pulse border-red-300 bg-red-50 text-red-600"
                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {listening ? "■" : "🎤"}
          </button>
        )}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder={
            supported
              ? "Speak or type: “I applied to Stripe for a PM role; reach out to…”"
              : "Type a command: “Move Anduril to interviewing”"
          }
          className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500"
        />
        <button
          onClick={submit}
          disabled={loading || !text.trim()}
          className="h-9 shrink-0 rounded-md bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {loading ? "…" : "Parse"}
        </button>
      </div>

      {!supported && (
        <p className="mt-1 text-xs text-slate-400">
          Voice input isn&apos;t supported in this browser. Use Chrome or Edge for
          the mic — typing works everywhere.
        </p>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}

      {plan && (
        <CommandDiff
          transcript={submitted}
          plan={plan}
          onClose={() => setPlan(null)}
          onApplied={() => {
            setPlan(null);
            setText("");
            onChanged();
          }}
        />
      )}
    </div>
  );
}
