import React, { useEffect } from "react";
import { X, CheckCircle, AlertTriangle, Info, XCircle } from "lucide-react";
import { useStore, SystemNotification } from "../store/useStore";

interface ToastProps {
  notification: SystemNotification;
  onClose: (id: string) => void;
}

export function Toast({ notification, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(notification.id);
    }, 4000);
    return () => clearTimeout(timer);
  }, [notification.id, onClose]);

  const typeConfig = {
    success: {
      border: "border-l-4 border-l-emerald-500 border-y border-r border-border",
      text: "text-foreground",
      iconColor: "text-emerald-500",
      icon: CheckCircle,
    },
    warning: {
      border: "border-l-4 border-l-amber-500 border-y border-r border-border",
      text: "text-foreground",
      iconColor: "text-amber-500",
      icon: AlertTriangle,
    },
    error: {
      border: "border-l-4 border-l-rose-500 border-y border-r border-border",
      text: "text-foreground",
      iconColor: "text-rose-500",
      icon: XCircle,
    },
    info: {
      border: "border-l-4 border-l-blue-500 border-y border-r border-border",
      text: "text-foreground",
      iconColor: "text-blue-500",
      icon: Info,
    },
  };

  const config = typeConfig[notification.type] || typeConfig.info;
  const Icon = config.icon;

  return (
    <div
      className={`flex items-start gap-3 p-3.5 rounded-xl bg-card/90 text-foreground shadow-2xl backdrop-blur-md animate-toast-slide max-w-sm min-w-[280px] pointer-events-auto ${config.border}`}
    >
      <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${config.iconColor}`} />
      <div className="flex-1 text-xs font-semibold leading-relaxed">
        {notification.message}
      </div>
      <button
        onClick={() => onClose(notification.id)}
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        <X className="w-4 h-4 flex-shrink-0" />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const { notifications, clearNotification } = useStore();

  return (
    <div className="fixed top-20 right-4 z-50 flex flex-col gap-2 pointer-events-none max-w-sm">
      {notifications.slice(0, 5).map((n) => (
        <Toast key={n.id} notification={n} onClose={clearNotification} />
      ))}
    </div>
  );
}
