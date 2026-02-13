"use client";

import { useAuth } from "@/lib/auth-context";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Navbar } from "@/components/navbar/Navbar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  Clock,
  MapPin,
  User,
  ArrowLeft,
  Check,
  X,
  DollarSign,
  Filter,
  Search,
  CalendarDays,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from "lucide-react";
import axios from "axios";

export default function TutorSessionsPage() {
  const router = useNavigate();
  const user = JSON.parse(localStorage.getItem("user"));
  const token = localStorage.getItem("token");

  const [sessions, setSessions] = useState([]);
  const [upcomingSessions, setUpcomingSessions] = useState([]);
  const [pastSessions, setPastSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);

  const fetchBookings = async () => {
    setIsLoading(true);
    try {
      const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/book/tutor`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const bookings = res.data;
      divideBookings(bookings);
      setSessions(res.data);
    } catch (error) {
      console.error("Error fetching bookings:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchBookings();
    }
  }, [token]);

  const acceptBooking = async (id) => {
    setActionLoading(id);
    try {
      await axios.put(
        `${import.meta.env.VITE_API_URL}/api/book/accept/${id}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
      await fetchBookings();
    } catch (error) {
      console.error("Error accepting booking:", error);
    } finally {
      setActionLoading(null);
    }
  };

  const declineBooking = async (id) => {
    setActionLoading(id);
    try {
      await axios.put(
        `${import.meta.env.VITE_API_URL}/api/book/decline/${id}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
      await fetchBookings();
    } catch (error) {
      console.error("Error declining booking:", error);
    } finally {
      setActionLoading(null);
    }
  };

  const divideBookings = (bookings) => {
    const upcoming = [];
    const past = [];

    bookings.forEach((b) => {
      const formatted = {
        id: b._id,
        studentName: b.student?.name || "Unknown",
        subject: b.subject,
        date: b.slot.day,
        time: `${b.slot.from} - ${b.slot.to}`,
        location: b.slot.location || "Online",
        status: b.status,
        amount: b.totalAmount,
      };

      if (b.status === "pending") {
        upcoming.push(formatted);
      } else {
        past.push(formatted);
      }
    });

    setUpcomingSessions(upcoming);
    setPastSessions(past);
  };

  const getStatusConfig = (status) => {
    const configs = {
      confirmed: {
        variant: "default",
        className:
          "bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200",
        icon: CheckCircle2,
        iconColor: "text-emerald-600",
      },
      pending: {
        variant: "secondary",
        className:
          "bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-200",
        icon: AlertCircle,
        iconColor: "text-amber-600",
      },
      completed: {
        variant: "outline",
        className:
          "bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200",
        icon: CheckCircle2,
        iconColor: "text-blue-600",
      },
      canceled: {
        variant: "outline",
        className: "bg-red-100 text-red-700 border-red-200 hover:bg-red-200",
        icon: XCircle,
        iconColor: "text-red-600",
      },
    };
    return configs[status] || configs.pending;
  };

  const SessionCard = ({ session }) => {
    const statusConfig = getStatusConfig(session.status);
    const StatusIcon = statusConfig.icon;
    const isActionPending = actionLoading === session.id;

    return (
      <Card className="border-0 shadow-md hover:shadow-lg transition-all duration-300 overflow-hidden group">
        <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-blue-500 to-purple-600" />

        <CardContent className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <div className="flex items-start gap-3">
                {/* Student Avatar */}
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                  {session.studentName.charAt(0)}
                </div>

                <div className="flex-1">
                  <h3 className="font-bold text-lg text-gray-900 mb-1">
                    {session.subject}
                  </h3>
                  <p className="text-sm text-gray-600 flex items-center gap-1.5">
                    <User className="h-4 w-4" />
                    {session.studentName}
                  </p>
                </div>
              </div>
            </div>

            <Badge
              className={`${statusConfig.className} border flex items-center gap-1.5 px-3 py-1`}
            >
              <StatusIcon className="h-3.5 w-3.5" />
              <span className="capitalize font-medium">{session.status}</span>
            </Badge>
          </div>

          {/* Session Details */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4 bg-gray-50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-sm">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Calendar className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <div className="text-xs text-gray-500 font-medium">Date</div>
                <div className="text-gray-900 font-semibold">
                  {session.date}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Clock className="h-4 w-4 text-purple-600" />
              </div>
              <div>
                <div className="text-xs text-gray-500 font-medium">Time</div>
                <div className="text-gray-900 font-semibold">
                  {session.time}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <MapPin className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <div className="text-xs text-gray-500 font-medium">
                  Location
                </div>
                <div className="text-gray-900 font-semibold">
                  {session.location}
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-200">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-emerald-600" />
              <span className="font-bold text-xl text-gray-900">
                ${session.amount.toFixed(2)}
              </span>
            </div>

            <div className="flex gap-2">
              {session.status === "pending" && (
                <>
                  <Button
                    onClick={() => declineBooking(session.id)}
                    size="sm"
                    variant="outline"
                    disabled={isActionPending}
                    className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-300"
                  >
                    {isActionPending ? (
                      <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <X className="h-4 w-4 mr-1" />
                        Decline
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={() => acceptBooking(session.id)}
                    size="sm"
                    disabled={isActionPending}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    {isActionPending ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <Check className="h-4 w-4 mr-1" />
                        Accept
                      </>
                    )}
                  </Button>
                </>
              )}
              {(session.status === "confirmed" ||
                session.status === "completed") && (
                <Button
                  size="sm"
                  variant="outline"
                  className="group-hover:bg-gray-100"
                >
                  View Details
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const LoadingSkeleton = () => (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <Card key={i} className="border-0 shadow-md">
          <CardContent className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start gap-3 flex-1">
                <div className="w-12 h-12 rounded-full bg-gray-200 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-6 bg-gray-200 rounded animate-pulse w-3/4" />
                  <div className="h-4 bg-gray-200 rounded animate-pulse w-1/2" />
                </div>
              </div>
              <div className="h-6 w-24 bg-gray-200 rounded-full animate-pulse" />
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[1, 2, 3].map((j) => (
                <div
                  key={j}
                  className="h-16 bg-gray-100 rounded-lg animate-pulse"
                />
              ))}
            </div>
            <div className="flex items-center justify-between pt-4 border-t">
              <div className="h-8 w-24 bg-gray-200 rounded animate-pulse" />
              <div className="h-8 w-32 bg-gray-200 rounded animate-pulse" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  const EmptyState = ({ type }) => (
    <div className="text-center py-16">
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gray-100 mb-4">
        <CalendarDays className="h-10 w-10 text-gray-400" />
      </div>
      <h3 className="text-xl font-semibold text-gray-900 mb-2">
        No {type} Sessions
      </h3>
      <p className="text-gray-500 max-w-sm mx-auto">
        {type === "upcoming"
          ? "You don't have any pending sessions at the moment. New booking requests will appear here."
          : "You haven't completed any sessions yet. Completed sessions will be shown here."}
      </p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30">
      <Navbar />

      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => router("/tutor/dashboard")}
            className="mb-4 hover:bg-white/50"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 via-blue-800 to-purple-800 bg-clip-text text-transparent mb-2">
                My Sessions
              </h1>
              <p className="text-gray-600">
                Manage your tutoring sessions and bookings
              </p>
            </div>

            {/* Stats Summary */}
            <div className="hidden md:flex gap-4">
              <div className="bg-white rounded-lg shadow-md px-6 py-3 border border-gray-100">
                <div className="text-sm text-gray-600">Pending</div>
                <div className="text-2xl font-bold text-amber-600">
                  {upcomingSessions.length}
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-md px-6 py-3 border border-gray-100">
                <div className="text-sm text-gray-600">Total</div>
                <div className="text-2xl font-bold text-blue-600">
                  {sessions.length}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="upcoming" className="space-y-6">
          <TabsList className="bg-white shadow-md border-0 p-1">
            <TabsTrigger
              value="upcoming"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-purple-600 data-[state=active]:text-white rounded-md px-6"
            >
              <AlertCircle className="h-4 w-4 mr-2" />
              Pending Sessions
              <Badge className="ml-2 bg-amber-100 text-amber-700 hover:bg-amber-200">
                {upcomingSessions.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger
              value="past"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-purple-600 data-[state=active]:text-white rounded-md px-6"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Past Sessions
              <Badge className="ml-2 bg-blue-100 text-blue-700 hover:bg-blue-200">
                {pastSessions.length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming" className="space-y-4">
            {isLoading ? (
              <LoadingSkeleton />
            ) : upcomingSessions.length > 0 ? (
              upcomingSessions.map((session) => (
                <SessionCard key={session.id} session={session} />
              ))
            ) : (
              <EmptyState type="upcoming" />
            )}
          </TabsContent>

          <TabsContent value="past" className="space-y-4">
            {isLoading ? (
              <LoadingSkeleton />
            ) : pastSessions.length > 0 ? (
              pastSessions.map((session) => (
                <SessionCard key={session.id} session={session} />
              ))
            ) : (
              <EmptyState type="past" />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
