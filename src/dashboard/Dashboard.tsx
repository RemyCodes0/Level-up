"use client"

import { useEffect } from "react"
import { useNavigate} from "react-router-dom"
import { useAuth } from "@/lib/auth-context"
import { Navbar } from "@/components/navbar/Navbar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { BookOpen, Calendar, Star, TrendingUp, ArrowRight, Award, Clock, Target } from "lucide-react"

export default function DashboardPage() {
  const { loading } = useAuth()
  const router = useNavigate()

  const storedUser = localStorage.getItem("user")
  const user = storedUser ? JSON.parse(storedUser): null

  useEffect(() => {
    if (!loading && !user) {
      router("/login")
    }
  }, [user, loading, router])

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-lg">Loading...</div>
      </div>
    )
  }

  if (!user) {
    return null
  }
 
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <Navbar />
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header Section */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-white font-bold text-xl">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                Welcome back, {user.name}!
              </h1>
              <p className="text-muted-foreground mt-1">Ready to continue your learning journey?</p>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          <Card className="border-none shadow-lg hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-blue-500/10 to-blue-600/5 hover:scale-[1.02]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-blue-700 dark:text-blue-400">Upcoming Sessions</CardTitle>
              <div className="h-10 w-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-900 dark:text-blue-100">3</div>
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Next session in 2 days
              </p>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-green-500/10 to-green-600/5 hover:scale-[1.02]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-green-700 dark:text-green-400">Total Sessions</CardTitle>
              <div className="h-10 w-10 rounded-full bg-green-500/20 flex items-center justify-center">
                <BookOpen className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-900 dark:text-green-100">12</div>
              <p className="text-xs text-green-600 dark:text-green-400 mt-1 font-medium">+2 from last month</p>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-amber-500/10 to-amber-600/5 hover:scale-[1.02]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-amber-700 dark:text-amber-400">Favorite Tutors</CardTitle>
              <div className="h-10 w-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                <Star className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-amber-900 dark:text-amber-100">5</div>
              <p className="text-xs text-muted-foreground mt-1">Across 3 subjects</p>
            </CardContent>
          </Card>

          <Card className="border-none shadow-lg hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-purple-500/10 to-purple-600/5 hover:scale-[1.02]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-purple-700 dark:text-purple-400">Learning Progress</CardTitle>
              <div className="h-10 w-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-purple-900 dark:text-purple-100">85%</div>
              <p className="text-xs text-purple-600 dark:text-purple-400 mt-1 font-medium">Great improvement! 🎉</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Grid */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Quick Actions Card */}
          <Card className="border-none shadow-lg hover:shadow-xl transition-shadow duration-300">
            <CardHeader>
              <CardTitle className="text-xl">Quick Actions</CardTitle>
              <CardDescription>What would you like to do today?</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <a href="/tutors" className="block">
                <Button className="w-full justify-between h-auto py-4 px-5 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 transition-all group" size="lg">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-white/20 flex items-center justify-center">
                      <BookOpen className="h-5 w-5" />
                    </div>
                    <div className="text-left">
                      <div className="font-semibold">Find a Tutor</div>
                      <div className="text-xs opacity-90">Browse available experts</div>
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </a>
              
              <a href="/bookings" className="block">
                <Button className="w-full justify-between h-auto py-4 px-5 group" variant="outline" size="lg">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Calendar className="h-5 w-5 text-primary" />
                    </div>
                    <div className="text-left">
                      <div className="font-semibold">View My Bookings</div>
                      <div className="text-xs text-muted-foreground">Manage your sessions</div>
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                </Button>
              </a>

              <a href="/profile" className="block">
                <Button className="w-full justify-between h-auto py-4 px-5 group" variant="outline" size="lg">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                      <Star className="h-5 w-5 text-amber-600" />
                    </div>
                    <div className="text-left">
                      <div className="font-semibold">Update Profile</div>
                      <div className="text-xs text-muted-foreground">Personalize your account</div>
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                </Button>
              </a>
            </CardContent>
          </Card>

          {/* Learning Achievements Card */}
          <Card className="border-none shadow-lg hover:shadow-xl transition-shadow duration-300">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <Award className="h-5 w-5 text-amber-500" />
                Learning Achievements
              </CardTitle>
              <CardDescription>Your recent milestones and progress</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Achievement 1 */}
                <div className="flex items-start gap-4 p-4 rounded-xl bg-gradient-to-r from-green-500/10 to-green-500/5 border border-green-500/20">
                  <div className="h-12 w-12 rounded-full bg-green-500 flex items-center justify-center text-white flex-shrink-0">
                    <Award className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm mb-1">10 Sessions Milestone</p>
                    <p className="text-xs text-muted-foreground">Completed 10 tutoring sessions</p>
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1 font-medium">Unlocked 3 days ago</p>
                  </div>
                </div>

                {/* Achievement 2 */}
                <div className="flex items-start gap-4 p-4 rounded-xl bg-gradient-to-r from-blue-500/10 to-blue-500/5 border border-blue-500/20">
                  <div className="h-12 w-12 rounded-full bg-blue-500 flex items-center justify-center text-white flex-shrink-0">
                    <Target className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm mb-1">Consistency Champion</p>
                    <p className="text-xs text-muted-foreground">Booked sessions 2 weeks in a row</p>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 font-medium">Unlocked 1 week ago</p>
                  </div>
                </div>

                {/* Next Goal */}
                <div className="flex items-start gap-4 p-4 rounded-xl bg-gradient-to-r from-purple-500/10 to-purple-500/5 border border-purple-500/20 border-dashed">
                  <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <Star className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm mb-1">Subject Master</p>
                    <p className="text-xs text-muted-foreground">Complete 5 sessions in one subject</p>
                    <div className="mt-2">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">Progress</span>
                        <span className="font-medium">3/5</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-purple-500 to-purple-600 rounded-full" style={{ width: '60%' }}></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}