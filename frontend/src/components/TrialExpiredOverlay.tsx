import React, { useState } from "react";
import { Lock, KeyRound, ShieldAlert, ArrowRight, CheckCircle2 } from "lucide-react";

interface TrialExpiredOverlayProps {
  onActivate: () => void;
  onResetTrial: () => void;
}

export default function TrialExpiredOverlay({ onActivate, onResetTrial }: TrialExpiredOverlayProps) {
  const [activationKey, setActivationKey] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleActivate = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const cleanKey = activationKey.trim().toUpperCase();
    if (cleanKey === "POS-ACTIVATE-2026" || cleanKey === "ADMIN-FULL-LICENSE") {
      setSuccess(true);
      setTimeout(() => {
        localStorage.setItem("pos_activated", "true");
        onActivate();
      }, 1500);
    } else if (!cleanKey) {
      setError("Please enter an activation key.");
    } else {
      setError("Invalid activation key. Please contact support.");
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-background/95 backdrop-blur-xl flex items-center justify-center p-4 select-none font-sans">
      {/* Background radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.08),transparent_50%)] pointer-events-none" />

      {/* Main UI Matched Card */}
      <div className="w-full max-w-md bg-card border border-border p-8 rounded-2xl shadow-2xl relative overflow-hidden backdrop-blur-md">
        {/* Glow accent matching the login screen */}
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />

        {success ? (
          <div className="text-center py-6 space-y-4">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-green-500/10 border border-green-500/20 text-green-500 flex items-center justify-center mb-2">
              <CheckCircle2 className="w-8 h-8 animate-bounce" />
            </div>
            <h3 className="text-xl font-bold text-foreground tracking-tight">Activation Successful!</h3>
            <p className="text-sm text-muted-foreground">
              Your software license has been successfully registered. Unlocking dashboard...
            </p>
          </div>
        ) : (
          <>
            {/* Header Icon matching the login screen brand placement */}
            <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-6">
              <Lock className="w-7 h-7" />
            </div>

            {/* Typography */}
            <h2 className="text-2xl font-bold tracking-tight text-foreground text-center">
              Evaluation Period Expired
            </h2>
            <p className="text-sm text-muted-foreground mt-2 text-center leading-relaxed">
              Your 30-day trial of <strong>POS System</strong> has ended. Access to point of sale, installments, and accounting features is locked.
            </p>

            {/* License Activation Form matching login screen input design */}
            <form onSubmit={handleActivate} className="mt-8 space-y-5">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 pl-1">
                  License Activation Key
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={activationKey}
                    onChange={(e) => setActivationKey(e.target.value)}
                    placeholder="POS-XXXX-XXXX-XXXX"
                    className="w-full bg-secondary text-foreground placeholder-muted-foreground/50 border border-border px-4 py-3 pl-11 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 transition duration-200 text-sm font-mono"
                  />
                </div>
                {error && (
                  <p className="text-xs text-destructive flex items-center gap-1.5 mt-2 pl-1 font-medium">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    {error}
                  </p>
                )}
              </div>

              <button
                type="submit"
                className="w-full bg-primary hover:bg-primary/95 text-white font-medium py-3 rounded-xl flex items-center justify-center gap-2 transition duration-200 cursor-pointer shadow-lg shadow-primary/10"
              >
                <span>Activate Software</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            {/* Support Information Box */}
            <div className="mt-8 bg-secondary/50 border border-border rounded-xl p-4 text-xs text-muted-foreground text-left">
              <span className="font-bold text-foreground block mb-1">Need a license key?</span>
              Please contact your administrator at <strong className="text-foreground">03459347900</strong> or email <strong className="text-foreground">um.waqas.khan@gmail.com</strong> to obtain a key.
              <span className="block mt-2.5 text-[10px] text-muted-foreground/80 font-mono">
                * Test Key: <span className="underline select-all text-primary font-bold">POS-ACTIVATE-2026</span>
              </span>
            </div>

            {/* Developer/Testing Bypass Actions */}
            <div className="mt-6 flex flex-col items-center justify-center gap-2">
              <button
                type="button"
                onClick={onResetTrial}
                className="text-xs text-muted-foreground hover:text-foreground underline transition cursor-pointer"
                title="Resets local storage trial date to today"
              >
                Reset Trial Period (Extend 30 Days)
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
