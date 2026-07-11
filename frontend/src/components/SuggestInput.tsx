import React, { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";

export type LocalSuggestion = { id?: string; label: string; source?: "local" | "google" };

type SuggestInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (item: LocalSuggestion) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
  inputClassName?: string;
  /** Extra local options (e.g. existing categories/brands) shown first */
  localOptions?: LocalSuggestion[];
  /** Debounce ms for Google API */
  debounceMs?: number;
  disabled?: boolean;
  id?: string;
  autoFocus?: boolean;
};

/**
 * Text input with Google autocomplete (via /api/products/suggest proxy)
 * plus optional local options (existing catalog categories/brands).
 */
export default function SuggestInput({
  value,
  onChange,
  onSelect,
  placeholder,
  required,
  className = "",
  inputClassName = "",
  localOptions = [],
  debounceMs = 280,
  disabled,
  id,
  autoFocus,
}: SuggestInputProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleSuggestions, setGoogleSuggestions] = useState<string[]>([]);
  const [highlight, setHighlight] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const localMatches = localOptions.filter((o) => {
    if (!value.trim()) return true;
    return o.label.toLowerCase().includes(value.toLowerCase());
  }).slice(0, 8);

  const googleOnly = googleSuggestions
    .filter((g) => !localMatches.some((l) => l.label.toLowerCase() === g.toLowerCase()))
    .map((g) => ({ label: g, source: "google" as const }));

  const items: LocalSuggestion[] = [
    ...localMatches.map((l) => ({ ...l, source: "local" as const })),
    ...googleOnly,
  ].slice(0, 12);

  const fetchGoogle = useCallback(async (q: string) => {
    abortRef.current?.abort();
    if (!q.trim()) {
      setGoogleSuggestions([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const res = await axios.get("/api/products/suggest", {
        params: { q: q.trim() },
        signal: controller.signal,
      });
      setGoogleSuggestions(res.data?.suggestions || []);
    } catch (err: any) {
      if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError") return;
      setGoogleSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!open) return;
    timerRef.current = setTimeout(() => fetchGoogle(value), debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, open, debounceMs, fetchGoogle]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setHighlight(-1);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = (item: LocalSuggestion) => {
    onChange(item.label);
    onSelect?.(item);
    setOpen(false);
    setHighlight(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && open && highlight >= 0 && items[highlight]) {
      e.preventDefault();
      pick(items[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setHighlight(-1);
    }
  };

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <input
        id={id}
        type="text"
        autoComplete="off"
        required={required}
        disabled={disabled}
        autoFocus={autoFocus}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlight(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className={
          inputClassName ||
          "w-full bg-secondary border border-border px-3 py-2 rounded text-xs focus:outline-none"
        }
      />
      {open && (items.length > 0 || loading || value.trim().length > 0) && (
        <ul className="absolute z-[80] left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-card shadow-xl text-xs">
          {loading && items.length === 0 && (
            <li className="px-3 py-2 text-muted-foreground">Searching…</li>
          )}
          {!loading && items.length === 0 && value.trim().length > 0 && (
            <li className="px-3 py-2 text-muted-foreground">No suggestions</li>
          )}
          {items.map((item, i) => (
            <li key={`${item.source}-${item.id || item.label}-${i}`}>
              <button
                type="button"
                className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 transition ${
                  i === highlight ? "bg-primary/15 text-foreground" : "hover:bg-secondary text-foreground"
                }`}
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(item);
                }}
              >
                <span className="truncate">{item.label}</span>
                <span className="text-[9px] uppercase font-bold text-muted-foreground shrink-0">
                  {item.source === "local" ? "Saved" : "Google"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
