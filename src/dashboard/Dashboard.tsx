"use client";

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { Navbar } from "@/components/navbar/Navbar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowUpRight,
  Bot,
  CalendarDays,
  UserRound,
  Target,
} from "lucide-react";
import axios from "axios";

type Stat = {
  key: string;
  label: string;
  value: number | undefined;
  suffix?: string;
  icon: React.ElementType;
  hint: string;
};

export default function DashboardPage() {
  const { loading } = useAuth();
  const router = useNavigate();

  const storedUser = localStorage.getItem("user");
  const user = storedUser ? JSON.parse(storedUser) : null;
  const token = localStorage.getItem("token");

  const [totalSessions, setTotalSessions] = useState<number>();
  const [upcomingSessions, setUpcomingSessions] = useState<number>();
  const [sessionCompleted, setSessionCompleted] = useState<number>();
  const [duration, setDuration] = useState<number>();

  useEffect(() => {
    if (!loading && !user) {
      router("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    const fetchBookings = async () => {
      try {
        const res = await axios.get(
          `${import.meta.env.VITE_API_URL}/api/book/student`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        const data = res.data.length;
        const upcoming = res.data.filter(
          (b: any) => b.status === "confirmed"
        ).length;
        const completed = res.data.filter(
          (b: any) => b.status === "completed"
        ).length;
        const totalHours = res.data.reduce(
          (acc: number, b: any) => acc + Number(b.duration) / 60,
          0
        );

        setTotalSessions(data);
        setUpcomingSessions(upcoming);
        setSessionCompleted(completed);
        setDuration(Math.round(totalHours * 10) / 10);
      } catch (error) {
        console.error(error);
      }
    };
    fetchBookings();
  }, [token, user?._id]);

  // Completion rate derived from real data — no mock numbers.
  const completionRate = useMemo(() => {
    if (totalSessions === undefined || sessionCompleted === undefined) return undefined;
    if (totalSessions === 0) return 0;
    return Math.round((sessionCompleted / totalSessions) * 100);
  }, [totalSessions, sessionCompleted]);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  }, []);

  const today = useMemo(
    () =>
      new Date().toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      }),
    []
  );

  const stats: Stat[] = [
    {
      key: "upcoming",
      label: "Upcoming",
      value: upcomingSessions,
      icon: CalendarClock,
      hint: "Confirmed & scheduled",
    },
    {
      key: "total",
      label: "Total Sessions",
      value: totalSessions,
      icon: BookOpen,
      hint: "Booked all-time",
    },
    {
      key: "completed",
      label: "Completed",
      value: sessionCompleted,
      icon: CheckCircle2,
      hint: "Finished lessons",
    },
    {
      key: "hours",
      label: "Learning Hours",
      value: duration,
      suffix: "h",
      icon: Clock,
      hint: "Time invested",
    },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <span className="h-2.5 w-2.5 rounded-full bg-primary animate-ping" />
          <span className="text-sm font-medium">Loading your dashboard…</span>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-muted/30">
      <Navbar />

      <main className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-3xl border bg-card shadow-sm">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/10" />
          <div className="pointer-events-none absolute right-24 top-24 h-24 w-24 rounded-full bg-primary/5" />

          <div className="relative flex flex-col gap-6 p-6 sm:p-8 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground text-2xl font-bold shadow-sm">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {today}
                </p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-balance sm:text-3xl">
                  {greeting}, {user.name.split(" ")[0]}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {upcomingSessions
                    ? `You have ${upcomingSessions} session${upcomingSessions > 1 ? "s" : ""} coming up.`
                    : "No upcoming sessions — let's book your next one."}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row md:flex-col lg:flex-row">
              <a href="/tutors">
                <Button size="lg" className="w-full gap-2 sm:w-auto">
                  <BookOpen className="h-4 w-4" />
                  Find a Tutor
                </Button>
              </a>
              <a href="/ai_tutor">
                <Button size="lg" variant="outline" className="w-full gap-2 sm:w-auto">
                  <Sparkles className="h-4 w-4 text-primary" />
                  AI Tutor
                </Button>
              </a>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map((s) => {
            const Icon = s.icon;
            return (
              <Card
                key={s.key}
                className="group relative overflow-hidden border shadow-sm transition-all hover:shadow-md"
              >
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </span>
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground/40 transition-colors group-hover:text-primary" />
                  </div>

                  {s.value === undefined ? (
                    <div className="mt-4 h-8 w-16 animate-pulse rounded-md bg-muted" />
                  ) : (
                    <div className="mt-4 text-3xl font-bold tracking-tight tabular-nums">
                      {s.value}
                      {s.suffix && (
                        <span className="ml-0.5 text-lg font-semibold text-muted-foreground">
                          {s.suffix}
                        </span>
                      )}
                    </div>
                  )}

                  <p className="mt-1 text-sm font-medium">{s.label}</p>
                  <p className="text-xs text-muted-foreground">{s.hint}</p>
                </CardContent>
              </Card>
            );
          })}
        </section>

        {/* Progress + Quick Actions */}
        <section className="mt-6 grid gap-6 lg:grid-cols-5">
          {/* Progress */}
          <Card className="border shadow-sm lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Target className="h-5 w-5 text-primary" />
                Your Progress
              </CardTitle>
              <CardDescription>Completion across all booked sessions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                <ProgressRing value={completionRate} />
                <div className="space-y-3">
                  <Legend
                    color="bg-primary"
                    label="Completed"
                    value={sessionCompleted}
                  />
                  <Legend
                    color="bg-primary/30"
                    label="Upcoming"
                    value={upcomingSessions}
                  />
                  <Legend
                    color="bg-muted-foreground/20"
                    label="Total booked"
                    value={totalSessions}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card className="border shadow-sm lg:col-span-3">
            <CardHeader>
              <CardTitle className="text-lg">Quick Actions</CardTitle>
              <CardDescription>Jump back into your learning</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <ActionTile
                href="/tutors"
                icon={BookOpen}
                title="Find a Tutor"
                subtitle="Browse available experts"
                primary
              />
              <ActionTile
                href="/ai_tutor"
                icon={Bot}
                title="Your AI Tutor"
                subtitle="Turn slides into video"
                primary
              />
              <ActionTile
                href="/bookings"
                icon={CalendarDays}
                title="My Bookings"
                subtitle="Manage your sessions"
              />
              <ActionTile
                href="/profile"
                icon={UserRound}
                title="Update Profile"
                subtitle="Personalize your account"
              />
            </CardContent>
          </Card>
        </section>

        {/* How it works */}
        <section className="mt-6">
          <Card className="border shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">How It Works</CardTitle>
              <CardDescription>From discovery to mastery in four steps</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="grid gap-6 md:grid-cols-4">
                {[
                  {
                    t: "Find Your Tutor",
                    d: "Filter by subject and review profiles, ratings, and availability.",
                  },
                  {
                    t: "Book a Session",
                    d: "Pick a time slot, choose duration, and confirm instantly.",
                  },
                  {
                    t: "Attend & Learn",
                    d: "Join at the scheduled time for personalized support.",
                  },
                  {
                    t: "Pay & Review",
                    d: "Settle up afterward and rate your tutor to help others.",
                  },
                ].map((step, i) => (
                  <li key={i} className="relative">
                    <div className="flex items-center gap-3">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                        {i + 1}
                      </span>
                      {i < 3 && (
                        <span className="hidden h-px flex-1 bg-border md:block" />
                      )}
                    </div>
                    <p className="mt-3 text-sm font-semibold">{step.t}</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {step.d}
                    </p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}

function ProgressRing({ value }: { value: number | undefined }) {
  const pct = value ?? 0;
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="relative h-32 w-32 shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          strokeWidth="12"
          className="stroke-muted"
        />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={value === undefined ? circumference : offset}
          className="stroke-primary transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        {value === undefined ? (
          <span className="h-6 w-10 animate-pulse rounded bg-muted" />
        ) : (
          <div className="text-center">
            <div className="text-2xl font-bold tabular-nums">{pct}%</div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Done
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Legend({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number | undefined;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="ml-auto text-sm font-semibold tabular-nums">
        {value === undefined ? "—" : value}
      </span>
    </div>
  );
}

function ActionTile({
  href,
  icon: Icon,
  title,
  subtitle,
  primary,
}: {
  href: string;
  icon: React.ElementType;
  title: string;
  subtitle: string;
  primary?: boolean;
}) {
  return (
    <a
      href={href}
      className={`group flex items-center gap-3 rounded-xl border p-4 transition-all hover:shadow-sm ${
        primary
          ? "border-primary/20 bg-primary/5 hover:border-primary/40"
          : "bg-card hover:bg-accent"
      }`}
    >
      <span
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${
          primary
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        }`}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{title}</div>
        <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
      </div>
      <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
    </a>
  );
}
