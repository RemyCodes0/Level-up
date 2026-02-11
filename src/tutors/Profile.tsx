"use client"

import { useAuth } from "@/lib/auth-context"
import { useNavigate } from "react-router-dom"
import { useEffect, useState } from "react"
import { Navbar } from "@/components/navbar/Navbar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { ALL_SUBJECTS, MOCK_TUTORS } from "@/lib/mock-data"
import { 
  X, 
  Plus, 
  Save, 
  ArrowLeft,
  BookOpen,
  DollarSign,
  MapPin,
  Target,
  Sparkles,
  CheckCircle2,
  User,
  GraduationCap
} from "lucide-react"
import { motion } from "framer-motion"
import axios from "axios"

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

export default function TutorProfileEditPage() {
  const navigate = useNavigate()
  
  const [bio, setBio] = useState("")
  const [hourlyRate, setHourlyRate] = useState<number | "">("")
  const [selectedSubjects, setSelectedSubjects] = useState<{code: string, name: string, _id: string}[]>([])
  const [subjectInput, setSubjectInput] = useState("")
  
  // New fields
  const [location, setLocation] = useState("")
  const [locationType, setLocationType] = useState<"campus" | "online" | "both">("both")
  const [teachingApproach, setTeachingApproach] = useState("")
  const [teachingStyle, setTeachingStyle] = useState("")
  const [studentBenefits, setStudentBenefits] = useState<string[]>(DEFAULT_BENEFITS)
  const [customBenefit, setCustomBenefit] = useState("")
  
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const storedUser = localStorage.getItem("user")
  const user = storedUser ? JSON.parse(storedUser) : null

  useEffect(() => {
    if (!user || (user.role !== "tutor")) {
      navigate("/")
      return
    }

    // Load existing tutor data
    const fetchTutorData = async () => {
      try {
        const res = await axios.get(`http://localhost:5000/api/tutor/${user._id}/getTutorWithUserId`)
        const data = res.data.tutor

        if (data) {
          setBio(data.bio || "")
          setHourlyRate(data.hourlyRate || "")
          setSelectedSubjects(data.subjects || [])
          setLocation(data.location || "")
          setLocationType(data.locationType || "both")
          setTeachingApproach(data.teachingApproach || "")
          setTeachingStyle(data.teachingStyle || "")
          setStudentBenefits(data.studentBenefits || DEFAULT_BENEFITS)
        }
      } catch (error) {
        console.error("Failed to load tutor data:", error)
      }
    }
    fetchTutorData()
  }, [user, navigate])

  if (!user || (user.role !== "tutor")) {
    return null
  }

  const handleAddSubject = (subject: string) => {
    if (subject && !selectedSubjects.find(s => s.name === subject)) {
      // In a real app, you'd fetch the subject details from the backend
      const newSubject = { code: subject, name: subject, _id: `temp-${Date.now()}` }
      setSelectedSubjects([...selectedSubjects, newSubject])
      setSubjectInput("")
    }
  }

  const addCustomBenefit = () => {
    if (customBenefit.trim()) {
      setStudentBenefits([...studentBenefits, customBenefit.trim()])
      setCustomBenefit("")
    }
  }

  const removeBenefit = (index: number) => {
    setStudentBenefits(studentBenefits.filter((_, i) => i !== index))
  }

  const handleSave = async () => {
    setLoading(true)
    try {
      // In production, this would be an API call
      const updatedData = {
        bio,
        hourlyRate,
        subjects: selectedSubjects,
        location,
        locationType,
        teachingApproach,
        teachingStyle,
        studentBenefits,
      }

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      setSuccess(true)
      setTimeout(() => {
        setSuccess(false)
        navigate("/tutor/dashboard")
      }, 2000)
    } catch (error) {
      console.error("Failed to save:", error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <Navbar />
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <Button 
            variant="ghost" 
            onClick={() => navigate("/tutor/dashboard")} 
            className="mb-4 hover:bg-primary/10"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>

          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-5 w-5 text-primary" />
            <Badge variant="secondary" className="text-xs">Profile Settings</Badge>
          </div>
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            Edit Tutor Profile
          </h1>
          <p className="text-lg text-muted-foreground">
            Update your profile to attract more students
          </p>
        </motion.div>

        {/* Success Alert */}
        {success && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            <Alert className="bg-gradient-to-r from-green-50 to-emerald-50 border-green-200 shadow-lg">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <AlertDescription className="text-green-800 font-medium">
                Profile updated successfully! Redirecting...
              </AlertDescription>
            </Alert>
          </motion.div>
        )}

        <div className="space-y-6">
          {/* Basic Information */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <Card className="border-none shadow-lg hover:shadow-xl transition-shadow duration-300">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <User className="h-5 w-5 text-blue-600" />
                  </div>
                  <CardTitle className="text-xl">Basic Information</CardTitle>
                </div>
                <CardDescription>Update your profile details and bio</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="bio" className="text-sm font-semibold flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-muted-foreground" />
                    Bio
                  </Label>
                  <Textarea
                    id="bio"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Tell students about yourself, your teaching style, and experience..."
                    rows={6}
                    className="border-2 focus:border-blue-500 resize-none"
                    maxLength={500}
                  />
                  <p className="text-sm text-muted-foreground">{bio?.length}/500 characters</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="rate" className="text-sm font-semibold flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    Hourly Rate (USD)
                  </Label>
                  <Input
                    id="rate"
                    type="number"
                    step="0.50"
                    min="5"
                    max="100"
                    value={hourlyRate}
                    onChange={(e) => setHourlyRate(Number(e.target.value))}
                    className="h-11 border-2 focus:border-blue-500"
                  />
                  <p className="text-sm text-muted-foreground">Recommended: $15-30 per hour based on subject complexity</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Subjects */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <Card className="border-none shadow-lg hover:shadow-xl transition-shadow duration-300">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                    <GraduationCap className="h-5 w-5 text-purple-600" />
                  </div>
                  <CardTitle className="text-xl">Subjects</CardTitle>
                </div>
                <CardDescription>Select the subjects you can tutor</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="subject" className="text-sm font-semibold">Add Subject</Label>
                  <div className="flex gap-2">
                    <Input
                      id="subject"
                      value={subjectInput}
                      onChange={(e) => setSubjectInput(e.target.value)}
                      placeholder="Type or select a subject..."
                      list="subjects-list"
                      className="h-11 border-2 focus:border-purple-500"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleAddSubject(subjectInput)
                        }
                      }}
                    />
                    <datalist id="subjects-list">
                      {ALL_SUBJECTS.map((subject) => (
                        <option key={subject} value={subject} />
                      ))}
                    </datalist>
                    <Button 
                      onClick={() => handleAddSubject(subjectInput)}
                      className="h-11 bg-gradient-to-r from-purple-600 to-blue-600"
                    >
                      <Plus className="h-5 w-5" />
                    </Button>
                  </div>
                </div>

                {selectedSubjects?.length > 0 ? (
                  <div className="flex flex-wrap gap-2 p-4 rounded-lg bg-gradient-to-r from-purple-50 to-blue-50 border-2 border-purple-100">
                    {selectedSubjects.map((subject) => (
                      <Badge key={subject._id} className="bg-white text-gray-700 hover:bg-gray-50 px-3 py-1.5">
                        {subject.name}
                        <button
                          onClick={() =>
                            setSelectedSubjects(selectedSubjects.filter((s) => s._id !== subject._id))
                          }
                          className="ml-2 hover:text-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground p-4 bg-muted/30 rounded-lg text-center">
                    No subjects selected yet
                  </p>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Location & Session Type */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
          >
            <Card className="border-none shadow-lg hover:shadow-xl transition-shadow duration-300">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                    <MapPin className="h-5 w-5 text-green-600" />
                  </div>
                  <CardTitle className="text-xl">Location & Session Type</CardTitle>
                </div>
                <CardDescription>Specify where you prefer to teach</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-3">
                  <Label className="text-sm font-semibold">Session Type</Label>
                  <RadioGroup value={locationType} onValueChange={(value: any) => setLocationType(value)}>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="flex items-center space-x-2 p-3 rounded-lg border-2 hover:border-green-300 transition-colors cursor-pointer">
                        <RadioGroupItem value="campus" id="campus-edit" />
                        <Label htmlFor="campus-edit" className="cursor-pointer text-sm font-medium">
                          On-Campus
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2 p-3 rounded-lg border-2 hover:border-green-300 transition-colors cursor-pointer">
                        <RadioGroupItem value="online" id="online-edit" />
                        <Label htmlFor="online-edit" className="cursor-pointer text-sm font-medium">
                          Online Only
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2 p-3 rounded-lg border-2 hover:border-green-300 transition-colors cursor-pointer">
                        <RadioGroupItem value="both" id="both-edit" />
                        <Label htmlFor="both-edit" className="cursor-pointer text-sm font-medium">
                          Both
                        </Label>
                      </div>
                    </div>
                  </RadioGroup>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="location" className="text-sm font-semibold">
                    Preferred Teaching Location
                  </Label>
                  <Input
                    id="location"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g., AUB Campus Library, Online via Zoom, or Both"
                    className="h-11 border-2 focus:border-green-500"
                  />
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Teaching Style & Approach */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.4 }}
          >
            <Card className="border-none shadow-lg hover:shadow-xl transition-shadow duration-300">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
                    <Target className="h-5 w-5 text-orange-600" />
                  </div>
                  <CardTitle className="text-xl">Teaching Style & Approach</CardTitle>
                </div>
                <CardDescription>Define your teaching methodology</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-3">
                  <Label className="text-sm font-semibold">Teaching Style</Label>
                  <RadioGroup value={teachingStyle} onValueChange={setTeachingStyle}>
                    <div className="space-y-3">
                      {TEACHING_STYLES.map((style) => (
                        <div 
                          key={style.value} 
                          className="flex items-start space-x-3 p-4 rounded-lg border-2 hover:border-orange-300 transition-colors cursor-pointer"
                        >
                          <RadioGroupItem value={style.value} id={`${style.value}-edit`} className="mt-1" />
                          <Label htmlFor={`${style.value}-edit`} className="cursor-pointer flex-1">
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
                    Teaching Approach Description
                  </Label>
                  <Textarea
                    id="teachingApproach"
                    value={teachingApproach}
                    onChange={(e) => setTeachingApproach(e.target.value)}
                    placeholder="Explain your methodology, how you adapt to different learning styles, and what makes your approach effective..."
                    rows={4}
                    className="border-2 focus:border-orange-500 resize-none"
                  />
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Student Benefits */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.5 }}
          >
            <Card className="border-none shadow-lg hover:shadow-xl transition-shadow duration-300">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <Sparkles className="h-5 w-5 text-amber-600" />
                  </div>
                  <CardTitle className="text-xl">What Students Will Get</CardTitle>
                </div>
                <CardDescription>List the benefits students receive from your sessions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
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
              </CardContent>
            </Card>
          </motion.div>

          {/* Action Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.6 }}
            className="flex flex-col sm:flex-row gap-4 pt-4"
          >
            <Button 
              onClick={handleSave} 
              disabled={loading}
              className="flex-1 h-12 text-base font-semibold bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg hover:shadow-xl transition-all"
            >
              {loading ? (
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
              variant="outline" 
              onClick={() => navigate("/tutor/dashboard")} 
              className="h-12 border-2 hover:bg-muted"
            >
              Cancel
            </Button>
          </motion.div>
        </div>
      </div>
    </div>
  )
}