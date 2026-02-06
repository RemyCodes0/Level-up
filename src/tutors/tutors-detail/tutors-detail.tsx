"use client"

import { useNavigate, useParams } from "react-router-dom"
import { useEffect, useState } from "react"
import axios from "axios"

import { Navbar } from "@/components/navbar/Navbar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { StarRating } from "@/components/star-rating"
import { Star, CheckCircle2, DollarSign, BookOpen, Calendar, Clock, MapPin, Award } from "lucide-react"

export default function TutorProfilePage() {
  const { id } = useParams<{ id: string }>()
  const router = useNavigate()

  const [tutor, setTutor] = useState<any>(null)
  const [reviews, setReviews] = useState<any[]>([])
  const [newComment, setNewComment] = useState("")
  const [newRating, setNewRating] = useState(5)

  // Fetch tutor info
  useEffect(() => {
    const fetchTutor = async () => {
      try {
        const res = await axios.get(`http://localhost:5000/api/tutor/${id}/getTutor`)
        setTutor(res.data.tutor)
      } catch (err) {
        console.error(err)
      }
    }
    fetchTutor()
  }, [id])

  // Fetch reviews
  useEffect(() => {
    const fetchReviews = async () => {
      try {
        const res = await axios.get(`http://localhost:5000/api/reviews/${id}`)
        setReviews(res.data)
      } catch (err) {
        console.error(err)
      }
    }
    fetchReviews()
  }, [id])

  // Submit a new review
  const submitReview = async () => {
    try {
      const token = localStorage.getItem("token") // your auth token
      const res = await axios.post(
        `http://localhost:5000/api/reviews/${id}`,
        { rating: newRating, comment: newComment },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setReviews([res.data, ...reviews])
      setNewComment("")
      setNewRating(5)
    } catch (err: any) {
      console.error(err)
      alert(err.response?.data?.message || "Failed to submit review")
    }
  }

  if (!tutor) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto px-4 py-8 text-center">
          <h1 className="text-2xl font-bold mb-4">Tutor not found</h1>
          <Button onClick={() => router("/tutors")}>Back to Tutors</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        <Button variant="ghost" onClick={() => router("/tutors")} className="mb-6">
          ← Back to Tutors
        </Button>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Profile */}
          <div className="lg:col-span-2 space-y-6">
            {/* Header Card */}
            <Card>
              <CardContent className="p-6">
                <div className="flex flex-col md:flex-row items-start gap-6 mb-6">
                  <Avatar className="h-32 w-32">
                    <AvatarFallback className="text-2xl">{tutor.user.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h1 className="text-3xl font-bold">{tutor.user.name}</h1>
                      {tutor.status === "approved" && (
                        <CheckCircle2 className="h-6 w-6 text-primary" title="Verified Tutor" />
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-muted-foreground mb-4">
                      <div className="flex items-center gap-1">
                        <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                        <span className="text-sm">({reviews.length} reviews)</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-2xl font-bold text-primary mb-4">
                      <DollarSign className="h-6 w-6" />
                      <span>{tutor.hourlyRate.toFixed(2)}/hour</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {tutor.subjects.map((subject: any) => (
                        <Badge key={subject.name} variant="secondary" className="text-sm px-3 py-1">
                          {subject.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>

                <Separator className="my-6" />

                {/* About Section */}
                <div>
                  <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
                    <Award className="h-5 w-5 text-primary" />
                    About Me
                  </h2>
                  <p className="text-muted-foreground leading-relaxed">{tutor.bio}</p>
                </div>
              </CardContent>
            </Card>

            {/* Teaching Approach */}
            <Card>
              <CardHeader>
                <CardTitle>My Teaching Approach</CardTitle>
                <CardDescription>What you can expect from our sessions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-primary" />
                    Teaching Style
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    I focus on building strong fundamentals and helping students develop problem-solving skills.
                  </p>
                </div>
                <Separator />
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    What You'll Get
                  </h3>
                  <ul className="space-y-2">
                    <li className="flex items-start gap-2 text-muted-foreground">
                      <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <span>Personalized lesson plans based on your goals and learning style</span>
                    </li>
                    <li className="flex items-start gap-2 text-muted-foreground">
                      <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <span>Practice problems and homework help with detailed explanations</span>
                    </li>
                    <li className="flex items-start gap-2 text-muted-foreground">
                      <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <span>Exam preparation strategies and study materials</span>
                    </li>
                    <li className="flex items-start gap-2 text-muted-foreground">
                      <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <span>Flexible scheduling and location options (on-campus or online)</span>
                    </li>
                    <li className="flex items-start gap-2 text-muted-foreground">
                      <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <span>Follow-up resources and practice materials after each session</span>
                    </li>
                  </ul>
                </div>
                <Separator />
                <div>
                  <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    Session Locations
                  </h3>
                  <p className="text-muted-foreground">
                    On-campus (AUB) or online via Zoom.
                  </p>
                </div>
              </CardContent>
            </Card>
             {/* Availability */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" />
                  Weekly Availability
                </CardTitle>
                <CardDescription>Times when {tutor.user.name.split(" ")[0]} is available for sessions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {tutor.availability.map((day) => (
                    <div key={day.day} className="flex items-start gap-4 p-3 rounded-lg bg-muted/50">
                      <div className="w-28 font-medium text-foreground">{day.day}</div>
                      <div className="flex-1 flex flex-wrap gap-2">
                        
                          <Badge key={day.day} variant="outline" className="text-sm bg-background">
                            {day.from} - {day.to}
                          </Badge>
                       
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground mt-4">
                  Note: Availability may vary during exam periods. Please message me to confirm specific times.
                </p>
              </CardContent>
            </Card>


            {/* Reviews Section */}
            <Card>
              <CardHeader>
                <CardTitle>Student Reviews ({reviews.length})</CardTitle>
                <CardDescription>What students are saying about {tutor.user.name.split(" ")[0]}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Add Review Form */}
                <Card className="mb-6">
                  <CardContent className="space-y-2">
                    <textarea
                      placeholder="Write your review..."
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      className="w-full border p-2 rounded"
                    />
                    <select
                      value={newRating}
                      onChange={(e) => setNewRating(Number(e.target.value))}
                      className="w-full border p-2 rounded"
                    >
                      {[5, 4, 3, 2, 1].map((r) => (
                        <option key={r} value={r}>
                          {r} Star{r > 1 ? "s" : ""}
                        </option>
                      ))}
                    </select>
                    <Button onClick={submitReview} className="w-full mt-2">
                      Submit Review
                    </Button>
                  </CardContent>
                </Card>

                {/* Reviews List */}
                {reviews.map((review, index) => (
                  <div key={review._id}>
                    <div className="flex items-start gap-4">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback>{review.student.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-semibold">{review.student.name}</span>
                            <div className="flex items-center gap-2 mt-1">
                              <StarRating rating={review.rating} size="sm" />
                              <span className="text-sm text-muted-foreground">
                                {new Date(review.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        </div>
                        <p className="text-muted-foreground leading-relaxed">{review.comment}</p>
                      </div>
                    </div>
                    {index !== reviews.length - 1 && <Separator className="mt-6" />}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Booking Sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-20 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Book a Session</CardTitle>
                  <CardDescription>Get started with {tutor.user.name.split(" ")[0]}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3 p-4 rounded-lg bg-muted/50">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Hourly Rate</span>
                      <span className="font-semibold text-lg">${tutor.hourlyRate.toFixed(2)}</span>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Response Time</span>
                      <span className="font-semibold">Within 2 hours</span>
                    </div>
                  </div>

                  <a href={`/book/${id}`} className="block">
                    <Button className="w-full" size="lg">
                      <Calendar className="mr-2 h-4 w-4" />
                      Book Session Now
                    </Button>
                  </a>

                  <p className="text-xs text-muted-foreground text-center">
                    Have questions? Send a message before booking
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
