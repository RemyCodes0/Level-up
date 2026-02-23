"use client";

import { useEffect, useState } from "react";
import { Navbar } from "@/components/navbar/Navbar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  BookOpen,
  DollarSign,
  TrendingUp,
  UserCheck,
  Clock,
  Activity,
  AlertCircle,
  CheckCircle,
  XCircle,
  ChevronRight,
  BarChart3,
  UserPlus,
} from "lucide-react";
import axios from "axios";

export default function AdminDashboardPage() {
  const [user, setUser] = useState(null);
  const [applications, setApplications] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [allSessions, setAllSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const token = localStorage.getItem("token");

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  useEffect(() => {
    const fetchAllData = async () => {
      setIsLoading(true);
      try {
        // Fetch applications
        const applicationsRes = await axios.get(
          `${import.meta.env.VITE_API_URL}/api/tutor/applications`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        setApplications(applicationsRes.data);

        // Fetch all users (you'll need to create this endpoint)
        try {
          const usersRes = await axios.get(
            `${import.meta.env.VITE_API_URL}/api/auth/getUsers`,
            {
              headers: { Authorization: `Bearer ${token}` },
            },
          );
          setAllUsers(usersRes.data.user);
        } catch (error) {
          console.log("Users endpoint not available:", error);
        }

        // Fetch all sessions (you'll need to create this endpoint)
        try {
          const sessionsRes = await axios.get(
            `${import.meta.env.VITE_API_URL}/api/book/allBookings`,
            {
              headers: { Authorization: `Bearer ${token}` },
            },
          );
          setAllSessions(sessionsRes.data);
        } catch (error) {
          console.log("Sessions endpoint not available:", error);
        }
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    if (token) {
      fetchAllData();
    }
  }, [token]);

  // Calculate statistics
  const totalUsers = allUsers.length;
  const activeTutors = allUsers.filter((u) => u.role === "tutor").length;
  const activeStudents = allUsers.filter((u) => u.role === "learner").length;
  const totalSessions = allSessions.length;
  const confirmedSessions = allSessions.filter(
    (s) => s.status === "confirmed",
  ).length;
  const pendingApplications = applications.filter(
    (app) => app.status === "pending",
  ).length;
  const totalRevenue = allSessions
    .filter((s) => s.status === "confirmed")
    .reduce((acc, s) => acc + (s.totalAmount || 0), 0);

  // Get this month's revenue
  const thisMonth = new Date().getMonth();
  const thisYear = new Date().getFullYear();
  const thisMonthRevenue = allSessions
    .filter((s) => {
      const sessionDate = new Date(s.createdAt);
      return (
        s.status === "confirmed" &&
        sessionDate.getMonth() === thisMonth &&
        sessionDate.getFullYear() === thisYear
      );
    })
    .reduce((acc, s) => acc + (s.totalAmount || 0), 0);

  const stats = [
    {
      title: "Total Users",
      value: totalUsers,
      subtitle: `${activeTutors} tutors, ${activeStudents} students`,
      icon: Users,
      trend: "+12 this week",
      trendUp: true,
      bgGradient: "from-blue-500 to-indigo-600",
      iconBg: "bg-blue-100",
      iconColor: "text-blue-600",
    },
    {
      title: "Total Sessions",
      value: totalSessions,
      subtitle: `${confirmedSessions} confirmed`,
      icon: BookOpen,
      trend: "+23 this month",
      trendUp: true,
      bgGradient: "from-purple-500 to-pink-600",
      iconBg: "bg-purple-100",
      iconColor: "text-purple-600",
    },
    {
      title: "Platform Revenue",
      value: `$${totalRevenue.toFixed(2)}`,
      subtitle: `+$${thisMonthRevenue.toFixed(2)} this month`,
      icon: DollarSign,
      trend: "+18.2%",
      trendUp: true,
      bgGradient: "from-emerald-500 to-teal-600",
      iconBg: "bg-emerald-100",
      iconColor: "text-emerald-600",
    },
    {
      title: "Pending Applications",
      value: pendingApplications,
      subtitle: "Awaiting review",
      icon: Clock,
      trend: pendingApplications > 0 ? "Needs attention" : "All clear",
      trendUp: pendingApplications === 0,
      bgGradient: "from-orange-500 to-red-600",
      iconBg: "bg-orange-100",
      iconColor: "text-orange-600",
    },
  ];

  const quickActions = [
    {
      title: "Review Applications",
      icon: UserCheck,
      href: "/admin/applications",
      description: "Approve or reject tutors",
      color: "text-blue-600",
      bgColor: "bg-blue-50 hover:bg-blue-100",
      badge: pendingApplications > 0 ? pendingApplications : null,
    },
    {
      title: "Manage Users",
      icon: Users,
      href: "/admin/users",
      description: "View all platform users",
      color: "text-purple-600",
      bgColor: "bg-purple-50 hover:bg-purple-100",
    },
    {
      title: "View Sessions",
      icon: BookOpen,
      href: "/admin/sessions",
      description: "All tutoring sessions",
      color: "text-emerald-600",
      bgColor: "bg-emerald-50 hover:bg-emerald-100",
    },
    {
      title: "Analytics",
      icon: BarChart3,
      href: "/admin/analytics",
      description: "Platform insights",
      color: "text-orange-600",
      bgColor: "bg-orange-50 hover:bg-orange-100",
    },
  ];

  // Get recent activity from applications and sessions
  const getRecentActivity = () => {
    const activity = [];

    // Add recent applications
    applications.slice(0, 3).forEach((app) => {
      activity.push({
        id: app._id,
        type: "application",
        status: app.status,
        message: `Tutor application from ${app.name}`,
        time: getTimeAgo(app.createdAt),
        icon: UserPlus,
      });
    });

    // Add recent sessions
    allSessions.slice(0, 3).forEach((session) => {
      activity.push({
        id: session._id,
        type: "session",
        status: session.status,
        message: `Session: ${session.subject} - ${session.location}`,
        time: getTimeAgo(session.createdAt),
        icon: BookOpen,
      });
    });

    // Sort by time and take latest 6
    return activity
      .sort((a, b) => new Date(b.time) - new Date(a.time))
      .slice(0, 6);
  };

  const getTimeAgo = (date) => {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    const intervals = {
      year: 31536000,
      month: 2592000,
      week: 604800,
      day: 86400,
      hour: 3600,
      minute: 60,
    };

    for (const [unit, secondsInUnit] of Object.entries(intervals)) {
      const interval = Math.floor(seconds / secondsInUnit);
      if (interval >= 1) {
        return `${interval} ${unit}${interval !== 1 ? "s" : ""} ago`;
      }
    }
    return "just now";
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case "confirmed":
      case "approved":
        return <CheckCircle className="h-4 w-4 text-emerald-600" />;
      case "pending":
        return <Clock className="h-4 w-4 text-amber-600" />;
      case "canceled":
      case "rejected":
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "confirmed":
      case "approved":
        return "bg-emerald-100 text-emerald-700 border-emerald-200";
      case "pending":
        return "bg-amber-100 text-amber-700 border-amber-200";
      case "canceled":
      case "rejected":
        return "bg-red-100 text-red-700 border-red-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <Navbar />
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-96">
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-gray-600 font-medium">
                Loading admin dashboard...
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-indigo-50/30 to-blue-50/30">
      <Navbar />

      <div className="container mx-auto px-4 py-8">
        {/* Welcome Header */}
        <div className="mb-8 animate-fade-in">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 via-indigo-800 to-blue-800 bg-clip-text text-transparent mb-2">
            Admin Dashboard
          </h1>
          <p className="text-gray-600 text-lg">
            Platform overview and management
          </p>
        </div>

        {/* Pending Applications Alert */}
        {pendingApplications > 0 && (
          <Card className="mb-8 border-2 border-orange-500 bg-gradient-to-r from-orange-50 to-amber-50 shadow-lg animate-fade-in">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-orange-100 rounded-full">
                    <Clock className="h-8 w-8 text-orange-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg text-gray-900">
                      Pending Tutor Applications
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">
                      {pendingApplications} application
                      {pendingApplications !== 1 ? "s" : ""} waiting for review
                    </p>
                  </div>
                </div>
                <a href="/admin/applications">
                  <Button className="bg-orange-600 hover:bg-orange-700 shadow-md">
                    <UserCheck className="mr-2 h-4 w-4" />
                    Review Now
                  </Button>
                </a>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {stats.map((stat, index) => (
            <Card
              key={index}
              className="relative overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 group"
            >
              <div
                className={`absolute inset-0 bg-gradient-to-br ${stat.bgGradient} opacity-0 group-hover:opacity-5 transition-opacity duration-300`}
              />

              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">
                  {stat.title}
                </CardTitle>
                <div className={`${stat.iconBg} p-2 rounded-lg`}>
                  <stat.icon className={`h-5 w-5 ${stat.iconColor}`} />
                </div>
              </CardHeader>

              <CardContent>
                <div className="text-3xl font-bold text-gray-900 mb-1">
                  {stat.value}
                </div>
                <p className="text-xs text-gray-600 mb-2">{stat.subtitle}</p>
                {/* <div className="flex items-center gap-1 text-sm">
                  {stat.trendUp ? (
                    <TrendingUp className="h-3 w-3 text-emerald-600" />
                  ) : (
                    <AlertCircle className="h-3 w-3 text-orange-600" />
                  )}
                  <span
                    className={`font-medium ${
                      stat.trendUp ? "text-emerald-600" : "text-orange-600"
                    }`}
                  >
                    {stat.trend}
                  </span>
                </div> */}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Recent Activity */}
          <div className="lg:col-span-2">
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-2xl">Recent Activity</CardTitle>
                    <CardDescription className="mt-1">
                      Latest platform events
                    </CardDescription>
                  </div>
                  <Badge variant="secondary" className="text-sm px-3 py-1">
                    Live
                  </Badge>
                </div>
              </CardHeader>

              <CardContent>
                <div className="space-y-3">
                  {getRecentActivity().length > 0 ? (
                    getRecentActivity().map((activity) => (
                      <div
                        key={activity.id}
                        className="flex items-start gap-4 p-4 border-2 border-gray-100 rounded-xl hover:border-blue-200 hover:shadow-md transition-all duration-300 bg-white"
                      >
                        <div className="p-2 bg-gray-50 rounded-lg">
                          <activity.icon className="h-5 w-5 text-gray-600" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-medium text-gray-900">
                              {activity.message}
                            </p>
                            {getStatusIcon(activity.status)}
                          </div>
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-gray-500">
                              {activity.time}
                            </p>
                            <Badge
                              className={`${getStatusColor(activity.status)} border text-xs`}
                            >
                              {activity.status}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-12">
                      <Activity className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500 font-medium">
                        No recent activity
                      </p>
                      <p className="text-sm text-gray-400 mt-1">
                        Activity will appear here
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            {/* Quick Actions */}
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="text-xl">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {quickActions.map((action, index) => (
                  <a key={index} href={action.href}>
                    <Button
                      variant="ghost"
                      className={`w-full justify-start h-auto py-4 px-4 ${action.bgColor} border-0 transition-all duration-200 group relative`}
                    >
                      {action.badge && (
                        <Badge className="absolute top-2 right-2 bg-red-500 text-white border-0 px-2 py-0.5">
                          {action.badge}
                        </Badge>
                      )}
                      <div className="flex items-center gap-3 w-full">
                        <div className="p-2 rounded-lg bg-white shadow-sm">
                          <action.icon className={`h-5 w-5 ${action.color}`} />
                        </div>
                        <div className="flex-1 text-left">
                          <div className="font-semibold text-gray-900">
                            {action.title}
                          </div>
                          <div className="text-xs text-gray-600">
                            {action.description}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-gray-400 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </Button>
                  </a>
                ))}
              </CardContent>
            </Card>

            {/* Platform Stats */}
            <Card className="border-0 shadow-lg bg-gradient-to-br from-indigo-600 to-blue-700 text-white">
              <CardHeader>
                <CardTitle className="text-xl flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Platform Stats
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-blue-100">Total Users</span>
                  <span className="text-2xl font-bold">{totalUsers}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-blue-100">Active Tutors</span>
                  <span className="text-2xl font-bold">{activeTutors}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-blue-100">Total Sessions</span>
                  <span className="text-2xl font-bold">{totalSessions}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-blue-100">Revenue</span>
                  <span className="text-2xl font-bold">
                    ${totalRevenue.toFixed(0)}
                  </span>
                </div>
                <div className="pt-4 border-t border-blue-400/30">
                  <p className="text-sm text-blue-100">
                    📊 Platform growing steadily with {activeTutors} active
                    tutors!
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
