"use client";

import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard, DollarSign, BookOpen, Users, GraduationCap,
  MessageSquare, LineChart, Settings, Mail, Blocks,
} from "lucide-react";
import { PageMeta } from "@/components/PageMeta";
import { RequireAdmin } from "./RequireAdmin";

const NAV = [
  { to: "/admin", end: true, label: "Overview", icon: LayoutDashboard },
  { to: "/admin/ai-spend", label: "AI Spend", icon: DollarSign },
  { to: "/admin/courses", label: "Courses", icon: BookOpen },
  { to: "/admin/component-library", label: "Component Library", icon: Blocks },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/tutors-bookings", label: "Tutors & Bookings", icon: GraduationCap },
  { to: "/admin/feedback-reviews", label: "Feedback & Reviews", icon: MessageSquare },
  { to: "/admin/traffic", label: "Traffic", icon: LineChart },
  { to: "/admin/pricing", label: "Pricing Config", icon: Settings },
  { to: "/admin/emails", label: "Emails", icon: Mail },
];

export default function AdminLayout() {
  return (
    <RequireAdmin>
      <PageMeta title="Admin | Level Up" noindex />
      <div className="min-h-screen bg-slate-50 flex">
        {/* Sidebar */}
        <aside className="w-60 shrink-0 bg-white border-r border-slate-200 hidden md:flex flex-col">
          <div className="px-5 py-5 border-b border-slate-100">
            <span className="text-sm font-bold text-slate-900">Level Up — Admin</span>
          </div>
          <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
            {NAV.map(({ to, end, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50"
                  }`
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </NavLink>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </RequireAdmin>
  );
}
