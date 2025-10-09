"use client"

import { useAuth } from "@/lib/auth-context"
import { useNavigate } from "react-router-dom"
import { useEffect } from "react"
import { Navbar } from "@/components/navbar/Navbar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DollarSign, Calendar, Star, TrendingUp, Users } from "lucide-react"

export default function TutorDashboardPage() {
//   const { user } = useAuth()
  const router = useNavigate()

//   useEffect(() => {
//     if (!user || (user.role !== "tutor" && user.role !== "both")) {
//       router("/")
//     }
//   }, [user, router])

//   if (!user || (user.role !== "tutor" && user.role !== "both")) {
//     return null
//   }

  const stats = {
    totalEarnings: 1245.5,
    thisMonthEarnings: 385.0,
    totalSessions: 45,
    upcomingSessions: 8,
    averageRating: 4.8,
    totalReviews: 32,
  }

  const upcomingSessions = [
    {
      id: "1",
      studentName: "Nour M.",
      subject: "Data Structures",
      date: "Tomorrow, 2:00 PM",
      duration: 60,
      location: "Jafet Library",
    },
    {
      id: "2",
      studentName: "Ali K.",
      subject: "Algorithms",
      date: "Jan 25, 4:00 PM",
      duration: 90,
      location: "Online",
    },
    {
      id: "3",
      studentName: "Layla H.",
      subject: "Programming",
      date: "Jan 26, 10:00 AM",
      duration: 60,
      location: "Nicely Hall",
    },
  ]

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        {/* <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Tutor Dashboard</h1>
          <p className="text-muted-foreground">Welcome back, {user.fullName}!</p>
        </div> */}

        {/* Stats Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Earnings</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${stats.totalEarnings.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground mt-1">+${stats.thisMonthEarnings.toFixed(2)} this month</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Sessions</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalSessions}</div>
              <p className="text-xs text-muted-foreground mt-1">{stats.upcomingSessions} upcoming</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Average Rating</CardTitle>
              <Star className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.averageRating.toFixed(1)}</div>
              <p className="text-xs text-muted-foreground mt-1">From {stats.totalReviews} reviews</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Upcoming Sessions</CardTitle>
                <CardDescription>Your scheduled tutoring sessions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {upcomingSessions.map((session) => (
                    <div key={session.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="space-y-1">
                        <div className="font-medium">{session.studentName}</div>
                        <div className="text-sm text-muted-foreground">{session.subject}</div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {session.date}
                          </span>
                          <span>{session.duration} min</span>
                          <span>{session.location}</span>
                        </div>
                      </div>
                      <Button variant="outline" size="sm">
                        View Details
                      </Button>
                    </div>
                  ))}
                </div>
                <a href="/tutor/sessions">
                  <Button variant="link" className="mt-4">
                    View All Sessions →
                  </Button>
                </a>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <a href="/tutor/profile">
                  <Button variant="outline" className="w-full justify-start bg-transparent">
                    <Users className="mr-2 h-4 w-4" />
                    Edit Profile
                  </Button>
                </a>
                <a href="/tutor/availability">
                  <Button variant="outline" className="w-full justify-start bg-transparent">
                    <Calendar className="mr-2 h-4 w-4" />
                    Manage Availability
                  </Button>
                </a>
                <a href="/tutor/earnings">
                  <Button variant="outline" className="w-full justify-start bg-transparent">
                    <TrendingUp className="mr-2 h-4 w-4" />
                    View Earnings
                  </Button>
                </a>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Profile Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Profile Completion</span>
                  <Badge variant="secondary">95%</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Verification Status</span>
                  <Badge className="bg-green-500">Verified</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Response Rate</span>
                  <Badge variant="secondary">98%</Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
