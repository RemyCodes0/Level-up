"use client";

import { useEffect, useState } from "react";
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
  Calendar,
  Star,
  TrendingUp,
  ArrowRight,
} from "lucide-react";
import axios from "axios";

export default function DashboardPage() {
  const { loading } = useAuth();
  const router = useNavigate();

  const storedUser = localStorage.getItem("user");
  const user = storedUser ? JSON.parse(storedUser) : null;
  const token = localStorage.getItem("token");

  const [totalSessions, setTotalSessions] = useState();
  const [upcomingSessions, setUpcomingSessions] = useState();
  const [sessionCompleted, setSessionCompleted] = useState();
  const [duration, setDuration] = useState();

  useEffect(() => {
    if (!loading && !user) {
      router("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    const fetchBookings = async () => {
      try {
        const res = await axios.get(`http://localhost:5000/api/book/student`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const data = res.data.length;
        const upcoming = res.data.filter(b => b.status === "confirmed").length;
        const completed = res.data.filter(b => b.status === "completed").length;
        const totalHours = res.data.reduce((acc, b) => acc + Number(b.duration) / 60, 0);

        setTotalSessions(data);
        setUpcomingSessions(upcoming);
        setSessionCompleted(completed);
        setDuration(totalHours);

      } catch (error) {
        console.error(error);
      }
    };
    fetchBookings();
  }, [token, user?._id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-lg">Loading...</div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <Navbar />

      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Centralized Welcome Section */}
        <div className="mb-10 flex flex-col items-center justify-center text-center">
          <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-white font-bold text-2xl mb-4">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            Welcome back, {user.name}!
          </h1>
          <p className="text-muted-foreground mt-2">
            Ready to continue your learning journey?
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          <Card className="border-none shadow-lg hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-blue-500/10 to-blue-600/5 hover:scale-[1.02]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-blue-700 dark:text-blue-400">
                Upcoming Sessions
              </CardTitle>
              <div className="h-10 w-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
            </CardHeader>
            <CardContent>
              {upcomingSessions === undefined ? (
                <div className="h-9 w-16 bg-blue-200/50 dark:bg-blue-800/30 rounded animate-pulse" />
              ) : (
                <div className="text-3xl font-bold text-blue-900 dark:text-blue-100">
                  {upcomingSessions}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-green-500/10 to-green-600/5 hover:scale-[1.02]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-green-700 dark:text-green-400">
                Total Sessions
              </CardTitle>
              <div className="h-10 w-10 rounded-full bg-green-500/20 flex items-center justify-center">
                <BookOpen className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
            </CardHeader>
            <CardContent>
              {totalSessions === undefined ? (
                <div className="h-9 w-16 bg-green-200/50 dark:bg-green-800/30 rounded animate-pulse" />
              ) : (
                <div className="text-3xl font-bold text-green-900 dark:text-green-100">
                  {totalSessions}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-amber-500/10 to-amber-600/5 hover:scale-[1.02]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-amber-700 dark:text-amber-400">
                Session Completed
              </CardTitle>
              <div className="h-10 w-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                <Star className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
            </CardHeader>
            <CardContent>
              {sessionCompleted === undefined ? (
                <div className="h-9 w-16 bg-amber-200/50 dark:bg-amber-800/30 rounded animate-pulse" />
              ) : (
                <div className="text-3xl font-bold text-amber-900 dark:text-amber-100">
                  {sessionCompleted}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-purple-500/10 to-purple-600/5 hover:scale-[1.02]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-purple-700 dark:text-purple-400">
                Hours studying
              </CardTitle>
              <div className="h-10 w-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
            </CardHeader>
            <CardContent>
              {duration === undefined ? (
                <div className="h-9 w-16 bg-purple-200/50 dark:bg-purple-800/30 rounded animate-pulse" />
              ) : (
                <div className="text-3xl font-bold text-purple-900 dark:text-purple-100">
                  {duration}H
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions and How It Works Cards */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Quick Actions Card */}
          <Card className="border-none shadow-lg hover:shadow-xl transition-shadow duration-300">
            <CardHeader>
              <CardTitle className="text-xl">Quick Actions</CardTitle>
              <CardDescription>
                What would you like to do today?
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <a href="/tutors" className="block">
                <Button
                  className="w-full justify-between h-auto py-4 px-5 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 transition-all group"
                  size="lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-white/20 flex items-center justify-center">
                      <BookOpen className="h-5 w-5" />
                    </div>
                    <div className="text-left">
                      <div className="font-semibold">Find a Tutor</div>
                      <div className="text-xs opacity-90">
                        Browse available experts
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </a>

              <a href="/bookings" className="block">
                <Button
                  className="w-full justify-between h-auto py-4 px-5 group"
                  variant="outline"
                  size="lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Calendar className="h-5 w-5 text-primary" />
                    </div>
                    <div className="text-left">
                      <div className="font-semibold">View My Bookings</div>
                      <div className="text-xs text-muted-foreground">
                        Manage your sessions
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                </Button>
              </a>

              <a href="/profile" className="block">
                <Button
                  className="w-full justify-between h-auto py-4 px-5 group"
                  variant="outline"
                  size="lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                      <Star className="h-5 w-5 text-amber-600" />
                    </div>
                    <div className="text-left">
                      <div className="font-semibold">Update Profile</div>
                      <div className="text-xs text-muted-foreground">
                        Personalize your account
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                </Button>
              </a>
            </CardContent>
          </Card>

          {/* Getting Started Guide */}
          <Card className="border-none shadow-lg hover:shadow-xl transition-shadow duration-300">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" />
                How It Works
              </CardTitle>
              <CardDescription>
                Follow these simple steps to get started
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {["Find Your Tutor","Book a Session","Attend & Learn","Pay & Review"].map((step, idx) => (
                  <div key={idx} className={`flex items-start gap-4 p-4 rounded-xl border
                    ${idx===0 ? "bg-blue-500/10 border-blue-500/20" :
                     idx===1 ? "bg-green-500/10 border-green-500/20" :
                     idx===2 ? "bg-purple-500/10 border-purple-500/20" :
                               "bg-amber-500/10 border-amber-500/20"}`}>
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center text-white flex-shrink-0 font-bold
                      ${idx===0?"bg-blue-500":idx===1?"bg-green-500":idx===2?"bg-purple-500":"bg-amber-500"}`}>
                      {idx+1}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-sm mb-1">{step}</p>
                      <p className="text-xs text-muted-foreground">
                        {idx===0
                          ? "Browse through our qualified tutors, filter by subject, and check their profiles, ratings, and availability"
                          : idx===1
                          ? "Select a convenient time slot, choose session duration, and confirm your booking"
                          : idx===2
                          ? "Join your session at the scheduled time and get personalized learning support"
                          : "Complete payment after your session and rate your tutor to help other students"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
