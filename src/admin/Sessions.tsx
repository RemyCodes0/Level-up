"use client";

import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Navbar } from "@/components/navbar/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Calendar,
  Clock,
  MapPin,
  Search,
  BookOpen,
  CheckCircle,
  AlertCircle,
  XCircle,
  ArrowLeft,
  DollarSign,
  User,
  GraduationCap,
  TrendingUp,
} from "lucide-react";
import axios from "axios";

type Session = {
  _id: string;
  tutor: {
    name: string;
    email: string;
  };
  student: {
    name: string;
    email: string;
  };
  subject: string;
  slot: {
    day: string;
    time: string;
  };
  duration: number;
  location: string;
  status: "confirmed" | "pending" | "canceled" | "completed";
  totalAmount: number;
  createdAt: string;
};

export default function AdminSessionsPage() {
  const router = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [allSessions, setAllSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const token = localStorage.getItem("token");

  useEffect(() => {
    const fetchSessions = async () => {
      setIsLoading(true);
      try {
        const res = await axios.get(
          `${import.meta.env.VITE_API_URL}/api/admin/sessions`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        setAllSessions(res.data);
      } catch (err) {
        console.error("Error fetching sessions:", err);
      } finally {
        setIsLoading(false);
      }
    };
    if (token) {
      fetchSessions();
    }
  }, [token]);

  const filteredSessions = allSessions.filter(
    (session) =>
      session.tutor.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      session.student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      session.subject.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const upcomingSessions = filteredSessions.filter(
    (s) => s.status === "confirmed" || s.status === "pending",
  );
  const completedSessions = filteredSessions.filter(
    (s) => s.status === "completed",
  );
  const canceledSessions = filteredSessions.filter(
    (s) => s.status === "canceled",
  );

  // Calculate stats
  const totalRevenue = allSessions
    .filter((s) => s.status === "confirmed" || s.status === "completed")
    .reduce((acc, s) => acc + s.totalAmount, 0);

  const totalHours = allSessions
    .filter((s) => s.status === "confirmed" || s.status === "completed")
    .reduce((acc, s) => acc + s.duration / 60, 0);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed":
        return "bg-emerald-100 text-emerald-700 border-emerald-200";
      case "pending":
        return "bg-amber-100 text-amber-700 border-amber-200";
      case "completed":
        return "bg-blue-100 text-blue-700 border-blue-200";
      case "canceled":
        return "bg-red-100 text-red-700 border-red-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "confirmed":
      case "completed":
        return <CheckCircle className="h-4 w-4" />;
      case "pending":
        return <Clock className="h-4 w-4" />;
      case "canceled":
        return <XCircle className="h-4 w-4" />;
      default:
        return <AlertCircle className="h-4 w-4" />;
    }
  };

  const SessionCard = ({ session }: { session: Session }) => (
    <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden group">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      <CardContent className="p-6 relative">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h3 className="font-semibold text-xl text-gray-900 mb-2">
              {session.subject}
            </h3>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <GraduationCap className="h-4 w-4 text-blue-600" />
                <span className="font-medium">Tutor:</span>
                <span>{session.tutor.name}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <User className="h-4 w-4 text-purple-600" />
                <span className="font-medium">Student:</span>
                <span>{session.student.name}</span>
              </div>
            </div>
          </div>
          <Badge
            className={`${getStatusColor(session.status)} border font-medium capitalize flex items-center gap-1`}
          >
            {getStatusIcon(session.status)}
            {session.status}
          </Badge>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 space-y-2 mb-4">
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <Calendar className="h-4 w-4 text-gray-500" />
            <span className="font-medium">{session.slot.day}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <Clock className="h-4 w-4 text-gray-500" />
            <span>
              {session.slot.time} • {session.duration} minutes
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <MapPin className="h-4 w-4 text-gray-500" />
            <span>{session.location}</span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t-2 border-gray-100">
          <div className="flex items-center gap-1.5 font-bold text-lg text-emerald-600">
            <DollarSign className="h-5 w-5" />
            <span>{session.totalAmount.toFixed(2)}</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300"
          >
            View Details
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <Navbar />
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-96">
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-gray-600 font-medium">Loading sessions...</p>
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

        {/* Header Section */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 via-indigo-800 to-blue-800 bg-clip-text text-transparent mb-2">
            All Sessions
          </h1>
          <p className="text-gray-600 text-lg mb-6">
            View and manage all tutoring sessions
          </p>

          {/* Search Bar */}
          <Card className="border-0 shadow-lg max-w-2xl">
            <CardContent className="p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  placeholder="Search by tutor, student, or subject..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 h-12 border-0 focus-visible:ring-2 focus-visible:ring-blue-500"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Stats Cards */}
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Total Sessions
              </CardTitle>
              <div className="p-2 bg-blue-100 rounded-lg">
                <BookOpen className="h-5 w-5 text-blue-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900">
                {allSessions.length}
              </div>
              <p className="text-xs text-gray-600 mt-1">All time</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Upcoming
              </CardTitle>
              <div className="p-2 bg-purple-100 rounded-lg">
                <Calendar className="h-5 w-5 text-purple-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900">
                {upcomingSessions.length}
              </div>
              <p className="text-xs text-gray-600 mt-1">Scheduled sessions</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Total Hours
              </CardTitle>
              <div className="p-2 bg-emerald-100 rounded-lg">
                <Clock className="h-5 w-5 text-emerald-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900">
                {totalHours.toFixed(0)}h
              </div>
              <p className="text-xs text-gray-600 mt-1">Teaching time</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Total Revenue
              </CardTitle>
              <div className="p-2 bg-orange-100 rounded-lg">
                <DollarSign className="h-5 w-5 text-orange-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900">
                ${totalRevenue.toFixed(0)}
              </div>
              <div className="flex items-center gap-1 text-xs text-emerald-600 mt-1">
                <TrendingUp className="h-3 w-3" />
                <span>From sessions</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sessions List with Tabs */}
        <Card className="border-0 shadow-lg">
          <CardContent className="p-6">
            <Tabs defaultValue="upcoming" className="space-y-6">
              <TabsList className="grid w-full grid-cols-3 bg-gray-100 p-1 rounded-lg">
                <TabsTrigger
                  value="upcoming"
                  className="data-[state=active]:bg-white data-[state=active]:shadow-sm"
                >
                  <Calendar className="h-4 w-4 mr-2" />
                  Upcoming ({upcomingSessions.length})
                </TabsTrigger>
                <TabsTrigger
                  value="completed"
                  className="data-[state=active]:bg-white data-[state=active]:shadow-sm"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Completed ({completedSessions.length})
                </TabsTrigger>
                <TabsTrigger
                  value="canceled"
                  className="data-[state=active]:bg-white data-[state=active]:shadow-sm"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Canceled ({canceledSessions.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="upcoming" className="space-y-3">
                {upcomingSessions.length === 0 ? (
                  <Card className="border-2 border-dashed border-gray-200">
                    <CardContent className="py-12 text-center">
                      <Calendar className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500 font-medium">
                        No upcoming sessions
                      </p>
                      <p className="text-sm text-gray-400 mt-1">
                        Scheduled sessions will appear here
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  upcomingSessions.map((session) => (
                    <SessionCard key={session._id} session={session} />
                  ))
                )}
              </TabsContent>

              <TabsContent value="completed" className="space-y-3">
                {completedSessions.length === 0 ? (
                  <Card className="border-2 border-dashed border-gray-200">
                    <CardContent className="py-12 text-center">
                      <CheckCircle className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500 font-medium">
                        No completed sessions
                      </p>
                      <p className="text-sm text-gray-400 mt-1">
                        Completed sessions will appear here
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  completedSessions.map((session) => (
                    <SessionCard key={session._id} session={session} />
                  ))
                )}
              </TabsContent>

              <TabsContent value="canceled" className="space-y-3">
                {canceledSessions.length === 0 ? (
                  <Card className="border-2 border-dashed border-gray-200">
                    <CardContent className="py-12 text-center">
                      <XCircle className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500 font-medium">
                        No canceled sessions
                      </p>
                      <p className="text-sm text-gray-400 mt-1">
                        Canceled sessions will appear here
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  canceledSessions.map((session) => (
                    <SessionCard key={session._id} session={session} />
                  ))
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
