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
import { ALL_SUBJECTS, MOCK_TUTORS } from "@/lib/mock-data"
import { X } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

export default function TutorProfileEditPage() {
  const { user } = useAuth()
  const router = useNavigate()
  const { toast } = useToast()

  const [bio, setBio] = useState("")
  const [hourlyRate, setHourlyRate] = useState("15.00")
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([])
  const [subjectInput, setSubjectInput] = useState("")

//   useEffect(() => {
//     if (!user || (user.role !== "tutor" && user.role !== "both")) {
//       router("/")
//       return
//     }

//     // Load existing tutor data
//     const tutorData = MOCK_TUTORS.find((t) => t.id === user.id)
//     if (tutorData) {
//       setBio(tutorData.profile.bio)
//       setHourlyRate(tutorData.profile.hourlyRate.toString())
//       setSelectedSubjects(tutorData.profile.subjects)
//     }
//   }, [user, router])

  if (!user || (user.role !== "tutor" && user.role !== "both")) {
    return null
  }

  const handleAddSubject = (subject: string) => {
    if (subject && !selectedSubjects.includes(subject)) {
      setSelectedSubjects([...selectedSubjects, subject])
      setSubjectInput("")
    }
  }

  const handleRemoveSubject = (subject: string) => {
    setSelectedSubjects(selectedSubjects.filter((s) => s !== subject))
  }

  const handleSave = () => {
    toast({
      title: "Profile Updated",
      description: "Your tutor profile has been successfully updated.",
    })
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Button variant="ghost" onClick={() => router("/tutor/dashboard")} className="mb-6">
          ← Back to Dashboard
        </Button>

        <h1 className="text-3xl font-bold mb-8">Edit Tutor Profile</h1>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>Update your profile details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="bio">Bio</Label>
                <Textarea
                  id="bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell students about yourself, your teaching style, and experience..."
                  rows={6}
                />
                <p className="text-sm text-muted-foreground">{bio.length}/500 characters</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="rate">Hourly Rate ($)</Label>
                <Input
                  id="rate"
                  type="number"
                  step="0.50"
                  min="5"
                  max="100"
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value)}
                />
                <p className="text-sm text-muted-foreground">Set your hourly tutoring rate</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Subjects</CardTitle>
              <CardDescription>Select the subjects you can tutor</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="subject">Add Subject</Label>
                <div className="flex gap-2">
                  <Input
                    id="subject"
                    value={subjectInput}
                    onChange={(e) => setSubjectInput(e.target.value)}
                    placeholder="Type or select a subject..."
                    list="subjects-list"
                  />
                  <datalist id="subjects-list">
                    {ALL_SUBJECTS.map((subject) => (
                      <option key={subject} value={subject} />
                    ))}
                  </datalist>
                  <Button onClick={() => handleAddSubject(subjectInput)}>Add</Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {selectedSubjects.map((subject) => (
                  <Badge key={subject} variant="secondary" className="text-sm px-3 py-1">
                    {subject}
                    <button onClick={() => handleRemoveSubject(subject)} className="ml-2 hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>

              {selectedSubjects.length === 0 && (
                <p className="text-sm text-muted-foreground">No subjects selected yet</p>
              )}
            </CardContent>
          </Card>

          <div className="flex gap-4">
            <Button onClick={handleSave} size="lg" className="flex-1">
              Save Changes
            </Button>
            <Button variant="outline" onClick={() => router("/tutor/dashboard")} size="lg">
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
