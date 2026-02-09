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
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { 
  Star, 
  CheckCircle2, 
  DollarSign, 
  BookOpen, 
  Calendar, 
  Clock, 
  MapPin, 
  Award,
  ArrowLeft,
  MessageSquare,
  GraduationCap,
  TrendingUp,
  Users
} from "lucide-react"

export default function TutorProfilePage() {
  const { id } = useParams<{ id: string }>()
  const router = useNavigate()

  const [tutor, setTutor] = useState<any>(null)
  const [reviews, setReviews] = useState<any[]>([])
  const [newComment, setNewComment] = useState("")
  const [newRating, setNewRating] = useState(5)
  const [loading, setLoading] = useState(true)

  // Fetch tutor info
  useEffect(() => {
    const fetchTutor = async () => {
      try {
        const res = await axios.get(`http://localhost:5000/api/tutor/${id}/getTutor`)
        setTutor(res.data.tutor)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
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
    if (!newComment.trim()) {
      alert("Please write a review comment")
      return
    }

    try {
      const token = localStorage.getItem("token")
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

  const calculateAverageRating = () => {
    if (reviews.length === 0) return 0
    const sum = reviews.reduce((acc, review) => acc + review.rating, 0)
    return (sum / reviews.length).toFixed(1)
  }

  const getRatingDistribution = () => {
    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
    reviews.forEach(review => {
      distribution[review.rating as keyof typeof distribution]++
    })
    return distribution
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20">
        <Navbar />
        <div className="flex items-center justify-center py-20">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-muted-foreground">Loading tutor profile...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!tutor) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20">
        <Navbar />
        <div className="container mx-auto px-4 py-8 text-center">
          <Card className="max-w-md mx-auto border-0 shadow-lg">
            <CardContent className="pt-6">
              <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Users className="h-10 w-10 text-red-600" />
              </div>
              <h1 className="text-2xl font-bold mb-2">Tutor not found</h1>
              <p className="text-muted-foreground mb-6">The tutor you're looking for doesn't exist or has been removed.</p>
              <Button onClick={() => router("/tutors")}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Tutors
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const averageRating = calculateAverageRating()
  const ratingDistribution = getRatingDistribution()

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20">
      <Navbar />
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <Button 
          variant="ghost" 
          onClick={() => router("/tutors")} 
          className="mb-6 hover:bg-white/80 transition-colors"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Tutors
        </Button>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Profile */}
          <div className="lg:col-span-2 space-y-6">
            {/* Header Card */}
            <Card className="border-0 shadow-xl bg-white/80 backdrop-blur overflow-hidden">
              <div className="h-24 bg-gradient-to-r from-slate-100 via-blue-50 to-indigo-50"></div>
              <CardContent className="p-6 -mt-12">
                <div className="flex flex-col md:flex-row items-start gap-6 mb-6">
                  <Avatar className="h-28 w-28 border-4 border-white shadow-lg">
                    <AvatarFallback className="text-3xl bg-gradient-to-br from-slate-600 to-slate-700 text-white">
                      {tutor.user.name.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 mt-12 md:mt-0">
                    <div className="flex items-center gap-2 mb-2">
                      <h1 className="text-3xl font-bold text-slate-900">
                        {tutor.user.name}
                      </h1>
                      {tutor.status === "approved" && (
                        <div className="relative group">
                          <CheckCircle2 className="h-6 w-6 text-green-600" />
                          <span className="absolute left-1/2 -translate-x-1/2 top-full mt-2 px-2 py-1 bg-slate-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                            Verified Tutor
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Stats Row */}
                    <div className="flex flex-wrap items-center gap-6 mb-4">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
                          <span className="font-semibold text-lg">{averageRating}</span>
                        </div>
                        <span className="text-sm text-muted-foreground">({reviews.length} reviews)</span>
                      </div>
                      <Separator orientation="vertical" className="h-6" />
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <BookOpen className="h-4 w-4" />
                        <span className="text-sm">{tutor.subjects.length} subjects</span>
                      </div>
                    </div>

                    {/* Price */}
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-100 border border-slate-200 mb-4">
                      <DollarSign className="h-5 w-5 text-slate-600" />
                      <span className="text-2xl font-bold text-slate-900">{tutor.hourlyRate.toFixed(2)}</span>
                      <span className="text-slate-600">/hour</span>
                    </div>

                    {/* Subjects */}
                    <div className="flex flex-wrap gap-2">
                      {tutor.subjects.map((subject: any, index: number) => (
                        <Badge 
                          key={subject.name} 
                          variant="secondary" 
                          className="text-sm px-3 py-1.5 bg-gradient-to-r from-blue-100 to-indigo-100 border border-blue-200 hover:from-blue-200 hover:to-indigo-200 transition-colors"
                        >
                          {subject.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>

                <Separator className="my-6" />

                {/* About Section */}
                <div>
                  <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                    <GraduationCap className="h-6 w-6 text-primary" />
                    About Me
                  </h2>
                  <p className="text-muted-foreground leading-relaxed text-base">{tutor.bio}</p>
                </div>
              </CardContent>
            </Card>

            {/* Teaching Approach */}
            <Card className="border-0 shadow-lg bg-white/80 backdrop-blur">
              <CardHeader className="bg-gradient-to-r from-slate-50 to-blue-50">
                <CardTitle className="flex items-center gap-2">
                  <Award className="h-6 w-6 text-primary" />
                  My Teaching Approach
                </CardTitle>
                <CardDescription>What you can expect from our sessions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 pt-6">
                <div className="p-4 rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100">
                  <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-primary" />
                    Teaching Style
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    I focus on building strong fundamentals and helping students develop problem-solving skills 
                    through interactive sessions and real-world examples.
                  </p>
                </div>

                <div>
                  <h3 className="font-semibold mb-4 flex items-center gap-2 text-lg">
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                    What You'll Get
                  </h3>
                  <div className="grid md:grid-cols-2 gap-3">
                    {[
                      "Personalized lesson plans based on your goals",
                      "Practice problems with detailed explanations",
                      "Exam preparation strategies",
                      "Flexible scheduling options",
                      "Follow-up resources after sessions",
                      "On-campus or online sessions"
                    ].map((benefit, index) => (
                      <div key={index} className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors">
                        <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-slate-700">{benefit}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <Separator />

                <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200">
                  <MapPin className="h-5 w-5 text-amber-600 mt-0.5" />
                  <div>
                    <h3 className="font-semibold mb-1 text-amber-900">Session Locations</h3>
                    <p className="text-sm text-amber-700">
                      On-campus (AUB) or online via Zoom - your choice!
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Availability */}
            <Card className="border-0 shadow-lg bg-white/80 backdrop-blur">
              <CardHeader className="bg-gradient-to-r from-slate-50 to-blue-50">
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-6 w-6 text-primary" />
                  Weekly Availability
                </CardTitle>
                <CardDescription>
                  Times when {tutor.user.name.split(" ")[0]} is available for sessions
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="space-y-3">
                  {tutor.availability.map((day: any, index: number) => (
                    <div 
                      key={day.day} 
                      className="flex items-center gap-4 p-4 rounded-lg bg-gradient-to-r from-slate-50 to-blue-50 border border-slate-200 hover:border-primary/50 transition-colors"
                    >
                      <div className="w-28 font-semibold text-slate-900">{day.day}</div>
                      <div className="flex-1">
                        <Badge 
                          variant="outline" 
                          className="text-sm bg-white border-primary/20 text-primary px-3 py-1"
                        >
                          <Clock className="h-3 w-3 mr-1.5" />
                          {day.from} - {day.to}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-200">
                  <p className="text-sm text-blue-700">
                    <span className="font-semibold">Note:</span> Availability may vary during exam periods. 
                    Please message to confirm specific times.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Reviews Section */}
            <Card className="border-0 shadow-lg bg-white/80 backdrop-blur">
              <CardHeader className="bg-gradient-to-r from-slate-50 to-blue-50">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <MessageSquare className="h-6 w-6 text-primary" />
                      Student Reviews ({reviews.length})
                    </CardTitle>
                    <CardDescription>
                      What students are saying about {tutor.user.name.split(" ")[0]}
                    </CardDescription>
                  </div>
                  {reviews.length > 0 && (
                    <div className="text-right">
                      <div className="flex items-center gap-2">
                        <Star className="h-6 w-6 fill-amber-400 text-amber-400" />
                        <span className="text-3xl font-bold">{averageRating}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">Average rating</p>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-6 pt-6">
                {/* Rating Distribution */}
                {reviews.length > 0 && (
                  <div className="p-4 rounded-lg bg-gradient-to-r from-slate-50 to-blue-50 border border-slate-200">
                    <h3 className="font-semibold mb-3 text-sm">Rating Distribution</h3>
                    <div className="space-y-2">
                      {[5, 4, 3, 2, 1].map((rating) => {
                        const count = ratingDistribution[rating as keyof typeof ratingDistribution]
                        const percentage = reviews.length > 0 ? (count / reviews.length) * 100 : 0
                        return (
                          <div key={rating} className="flex items-center gap-3">
                            <div className="flex items-center gap-1 w-12">
                              <span className="text-sm font-medium">{rating}</span>
                              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                            </div>
                            <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full transition-all"
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground w-8">{count}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Add Review Form */}
                <Card className="border-2 border-primary/20 bg-gradient-to-r from-blue-50/50 to-indigo-50/50">
                  <CardHeader>
                    <CardTitle className="text-lg">Write a Review</CardTitle>
                    <CardDescription>Share your experience with this tutor</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label className="text-sm font-medium mb-2 block">Your Rating</Label>
                      <Select value={String(newRating)} onValueChange={(val) => setNewRating(Number(val))}>
                        <SelectTrigger className="bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[5, 4, 3, 2, 1].map((r) => (
                            <SelectItem key={r} value={String(r)}>
                              <div className="flex items-center gap-2">
                                {Array.from({ length: r }).map((_, i) => (
                                  <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                                ))}
                                <span className="ml-2">({r} {r > 1 ? "Stars" : "Star"})</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-sm font-medium mb-2 block">Your Review</Label>
                      <Textarea
                        placeholder="Share your experience with this tutor..."
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        className="min-h-[120px] bg-white resize-none"
                      />
                    </div>
                    <Button onClick={submitReview} className="w-full" size="lg">
                      <MessageSquare className="mr-2 h-4 w-4" />
                      Submit Review
                    </Button>
                  </CardContent>
                </Card>

                <Separator />

                {/* Reviews List */}
                <div className="space-y-6">
                  {reviews.length > 0 ? (
                    reviews.map((review, index) => (
                      <div key={review._id}>
                        <div className="flex items-start gap-4 p-4 rounded-lg hover:bg-slate-50 transition-colors">
                          <Avatar className="h-12 w-12 border-2 border-primary/20">
                            <AvatarFallback className="bg-gradient-to-br from-primary to-blue-600 text-white">
                              {review.student.name.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 space-y-2">
                            <div className="flex items-start justify-between">
                              <div>
                                <span className="font-semibold text-slate-900">{review.student.name}</span>
                                <div className="flex items-center gap-3 mt-1">
                                  <StarRating rating={review.rating} size="sm" />
                                  <span className="text-xs text-muted-foreground">
                                    {new Date(review.createdAt).toLocaleDateString('en-US', { 
                                      month: 'short', 
                                      day: 'numeric', 
                                      year: 'numeric' 
                                    })}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <p className="text-muted-foreground leading-relaxed">{review.comment}</p>
                          </div>
                        </div>
                        {index !== reviews.length - 1 && <Separator className="my-4" />}
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-12">
                      <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <MessageSquare className="h-10 w-10 text-slate-400" />
                      </div>
                      <p className="text-slate-600 font-medium mb-1">No reviews yet</p>
                      <p className="text-sm text-muted-foreground">Be the first to review this tutor!</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Booking Sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-20 space-y-4">
              <Card className="border-0 shadow-xl bg-white/80 backdrop-blur overflow-hidden">
                <div className="h-2 bg-gradient-to-r from-primary via-blue-600 to-purple-600"></div>
                <CardHeader>
                  <CardTitle>Book a Session</CardTitle>
                  <CardDescription>Get started with {tutor.user.name.split(" ")[0]}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3 p-4 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Hourly Rate</span>
                      <div className="flex items-center gap-1">
                        <DollarSign className="h-4 w-4 text-slate-600" />
                        <span className="font-bold text-xl text-slate-900">
                          {tutor.hourlyRate.toFixed(2)}
                        </span>
                      </div>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Response Time</span>
                      <Badge variant="secondary" className="bg-green-100 text-green-700 border-green-200">
                        Within 2 hours
                      </Badge>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Total Reviews</span>
                      <span className="font-semibold">{reviews.length}</span>
                    </div>
                  </div>

                  <a href={`/book/${id}`} className="block">
                    <Button className="w-full shadow-lg hover:shadow-xl transition-shadow" size="lg">
                      <Calendar className="mr-2 h-5 w-5" />
                      Book Session Now
                    </Button>
                  </a>

                  <div className="text-center p-3 rounded-lg bg-blue-50 border border-blue-200">
                    <p className="text-xs text-blue-700">
                      💬 Have questions? Send a message before booking
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Quick Stats */}
              <Card className="border-0 shadow-lg bg-white/80 backdrop-blur">
                <CardHeader>
                  <CardTitle className="text-lg">Quick Stats</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50">
                    <div className="flex items-center gap-2">
                      <Star className="h-4 w-4 text-amber-500" />
                      <span className="text-sm text-muted-foreground">Avg Rating</span>
                    </div>
                    <span className="font-bold">{averageRating}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-emerald-50 to-green-50">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-emerald-600" />
                      <span className="text-sm text-muted-foreground">Subjects</span>
                    </div>
                    <span className="font-bold">{tutor.subjects.length}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-purple-50 to-pink-50">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-purple-600" />
                      <span className="text-sm text-muted-foreground">Reviews</span>
                    </div>
                    <span className="font-bold">{reviews.length}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <label className={className}>{children}</label>
}