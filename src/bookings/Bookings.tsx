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
import { ReviewDialog } from "@/components/review-dialog";
import { MOCK_TUTORS } from "@/lib/mock-data";
import { Calendar, Clock, MapPin, Star } from "lucide-react";
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
  const [selectedSession, setSelectedSession] = useState<MockSession | null>(
    null,
  );
  const [mockSessions, setMocksessions] = useState();

  const user = JSON.parse(localStorage.getItem("user"));
  const token = localStorage.getItem("token");

  useEffect(() => {
    const fetchBookings = async () => {
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
      }
    };
    fetchBookings();
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      router("/login");
    }
  }, [user, loading, router]);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return null;
  }

  // Mock sessions data
  // const mockSessions: MockSession[] = [
  //   {
  //     id: "1",
  //     tutorId: "a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d",
  //     subject: "Data Structures",
  //     date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
  //     duration: 60,
  //     location: "Jafet Library",
  //     status: "confirmed",
  //     totalAmount: 15.0,
  //     notes: "Need help with binary trees",
  //   },
  //   {
  //     id: "2",
  //     tutorId: "b2c3d4e5-f6a7-5b6c-9d0e-1f2a3b4c5d6e",
  //     subject: "Calculus II",
  //     date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
  //     duration: 90,
  //     location: "Nicely Hall",
  //     status: "confirmed",
  //     totalAmount: 18.0,
  //   },
  //   {
  //     id: "3",
  //     tutorId: "c3d4e5f6-a7b8-6c7d-0e1f-2a3b4c5d6e7f",
  //     subject: "Molecular Biology",
  //     date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
  //     duration: 60,
  //     location: "Biology Lab",
  //     status: "completed",
  //     totalAmount: 13.0,
  //     hasReview: true,
  //   },
  //   {
  //     id: "4",
  //     tutorId: "e5f6a7b8-c9d0-8e9f-2a3b-4c5d6e7f8a9b",
  //     subject: "Academic Writing",
  //     date: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000),
  //     duration: 60,
  //     location: "Online (Zoom)",
  //     status: "completed",
  //     totalAmount: 11.0,
  //     hasReview: false,
  //   },
  // ]

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

  const SessionCard = ({ session }) => {
    const [tutors, setTutors] = useState();

    useEffect(() => {
      const fetchTutor = async () => {
        try {
          const res = await axios.get(
            "http://localhost:5000/api/tutor/allTutors",
          );
          setTutors(res.data);
        } catch (error) {
          console.error(error);
        }
      };
      fetchTutor();
    }, []);

    const tutor = tutors?.find((t) => t.id === session.tutorId);
    if (!tutor) return null;

    const isPast = session.status === "completed";

    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <Avatar className="h-12 w-12">
              <AvatarImage
                src={tutor.avatarUrl || "/placeholder.svg"}
                alt={tutor.fullName}
              />
              <AvatarFallback>{tutor.user.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-semibold text-lg">
                    {session?.tutor?.user?.name}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {session.subject}
                  </p>
                </div>
                <Badge
                  variant={
                    session.status === "confirmed" ? "default" : "secondary"
                  }
                >
                  {session.status.charAt(0).toUpperCase() +
                    session.status.slice(1)}
                </Badge>
              </div>

              <div className="grid md:grid-cols-2 gap-2 text-sm text-muted-foreground mb-4">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span>
                    {session.slot.day}: {session.slot.from}-{session.slot.to}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span>({session.duration} min)</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  <span>{session.location}</span>
                </div>
                <div className="flex items-center gap-2 font-semibold text-foreground">
                  <span>Total: ${session.totalAmount.toFixed(2)}</span>
                </div>
              </div>

              {session.notes && (
                <p className="text-sm text-muted-foreground mb-4 italic">
                  Note: {session.notes}
                </p>
              )}

              <div className="flex gap-2">
                <a href={`/tutors/${tutor.id}`}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="bg-transparent"
                  >
                    View Tutor
                  </Button>
                </a>
                {isPast && !session.hasReview && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="bg-transparent"
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
                    className="bg-transparent"
                    disabled
                  >
                    <Star className="mr-2 h-4 w-4 fill-yellow-400 text-yellow-400" />
                    Reviewed
                  </Button>
                )}
                {!isPast && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive bg-transparent"
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">My Bookings</h1>
          <p className="text-muted-foreground">Manage your tutoring sessions</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="upcoming">
              Upcoming ({upcomingSessions?.length})
            </TabsTrigger>
            <TabsTrigger value="past">
              Past ({pastSessions?.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming" className="space-y-4">
            {upcomingSessions?.length > 0 ? (
              upcomingSessions?.map((session) => (
                <SessionCard key={session._id} session={session} />
              ))
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>No upcoming sessions</CardTitle>
                  <CardDescription>
                    You don't have any scheduled tutoring sessions yet.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <a href="/tutors">
                    <Button>Find a Tutor</Button>
                  </a>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="past" className="space-y-4">
            {pastSessions?.length > 0 ? (
              pastSessions?.map((session) => (
                <SessionCard key={session._id} session={session} />
              ))
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>No past sessions</CardTitle>
                  <CardDescription>
                    Your completed sessions will appear here.
                  </CardDescription>
                </CardHeader>
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
