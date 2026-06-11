"use client";

import { create } from "zustand";

interface ToastState {
  message: string | null;
  variant: "ok" | "err";
  show: (message: string, variant?: "ok" | "err") => void;
}

export const useToast = create<ToastState>((set) => ({
  message: null,
  variant: "ok",
  show: (message, variant = "ok") => {
    set({ message, variant });
    setTimeout(() => set({ message: null }), 2800);
  },
}));

export function Toaster() {
  const { message, variant } = useToast();
  return (
    <div
      id="toast"
      className={message ? "show" : ""}
      style={variant === "err" ? { background: "#991b1b" } : undefined}
    >
      {message}
    </div>
  );
}
