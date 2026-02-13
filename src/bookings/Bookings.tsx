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
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ReviewDialog } from "@/components/review-dialog";
import { MOCK_TUTORS } from "@/lib/mock-data";
import { Calendar, Clock, MapPin, Star, Sparkles, AlertCircle, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import axios from "axios";

interface MockSession {
  id: string;
  tutorId: string;
  subject: string;
  date: Date;
  duration: number;
  location: string;
  status: "pending" | "confirmed" | "completed" | "cancelled";
  totalAmount: number;
  notes?: string;
  hasReview?: boolean;
}

export default function BookingsPage() {
  const { loading } = useAuth();
  const router = useNavigate();
  const [activeTab, setActiveTab] = useState("upcoming");
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<MockSession | null>(null);
  const [mockSessions, setMocksessions] = useState();
  const [tutors, setTutors] = useState();
  const [loadingBookings, setLoadingBookings] = useState(true);
  const [loadingTutors, setLoadingTutors] = useState(true);

  const user = JSON.parse(localStorage.getItem("user"));
  const token = localStorage.getItem("token");

  useEffect(() => {
    const fetchBookings = async () => {
      setLoadingBookings(true);
      try {
        const res = await axios.get(`http://localhost:5000/api/book/student`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        setMocksessions(res.data);
        console.log(res.data);
      } catch (error) {
        console.error(error);
        console.log(user._id);
      } finally {
        setLoadingBookings(false);
      }
    };
    fetchBookings();
  }, []);

  useEffect(() => {
    const fetchTutor = async () => {
      setLoadingTutors(true);
      try {
        const res = await axios.get(
          "http://localhost:5000/api/tutor/allTutors",
        );
        setTutors(res.data);
      } catch (error) {
        console.error(error);
      } finally {
        setLoadingTutors(false);
      }
    };
    fetchTutor();
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      router("/login");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading your bookings...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const upcomingSessions = mockSessions?.filter(
    (s) => s.status === "confirmed" || s.status === "pending",
  );
  const pastSessions = mockSessions?.filter((s) => s.status === "completed");

  const handleReviewSubmit = (rating: number, comment: string) => {
    console.log("[v0] Review submitted:", {
      rating,
      comment,
      sessionId: selectedSession?.id,
    });
    // In production, this would call an API to save the review
  };

  const openReviewDialog = (session: MockSession) => {
    setSelectedSession(session);
    setReviewDialogOpen(true);
  };

  const SessionCardSkeleton = () => (
    <Card className="border-none shadow-lg overflow-hidden">
      <div className="h-1 bg-gradient-to-r from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600" />
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <Skeleton className="h-14 w-14 rounded-full flex-shrink-0" />
          
          <div className="flex-1 min-w-0 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-24" />
              </div>
              <Skeleton className="h-6 w-20" />
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-accent/50">
                  <Skeleton className="h-8 w-8 rounded-lg flex-shrink-0" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-9 w-36" />
              <Skeleton className="h-9 w-32" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const SessionCard = ({ session }) => {
    const tutor = tutors?.find((t) => t.id === session.tutorId);
    
    if (loadingTutors) {
      return <SessionCardSkeleton />;
    }

    if (!tutor) return null;

    const isPast = session.status === "completed";

    const getStatusConfig = (status: string) => {
      switch (status) {
        case "confirmed":
          return {
            variant: "default" as const,
            icon: CheckCircle2,
            color: "text-emerald-600",
            bgColor: "bg-emerald-500/10",
            label: "Confirmed"
          };
        case "pending":
          return {
            variant: "secondary" as const,
            icon: Clock,
            color: "text-amber-600",
            bgColor: "bg-amber-500/10",
            label: "Pending"
          };
        case "completed":
          return {
            variant: "secondary" as const,
            icon: CheckCircle2,
            color: "text-blue-600",
            bgColor: "bg-blue-500/10",
            label: "Completed"
          };
        case "cancelled":
          return {
            variant: "secondary" as const,
            icon: XCircle,
            color: "text-red-600",
            bgColor: "bg-red-500/10",
            label: "Cancelled"
          };
        default:
          return {
            variant: "secondary" as const,
            icon: AlertCircle,
            color: "text-gray-600",
            bgColor: "bg-gray-500/10",
            label: status
          };
      }
    };

    const statusConfig = getStatusConfig(session.status);
    const StatusIcon = statusConfig.icon;

    return (
      <Card className="border-none shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden">
        <div className={`h-1 ${session.status === 'confirmed' ? 'bg-gradient-to-r from-emerald-500 to-emerald-600' : session.status === 'pending' ? 'bg-gradient-to-r from-amber-500 to-amber-600' : 'bg-gradient-to-r from-blue-500 to-blue-600'}`} />
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <Avatar className="h-14 w-14 ring-2 ring-primary/20 flex-shrink-0">
              <AvatarImage
                src={tutor.avatarUrl || "/placeholder.svg"}
                alt={tutor.fullName}
              />
              <AvatarFallback className="bg-gradient-to-br from-primary to-primary/80 text-white text-lg">
                {tutor.user.name.charAt(0)}
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between mb-3 gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-lg truncate">
                    {session?.tutor?.user?.name}
                  </h3>
                  <p className="text-sm text-muted-foreground font-medium">
                    {session.subject}
                  </p>
                </div>
                <Badge 
                  variant={statusConfig.variant}
                  className={`${statusConfig.bgColor} ${statusConfig.color} border-none flex items-center gap-1 px-3 py-1 whitespace-nowrap`}
                >
                  <StatusIcon className="h-3 w-3" />
                  {statusConfig.label}
                </Badge>
              </div>

              <div className="grid sm:grid-cols-2 gap-3 mb-4">
                <div className="flex items-center gap-2 p-2 rounded-lg bg-accent/50">
                  <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                    <Calendar className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground font-medium">Date & Time</p>
                    <p className="text-sm font-semibold truncate">
                      {session.slot.day}: {session.slot.from}-{session.slot.to}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-2 rounded-lg bg-accent/50">
                  <div className="h-8 w-8 rounded-lg bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                    <Clock className="h-4 w-4 text-violet-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground font-medium">Duration</p>
                    <p className="text-sm font-semibold">{session.duration} minutes</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-2 rounded-lg bg-accent/50">
                  <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                    <MapPin className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground font-medium">Location</p>
                    <p className="text-sm font-semibold truncate">{session.location || "TBD"}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-2 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5">
                  <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-primary">$</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground font-medium">Total Amount</p>
                    <p className="text-sm font-bold text-primary">${session.totalAmount.toFixed(2)}</p>
                  </div>
                </div>
              </div>

              {session.notes && (
                <div className="mb-4 p-3 rounded-lg bg-blue-500/5 border border-blue-500/10">
                  <p className="text-xs font-medium text-blue-600 mb-1">Session Notes</p>
                  <p className="text-sm text-muted-foreground italic">
                    {session.notes}
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {/* <a href={`/tutors/${session.tutor._id}`}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="hover:bg-primary hover:text-primary-foreground transition-colors"
                  >
                    View Tutor Profile
                  </Button>
                </a> */}
                {isPast && !session.hasReview && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="hover:bg-amber-500 hover:text-white hover:border-amber-500 transition-colors"
                    onClick={() => openReviewDialog(session)}
                  >
                    <Star className="mr-2 h-4 w-4" />
                    Leave Review
                  </Button>
                )}
                {isPast && session.hasReview && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-amber-500/20 bg-amber-500/5"
                    disabled
                  >
                    <Star className="mr-2 h-4 w-4 fill-amber-400 text-amber-400" />
                    Reviewed
                  </Button>
                )}
                {/* {!isPast && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors"
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Cancel Booking
                  </Button>
                )} */}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const isDataLoading = loadingBookings || loadingTutors;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <Navbar />
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header Section */}
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-5 w-5 text-primary" />
            <Badge variant="secondary" className="text-xs">Sessions</Badge>
          </div>
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            My Bookings
          </h1>
          <p className="text-lg text-muted-foreground">
            Manage and track all your tutoring sessions
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-2 h-12 bg-accent/50 p-1">
            <TabsTrigger 
              value="upcoming" 
              className="data-[state=active]:bg-background data-[state=active]:shadow-lg transition-all text-sm font-semibold"
              disabled={loadingBookings}
            >
              <Calendar className="mr-2 h-4 w-4" />
              Upcoming {!loadingBookings && `(${upcomingSessions?.length || 0})`}
            </TabsTrigger>
            <TabsTrigger 
              value="past"
              className="data-[state=active]:bg-background data-[state=active]:shadow-lg transition-all text-sm font-semibold"
              disabled={loadingBookings}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Past {!loadingBookings && `(${pastSessions?.length || 0})`}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming" className="space-y-4">
            {isDataLoading ? (
              <>
                <SessionCardSkeleton />
                <SessionCardSkeleton />
                <SessionCardSkeleton />
              </>
            ) : upcomingSessions?.length > 0 ? (
              upcomingSessions?.map((session) => (
                <SessionCard key={session._id} session={session} />
              ))
            ) : (
              <Card className="border-none shadow-lg">
                <CardContent className="pt-12 pb-12 text-center">
                  <div className="h-20 w-20 rounded-full bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center mx-auto mb-6">
                    <Calendar className="h-10 w-10 text-primary" />
                  </div>
                  <CardTitle className="text-2xl mb-3">No upcoming sessions</CardTitle>
                  <CardDescription className="text-base mb-6 max-w-md mx-auto">
                    You don't have any scheduled tutoring sessions yet. Start your learning journey by booking a session with one of our expert tutors.
                  </CardDescription>
                  <a href="/tutors">
                    <Button size="lg" className="bg-gradient-to-r from-primary to-primary/90 shadow-lg hover:shadow-xl">
                      <Sparkles className="mr-2 h-4 w-4" />
                      Find a Tutor
                    </Button>
                  </a>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="past" className="space-y-4">
            {isDataLoading ? (
              <>
                <SessionCardSkeleton />
                <SessionCardSkeleton />
              </>
            ) : pastSessions?.length > 0 ? (
              pastSessions?.map((session) => (
                <SessionCard key={session._id} session={session} />
              ))
            ) : (
              <Card className="border-none shadow-lg">
                <CardContent className="pt-12 pb-12 text-center">
                  <div className="h-20 w-20 rounded-full bg-gradient-to-br from-blue-500/10 to-blue-600/5 flex items-center justify-center mx-auto mb-6">
                    <CheckCircle2 className="h-10 w-10 text-blue-600" />
                  </div>
                  <CardTitle className="text-2xl mb-3">No past sessions</CardTitle>
                  <CardDescription className="text-base max-w-md mx-auto">
                    Your completed tutoring sessions will appear here once you finish them.
                  </CardDescription>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {selectedSession && (
          <ReviewDialog
            open={reviewDialogOpen}
            onOpenChange={setReviewDialogOpen}
            tutorName={
              MOCK_TUTORS.find((t) => t.id === selectedSession.tutorId)
                ?.fullName || ""
            }
            sessionSubject={selectedSession.subject}
            onSubmit={handleReviewSubmit}
          />
        )}
      </div>
    </div>
  );
}