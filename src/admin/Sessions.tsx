"use client"

import { useAuth } from "@/lib/auth-context"
import { useNavigate } from "react-router-dom"
import { useEffect } from "react"
import { Navbar } from "@/components/navbar/Navbar"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Calendar, Clock, MapPin, Search } from "lucide-react"
import { useState } from "react"

export default function AdminSessionsPage() {
  const { user } = useAuth()
  const router = useNavigate()
  const [searchQuery, setSearchQuery] = useState("")

//   useEffect(() => {
//     if (!user || user.role !== "admin") {
//       router.push("/")
//     }
//   }, [user, router])

//   if (!user || user.role !== "admin") {
//     return null
//   }

  const allSessions = [
    {
      id: "1",
      tutor: "Sarah Hassan",
      student: "Nour M.",
      subject: "Data Structures",
      date: "Jan 24, 2024",
      time: "2:00 PM - 3:00 PM",
      location: "Jafet Library",
      status: "confirmed",
      amount: 15.0,
    },
    {
      id: "2",
      tutor: "Karim Nader",
      student: "Ali K.",
      subject: "Calculus",
      date: "Jan 25, 2024",
      time: "4:00 PM - 5:30 PM",
      location: "Online",
      status: "confirmed",
      amount: 18.0,
    },
    {
      id: "3",
      tutor: "Sarah Hassan",
      student: "Layla H.",
      subject: "Programming",
      date: "Jan 20, 2024",
      time: "10:00 AM - 11:00 AM",
      location: "Nicely Hall",
      status: "completed",
      amount: 15.0,
    },
    {
      id: "4",
      tutor: "Lina Khoury",
      student: "Omar S.",
      subject: "Biology",
      date: "Jan 26, 2024",
      time: "3:00 PM - 4:00 PM",
      location: "Science Building",
      status: "pending",
      amount: 13.0,
    },
  ]

  const filteredSessions = allSessions.filter(
    (session) =>
      session.tutor.toLowerCase().includes(searchQuery.toLowerCase()) ||
      session.student.toLowerCase().includes(searchQuery.toLowerCase()) ||
      session.subject.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const upcomingSessions = filteredSessions.filter((s) => s.status === "confirmed" || s.status === "pending")
  const completedSessions = filteredSessions.filter((s) => s.status === "completed")

  const SessionCard = ({ session }: { session: any }) => (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-semibold text-lg mb-1">{session.subject}</h3>
            <p className="text-sm text-muted-foreground">
              Tutor: {session.tutor} • Student: {session.student}
            </p>
          </div>
          <Badge
            variant={
              session.status === "confirmed" ? "default" : session.status === "pending" ? "secondary" : "outline"
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
          <Button size="sm" variant="outline">
            View Details
          </Button>
        </div>
      </CardContent>
    </Card>
  )

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        <Button variant="ghost" onClick={() => router("/admin/dashboard")} className="mb-6">
          ← Back to Dashboard
        </Button>

        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-4">All Sessions</h1>
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by tutor, student, or subject..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <Tabs defaultValue="upcoming" className="space-y-6">
          <TabsList>
            <TabsTrigger value="upcoming">Upcoming ({upcomingSessions.length})</TabsTrigger>
            <TabsTrigger value="completed">Completed ({completedSessions.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming" className="space-y-4">
            {upcomingSessions.map((session) => (
              <SessionCard key={session.id} session={session} />
            ))}
          </TabsContent>

          <TabsContent value="completed" className="space-y-4">
            {completedSessions.map((session) => (
              <SessionCard key={session.id} session={session} />
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
