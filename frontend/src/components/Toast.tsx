import React, { useEffect } from "react";
import { X, CheckCircle, AlertTriangle, Info } from "lucide-react";
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
      bg: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
      icon: CheckCircle,
    },
    warning: {
      bg: "bg-amber-500/10 border-amber-500/20 text-amber-400",
      icon: AlertTriangle,
    },
    info: {
      bg: "bg-blue-500/10 border-blue-500/20 text-blue-400",
      icon: Info,
    },
  };

  const config = typeConfig[notification.type] || typeConfig.info;
  const Icon = config.icon;

  return (
    <div
      className={`flex items-start gap-3 p-3.5 rounded-xl border ${config.bg} shadow-2xl backdrop-blur-md animate-toast-slide max-w-sm min-w-[280px] pointer-events-auto`}
    >
      <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
      <div className="flex-1 text-xs font-bold leading-relaxed">
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
