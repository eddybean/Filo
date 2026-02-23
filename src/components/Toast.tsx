import { useEffect } from "react";

interface ToastProps {
  messages: string[];
  onDismiss: () => void;
}

export function Toast({ messages, onDismiss }: ToastProps) {
  useEffect(() => {
    if (messages.length === 0) return;
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [messages, onDismiss]);

  if (messages.length === 0) return null;

  return (
    <div
      data-testid="validation-errors"
      role="alert"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-700/60 rounded-xl shadow-lg px-4 py-3 text-sm text-red-700 dark:text-red-400 w-full max-w-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          {messages.map((msg, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <span className="mt-0.5 shrink-0">•</span>
              <span>{msg}</span>
            </div>
          ))}
        </div>
        <button
          onClick={onDismiss}
          className="shrink-0 text-red-400 hover:text-red-600 dark:text-red-500 dark:hover:text-red-300 transition-colors leading-none mt-0.5"
        >
          ×
        </button>
      </div>
    </div>
  );
}
