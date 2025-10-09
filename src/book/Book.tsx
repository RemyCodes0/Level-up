"use client"

import type React from "react"
import { useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useAuth } from "@/lib/auth-context"
import { Navbar } from "@/components/navbar/Navbar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { MOCK_TUTORS } from "@/lib/mock-data"
import { Calendar, Clock, MapPin, DollarSign } from "lucide-react"



export default function BookSessionPage() {
  const { id } = useParams()
  const router = useNavigate()
  const { user } = useAuth()
  const tutor = MOCK_TUTORS.find((t) => t.id === id)

  const [subject, setSubject] = useState("")
  const [date, setDate] = useState("")
  const [time, setTime] = useState("")
  const [duration, setDuration] = useState("60")
  const [location, setLocation] = useState("")
  const [notes, setNotes] = useState("")
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  if (!tutor) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Tutor not found</h1>
            <Button onClick={() => router("/tutors")}>Back to Tutors</Button>
          </div>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!user) {
      router("/login")
      return
    }

    setLoading(true)

    // Simulate booking creation
    setTimeout(() => {
      setLoading(false)
      setSuccess(true)

      // Redirect to bookings page after 2 seconds
      setTimeout(() => {
        router("/bookings")
      }, 2000)
    }, 1000)
  }

  const totalAmount = (tutor.profile.hourlyRate * Number.parseInt(duration)) / 60

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        <Button variant="ghost" onClick={() => router(`/tutors/${id}`)} className="mb-6">
          ← Back to Profile
        </Button>

        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-2">Book a Session</h1>
          <p className="text-muted-foreground mb-8">Schedule your tutoring session with {tutor.fullName}</p>

          {success && (
            <Alert className="mb-6 bg-green-50 border-green-200">
              <AlertDescription className="text-green-800">
                Session booked successfully! Redirecting to your bookings...
              </AlertDescription>
            </Alert>
          )}

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Booking Form */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>Session Details</CardTitle>
                  <CardDescription>Fill in the details for your tutoring session</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="subject">Subject *</Label>
                      <Select value={subject} onValueChange={setSubject} required>
                        <SelectTrigger id="subject">
                          <SelectValue placeholder="Select a subject" />
                        </SelectTrigger>
                        <SelectContent>
                          {tutor.profile.subjects.map((subj) => (
                            <SelectItem key={subj} value={subj}>
                              {subj}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="date">Date *</Label>
                        <Input
                          id="date"
                          type="date"
                          value={date}
                          onChange={(e) => setDate(e.target.value)}
                          min={new Date().toISOString().split("T")[0]}
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="time">Time *</Label>
                        <Input id="time" type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="duration">Duration *</Label>
                      <Select value={duration} onValueChange={setDuration} required>
                        <SelectTrigger id="duration">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="30">30 minutes</SelectItem>
                          <SelectItem value="60">1 hour</SelectItem>
                          <SelectItem value="90">1.5 hours</SelectItem>
                          <SelectItem value="120">2 hours</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="location">Location *</Label>
                      <Select value={location} onValueChange={setLocation} required>
                        <SelectTrigger id="location">
                          <SelectValue placeholder="Select location" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="jafet">Jafet Library</SelectItem>
                          <SelectItem value="nicely">Nicely Hall</SelectItem>
                          <SelectItem value="west-hall">West Hall</SelectItem>
                          <SelectItem value="bliss">Bliss Hall</SelectItem>
                          <SelectItem value="online">Online (Zoom/Teams)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="notes">Notes (Optional)</Label>
                      <Textarea
                        id="notes"
                        placeholder="Any specific topics or questions you'd like to cover?"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={4}
                      />
                    </div>

                    <Button type="submit" className="w-full" size="lg" disabled={loading || success}>
                      {loading ? "Booking..." : success ? "Booked!" : "Confirm Booking"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>

            {/* Booking Summary */}
            <div className="lg:col-span-1">
              <div className="sticky top-20">
                <Card>
                  <CardHeader>
                    <CardTitle>Booking Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={tutor.avatarUrl || "/placeholder.svg"} alt={tutor.fullName} />
                        <AvatarFallback>{tutor.fullName.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-semibold">{tutor.fullName}</p>
                        <p className="text-sm text-muted-foreground">{subject || "No subject selected"}</p>
                      </div>
                    </div>

                    <div className="space-y-3 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span>{date ? new Date(date).toLocaleDateString() : "No date selected"}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        <span>
                          {time || "No time selected"} ({duration} minutes)
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <MapPin className="h-4 w-4" />
                        <span>{location || "No location selected"}</span>
                      </div>
                    </div>

                    <div className="border-t pt-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-muted-foreground">Hourly Rate</span>
                        <span className="text-sm">${tutor.profile.hourlyRate.toFixed(2)}/hour</span>
                      </div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-muted-foreground">Duration</span>
                        <span className="text-sm">{duration} minutes</span>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t">
                        <span className="font-semibold">Total</span>
                        <span className="text-xl font-bold text-primary">${totalAmount.toFixed(2)}</span>
                      </div>
                    </div>

                    <Alert>
                      <DollarSign className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        Payment will be arranged directly with the tutor after the session is confirmed.
                      </AlertDescription>
                    </Alert>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
