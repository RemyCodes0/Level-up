"use client";

import { useAuth } from "@/lib/auth-context";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Navbar } from "@/components/navbar/Navbar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, MapPin, User } from "lucide-react";
import axios from "axios";

export default function TutorSessionsPage() {

  const router = useNavigate();

  //   useEffect(() => {
  //     if (!user || (user.role !== "tutor" && user.role !== "both")) {
  //       router("/")
  //     }
  //   }, [user, router])

  // if (!user || (user.role !== "tutor" && user.role !== "both")) {
  //   return null
  // }
  const user = JSON.parse(localStorage.getItem("user"));
  const [sessions, setSessions] = useState();
  const token = localStorage.getItem("token");
  const [upcomingSessions, setUpcomingSessions] = useState([])
  const [pastSessions, setPastSessions] = useState([])

  //   useEffect(() => {
  //     if (!user || (user.role !== "tutor" && user.role !== "both")) {
  //       router("/")
  //     }
  //   }, [user, router])

  // if (!user || (user.role !== "tutor" && user.role !== "both")) {
  //   return null
  // }


  useEffect(() => {
    const fetchBookings = async () => {
      try {
        const res = await axios.get("http://localhost:5000/api/book/tutor", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const bookings = res.data

        divideBookings(bookings)
        setSessions(res.data);
        console.log("Bookings:", res.data);
      } catch (error) {
        console.error("Error fetching bookings:", error);
      }
    };

    if (token) {
      fetchBookings();
    }
  }, [token]);


  const divideBookings=(bookings)=>{
    const upcoming = []
    const past =[]

    bookings.forEach((b)=>{
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

    if (b.status ==="pending" || b.status === "confirmed"){
      upcoming.push(formatted)

    }else{
      past.push(formatted)
    }
    })

    setUpcomingSessions(upcoming)
    setPastSessions(past)
  }
  // const upcomingSessions = [
  //   {
  //     id: "1",
  //     studentName: "Nour M.",
  //     subject: "Data Structures",
  //     date: "Jan 24, 2024",
  //     time: "2:00 PM - 3:00 PM",
  //     location: "Jafet Library",
  //     status: "confirmed",
  //     amount: 15.0,
  //   },
  //   {
  //     id: "2",
  //     studentName: "Ali K.",
  //     subject: "Algorithms",
  //     date: "Jan 25, 2024",
  //     time: "4:00 PM - 5:30 PM",
  //     location: "Online",
  //     status: "confirmed",
  //     amount: 22.5,
  //   },
  //   {
  //     id: "3",
  //     studentName: "Layla H.",
  //     subject: "Programming",
  //     date: "Jan 26, 2024",
  //     time: "10:00 AM - 11:00 AM",
  //     location: "Nicely Hall",
  //     status: "pending",
  //     amount: 15.0,
  //   },
  // ];

  // const pastSessions = [
  //   {
  //     id: "4",
  //     studentName: "Omar S.",
  //     subject: "Data Structures",
  //     date: "Jan 20, 2024",
  //     time: "3:00 PM - 4:00 PM",
  //     location: "Jafet Library",
  //     status: "completed",
  //     amount: 15.0,
  //   },
  //   {
  //     id: "5",
  //     studentName: "Maya K.",
  //     subject: "Algorithms",
  //     date: "Jan 18, 2024",
  //     time: "1:00 PM - 2:30 PM",
  //     location: "Online",
  //     status: "completed",
  //     amount: 22.5,
  //   },
  // ];

  const SessionCard = ({ session }: { session: any }) => (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-semibold text-lg mb-1">{session.subject}</h3>
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <User className="h-3 w-3" />
              {session.studentName}
            </p>
          </div>
          <Badge
            variant={
              session.status === "confirmed"
                ? "default"
                : session.status === "pending"
                  ? "secondary"
                  : "outline"
            }
            className="capitalize"
          >
            {session.status}
          </Badge>
        </div>

        <div className="space-y-2 mb-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>{session.date}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>{session.time}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4" />
            <span>{session.location}</span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t">
          <div className="font-semibold">${session.amount.toFixed(2)}</div>
          <div className="flex gap-2">
            {session.status === "pending" && (
              <>
                <Button size="sm" variant="outline">
                  Decline
                </Button>
                <Button size="sm">Accept</Button>
              </>
            )}
            {session.status === "confirmed" && (
              <Button size="sm" variant="outline">
                View Details
              </Button>
            )}
            {session.status === "completed" && (
              <Button size="sm" variant="outline">
                View Details
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        <Button
          variant="ghost"
          onClick={() => router("/tutor/dashboard")}
          className="mb-6"
        >
          ← Back to Dashboard
        </Button>

        <h1 className="text-3xl font-bold mb-8">My Sessions</h1>

        <Tabs defaultValue="upcoming" className="space-y-6">
          <TabsList>
            <TabsTrigger value="upcoming">
              Upcoming ({upcomingSessions.length})
            </TabsTrigger>
            <TabsTrigger value="past">Past ({pastSessions.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming" className="space-y-4">
            {upcomingSessions.map((session) => (
              <SessionCard key={session.id} session={session} />
            ))}
          </TabsContent>

          <TabsContent value="past" className="space-y-4">
            {pastSessions.map((session) => (
              <SessionCard key={session.id} session={session} />
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
