import React, { useEffect } from "react";
import { createPortal } from "react-dom";

interface PortalModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  backdropClass?: string;
}

export default function PortalModal({
  isOpen,
  onClose,
  children,
  backdropClass = "bg-black/75 backdrop-blur-sm px-4"
}: PortalModalProps) {
  // Prevent background scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div className={`fixed inset-0 flex items-center justify-center z-50 overflow-y-auto ${backdropClass}`}>
      {children}
    </div>,
    document.body
  );
}
