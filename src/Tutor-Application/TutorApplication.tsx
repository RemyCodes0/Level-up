"use client"

import type React from "react"

import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { GraduationCap, Upload, X, Plus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { TutorApplication } from "@/lib/types"
import axios from "axios"

const AVAILABLE_SUBJECTS = [
  { code: "MATH201", name: "Calculus I" },
  { code: "MATH202", name: "Calculus II" },
  { code: "PHYS201", name: "Physics I" },
  { code: "PHYS202", name: "Physics II" },
  { code: "CHEM201", name: "Chemistry I" },
  { code: "CMPS200", name: "Introduction to Computer Science" },
  { code: "ECON201", name: "Microeconomics" },
  { code: "ECON202", name: "Macroeconomics" },
  { code: "BIOL201", name: "Biology I" },
  { code: "ENGL201", name: "Academic Writing" },
]

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
interface User {
  _id: string;
  name: string;
  email: string;
}
export default function ApplyTutorPage() {
  const router = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const idInputRef = useRef<HTMLInputElement>(null)
  const [user, setUser] = useState<User| null>(null)
  
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState("")
const token = localStorage.getItem("token")
  useEffect(()=>{
    
    const storedUser = localStorage.getItem("user")
    if(storedUser){
      setUser(JSON.parse(storedUser))
    }
  },[])

  // Form fields
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [bio, setBio] = useState("")
  const [subjects, setSubjects] = useState<{ code: string; name: string }[]>([])
  const [experiences, setExperiences] = useState("")
 const [certificates, setCertificates] = useState<File[]>([])

  const [idCard, setIdCard] = useState<File | null>(null)
  const [gpa, setGpa] = useState("")
  const [hourlyRate, setHourlyRate] = useState("")
  const [availability, setAvailability] = useState<{ day: string; from: string; to: string }[]>([])

  // Subject selection
  const [selectedSubjectCode,  setSelectedSubjectCode] = useState("")

  const addSubject = () => {
    const subject = AVAILABLE_SUBJECTS.find((s) => s.code === selectedSubjectCode)
    if (subject && !subjects.find((s) => s.code === subject.code)) {
      setSubjects([...subjects, subject])
      setSelectedSubjectCode("")
    }
  }

  const removeSubject = (code: string) => {
    setSubjects(subjects.filter((s) => s.code !== code))
  }

  // File upload simulation
 

  // Availability
  const addAvailabilitySlot = () => {
    setAvailability([...availability, { day: "Monday", from: "09:00", to: "10:00" }])
  }

  const updateAvailabilitySlot = (index: number, field: "day" | "from" | "to", value: string) => {
    const updated = [...availability]
    updated[index][field] = value
    setAvailability(updated)
  }

  const removeAvailabilitySlot = (index: number) => {
    setAvailability(availability.filter((_, i) => i !== index))
  }
 

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
 const formData = new FormData()
  formData.append("bio", bio)
  formData.append("experiences", experiences)
  formData.append("hourlyRate", hourlyRate)
  formData.append("gpa", gpa)
//  availability.forEach((slot, i) => {
//   formData.append(`availability[${i}][day]`, slot.day)
//   formData.append(`availability[${i}][from]`, slot.from)
//   formData.append(`availability[${i}][to]`, slot.to)
// })
// subjects.forEach((subject, i) => {
//   formData.append(`subjects[${i}][code]`, subject.code)
//   formData.append(`subjects[${i}][name]`, subject.name)
// })
formData.append("subjects", JSON.stringify(subjects))
formData.append("availability", JSON.stringify(availability))

certificates.forEach(file => formData.append("certificates", file))
if (idCard) formData.append("idCard", idCard)

    try {
      // Validation
      if (subjects.length === 0) {
        throw new Error("Please select at least one subject")
      }
      if (availability.length === 0) {
        throw new Error("Please add at least one availability slot")
      }
      if (!hourlyRate || Number.parseFloat(hourlyRate) <= 0) {
        throw new Error("Please enter a valid hourly rate")
      }

      const response = await axios.post("http://localhost:5000/api/tutor/apply", formData,  {
    headers: {
      "Content-Type": "multipart/form-data",
      Authorization: `Bearer ${token}`, // if your backend uses auth middleware
    }})
      const application = response.data

      // Create application
      // const application: TutorApplication = {
      //   id: `app-${Date.now()}`,
      //   userId: `user-${Date.now()}`,
      //   fullName,
      //   email,
      //   bio,
      //   subjects: subjects,
      //   experience,
      //   certificates,
      //   idCard,
      //   gpa: gpa ? Number.parseFloat(gpa) : undefined,
      //   availability,
      //   hourlyRate: Number.parseFloat(hourlyRate),
      //   status: "pending",
      //   submittedAt: new Date(),
      // }


      // Save to localStorage (simulating backend)
      const existingApplications = JSON.parse(localStorage.getItem("tutorApplications") || "[]")
      localStorage.setItem("tutorApplications", JSON.stringify([...existingApplications, application]))

      setSuccess(true)
      setTimeout(() => {
        router("/login")
      }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit application")
      console.log({bio, subjects,experiences,certificates, idCard,gpa: gpa? parseFloat(gpa): undefined,availability,status: "pending", adminFeedback: ""})
    } finally {
      setLoading(false)
      console.log({bio, subjects,experiences,certificates, idCard,gpa: gpa? parseFloat(gpa): undefined,availability,status: "pending", adminFeedback: ""})
    }
  }
  
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="bg-green-100 text-green-600 p-3 rounded-full">
                <GraduationCap className="h-8 w-8" />
              </div>
            </div>
            <CardTitle>Application Submitted!</CardTitle>
            <CardDescription>
              Thank you for applying to become a tutor. We'll review your application and get back to you soon.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <Card>
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
             <a href="/" className="flex items-center gap-2 font-bold text-xl">
           <div className="bg-primary overflow-hidden text-primary-foreground p-2 rounded-full">
            <img src="/logo.png" alt="No image" className="h-10 w-10 object-cover rounded-full"/>
          </div>
          <span>Level Up</span>
        </a>

            </div>
            <CardTitle className="text-3xl">Become a Tutor</CardTitle>
            <CardDescription>Join Level Up and help fellow students succeed</CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-6">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {/* Personal Information */}
              <div className="space-y-4 text-start">
                <h3 className="text-lg font-semibold">Personal Information</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  {/* <div className="space-y-2">
                    <Label htmlFor="fullName">Full Name *</Label>
                    <Input
                      id="fullName"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      placeholder="John Doe"
                    />
                  </div> */}
                  {/* <div className="space-y-2">
                    <Label htmlFor="email">AUB Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="your.email@aub.edu.lb"
                    />
                  </div> */}
                </div>
                {/* <div className="space-y-2">
                  <Label htmlFor="password">Password *</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="Create a secure password"
                  />
                </div> */}
                <div className="space-y-2">
                  <Label htmlFor="gpa">Overall GPA</Label>
                  <Input
                    id="gpa"
                    type="number"
                    step="0.01"
                    min="0"
                    max="4"
                    value={gpa}
                    onChange={(e) => setGpa(e.target.value)}
                    placeholder="3.75"
                  />
                </div>
              </div>

              {/* Bio */}
              <div className="text-start space-y-2">
                <Label htmlFor="bio">Bio *</Label>
                <Textarea
                  id="bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  required
                  placeholder="Tell us about yourself, your teaching style, and what makes you a great tutor..."
                  rows={4}
                />
              </div>

              {/* Subjects */}
              <div className="text-start space-y-2">
                <Label>Subjects You Can Teach *</Label>
                <div className="flex gap-2">
                  <Select value={selectedSubjectCode} onValueChange={setSelectedSubjectCode}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a subject" />
                    </SelectTrigger>
                    <SelectContent>
                      {AVAILABLE_SUBJECTS.map((subject) => (
                        <SelectItem key={subject.code} value={subject.code}>
                          {subject.code} - {subject.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" onClick={addSubject} size="icon">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {subjects.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {subjects.map((subject) => (
                      <Badge key={subject.code} variant="secondary" className="gap-1">
                        {subject.code}
                        <button type="button" onClick={() => removeSubject(subject.code)} className="ml-1">
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Experience */}
              <div className=" text-start space-y-2">
                <Label htmlFor="experience">Teaching Experience *</Label>
                <Textarea
                  id="experience"
                  value={experiences}
                  onChange={(e) => setExperiences(e.target.value)}
                  required
                  placeholder="Describe your teaching experience, relevant coursework, or any tutoring you've done..."
                  rows={3}
                />
              </div>

              {/* Hourly Rate */}
              <div className="text-start space-y-2">
                <Label htmlFor="hourlyRate">Hourly Rate (USD) *</Label>
                <Input
                  id="hourlyRate"
                  type="number"
                  step="0.01"
                  min="5"
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value)}
                  required
                  placeholder="15.00"
                />
              </div>

              {/* Availability */}
              <div className="text-start space-y-2">
                <Label>Availability *</Label>
                <div className="space-y-2">
                  {availability.map((slot, index) => (
                    <div key={index} className="flex gap-2 items-end">
                      <div className="flex-1">
                        <Select value={slot.day} onValueChange={(value) => updateAvailabilitySlot(index, "day", value)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {DAYS_OF_WEEK.map((day) => (
                              <SelectItem key={day} value={day}>
                                {day}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex-1">
                        <Input
                          type="time"
                          value={slot.from}
                          onChange={(e) => updateAvailabilitySlot(index, "from", e.target.value)}
                        />
                      </div>
                      <div className="flex-1">
                        <Input
                          type="time"
                          value={slot.to}
                          onChange={(e) => updateAvailabilitySlot(index, "to", e.target.value)}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        onClick={() => removeAvailabilitySlot(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addAvailabilitySlot}
                    className="w-full bg-transparent"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Time Slot
                  </Button>
                </div>
              </div>

              {/* Certificates */}
              <div className="text-start space-y-2">
                <Label>Certificates (Optional)</Label>
                <Button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Certificate
                </Button>
              <input
  type="file"
  multiple
  hidden
  ref={fileInputRef}
  onChange={(e) => {
    if (e.target.files) {
      setCertificates([...certificates, ...Array.from(e.target.files)])
    }
  }}
/>
                {certificates.length > 0 && (
                  <div className="space-y-1">
                    {certificates.map((cert, index) => (
                      <div key={index} className="text-sm text-muted-foreground flex items-center gap-2">
                        <span className="truncate flex-1">Certificate {index + 1} uploaded</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setCertificates(certificates.filter((_, i) => i !== index))}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ID Card */}
               <div className="text-start space-y-2">

               
                <Label>IDCard</Label>
             <Button
                type="button"
                variant="outline"
                className="w-full"
                  onClick={() => idInputRef.current?.click()}>
    <Upload className="h-4 w-4 mr-2" /> Upload ID Document
  </Button>

  <input
    type="file"
    accept="image/*,.pdf"
    hidden
    ref={idInputRef}
    onChange={(e) => {
      if (e.target.files && e.target.files[0]) {
        setIdCard(e.target.files[0])
      }
    }}
  />

  {idCard && (
    <div className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
      <span className="flex-1">{idCard.name} uploaded</span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setIdCard(null)}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  )}
</div>

                <div className="pt-4 space-y-4">
                  <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Submitting..." : "Submit Application"}
                </Button>
                <p className="text-sm text-center text-muted-foreground">
                  Already have an account?{" "}
                  <a href="/login" className="text-primary hover:underline font-medium">
                    Sign in
                  </a>
                </p>
              </div>
            </CardContent>
          </form>
        </Card>
      </div>
    </div>
  )
}
