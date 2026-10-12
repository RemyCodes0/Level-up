"use client";

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, ShieldAlert, LogIn, ArrowRight } from "lucide-react";
import { adminApi, AdminApiError } from "./adminApi";
import { AdminStyles, Aurora, BTN_PRIMARY, BTN_SOFT, SURFACE, cx } from "./theme";

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

  // Mounted for the gate screens too, not just the dashboard — otherwise the
  // "log in required" / "no access" cards render in the browser's default
  // font on a bare white page before the layout ever gets a chance to load it.
  if (state === "ok") {
    return (
      <>
        <AdminStyles />
        {children}
      </>
    );
  }

  return (
    <>
      <AdminStyles />
      <div className="ad-shell relative flex min-h-screen items-center justify-center bg-[#0A0B10] px-4 text-[#ECEDF2] antialiased">
        <Aurora />
        {state === "checking" ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-[#8B7CFF]" />
            <p className="text-xs text-[#6E7389]">Checking access…</p>
          </div>
        ) : (
          <Gate state={state} />
        )}
      </div>
    </>
  );
}

function Gate({ state }: { state: "unauthenticated" | "forbidden" | "error" }) {
  const copy =
    state === "unauthenticated"
      ? {
          icon: <LogIn className="h-5 w-5 text-[#B4A9FF]" />,
          ring: "bg-[#8B7CFF]/10 ring-[#8B7CFF]/25",
          title: "Log in required",
          body: "You need to be signed in to open the admin dashboard.",
        }
      : state === "forbidden"
      ? {
          icon: <ShieldAlert className="h-5 w-5 text-[#FFB547]" />,
          ring: "bg-[#FFB547]/10 ring-[#FFB547]/25",
          title: "Admin access required",
          body: "This account doesn't have admin rights. Ask an existing admin to grant them.",
        }
      : {
          icon: <ShieldAlert className="h-5 w-5 text-[#FF8A95]" />,
          ring: "bg-[#FF5C6C]/10 ring-[#FF5C6C]/25",
          title: "Something went wrong",
          body: "Couldn't verify admin access — the API may be unreachable. Try refreshing.",
        };

  return (
    <div className={cx(SURFACE, "ad-rise w-full max-w-sm p-8 text-center shadow-[0_60px_120px_-50px_rgba(0,0,0,1)]")}>
      <span className={cx("mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl ring-1", copy.ring)}>
        {copy.icon}
      </span>
      <h2 className="ad-serif text-[26px] leading-tight text-white">{copy.title}</h2>
      <p className="mx-auto mt-2 max-w-[17rem] text-[13px] leading-relaxed text-[#8A8FA3]">{copy.body}</p>
      <div className="mt-6 flex flex-col gap-2">
        {state === "unauthenticated" ? (
          <Link to="/login" className={BTN_PRIMARY}>
            Log in <ArrowRight className="h-4 w-4" />
          </Link>
        ) : state === "error" ? (
          <button onClick={() => window.location.reload()} className={BTN_PRIMARY}>
            Refresh
          </button>
        ) : null}
        <Link to="/ai_tutor" className={BTN_SOFT}>
          Back to the app
        </Link>
      </div>
    </div>
  );
}
