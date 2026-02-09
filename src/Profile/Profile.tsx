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
import { motion } from "framer-motion"

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
      setFullName(user.fullName)
      setEmail(user.email)
    }
  }, [loading, user, router])

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center text-lg font-semibold animate-pulse">
        Loading profile...
      </div>
    )

  if (!user) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    setSaving(true)

    setTimeout(() => {
      setSaving(false)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    }, 1000)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <Navbar />

      <div className="container mx-auto px-4 py-10 max-w-2xl">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <h1 className="text-4xl font-extrabold tracking-tight mb-2">Profile Settings</h1>
          <p className="text-muted-foreground text-lg">Manage and update your personal information.</p>
        </motion.div>

        {success && (
          <Alert className="mb-6 bg-green-50 border-green-200">
            <AlertDescription className="text-green-800">Profile updated successfully!</AlertDescription>
          </Alert>
        )}

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Card className="rounded-2xl backdrop-blur bg-card/40 shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl font-bold">Personal Information</CardTitle>
              <CardDescription>Update your account details</CardDescription>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="flex items-center gap-6">
                  <Avatar className="h-20 w-20 shadow">
                    <AvatarImage src={user.avatarUrl || "/placeholder.svg"} alt={user.fullName} />
                    <AvatarFallback>{user.fullName?.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <Button type="button" variant="secondary" className="rounded-xl">
                    Change Photo
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your full name"
                    className="rounded-xl"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="rounded-xl"
                  />
                </div>

                <div className="space-y-2 text-sm">
                  <Label>Account Type</Label>
                  <div className="text-muted-foreground capitalize">
                    {user.role}
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={saving}
                  className="w-full rounded-xl text-md py-6 font-semibold"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}