"use client"

import { useAuth } from "@/lib/auth-context"
import { data, useNavigate } from "react-router-dom"
import { useEffect, useState } from "react"
import { Navbar } from "@/components/navbar/Navbar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Users, BookOpen, DollarSign, TrendingUp, UserCheck, Clock } from "lucide-react"
import axios from "axios"

export default function AdminDashboardPage() {
  // const { user } = useAuth()
  // const router = useNavigate()

  const storedUser = localStorage.getItem("user")
  const [user, setUser] = useState(null)
  const [application, setApplications] = useState([])

  useEffect(()=>{
    if(storedUser){
      setUser(JSON.parse(storedUser))
    }
  },[])

  useEffect(()=>{
    const fetchApplications= async()=>{
        const res = await axios.get("http://localhost:5000/api/tutor/applications")
        const data = res.data
        setApplications(data)
    }
    fetchApplications()
  }, [])
  let number = 0
  const numbersOfApplications = application.filter((app)=> app)
  



//   useEffect(() => {
//     if (!user || user.role !== "admin") {
//       router("/")
//     }
//   }, [user, router])

//   if (!user || user.role !== "admin") {
//     return null
//   }

  const stats = {
    totalUsers: 342,
    activeTutors: 28,
    totalSessions: 1247,
    pendingApplications: number,
    totalRevenue: 18675.5,
    thisMonthRevenue: 3245.0,
  }

  const recentActivity = [
    { id: "1", type: "application", message: "New tutor application from Ahmad Khalil", time: "2 hours ago" },
    { id: "2", type: "session", message: "Session completed: Sarah Hassan - Nour M.", time: "3 hours ago" },
    { id: "3", type: "user", message: "New user registration: Layla Ibrahim", time: "5 hours ago" },
    { id: "4", type: "application", message: "New tutor application from Nour Mansour", time: "1 day ago" },
  ]

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Admin Dashboard</h1>
          <p className="text-muted-foreground">Platform overview and management</p>
        </div>

        {/* Stats Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalUsers}</div>
              <p className="text-xs text-muted-foreground mt-1">{stats.activeTutors} active tutors</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Sessions</CardTitle>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalSessions}</div>
              <p className="text-xs text-muted-foreground mt-1">All-time completed sessions</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Platform Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${stats.totalRevenue.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground mt-1">+${stats.thisMonthRevenue.toFixed(2)} this month</p>
            </CardContent>
          </Card>
        </div>

        {/* Pending Applications Alert */}
        {stats.pendingApplications > 0 && (
          <Card className="mb-8 border-orange-500">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Clock className="h-8 w-8 text-orange-500" />
                  <div>
                    <h3 className="font-semibold">Pending Tutor Applications</h3>
                    <p className="text-sm text-muted-foreground">
                      {stats.pendingApplications} applications waiting for review
                    </p>
                  </div>
                </div>
                <a href="/admin/applications">
                  <Button>Review Applications</Button>
                </a>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Content */}
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Latest platform events</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {recentActivity.map((activity) => (
                    <div key={activity.id} className="flex items-start gap-4 p-3 border rounded-lg">
                      <div className="flex-1">
                        <p className="text-sm">{activity.message}</p>
                        <p className="text-xs text-muted-foreground mt-1">{activity.time}</p>
                      </div>
                      <Badge variant="outline" className="capitalize">
                        {activity.type}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <a href="/admin/applications">
                  <Button variant="outline" className="w-full justify-start bg-transparent">
                    <UserCheck className="mr-2 h-4 w-4" />
                    Review Applications
                  </Button>
                </a>
                <a href="/admin/users">
                  <Button variant="outline" className="w-full justify-start bg-transparent">
                    <Users className="mr-2 h-4 w-4" />
                    Manage Users
                  </Button>
                </a>
                <a href="/admin/sessions">
                  <Button variant="outline" className="w-full justify-start bg-transparent">
                    <BookOpen className="mr-2 h-4 w-4" />
                    View All Sessions
                  </Button>
                </a>
                <a href="/admin/analytics">
                  <Button variant="outline" className="w-full justify-start bg-transparent">
                    <TrendingUp className="mr-2 h-4 w-4" />
                    Analytics
                  </Button>
                </a>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
