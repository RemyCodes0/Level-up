"use client"

import { useNavigate } from "react-router-dom"
import { Navbar } from "@/components/navbar/Navbar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { StarRating } from "@/components/star-rating"
import { MessageDialog } from "@/components/message-dialog"
import { MOCK_TUTORS } from "@/lib/mock-data"
import { Star, CheckCircle2, DollarSign, BookOpen, Calendar, Clock, MapPin, Award } from "lucide-react"
import { useParams } from "react-router-dom"
import { useEffect, useState } from "react"
import axios from "axios"



export default function TutorProfilePage() {
  const { id } = useParams<{ id: string }>()
  const router = useNavigate()
  const [tutor, setTutors] = useState()

  useEffect(()=>{
    const fetchTutor =async()=>{
      try{
        const res = await axios.get(`http://localhost:5000/api/tutor/${id}/getTutor`)
       setTutors(res.data.tutor)
      }catch(err){
        console.error(err)
      }
    }
    fetchTutor()
  },[])

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

  const mockReviews = [
    {
      id: "1",
      studentName: "Nour M.",
      studentAvatar: "/placeholder.svg?height=40&width=40",
      rating: 5,
      comment:
        "Sarah is an amazing tutor! She explained data structures in a way that finally made sense to me. Very patient and always prepared for our sessions.",
      date: "2 weeks ago",
      subject: "Computer Science",
    },
    {
      id: "2",
      studentName: "Ali K.",
      studentAvatar: "/placeholder.svg?height=40&width=40",
      rating: 5,
      comment:
        "Very patient and knowledgeable. Helped me ace my algorithms exam! Would definitely recommend to anyone struggling with CS concepts.",
      date: "1 month ago",
      subject: "Algorithms",
    },
    {
      id: "3",
      studentName: "Layla H.",
      studentAvatar: "/placeholder.svg?height=40&width=40",
      rating: 4,
      comment:
        "Great tutor, very helpful with programming concepts. Would recommend! Sessions are well-structured and she provides great resources.",
      date: "1 month ago",
      subject: "Programming",
    },
    {
      id: "4",
      studentName: "Omar S.",
      studentAvatar: "/placeholder.svg?height=40&width=40",
      rating: 5,
      comment:
        "Best tutor I've had at AUB. Makes complex topics easy to understand and is always willing to go the extra mile.",
      date: "2 months ago",
      subject: "Data Structures",
    },
  ]

  const mockAvailability = [
    {
      day: "Monday",
      slots: [
        { start: "10:00 AM", end: "2:00 PM" },
        { start: "4:00 PM", end: "6:00 PM" },
      ],
    },
    { day: "Tuesday", slots: [{ start: "2:00 PM", end: "6:00 PM" }] },
    {
      day: "Wednesday",
      slots: [
        { start: "10:00 AM", end: "12:00 PM" },
        { start: "3:00 PM", end: "7:00 PM" },
      ],
    },
    { day: "Thursday", slots: [{ start: "1:00 PM", end: "5:00 PM" }] },
    { day: "Friday", slots: [{ start: "9:00 AM", end: "1:00 PM" }] },
  ]

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
                    <AvatarImage src={tutor.avatarUrl || "/placeholder.svg"} alt={tutor.fullName} />
                    <AvatarFallback className="text-2xl">{tutor.user.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h1 className="text-3xl font-bold">{tutor.fullName}</h1>
                      {tutor.status === "approved" && (
                        <CheckCircle2 className="h-6 w-6 text-primary" title="Verified Tutor" />
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-muted-foreground mb-4">
                      <div className="flex items-center gap-1">
                        <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                        {/* <span className="font-semibold text-foreground">{tutor.profile.averageRating.toFixed(1)}</span> */}
                        <span className="text-sm">({mockReviews.length} reviews)</span>
                      </div>
                      {/* <div className="flex items-center gap-1">
                        <BookOpen className="h-4 w-4" />
                        <span className="text-sm">{tutor.profile.totalSessions} sessions completed</span>
                      </div> */}
                    </div>
                    <div className="flex items-center gap-2 text-2xl font-bold text-primary mb-4">
                      <DollarSign className="h-6 w-6" />
                      <span>{tutor.hourlyRate.toFixed(2)}/hour</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {tutor.subjects.map((subject) => (
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
                    I focus on building strong fundamentals and helping students develop problem-solving skills. Each
                    session is tailored to your learning pace and style. I use real-world examples and interactive
                    exercises to make concepts stick. My goal is not just to help you pass exams, but to truly
                    understand the material.
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
                    I offer sessions both on-campus (AUB Library, Jafet, or other study areas) and online via Zoom. We
                    can discuss the best option for you when booking.
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

            {/* Reviews */}
            <Card>
              <CardHeader>
                <CardTitle>Student Reviews ({mockReviews.length})</CardTitle>
                <CardDescription>What students are saying about {tutor.user.name.split(" ")[0]}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {mockReviews.map((review, index) => (
                  <div key={review.id}>
                    <div className="flex items-start gap-4">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={review.studentAvatar || "/placeholder.svg"} alt={review.studentName} />
                        <AvatarFallback>{review.studentName.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">{review.studentName}</span>
                              <Badge variant="outline" className="text-xs">
                                {review.subject}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <StarRating rating={review.rating} size="sm" />
                              <span className="text-sm text-muted-foreground">{review.date}</span>
                            </div>
                          </div>
                        </div>
                        <p className="text-muted-foreground leading-relaxed">{review.comment}</p>
                      </div>
                    </div>
                    {index !== mockReviews.length - 1 && <Separator className="mt-6" />}
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
                    {/* <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Sessions</span>
                      <span className="font-semibold">{tutor.profile.totalSessions}</span>
                    </div> */}
                    {/* <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Rating</span>
                      <span className="font-semibold">{tutor.profile.averageRating.toFixed(1)}/5.0</span>
                    </div> */}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Response Time</span>
                      <span className="font-semibold">Within 2 hours</span>
                    </div>
                  </div>

                  <a href={`/book/${tutor._id}`} className="block">
                    <Button className="w-full" size="lg">
                      <Calendar className="mr-2 h-4 w-4" />
                      Book Session Now
                    </Button>
                  </a>
{/* 
                  <MessageDialog tutor={tutor} /> */}

                  <p className="text-xs text-muted-foreground text-center">
                    Have questions? Send a message before booking
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Why Choose {tutor.user.name.split(" ")[0]}?</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-muted-foreground">Verified AUB student tutor</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-muted-foreground">Highly rated by students</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-muted-foreground">Flexible scheduling options</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-muted-foreground">Affordable peer tutoring rates</span>
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
