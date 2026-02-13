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
import { 
  GraduationCap, 
  Upload, 
  X, 
  Plus,
  MapPin,
  BookOpen,
  Target,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Award,
  Clock
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { motion } from "framer-motion"
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

const TEACHING_STYLES = [
  { value: "structured", label: "Structured & Systematic", description: "Step-by-step approach with clear milestones" },
  { value: "interactive", label: "Interactive & Conversational", description: "Discussion-based with active engagement" },
  { value: "visual", label: "Visual & Hands-on", description: "Diagrams, examples, and practical demonstrations" },
  { value: "adaptive", label: "Adaptive & Flexible", description: "Tailored to each student's learning style" },
  { value: "exam-focused", label: "Exam-Focused", description: "Strategic preparation for tests and exams" },
]

const DEFAULT_BENEFITS = [
  "Personalized lesson plans based on your goals",
  "Practice problems with detailed explanations",
  "Exam preparation strategies",
  "Flexible scheduling options",
  "Follow-up resources after sessions",
]

interface User {
  _id: string;
  name: string;
  email: string;
}

export default function ApplyTutorPage() {
  const router = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const idInputRef = useRef<HTMLInputElement>(null)
  const [user, setUser] = useState<User | null>(null)
  
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState("")
  const token = localStorage.getItem("token")

  useEffect(() => {
    const storedUser = localStorage.getItem("user")
    if (storedUser) {
      setUser(JSON.parse(storedUser))
    }
  }, [])

  // Form fields
  const [bio, setBio] = useState("")
  const [subjects, setSubjects] = useState<{ code: string; name: string }[]>([])
  const [experiences, setExperiences] = useState("")
  const [certificates, setCertificates] = useState<File[]>([])
  const [idCard, setIdCard] = useState<File | null>(null)
  const [gpa, setGpa] = useState("")
  const [hourlyRate, setHourlyRate] = useState("")
  const [availability, setAvailability] = useState<{ day: string; from: string; to: string }[]>([])
  
  // New fields
  const [location, setLocation] = useState("")
  // const [locationType, setLocationType] = useState<"campus" | "online" | "both">("both")
  const [teachingApproach, setTeachingApproach] = useState("")
  const [teachingStyle, setTeachingStyle] = useState("")
  const [studentBenefits, setStudentBenefits] = useState<string[]>(DEFAULT_BENEFITS)
  const [customBenefit, setCustomBenefit] = useState("")

  // Subject selection
  const [selectedSubjectCode, setSelectedSubjectCode] = useState("")

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

  // Student Benefits
  const addCustomBenefit = () => {
    if (customBenefit.trim()) {
      setStudentBenefits([...studentBenefits, customBenefit.trim()])
      setCustomBenefit("")
    }
  }

  const removeBenefit = (index: number) => {
    setStudentBenefits(studentBenefits.filter((_, i) => i !== index))
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
    formData.append("location", location)
    // formData.append("locationType", locationType)
    formData.append("teachingApproach", teachingApproach)
    formData.append("teachingStyle", teachingStyle)
    formData.append("subjects", JSON.stringify(subjects))
    formData.append("availability", JSON.stringify(availability))
    formData.append("studentBenefits", JSON.stringify(studentBenefits))

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
      if (!location.trim()) {
        throw new Error("Please specify your preferred teaching location")
      }
      if (!teachingApproach.trim()) {
        throw new Error("Please describe your teaching approach")
      }
      if (!teachingStyle) {
        throw new Error("Please select your teaching style")
      }

      const response = await axios.post("http://localhost:5000/api/tutor/apply", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
          Authorization: `Bearer ${token}`,
        }
      })
      const application = response.data

      const existingApplications = JSON.parse(localStorage.getItem("tutorApplications") || "[]")
      localStorage.setItem("tutorApplications", JSON.stringify([...existingApplications, application]))

      setSuccess(true)
      setTimeout(() => {
        router("/login")
      }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit application")
      console.error(err)
    } finally {
      setLoading(false)
    }
  }
  
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <Card className="w-full max-w-md border-none shadow-2xl">
            <CardHeader className="text-center pb-8">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring" }}
                className="flex justify-center mb-4"
              >
                <div className="bg-gradient-to-r from-green-500 to-emerald-500 text-white p-4 rounded-full shadow-lg">
                  <CheckCircle2 className="h-12 w-12" />
                </div>
              </motion.div>
              <CardTitle className="text-3xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                Application Submitted!
              </CardTitle>
              <CardDescription className="text-base mt-3">
                Thank you for applying to become a tutor at Level Up. We'll review your application and get back to you within 2-3 business days.
              </CardDescription>
            </CardHeader>
          </Card>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Card className="border-none shadow-2xl backdrop-blur-sm bg-white/95">
            <CardHeader className="text-center pb-8">
              <div className="flex justify-center mb-6">
                <a href="/" className="flex items-center gap-3">
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full blur-lg opacity-50"></div>
                    <div className="relative bg-gradient-to-r from-blue-600 to-purple-600 overflow-hidden p-3 rounded-full shadow-lg">
                      <img src="/logo.png" alt="Level Up" className="h-10 w-10 object-cover rounded-full" />
                    </div>
                  </div>
                  <span className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                    Level Up
                  </span>
                </a>
              </div>
              <CardTitle className="text-4xl font-bold bg-gradient-to-r from-gray-900 via-blue-800 to-purple-800 bg-clip-text text-transparent">
                Become a Tutor
              </CardTitle>
              <CardDescription className="text-base mt-3">
                Join our community of educators and help students achieve their academic goals
              </CardDescription>
              <div className="flex items-center justify-center gap-2 mt-4">
                <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                  <Award className="h-3 w-3 mr-1" />
                  Competitive Rates
                </Badge>
                <Badge variant="secondary" className="bg-purple-100 text-purple-700">
                  <Clock className="h-3 w-3 mr-1" />
                  Flexible Schedule
                </Badge>
              </div>
            </CardHeader>

            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-8">
                {error && (
                  <Alert variant="destructive" className="border-red-200 bg-red-50">
                    <AlertCircle className="h-5 w-5" />
                    <AlertDescription className="font-medium">{error}</AlertDescription>
                  </Alert>
                )}

                {/* Personal Information */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                      <GraduationCap className="h-5 w-5 text-blue-600" />
                    </div>
                    <h3 className="text-xl font-bold">Academic Information</h3>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="gpa" className="text-sm font-semibold">Overall GPA</Label>
                    <Input
                      id="gpa"
                      type="number"
                      step="0.01"
                      min="0"
                      max="4"
                      value={gpa}
                      onChange={(e) => setGpa(e.target.value)}
                      placeholder="3.75"
                      className="h-11 border-2 focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Bio */}
                <div className="space-y-2">
                  <Label htmlFor="bio" className="text-sm font-semibold flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-muted-foreground" />
                    Bio *
                  </Label>
                  <Textarea
                    id="bio"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    required
                    placeholder="Tell us about yourself, your academic background, and what motivates you to teach..."
                    rows={4}
                    className="border-2 focus:border-blue-500 resize-none"
                  />
                </div>

                {/* Subjects */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold">Subjects You Can Teach *</Label>
                  <div className="flex gap-2">
                    <Select value={selectedSubjectCode} onValueChange={setSelectedSubjectCode}>
                      <SelectTrigger className="h-11 border-2">
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
                    <Button 
                      type="button" 
                      onClick={addSubject} 
                      size="icon"
                      className="h-11 w-11 bg-gradient-to-r from-blue-600 to-purple-600"
                    >
                      <Plus className="h-5 w-5" />
                    </Button>
                  </div>
                  {subjects.length > 0 && (
                    <div className="flex flex-wrap gap-2 p-4 rounded-lg bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-100">
                      {subjects.map((subject) => (
                        <Badge key={subject.code} className="bg-white text-gray-700 hover:bg-gray-50 px-3 py-1.5">
                          {subject.code}
                          <button 
                            type="button" 
                            onClick={() => removeSubject(subject.code)} 
                            className="ml-2 hover:text-red-600"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* Teaching Style */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                      <Target className="h-5 w-5 text-purple-600" />
                    </div>
                    <h3 className="text-xl font-bold">Teaching Style & Approach</h3>
                  </div>

                  <div className="space-y-3">
                    <Label className="text-sm font-semibold">Select Your Teaching Style *</Label>
                    <RadioGroup value={teachingStyle} onValueChange={setTeachingStyle}>
                      <div className="space-y-3">
                        {TEACHING_STYLES.map((style) => (
                          <div key={style.value} className="flex items-start space-x-3 p-4 rounded-lg border-2 hover:border-purple-300 transition-colors cursor-pointer">
                            <RadioGroupItem value={style.value} id={style.value} className="mt-1" />
                            <Label htmlFor={style.value} className="cursor-pointer flex-1">
                              <div className="font-semibold text-gray-900">{style.label}</div>
                              <div className="text-sm text-muted-foreground mt-1">{style.description}</div>
                            </Label>
                          </div>
                        ))}
                      </div>
                    </RadioGroup>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="teachingApproach" className="text-sm font-semibold">
                      Describe Your Teaching Approach *
                    </Label>
                    <Textarea
                      id="teachingApproach"
                      value={teachingApproach}
                      onChange={(e) => setTeachingApproach(e.target.value)}
                      required
                      placeholder="Explain your methodology, how you adapt to different learning styles, and what makes your approach effective..."
                      rows={4}
                      className="border-2 focus:border-purple-500 resize-none"
                    />
                  </div>
                </div>

                {/* Experience */}
                <div className="space-y-2">
                  <Label htmlFor="experience" className="text-sm font-semibold">Teaching Experience *</Label>
                  <Textarea
                    id="experience"
                    value={experiences}
                    onChange={(e) => setExperiences(e.target.value)}
                    required
                    placeholder="Describe your teaching experience, relevant coursework, certifications, or any tutoring you've done..."
                    rows={4}
                    className="border-2 focus:border-blue-500 resize-none"
                  />
                </div>

                {/* Location & Session Type */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                      <MapPin className="h-5 w-5 text-green-600" />
                    </div>
                    <h3 className="text-xl font-bold">Location & Availability</h3>
                  </div>

                  <div className="space-y-3">
                    {/* <Label className="text-sm font-semibold">Session Type *</Label> */}
                    {/* <RadioGroup value={locationType} onValueChange={(value: any) => setLocationType(value)}>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="flex items-center space-x-2 p-3 rounded-lg border-2 hover:border-green-300 transition-colors cursor-pointer">
                          <RadioGroupItem value="campus" id="campus" />
                          <Label htmlFor="campus" className="cursor-pointer text-sm font-medium">
                            On-Campus
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2 p-3 rounded-lg border-2 hover:border-green-300 transition-colors cursor-pointer">
                          <RadioGroupItem value="online" id="online" />
                          <Label htmlFor="online" className="cursor-pointer text-sm font-medium">
                            Online Only
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2 p-3 rounded-lg border-2 hover:border-green-300 transition-colors cursor-pointer">
                          <RadioGroupItem value="both" id="both" />
                          <Label htmlFor="both" className="cursor-pointer text-sm font-medium">
                            Both
                          </Label>
                        </div>
                      </div>
                    </RadioGroup> */}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="location" className="text-sm font-semibold">
                      Preferred Teaching Location *
                    </Label>
                    <Input
                      id="location"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      required
                      placeholder="e.g., AUB Campus Library, Online via Zoom, or Both"
                      className="h-11 border-2 focus:border-green-500"
                    />
                  </div>
                </div>

                {/* Student Benefits */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                      <Sparkles className="h-5 w-5 text-amber-600" />
                    </div>
                    <h3 className="text-xl font-bold">What Students Will Get</h3>
                  </div>
                  
                  <div className="p-4 rounded-lg bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-100 space-y-2">
                    {studentBenefits.map((benefit, index) => (
                      <div key={index} className="flex items-start gap-3 p-2 rounded bg-white/60">
                        <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                        <span className="text-sm flex-1">{benefit}</span>
                        <button
                          type="button"
                          onClick={() => removeBenefit(index)}
                          className="text-gray-400 hover:text-red-600 transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <Input
                      value={customBenefit}
                      onChange={(e) => setCustomBenefit(e.target.value)}
                      placeholder="Add a custom benefit..."
                      className="h-11 border-2 focus:border-amber-500"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          addCustomBenefit()
                        }
                      }}
                    />
                    <Button 
                      type="button" 
                      onClick={addCustomBenefit}
                      className="h-11 bg-gradient-to-r from-amber-500 to-orange-500"
                    >
                      <Plus className="h-5 w-5" />
                    </Button>
                  </div>
                </div>

                {/* Hourly Rate */}
                <div className="space-y-2">
                  <Label htmlFor="hourlyRate" className="text-sm font-semibold">Hourly Rate (USD) *</Label>
                  <Input
                    id="hourlyRate"
                    type="number"
                    step="0.01"
                    min="5"
                    value={hourlyRate}
                    onChange={(e) => setHourlyRate(e.target.value)}
                    required
                    placeholder="15.00"
                    className="h-11 border-2 focus:border-blue-500"
                  />
                  <p className="text-xs text-muted-foreground">Recommended: $15-30 per hour based on subject complexity</p>
                </div>

                {/* Availability */}
                <div className="space-y-3">
                  <Label className="text-sm font-semibold">Weekly Availability *</Label>
                  <div className="space-y-2">
                    {availability.map((slot, index) => (
                      <div key={index} className="flex gap-2 items-end p-3 rounded-lg border-2 bg-gray-50">
                        <div className="flex-1">
                          <Select value={slot.day} onValueChange={(value) => updateAvailabilitySlot(index, "day", value)}>
                            <SelectTrigger className="h-10">
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
                            className="h-10"
                          />
                        </div>
                        <div className="flex-1">
                          <Input
                            type="time"
                            value={slot.to}
                            onChange={(e) => updateAvailabilitySlot(index, "to", e.target.value)}
                            className="h-10"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          onClick={() => removeAvailabilitySlot(index)}
                          className="h-10 w-10"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={addAvailabilitySlot}
                      className="w-full h-11 border-2 border-dashed hover:border-blue-400 hover:bg-blue-50"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Time Slot
                    </Button>
                  </div>
                </div>

                {/* Certificates */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Certificates (Optional)</Label>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full h-11 border-2 hover:border-purple-400 hover:bg-purple-50"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Certificates
                  </Button>
                  <input
                    type="file"
                    multiple
                    hidden
                    ref={fileInputRef}
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => {
                      if (e.target.files) {
                        setCertificates([...certificates, ...Array.from(e.target.files)])
                      }
                    }}
                  />
                  {certificates.length > 0 && (
                    <div className="space-y-2 p-3 rounded-lg bg-purple-50 border-2 border-purple-100">
                      {certificates.map((cert, index) => (
                        <div key={index} className="flex items-center gap-2 p-2 bg-white rounded">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          <span className="text-sm flex-1 truncate">{cert.name}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setCertificates(certificates.filter((_, i) => i !== index))}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ID Card */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Student ID Card *</Label>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-11 border-2 hover:border-blue-400 hover:bg-blue-50"
                    onClick={() => idInputRef.current?.click()}
                  >
                    <Upload className="h-4 w-4 mr-2" /> 
                    Upload ID Document
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
                    <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg border-2 border-green-200">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      <span className="text-sm flex-1">{idCard.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setIdCard(null)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>

                {/* Submit Button */}
                <div className="pt-6 space-y-4">
                  <Button 
                    type="submit" 
                    className="w-full h-14 text-lg font-semibold bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg hover:shadow-xl transition-all" 
                    disabled={loading}
                  >
                    {loading ? (
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>Submitting Application...</span>
                      </div>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-5 w-5" />
                        Submit Application
                      </>
                    )}
                  </Button>
                  
                  <p className="text-sm text-center text-muted-foreground">
                    Already have an account?{" "}
                    <a href="/login" className="text-blue-600 hover:underline font-semibold">
                      Sign in
                    </a>
                  </p>
                </div>
              </CardContent>
            </form>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}