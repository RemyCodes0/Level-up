"use client"

import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/lib/auth-context"
import { Navbar } from "@/components/navbar/Navbar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { motion } from "framer-motion"
import {
  User,
  Mail,
  Shield,
  Camera,
  Save,
  CheckCircle2,
  Sparkles,
  BookOpen,
  Calendar,
  Award,
  LogOut
} from "lucide-react"

export default function ProfilePage() {
  const { loading } = useAuth()
  const router = useNavigate()
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)

  const stored = localStorage.getItem("user")
  const user = stored ? JSON.parse(stored) : null

  useEffect(() => {
    if (!loading && !user) router("/login")
    if (user) {
      setFullName(user.name || user.fullName)
      setEmail(user.email)
    }
  }, [loading, user, router])

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading your profile...</p>
        </div>
      </div>
    )

  if (!user) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    setSaving(true)

    setTimeout(() => {
      // Update localStorage with new values
      const updatedUser = { ...user, name: fullName, email }
      localStorage.setItem("user", JSON.stringify(updatedUser))
      
      setSaving(false)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    }, 1000)
  }

  const handleLogout = () => {
    localStorage.removeItem("user")
    localStorage.removeItem("token")
    router("/login")
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <Navbar />

      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Header Section */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-10"
        >
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-5 w-5 text-primary" />
            <Badge variant="secondary" className="text-xs">Account Settings</Badge>
          </div>
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            Profile Settings
          </h1>
          <p className="text-lg text-muted-foreground">
            Manage your account information and preferences
          </p>
        </motion.div>

        {/* Success Alert */}
        {success && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mb-6"
          >
            <Alert className="bg-gradient-to-r from-green-50 to-emerald-50 border-green-200 shadow-lg">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <AlertDescription className="text-green-800 font-medium">
                Profile updated successfully!
              </AlertDescription>
            </Alert>
          </motion.div>
        )}

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid lg:grid-cols-3 gap-6"
        >
          {/* Left Column - Profile Card */}
          <motion.div variants={itemVariants} className="lg:col-span-1">
            <Card className="border-none shadow-lg hover:shadow-xl transition-shadow duration-300">
              <CardContent className="pt-8 pb-6">
                <div className="flex flex-col items-center text-center">
                  {/* Avatar with Upload Overlay */}
                  <div className="relative group mb-6">
                    <Avatar className="h-32 w-32 ring-4 ring-primary/20 shadow-xl">
                      <AvatarImage 
                        src={user.avatarUrl || "/placeholder.svg"} 
                        alt={user.name || user.fullName} 
                      />
                      <AvatarFallback className="text-3xl bg-gradient-to-br from-primary to-primary/80 text-white">
                        {(user.name || user.fullName)?.charAt(0)?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="absolute inset-0 bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                      <Camera className="h-8 w-8 text-white" />
                    </div>
                  </div>

                  {/* User Info */}
                  <h2 className="text-2xl font-bold mb-1">{user.name || user.fullName}</h2>
                  <p className="text-sm text-muted-foreground mb-4">{user.email}</p>
                  
                  {/* Role Badge */}
                  <Badge 
                    className="mb-6 px-4 py-1.5 bg-gradient-to-r from-blue-500 to-purple-500 text-white border-none"
                  >
                    <Shield className="h-3 w-3 mr-1" />
                    {user.role?.charAt(0).toUpperCase() + user.role?.slice(1) || 'Learner'}
                  </Badge>

                  <Separator className="my-6" />

                  {/* Quick Stats */}
                  <div className="w-full space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                          <BookOpen className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        </div>
                        <span className="text-sm font-medium">Total Sessions</span>
                      </div>
                      <span className="text-lg font-bold text-blue-600 dark:text-blue-400">12</span>
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-lg bg-purple-50 dark:bg-purple-950/30">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                          <Calendar className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                        </div>
                        <span className="text-sm font-medium">This Month</span>
                      </div>
                      <span className="text-lg font-bold text-purple-600 dark:text-purple-400">3</span>
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
                          <Award className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                        </div>
                        <span className="text-sm font-medium">Achievements</span>
                      </div>
                      <span className="text-lg font-bold text-amber-600 dark:text-amber-400">5</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Right Column - Edit Form */}
          <motion.div variants={itemVariants} className="lg:col-span-2">
            <Card className="border-none shadow-lg hover:shadow-xl transition-shadow duration-300">
              <CardHeader>
                <CardTitle className="text-2xl flex items-center gap-2">
                  <User className="h-6 w-6 text-primary" />
                  Personal Information
                </CardTitle>
                <CardDescription>
                  Update your account details and personal information
                </CardDescription>
              </CardHeader>

              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Full Name Input */}
                  <div className="space-y-2">
                    <Label htmlFor="fullName" className="text-sm font-semibold flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      Full Name
                    </Label>
                    <div className="relative">
                      <Input
                        id="fullName"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Enter your full name"
                        className="h-12 pl-4 border-2 focus:border-primary transition-colors"
                      />
                    </div>
                  </div>

                  {/* Email Input */}
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-semibold flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      Email Address
                    </Label>
                    <div className="relative">
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="your-email@mail.aub.edu"
                        className="h-12 pl-4 border-2 focus:border-primary transition-colors"
                      />
                    </div>
                  </div>

                  {/* Account Type (Read-only) */}
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold flex items-center gap-2">
                      <Shield className="h-4 w-4 text-muted-foreground" />
                      Account Type
                    </Label>
                    <div className="h-12 px-4 border-2 border-muted rounded-lg flex items-center bg-muted/30">
                      <span className="capitalize font-medium text-muted-foreground">
                        {user.role || 'Learner'}
                      </span>
                    </div>
                  </div>

                  <Separator className="my-6" />

                  {/* Action Buttons */}
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button
                      type="submit"
                      disabled={saving}
                      className="flex-1 h-12 text-base font-semibold bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg hover:shadow-xl transition-all"
                    >
                      {saving ? (
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>Saving Changes...</span>
                        </div>
                      ) : (
                        <>
                          <Save className="mr-2 h-5 w-5" />
                          Save Changes
                        </>
                      )}
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleLogout}
                      className="h-12 border-2 hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-colors"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Log Out
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            {/* Additional Settings Card */}
            <motion.div variants={itemVariants}>
              <Card className="mt-6 border-none shadow-lg">
                <CardHeader>
                  <CardTitle className="text-lg">Account Actions</CardTitle>
                  <CardDescription>Manage your account settings</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button 
                    variant="outline" 
                    className="w-full justify-start h-11 hover:bg-blue-50 hover:border-blue-300 transition-colors"
                  >
                    <Mail className="mr-2 h-4 w-4" />
                    Change Password
                  </Button>
                  <Button 
                    variant="outline" 
                    className="w-full justify-start h-11 hover:bg-amber-50 hover:border-amber-300 transition-colors"
                  >
                    <Shield className="mr-2 h-4 w-4" />
                    Privacy Settings
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  )
}