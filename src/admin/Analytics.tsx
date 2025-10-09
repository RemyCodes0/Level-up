"use client"

import { useAuth } from "@/lib/auth-context"
import { useNavigate } from "react-router-dom"
import { useEffect } from "react"
import { Navbar } from "@/components/navbar/Navbar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { BookOpen, DollarSign, TrendingUp, Star } from "lucide-react"

export default function AdminAnalyticsPage() {
  const { user } = useAuth()
  const router = useNavigate()

//   useEffect(() => {
//     if (!user || user.role !== "admin") {
//       router("/")
//     }
//   }, [user, router])

//   if (!user || user.role !== "admin") {
//     return null
//   }

  const monthlyData = [
    { month: "Aug", sessions: 85, revenue: 1240, users: 28 },
    { month: "Sep", sessions: 102, revenue: 1580, users: 35 },
    { month: "Oct", sessions: 118, revenue: 1820, users: 42 },
    { month: "Nov", sessions: 134, revenue: 2150, users: 48 },
    { month: "Dec", sessions: 156, revenue: 2480, users: 56 },
    { month: "Jan", sessions: 178, revenue: 2890, users: 64 },
  ]

  const topTutors = [
    { name: "Sarah Hassan", sessions: 45, rating: 4.8, earnings: 675 },
    { name: "Karim Nader", sessions: 62, rating: 4.9, earnings: 744 },
    { name: "Maya El-Khoury", sessions: 51, rating: 5.0, earnings: 561 },
    { name: "Lina Khoury", sessions: 38, rating: 4.7, earnings: 494 },
  ]

  const popularSubjects = [
    { subject: "Mathematics", sessions: 245, percentage: 28 },
    { subject: "Computer Science", sessions: 198, percentage: 23 },
    { subject: "Biology", sessions: 156, percentage: 18 },
    { subject: "English", sessions: 134, percentage: 15 },
    { subject: "Physics", sessions: 112, percentage: 13 },
  ]

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        <Button variant="ghost" onClick={() => router("/admin/dashboard")} className="mb-6">
          ← Back to Dashboard
        </Button>

        <h1 className="text-3xl font-bold mb-8">Platform Analytics</h1>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Growth Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">+24%</div>
              <p className="text-xs text-muted-foreground mt-1">vs last month</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Avg Session Rate</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">$13.50</div>
              <p className="text-xs text-muted-foreground mt-1">per hour</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Avg Rating</CardTitle>
              <Star className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">4.8</div>
              <p className="text-xs text-muted-foreground mt-1">out of 5.0</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">94%</div>
              <p className="text-xs text-muted-foreground mt-1">sessions completed</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Monthly Growth</CardTitle>
              <CardDescription>Sessions, revenue, and user growth over time</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {monthlyData.map((data) => (
                  <div key={data.month} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{data.month}</span>
                      <div className="flex gap-4 text-muted-foreground">
                        <span>{data.sessions} sessions</span>
                        <span>${data.revenue}</span>
                        <span>{data.users} users</span>
                      </div>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${(data.sessions / 200) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top Performing Tutors</CardTitle>
              <CardDescription>Tutors with the most sessions and highest ratings</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {topTutors.map((tutor, idx) => (
                  <div key={tutor.name} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-semibold">
                        {idx + 1}
                      </div>
                      <div>
                        <div className="font-medium">{tutor.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {tutor.sessions} sessions • {tutor.rating} ⭐
                        </div>
                      </div>
                    </div>
                    <div className="font-semibold">${tutor.earnings}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Popular Subjects</CardTitle>
            <CardDescription>Most requested subjects on the platform</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {popularSubjects.map((item) => (
                <div key={item.subject} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{item.subject}</span>
                    <span className="text-muted-foreground">
                      {item.sessions} sessions ({item.percentage}%)
                    </span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${item.percentage * 3}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
