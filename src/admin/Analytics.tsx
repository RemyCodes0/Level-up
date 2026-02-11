"use client";

import { useNavigate } from "react-router-dom";
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
import {
  BookOpen,
  DollarSign,
  TrendingUp,
  Star,
  ArrowLeft,
  Users,
  Calendar,
  Award,
  BarChart3,
  Target,
} from "lucide-react";
import axios from "axios";

export default function AdminAnalyticsPage() {
  const router = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [allSessions, setAllSessions] = useState([]);
  const [allUsers, setAllUsers] = useState([]);

  const token = localStorage.getItem("token");

  useEffect(() => {
    const fetchAnalyticsData = async () => {
      setIsLoading(true);
      try {
        // Fetch sessions
        const sessionsRes = await axios.get(
          "http://localhost:5000/api/admin/sessions",
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        setAllSessions(sessionsRes.data);

        // Fetch users
        const usersRes = await axios.get(
          "http://localhost:5000/api/admin/users",
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        setAllUsers(usersRes.data);
      } catch (err) {
        console.error("Error fetching analytics data:", err);
      } finally {
        setIsLoading(false);
      }
    };

    if (token) {
      fetchAnalyticsData();
    }
  }, [token]);

  // Calculate metrics
  const totalRevenue = allSessions
    .filter((s) => s.status === "confirmed" || s.status === "completed")
    .reduce((acc, s) => acc + s.totalAmount, 0);

  const totalSessions = allSessions.length;
  const completedSessions = allSessions.filter(
    (s) => s.status === "completed"
  ).length;
  const completionRate =
    totalSessions > 0 ? (completedSessions / totalSessions) * 100 : 0;

  const avgSessionRate =
    allSessions.length > 0
      ? totalRevenue / allSessions.filter((s) => s.status !== "canceled").length
      : 0;

  // Calculate monthly data (last 6 months)
  const getMonthlyData = () => {
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const now = new Date();
    const monthlyStats = [];

    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthName = monthNames[date.getMonth()];
      const year = date.getFullYear();

      const monthSessions = allSessions.filter((s) => {
        const sessionDate = new Date(s.createdAt);
        return (
          sessionDate.getMonth() === date.getMonth() &&
          sessionDate.getFullYear() === year
        );
      });

      const monthUsers = allUsers.filter((u) => {
        const userDate = new Date(u.createdAt);
        return (
          userDate.getMonth() === date.getMonth() &&
          userDate.getFullYear() === year
        );
      });

      const revenue = monthSessions
        .filter((s) => s.status === "confirmed" || s.status === "completed")
        .reduce((acc, s) => acc + s.totalAmount, 0);

      monthlyStats.push({
        month: monthName,
        sessions: monthSessions.length,
        revenue: revenue,
        users: monthUsers.length,
      });
    }

    return monthlyStats;
  };

  // Calculate top tutors
  const getTopTutors = () => {
    const tutorStats = {};

    allSessions.forEach((session) => {
      const tutorId = session.tutor._id;
      if (!tutorStats[tutorId]) {
        tutorStats[tutorId] = {
          name: session.tutor.name,
          sessions: 0,
          earnings: 0,
        };
      }
      tutorStats[tutorId].sessions++;
      if (session.status === "confirmed" || session.status === "completed") {
        tutorStats[tutorId].earnings += session.totalAmount;
      }
    });

    return Object.values(tutorStats)
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 5);
  };

  // Calculate popular subjects
  const getPopularSubjects = () => {
    const subjectStats = {};
    const totalSessionsCount = allSessions.length;

    allSessions.forEach((session) => {
      const subject = session.subject;
      if (!subjectStats[subject]) {
        subjectStats[subject] = 0;
      }
      subjectStats[subject]++;
    });

    return Object.entries(subjectStats)
      .map(([subject, sessions]) => ({
        subject,
        sessions,
        percentage:
          totalSessionsCount > 0
            ? Math.round((sessions / totalSessionsCount) * 100)
            : 0,
      }))
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 5);
  };

  const monthlyData = getMonthlyData();
  const topTutors = getTopTutors();
  const popularSubjects = getPopularSubjects();

  // Calculate growth rate
  const lastMonth = monthlyData[monthlyData.length - 1]?.sessions || 0;
  const previousMonth = monthlyData[monthlyData.length - 2]?.sessions || 0;
  const growthRate =
    previousMonth > 0
      ? Math.round(((lastMonth - previousMonth) / previousMonth) * 100)
      : 0;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <Navbar />
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-96">
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-gray-600 font-medium">
                Loading analytics...
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
        {/* Back Button */}
        <Button
          variant="ghost"
          onClick={() => router("/admin/dashboard")}
          className="mb-6 hover:bg-white hover:shadow-md transition-all duration-200"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 via-indigo-800 to-blue-800 bg-clip-text text-transparent mb-2">
            Platform Analytics
          </h1>
          <p className="text-gray-600 text-lg">
            Insights and performance metrics
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500 to-teal-600 opacity-0 group-hover:opacity-5 transition-opacity duration-300" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Growth Rate
              </CardTitle>
              <div className="p-2 bg-emerald-100 rounded-lg">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900">
                {growthRate > 0 ? "+" : ""}
                {growthRate}%
              </div>
              <p className="text-xs text-gray-600 mt-1">vs last month</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-indigo-600 opacity-0 group-hover:opacity-5 transition-opacity duration-300" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Avg Session Rate
              </CardTitle>
              <div className="p-2 bg-blue-100 rounded-lg">
                <DollarSign className="h-5 w-5 text-blue-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900">
                ${avgSessionRate.toFixed(2)}
              </div>
              <p className="text-xs text-gray-600 mt-1">per session</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500 to-orange-600 opacity-0 group-hover:opacity-5 transition-opacity duration-300" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Avg Rating
              </CardTitle>
              <div className="p-2 bg-amber-100 rounded-lg">
                <Star className="h-5 w-5 text-amber-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900">4.8</div>
              <p className="text-xs text-gray-600 mt-1">out of 5.0</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-pink-600 opacity-0 group-hover:opacity-5 transition-opacity duration-300" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Completion Rate
              </CardTitle>
              <div className="p-2 bg-purple-100 rounded-lg">
                <BookOpen className="h-5 w-5 text-purple-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900">
                {completionRate.toFixed(0)}%
              </div>
              <p className="text-xs text-gray-600 mt-1">sessions completed</p>
            </CardContent>
          </Card>
        </div>

        {/* Charts Section */}
        <div className="grid lg:grid-cols-2 gap-8 mb-8">
          {/* Monthly Growth */}
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <BarChart3 className="h-5 w-5 text-blue-600" />
                </div>
                <CardTitle className="text-xl">Monthly Growth</CardTitle>
              </div>
              <CardDescription>
                Sessions, revenue, and user growth over time
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {monthlyData.map((data, index) => (
                  <div key={data.month} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold text-gray-900">
                        {data.month}
                      </span>
                      <div className="flex gap-4 text-gray-600">
                        <span className="flex items-center gap-1">
                          <BookOpen className="h-3 w-3" />
                          {data.sessions}
                        </span>
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />
                          {data.revenue}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {data.users}
                        </span>
                      </div>
                    </div>
                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min((data.sessions / 200) * 100, 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Top Tutors */}
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Award className="h-5 w-5 text-purple-600" />
                </div>
                <CardTitle className="text-xl">Top Performing Tutors</CardTitle>
              </div>
              <CardDescription>
                Tutors with the most sessions and highest earnings
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {topTutors.length > 0 ? (
                  topTutors.map((tutor, idx) => (
                    <div
                      key={tutor.name}
                      className="flex items-center justify-between p-4 border-2 border-gray-100 rounded-xl hover:border-purple-200 hover:shadow-md transition-all duration-300 bg-white"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-600 text-white font-bold text-lg shadow-md">
                          {idx + 1}
                        </div>
                        <div>
                          <div className="font-semibold text-gray-900">
                            {tutor.name}
                          </div>
                          <div className="text-sm text-gray-600 flex items-center gap-2">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {tutor.sessions} sessions
                            </span>
                            <span className="text-amber-500">⭐ 4.8</span>
                          </div>
                        </div>
                      </div>
                      <div className="font-bold text-lg text-emerald-600">
                        ${tutor.earnings.toFixed(0)}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    No tutor data available yet
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Popular Subjects */}
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <Target className="h-5 w-5 text-emerald-600" />
              </div>
              <CardTitle className="text-xl">Popular Subjects</CardTitle>
            </div>
            <CardDescription>
              Most requested subjects on the platform
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {popularSubjects.length > 0 ? (
                popularSubjects.map((item) => (
                  <div key={item.subject} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold text-gray-900">
                        {item.subject}
                      </span>
                      <span className="text-gray-600">
                        {item.sessions} sessions ({item.percentage}%)
                      </span>
                    </div>
                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-600 rounded-full transition-all duration-500"
                        style={{ width: `${item.percentage}%` }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No subject data available yet
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}