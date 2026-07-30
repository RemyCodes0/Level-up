"use client";

import { useEffect, useState } from "react";
import { Loader2, ShieldAlert, LogIn } from "lucide-react";
import { adminApi, AdminApiError } from "./adminApi";

// Formalizes the 401/403 check every admin page used to do ad hoc (the old
// /ai_admin dashboard had this inline; nothing else had it at all). Hits the
// cheapest existing admin endpoint purely to check access — doesn't render
// or store what it returns.
export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"checking" | "ok" | "unauthenticated" | "forbidden" | "error">("checking");

  useEffect(() => {
    adminApi
      .get("/api/admin/activity?limit=1")
      .then(() => setState("ok"))
      .catch((err) => {
        if (err instanceof AdminApiError && err.status === 401) setState("unauthenticated");
        else if (err instanceof AdminApiError && err.status === 403) setState("forbidden");
        else setState("error");
      });
  }, []);

  if (state === "checking") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-slate-400 animate-spin" />
      </div>
    );
  }

  if (state === "unauthenticated") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-xl border border-slate-200 p-8 max-w-sm text-center">
          <LogIn className="h-10 w-10 text-slate-400 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-slate-900 mb-1">Log in required</h2>
          <p className="text-sm text-slate-500">You need to be logged in to view this page.</p>
        </div>
      </div>
    );
  }

  if (state === "forbidden" || state === "error") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-xl border border-slate-200 p-8 max-w-sm text-center">
          <ShieldAlert className="h-10 w-10 text-amber-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-slate-900 mb-1">
            {state === "forbidden" ? "Admin access required" : "Something went wrong"}
          </h2>
          <p className="text-sm text-slate-500">
            {state === "forbidden"
              ? "Your account doesn't have access to this page."
              : "Couldn't verify admin access — try refreshing."}
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
