import * as React from "react";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "../../lib/utils";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}

const typeStyles: Record<
  ToastType,
  { border: string; bg: string; iconColor: string; Icon: React.ElementType }
> = {
  success: {
    border: "border-emerald-200",
    bg: "bg-emerald-50/50",
    iconColor: "text-emerald-600",
    Icon: CheckCircle2,
  },
  error: {
    border: "border-rose-200",
    bg: "bg-rose-50/50",
    iconColor: "text-rose-600",
    Icon: AlertCircle,
  },
  warning: {
    border: "border-amber-200",
    bg: "bg-amber-50/50",
    iconColor: "text-amber-600",
    Icon: AlertTriangle,
  },
  info: {
    border: "border-indigo-200",
    bg: "bg-indigo-50/50",
    iconColor: "text-indigo-600",
    Icon: Info,
  },
};

export const Toast: React.FC<ToastProps> = ({ toast, onDismiss }) => {
  const { border, bg, iconColor, Icon } = typeStyles[toast.type];

  return (
    <div
      role={toast.type === "error" ? "alert" : "status"}
      aria-live={toast.type === "error" ? "assertive" : "polite"}
      className={cn(
        "pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border bg-white shadow-lg text-slate-800 transition-all duration-200 animate-in slide-in-from-bottom-2 sm:slide-in-from-top-2",
        border,
        bg
      )}
    >
      <Icon className={cn("w-5 h-5 shrink-0 mt-0.5", iconColor)} />
      <div className="flex-1 text-xs sm:text-sm font-medium leading-snug">
        {toast.message}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 rounded-md p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors focus:outline-none"
        aria-label="Dismiss notification"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
