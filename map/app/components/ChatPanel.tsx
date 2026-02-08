"use client";

import { useState, useRef, useEffect } from "react";
import type { Facility, ChatMessage } from "../page";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

interface Props {
  messages: ChatMessage[];
  onMessagesChange: (msgs: ChatMessage[]) => void;
  facilities: Facility[];
  onHighlight: (names: Set<string>) => void;
  onSelectFacility: (f: Facility | null) => void;
  onApplyFilters: (filters: { specialty?: string; types?: string[] }) => void;
  onClose: () => void;
}

function matchFacilityNames(
  apiNames: string[],
  facilities: Facility[]
): Set<string> {
  const matched = new Set<string>();
  for (const apiName of apiNames) {
    const lower = apiName.toLowerCase().trim();
    // Exact match first
    const exact = facilities.find(
      (f) => f.name.toLowerCase() === lower
    );
    if (exact) {
      matched.add(exact.name);
      continue;
    }
    // Fuzzy: check if facility name contains the API name or vice versa
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
  onClose,
}: Props) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendQuery = async () => {
    const question = input.trim();
    if (!question || loading) return;

    setInput("");
    const userMsg: ChatMessage = { role: "user", content: question };
    const updated = [...messages, userMsg];
    onMessagesChange(updated);
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });

      if (!res.ok) throw new Error(`API error: ${res.status}`);

      const data = await res.json();

      // Extract facility names and highlight on map
      const apiNames: string[] = data.facility_names || [];
      const matched = matchFacilityNames(apiNames, facilities);
      onHighlight(matched);

      // Apply filters inferred from the query (if provided)
      if (data.filters) {
        onApplyFilters(data.filters);
      }

      // If we got a single match, select it on the map
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
      const errorMsg: ChatMessage = {
        role: "assistant",
        content: `**Error:** ${err.message}.\n\nMake sure the API server is running:\n\`\`\`\nuvicorn api.server:app --port 8000\n\`\`\``,
      };
      onMessagesChange([...updated, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="absolute bottom-20 right-6 z-[1000] w-[440px] h-[520px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-indigo-600 text-white flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" /></svg>
          <span className="font-semibold text-sm">Healthcare Agent</span>
        </div>
        <button onClick={onClose} className="hover:bg-indigo-500 rounded p-1 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-400 text-sm mb-3">Ask about Ghana healthcare facilities.</p>
            <p className="text-gray-400 text-xs">Results will be highlighted on the map.</p>
            <div className="mt-4 space-y-1.5">
              {[
                "How many hospitals have cardiology?",
                "Where are the medical deserts for ophthalmology?",
                "Which facilities claim surgery but lack equipment?",
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => { setInput(q); }}
                  className="block w-full text-left text-xs px-3 py-2 rounded-lg bg-gray-50 hover:bg-indigo-50 text-gray-600 hover:text-indigo-700 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[90%] rounded-xl px-3.5 py-2.5 text-sm ${
                msg.role === "user"
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-800"
              }`}
            >
              {msg.role === "assistant" ? (
                <div className="space-y-2">
                  <div
                    className="prose prose-sm max-w-none prose-headings:text-sm prose-headings:font-bold prose-headings:mt-2 prose-headings:mb-1 prose-p:my-1 prose-li:my-0"
                    dangerouslySetInnerHTML={{
                      __html: msg.content
                        .replace(/### (.*)/g, '<h4 class="text-sm font-bold mt-2 mb-1">$1</h4>')
                        .replace(/## (.*)/g, '<h3 class="text-sm font-bold mt-2 mb-1">$1</h3>')
                        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                        .replace(/\n- /g, "<br/>- ")
                        .replace(/\n\d+\. /g, (m) => "<br/>" + m.trim() + " ")
                        .replace(/\n/g, "<br/>"),
                    }}
                  />
                  {msg.metadata && (
                    <div className="mt-2 pt-2 border-t border-gray-200">
                      <div className="flex flex-wrap gap-1.5 text-xs text-gray-500">
                        {msg.metadata.intent && (
                          <span className="bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">
                            {msg.metadata.intent}
                          </span>
                        )}
                        {msg.metadata.agents?.map((a) => (
                          <span key={a} className="bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">
                            {a}
                          </span>
                        ))}
                        {msg.metadata.elapsed && (
                          <span className="text-gray-400">{msg.metadata.elapsed}s</span>
                        )}
                      </div>
                      {msg.metadata.facilityNames && msg.metadata.facilityNames.length > 0 && (
                        <div className="mt-1.5 text-xs text-indigo-600">
                          {msg.metadata.facilityNames.length} facilities highlighted on map
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
            <div className="bg-gray-100 rounded-xl px-4 py-3 flex items-center gap-2">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
              <span className="text-xs text-gray-500">Analyzing...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-gray-200 bg-white shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendQuery()}
            placeholder="Ask about Ghana healthcare..."
            disabled={loading}
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50"
          />
          <button
            onClick={sendQuery}
            disabled={loading || !input.trim()}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
