"use client";

import { useState, useRef, useEffect } from "react";
import type { Facility, ChatMessage } from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const SUGGESTIONS = [
  "Where are the largest cold spots for cataract surgery within 50km?",
  "Which facilities claim ICU but list no oxygen?",
  "Show facilities offering pediatric care in Ashanti.",
];

interface Props {
  messages: ChatMessage[];
  onMessagesChange: (msgs: ChatMessage[]) => void;
  facilities: Facility[];
  onHighlight: (names: Set<string>) => void;
  onSelectFacility: (f: Facility | null) => void;
  onApplyFilters: (filters: { specialty?: string; types?: string[] }) => void;
  onOpenSettings: () => void;
}

function matchFacilityNames(
  apiNames: string[],
  facilities: Facility[]
): Set<string> {
  const matched = new Set<string>();
  for (const apiName of apiNames) {
    const lower = apiName.toLowerCase().trim();
    const exact = facilities.find((f) => f.name.toLowerCase() === lower);
    if (exact) {
      matched.add(exact.name);
      continue;
    }
    const fuzzy = facilities.find(
      (f) =>
        f.name.toLowerCase().includes(lower) ||
        lower.includes(f.name.toLowerCase())
    );
    if (fuzzy) {
      matched.add(fuzzy.name);
    }
  }
  return matched;
}

export default function ChatPanel({
  messages,
  onMessagesChange,
  facilities,
  onHighlight,
  onSelectFacility,
  onApplyFilters,
  onOpenSettings,
}: Props) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [thinkingStage, setThinkingStage] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const THINKING_STAGES = [
    { label: "Parsing query intent", detail: "Understanding your question" },
    { label: "Classifying request type", detail: "Identifying required agents" },
    { label: "Routing to specialized agents", detail: "Selecting optimal pipeline" },
    { label: "Querying facility database", detail: "Searching across records" },
    { label: "Cross-referencing medical data", detail: "Validating coverage layers" },
    { label: "Analyzing geospatial patterns", detail: "Computing proximity metrics" },
    { label: "Synthesizing final response", detail: "Compiling insights" },
  ];

  useEffect(() => {
    if (!loading) {
      setThinkingStage(0);
      return;
    }
    const interval = setInterval(() => {
      setThinkingStage((prev) =>
        prev < THINKING_STAGES.length - 1 ? prev + 1 : prev
      );
    }, 3200);
    return () => clearInterval(interval);
  }, [loading]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendQuery = async (question?: string) => {
    const q = (question || input).trim();
    if (!q || loading) return;

    setInput("");
    const userMsg: ChatMessage = { role: "user", content: q };
    const updated = [...messages, userMsg];
    onMessagesChange(updated);
    setLoading(true);

    try {
      // Use AbortController with a generous timeout (pipeline can take
      // 2-3 minutes on free-tier due to rate-limit backoff).
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 300_000); // 5 min

      const res = await fetch(`${API_URL}/api/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        if (res.status === 429) {
          throw new Error(
            "Rate limit reached. Please wait ~30 seconds and try again."
          );
        }
        const errBody = await res.json().catch(() => null);
        const detail = errBody?.detail || `API error: ${res.status}`;
        throw new Error(detail);
      }

      const data = await res.json();

      const apiNames: string[] = data.facility_names || [];
      const matched = matchFacilityNames(apiNames, facilities);

      if (matched.size > 0) {
        // We found matching facilities — highlight them on the map
        onHighlight(matched);
      } else {
        // No matching facilities found — clear any existing highlights
        // so the map shows all facilities (unselected state)
        onHighlight(new Set());
      }

      if (data.filters) {
        // If no facilities matched, reset filters to show all facility types
        if (matched.size === 0) {
          onApplyFilters({ specialty: undefined, types: [] });
        } else {
          onApplyFilters(data.filters);
        }
      }

      if (matched.size === 1) {
        const name = [...matched][0];
        const fac = facilities.find((f) => f.name === name);
        if (fac) onSelectFacility(fac);
      }

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: data.synthesis || "No response generated.",
        metadata: {
          intent: data.intent,
          agents: data.required_agents,
          citations: data.citations,
          elapsed: data.elapsed,
          facilityNames: apiNames,
        },
      };
      onMessagesChange([...updated, assistantMsg]);
    } catch (err: any) {
      let content: string;
      if (err.name === "AbortError") {
        content = "**Timeout:** The query took too long. The AI pipeline may be rate-limited. Please try a simpler question or wait a moment.";
      } else if (
        err.message?.includes("NetworkError") ||
        err.message?.includes("Failed to fetch") ||
        err.message?.includes("fetch")
      ) {
        content = "**Connection error:** Could not reach the API server. Make sure it is running on port 8000.";
      } else {
        content = `**Error:** ${err.message}`;
      }
      const errorMsg: ChatMessage = {
        role: "assistant",
        content,
      };
      onMessagesChange([...updated, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-[300px] shrink-0 bg-[#0f1623] rounded-2xl flex flex-col overflow-hidden border border-[#1c2a3a]">
      {/* Header */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[11px] font-semibold tracking-[0.15em] uppercase text-[#2dd4bf]">
              Virtue Foundation
            </div>
            <h1 className="text-xl font-bold text-white mt-0.5 leading-tight">
              Living Map
            </h1>
            <p className="text-xs text-[#5a6577] mt-1">
              Ask. See. Verify. Plan.
            </p>
          </div>
          <button
            onClick={onOpenSettings}
            className="mt-1 p-2 rounded-lg hover:bg-[#1a2538] transition-colors text-[#5a6577] hover:text-[#8b97a8]"
            title="Layer settings"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Suggestions (always visible at top) */}
      <div className="px-4 pb-3 space-y-2">
        {SUGGESTIONS.map((q) => (
          <button
            key={q}
            onClick={() => sendQuery(q)}
            disabled={loading}
            className="w-full text-left text-[13px] leading-snug px-3.5 py-2.5 rounded-xl border border-[#1c2a3a] text-[#8b97a8] hover:text-white hover:border-[#2dd4bf]/40 hover:bg-[#2dd4bf]/5 transition-all duration-200 disabled:opacity-40"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div className="mx-4 border-t border-[#1c2a3a]" />

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3 custom-scrollbar"
      >
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-[#3a4556] text-xs text-center">
              Ask a question to get started
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${
              msg.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-[92%] rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                msg.role === "user"
                  ? "bg-[#2dd4bf]/15 text-[#2dd4bf] border border-[#2dd4bf]/20"
                  : "bg-[#151d2e] text-[#c4cdd9] border border-[#1c2a3a]"
              }`}
            >
              {msg.role === "assistant" ? (
                <div className="space-y-2">
                  <div
                    className="prose prose-sm prose-invert max-w-none prose-headings:text-sm prose-headings:font-bold prose-headings:text-white prose-headings:mt-2 prose-headings:mb-1 prose-p:my-1 prose-li:my-0 prose-strong:text-white"
                    dangerouslySetInnerHTML={{
                      __html: msg.content
                        .replace(
                          /### (.*)/g,
                          '<h4 class="text-sm font-bold mt-2 mb-1">$1</h4>'
                        )
                        .replace(
                          /## (.*)/g,
                          '<h3 class="text-sm font-bold mt-2 mb-1">$1</h3>'
                        )
                        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                        .replace(/\n- /g, "<br/>- ")
                        .replace(
                          /\n\d+\. /g,
                          (m) => "<br/>" + m.trim() + " "
                        )
                        .replace(/\n/g, "<br/>"),
                    }}
                  />
                  {msg.metadata && (
                    <div className="mt-2 pt-2 border-t border-[#1c2a3a]">
                      <div className="flex flex-wrap gap-1.5 text-[11px]">
                        {msg.metadata.intent && (
                          <span className="bg-[#2dd4bf]/10 text-[#2dd4bf] px-1.5 py-0.5 rounded">
                            {msg.metadata.intent}
                          </span>
                        )}
                        {msg.metadata.agents?.map((a) => (
                          <span
                            key={a}
                            className="bg-[#1a2538] text-[#6b7a8d] px-1.5 py-0.5 rounded"
                          >
                            {a}
                          </span>
                        ))}
                        {msg.metadata.elapsed && (
                          <span className="text-[#5a6577]">
                            {msg.metadata.elapsed}s
                          </span>
                        )}
                      </div>
                      {msg.metadata.facilityNames &&
                        msg.metadata.facilityNames.length > 0 && (
                          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[#f59e0b]">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                            </svg>
                            {msg.metadata.facilityNames.length} facilities shown on map
                          </div>
                        )}
                    </div>
                  )}
                </div>
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-[#151d2e] border border-[#1c2a3a] rounded-xl px-4 py-3 w-full max-w-[92%]">
              {/* Header */}
              <div className="flex items-center gap-2 mb-2.5">
                <div className="flex gap-1">
                  <div
                    className="w-1.5 h-1.5 bg-[#2dd4bf] rounded-full animate-bounce"
                    style={{ animationDelay: "0ms" }}
                  />
                  <div
                    className="w-1.5 h-1.5 bg-[#2dd4bf] rounded-full animate-bounce"
                    style={{ animationDelay: "150ms" }}
                  />
                  <div
                    className="w-1.5 h-1.5 bg-[#2dd4bf] rounded-full animate-bounce"
                    style={{ animationDelay: "300ms" }}
                  />
                </div>
                <span className="text-[11px] font-medium text-[#8b97a8]">
                  Reasoning
                </span>
              </div>

              {/* Thinking stages */}
              <div className="space-y-1.5">
                {THINKING_STAGES.map((stage, idx) => {
                  const isComplete = idx < thinkingStage;
                  const isCurrent = idx === thinkingStage;
                  const isPending = idx > thinkingStage;

                  return (
                    <div
                      key={idx}
                      className={`flex items-center gap-2 transition-all duration-500 ${
                        isPending ? "opacity-0 h-0 overflow-hidden" : "opacity-100"
                      }`}
                    >
                      {/* Status icon */}
                      <div className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
                        {isComplete ? (
                          <svg className="w-3.5 h-3.5 text-[#2dd4bf]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        ) : isCurrent ? (
                          <div className="w-2 h-2 bg-[#2dd4bf] rounded-full animate-pulse" />
                        ) : null}
                      </div>

                      {/* Label */}
                      <div className="flex-1 min-w-0">
                        <span
                          className={`text-[11px] leading-tight block transition-colors duration-300 ${
                            isComplete
                              ? "text-[#5a6577]"
                              : isCurrent
                              ? "text-[#c4cdd9]"
                              : "text-[#3a4556]"
                          }`}
                        >
                          {stage.label}
                          {isCurrent && (
                            <span className="text-[#3a4556] ml-1">
                              — {stage.detail}
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Progress bar */}
              <div className="mt-2.5 h-[2px] bg-[#1c2a3a] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#2dd4bf] to-[#2dd4bf]/60 rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${((thinkingStage + 1) / THINKING_STAGES.length) * 100}%`,
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-[#1c2a3a]">
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendQuery()}
            placeholder="Ask Virtue Agent..."
            disabled={loading}
            className="flex-1 px-3.5 py-2.5 text-[13px] bg-[#151d2e] border border-[#1c2a3a] rounded-xl text-[#e8edf5] placeholder-[#3a4556] focus:outline-none focus:ring-1 focus:ring-[#2dd4bf]/40 focus:border-[#2dd4bf]/40 disabled:opacity-40 transition-all"
          />
          <button
            onClick={() => sendQuery()}
            disabled={loading || !input.trim()}
            className="px-4 py-2.5 bg-[#e74c5a] text-white rounded-xl text-[13px] font-semibold hover:bg-[#d43d4b] disabled:opacity-30 disabled:cursor-not-allowed transition-all shrink-0"
          >
            Ask
          </button>
        </div>
      </div>
    </div>
  );
}
