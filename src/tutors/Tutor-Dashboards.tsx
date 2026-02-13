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
  DollarSign,
  Calendar,
  Clock,
  TrendingUp,
  Users,
  MapPin,
  ChevronRight,
  BookOpen,
  Award,
  Activity,
} from "lucide-react";
import axios from "axios";

export default function TutorDashboardPage() {
  const [upcomingSessions, setUpcomingSessions] = useState([]);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [totalSessions, setTotalSessions] = useState(0);
  const [totalHours, setTotalHours] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [reviews, setReviews] = useState<any[]>([])

  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user"))

  useEffect(() => {
    const fetchBookings = async () => {
      setIsLoading(true);
      try {
        const res = await axios.get("http://localhost:5000/api/book/tutor", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const reviewRes = await axios.get(
          `http://localhost:5000/api/reviews/${user._id}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
       
        
        setReviews(reviewRes.data)
        // const avgRating = reviews.length
        //   ? (
        //       reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length
        //     ).toFixed(1)
        //   : 0;
        // setRating(avgRating);
        const total = res.data
          .filter((b) => b.status === "confirmed")
          .reduce((acc, b) => acc + b.totalAmount, 0);
        setTotalEarnings(total);

        const sessions = res.data.filter((b) => b.status !== "canceled").length;
        setTotalSessions(sessions);

        const hoursTaught = res.data
          .filter((b) => b.status === "confirmed")
          .reduce((acc, b) => acc + b.duration / 60, 0);
        setTotalHours(hoursTaught);

        setUpcomingSessions(res.data.slice(0, 4)); // Show only first 4
      } catch (error) {
        console.error("Error fetching bookings:", error);
      } finally {
        setIsLoading(false);
      }
    };

    
    if (token) {
      fetchBookings();
    }
  }, [token]);

   const calculateAverageRating = () => {
    if (reviews.length === 0) return 0
    const sum = reviews.reduce((acc, review) => acc + review.rating, 0)
    return (sum / reviews.length).toFixed(1)
  }


  const averageRating = calculateAverageRating()

  const stats = [
    {
      title: "Total Earnings",
      value: `$${totalEarnings.toFixed(2)}`,
      icon: DollarSign,
      trend: "+12.5%",
      trendUp: true,
      bgGradient: "from-emerald-500 to-teal-600",
      iconBg: "bg-emerald-100",
      iconColor: "text-emerald-600",
    },
    {
      title: "Total Sessions",
      value: totalSessions,
      icon: Calendar,
      trend: "+8 this week",
      trendUp: true,
      bgGradient: "from-blue-500 to-indigo-600",
      iconBg: "bg-blue-100",
      iconColor: "text-blue-600",
    },
    {
      title: "Hours Taught",
      value: totalHours.toFixed(1),
      icon: Clock,
      trend: "45h this month",
      trendUp: true,
      bgGradient: "from-purple-500 to-pink-600",
      iconBg: "bg-purple-100",
      iconColor: "text-purple-600",
    },
    // {
    //   title: "Rate",
    //   value: averageRating,
    //   icon: Award,
    //   trend: "+2% this month",
    //   trendUp: true,
    //   bgGradient: "from-orange-500 to-red-600",
    //   iconBg: "bg-orange-100",
    //   iconColor: "text-orange-600",
    // },
  ];

  const quickActions = [
    {
      title: "Edit Profile",
      icon: Users,
      href: "/tutor/profile",
      description: "Update your information",
      color: "text-blue-600",
      bgColor: "bg-blue-50 hover:bg-blue-100",
    },
    {
      title: "Manage Availability",
      icon: Calendar,
      href: "/tutor/availability",
      description: "Set your schedule",
      color: "text-purple-600",
      bgColor: "bg-purple-50 hover:bg-purple-100",
    },
    {
      title: "View Sessions",
      icon: BookOpen,
      href: "/tutor/sessions",
      description: "See all bookings",
      color: "text-emerald-600",
      bgColor: "bg-emerald-50 hover:bg-emerald-100",
    },
  ];

  const getStatusColor = (status) => {
    switch (status) {
      case "confirmed":
        return "bg-emerald-100 text-emerald-700 border-emerald-200";
      case "pending":
        return "bg-amber-100 text-amber-700 border-amber-200";
      case "canceled":
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
                Loading your dashboard...
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30">
      <Navbar />

      <div className="container mx-auto px-4 py-8">
        {/* Welcome Header */}
        <div className="mb-8 animate-fade-in">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 via-blue-800 to-purple-800 bg-clip-text text-transparent mb-2">
            Tutor Dashboard
          </h1>
          <p className="text-gray-600 text-lg">
            Track your performance and manage your sessions
          </p>
        </div>

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
                {/* <div className="flex items-center gap-1 text-sm">
                  <TrendingUp className="h-3 w-3 text-emerald-600" />
                  <span className="text-emerald-600 font-medium">{stat.trend}</span>
                </div> */}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Upcoming Sessions */}
          <div className="lg:col-span-2">
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-2xl">
                      Upcoming Sessions
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Your scheduled tutoring sessions
                    </CardDescription>
                  </div>
                  <Badge variant="secondary" className="text-sm px-3 py-1">
                    {upcomingSessions.length} sessions
                  </Badge>
                </div>
              </CardHeader>

              <CardContent>
                <div className="space-y-3">
                  {upcomingSessions.length > 0 ? (
                    upcomingSessions.map((session) => (
                      <div
                        key={session._id}
                        className="group relative p-5 border-2 border-gray-100 rounded-xl hover:border-blue-200 hover:shadow-md transition-all duration-300 bg-white"
                      >
                        {/* Status Badge */}
                        <Badge
                          className={`absolute top-4 right-4 ${getStatusColor(session.status)} border`}
                        >
                          {session.status}
                        </Badge>

                        <div className="flex items-start gap-4">
                          {/* Avatar */}
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                            {session.student.name.charAt(0)}
                          </div>

                          {/* Session Info */}
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-lg text-gray-900 mb-1">
                              {session.student.name}
                            </div>

                            <div className="text-sm font-medium text-blue-600 mb-3">
                              {session.subject}
                            </div>

                            <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                              <span className="flex items-center gap-1.5">
                                <Calendar className="h-4 w-4 text-gray-400" />
                                {session.slot.day}
                              </span>
                              <span className="flex items-center gap-1.5">
                                <Clock className="h-4 w-4 text-gray-400" />
                                {session.duration} min
                              </span>
                              <span className="flex items-center gap-1.5">
                                <MapPin className="h-4 w-4 text-gray-400" />
                                {session.location}
                              </span>
                            </div>
                          </div>

                          {/* Action Button */}
                          {/* <a href="/tutor/sessions">
                            <Button
                              variant="outline"
                              size="sm"
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              Details
                              <ChevronRight className="h-4 w-4 ml-1" />
                            </Button>
                          </a> */}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-12">
                      <Calendar className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500 font-medium">
                        No upcoming sessions
                      </p>
                      <p className="text-sm text-gray-400 mt-1">
                        New bookings will appear here
                      </p>
                    </div>
                  )}
                </div>

                {upcomingSessions.length > 0 && (
                  <a href="/tutor/sessions">
                    <Button variant="ghost" className="w-full mt-4 group">
                      View All Sessions
                      <ChevronRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </Button>
                  </a>
                )}
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
                      className={`w-full justify-start h-auto py-4 px-4 ${action.bgColor} border-0 transition-all duration-200 group`}
                    >
                      <div className="flex items-center gap-3 w-full">
                        <div className={`p-2 rounded-lg bg-white shadow-sm`}>
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

            {/* Performance Insights */}
            <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-600 to-purple-700 text-white">
              <CardHeader>
                <CardTitle className="text-xl flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  This Month
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-blue-100">Sessions</span>
                  <span className="text-2xl font-bold">{totalSessions}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-blue-100">Hours</span>
                  <span className="text-2xl font-bold">
                    {totalHours.toFixed(0)}h
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-blue-100">Earnings</span>
                  <span className="text-2xl font-bold">
                    ${totalEarnings.toFixed(0)}
                  </span>
                </div>
                {/* <div className="pt-4 border-t border-blue-400/30">
                  <p className="text-sm text-blue-100">
                    🎉 You're in the top 15% of tutors this month!
                  </p>
                </div> */}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
