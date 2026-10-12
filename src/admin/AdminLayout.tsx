"use client";

import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard, DollarSign, BookOpen, Users,
  MessageSquare, LineChart, Settings, Mail, Blocks,
  Menu, X, ArrowUpRight,
} from "lucide-react";
import { PageMeta } from "@/components/PageMeta";
import { RequireAdmin } from "./RequireAdmin";
import { Aurora, cx, EYEBROW } from "./theme";

// Grouped rather than one flat list: nine destinations in a single column read
// as an undifferentiated stack, and the groups match how the pages are
// actually used (watch the system / inspect what it produced / act on people
// / change settings).
const NAV: { group: string; items: { to: string; end?: boolean; label: string; icon: typeof LayoutDashboard }[] }[] = [
  {
    group: "Monitor",
    items: [
      { to: "/admin", end: true, label: "Overview", icon: LayoutDashboard },
      { to: "/admin/ai-spend", label: "AI Spend", icon: DollarSign },
      { to: "/admin/traffic", label: "Traffic", icon: LineChart },
    ],
  },
  {
    group: "Content",
    items: [
      { to: "/admin/courses", label: "Courses", icon: BookOpen },
      { to: "/admin/component-library", label: "Component Library", icon: Blocks },
    ],
  },
  {
    group: "People",
    items: [
      { to: "/admin/users", label: "Users", icon: Users },
      { to: "/admin/feedback-reviews", label: "Feedback", icon: MessageSquare },
      { to: "/admin/emails", label: "Emails", icon: Mail },
    ],
  },
  {
    group: "Settings",
    items: [{ to: "/admin/pricing", label: "Pricing Config", icon: Settings }],
  },
];

const ALL_ITEMS = NAV.flatMap((g) => g.items);

function Brand() {
  return (
    <Link to="/admin" className="flex items-center gap-2.5 outline-none">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-gradient-to-br from-[#8B7CFF] to-[#FF7A45] ring-1 ring-white/10">
        <img src="/logo.png" alt="" className="h-full w-full object-cover opacity-90 mix-blend-luminosity" />
      </span>
      <span className="min-w-0">
        <span className="ad-serif block text-[17px] leading-none text-white">Level Up</span>
        <span className="mt-0.5 block text-[9px] font-semibold uppercase tracking-[0.18em] text-[#6E7389]">Admin</span>
      </span>
    </Link>
  );
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      {NAV.map(({ group, items }) => (
        <div key={group} className="mb-5">
          <p className={cx(EYEBROW, "mb-1.5 px-3 text-[10px]")}>{group}</p>
          <div className="space-y-0.5">
            {items.map(({ to, end, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cx(
                    "group relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] transition-all duration-200",
                    isActive
                      ? "bg-white/[0.06] font-semibold text-white ring-1 ring-inset ring-white/[0.08]"
                      : "font-medium text-[#8A8FA3] hover:bg-white/[0.035] hover:text-[#E3E5EE]"
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span
                        className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full bg-[#8B7CFF] shadow-[0_0_12px_rgba(139,124,255,0.9)]"
                        aria-hidden="true"
                      />
                    )}
                    <Icon className={cx("h-4 w-4 shrink-0 transition-colors", isActive ? "text-[#B4A9FF]" : "text-[#5B607A] group-hover:text-[#8A8FA3]")} />
                    <span className="truncate">{label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

function BackToApp() {
  return (
    <Link
      to="/ai_tutor"
      className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.03] px-3 py-2.5 text-[12px] font-medium text-[#8A8FA3] ring-1 ring-inset ring-white/[0.06] transition-colors hover:bg-white/[0.07] hover:text-white"
    >
      Back to the app
      <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
    </Link>
  );
}

export default function AdminLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { pathname } = useLocation();

  // Any navigation closes the mobile drawer — including a browser back/forward
  // that changes the route without a click on a nav item.
  useEffect(() => setDrawerOpen(false), [pathname]);

  // Match the longest-prefix route so nested paths (/admin/courses/:id) still
  // name their section in the mobile header.
  const current =
    ALL_ITEMS.filter((i) => (i.end ? pathname === i.to : pathname.startsWith(i.to)))
      .sort((a, b) => b.to.length - a.to.length)[0] ?? ALL_ITEMS[0];

  return (
    <RequireAdmin>
      <PageMeta title="Admin | Level Up" noindex />
      <div className="ad-shell relative flex min-h-screen bg-[#0A0B10] text-[#ECEDF2] antialiased">
        <Aurora />

        {/* ── Desktop sidebar ─────────────────────────────────────────── */}
        <aside className="hidden w-[248px] shrink-0 flex-col border-r border-white/[0.06] bg-[#0C0D13]/70 backdrop-blur-xl md:flex">
          <div className="px-5 py-5">
            <Brand />
          </div>
          <nav className="ad-scroll flex-1 overflow-y-auto px-2.5 pt-1">
            <NavItems />
          </nav>
          <div className="border-t border-white/[0.06] p-2.5">
            <BackToApp />
          </div>
        </aside>

        {/* ── Mobile: top bar + slide-in drawer ───────────────────────── */}
        <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-white/[0.06] bg-[#0A0B10]/85 px-4 backdrop-blur-xl md:hidden">
          <button
            onClick={() => setDrawerOpen(true)}
            className="-ml-1.5 flex h-9 w-9 items-center justify-center rounded-xl text-[#B9BCCB] transition-colors hover:bg-white/[0.06] hover:text-white"
            aria-label="Open admin navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-white">{current.label}</span>
          <Brand />
        </div>

        {drawerOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="absolute inset-0 bg-[#05060A]/80 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
            <div className="ad-scroll absolute inset-y-0 left-0 flex w-[270px] flex-col border-r border-white/[0.08] bg-[#0C0D13] shadow-[0_0_80px_rgba(0,0,0,1)]">
              <div className="flex items-center justify-between px-5 py-4">
                <Brand />
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-[#6E7389] transition-colors hover:bg-white/[0.06] hover:text-white"
                  aria-label="Close admin navigation"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <nav className="ad-scroll flex-1 overflow-y-auto px-2.5">
                <NavItems onNavigate={() => setDrawerOpen(false)} />
              </nav>
              <div className="border-t border-white/[0.06] p-2.5">
                <BackToApp />
              </div>
            </div>
          </div>
        )}

        {/* ── Content ─────────────────────────────────────────────────── */}
        <main className="ad-scroll min-w-0 flex-1 pt-14 md:pt-0">
          <Outlet />
        </main>
      </div>
    </RequireAdmin>
  );
}
