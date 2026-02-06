"use client"

import { useState, useMemo, useEffect } from "react"
import { Navbar } from "@/components/navbar/Navbar"
import { TutorCard } from "@/components/tutor-card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { MOCK_TUTORS, ALL_SUBJECTS } from "@/lib/mock-data"
import { Search } from "lucide-react"

export default function TutorsPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedSubject, setSelectedSubject] = useState<string>("all")
  const [maxPrice, setMaxPrice] = useState([20])
  const [minRating, setMinRating] = useState([0])
  const [tutors, setTutors] = useState<any[]>([])
const [loading, setLoading] = useState(true)
const [error, setError] = useState<string | null>(null)

useEffect(() => {
  const fetchTutors = async () => {
    try {
      const res = await fetch("http://localhost:5000/api/tutor/allTutors")

      if (!res.ok) {
        throw new Error("Failed to fetch tutors")
      }

      const data = await res.json()
      setTutors(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  fetchTutors()
}, [])


 const filteredTutors = useMemo(() => {
  return tutors.filter((tutor) => {
    const matchesSearch =
      searchQuery === "" ||
      tutor.user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tutor.subjects.some((subject: any) =>
        subject.name.toLowerCase().includes(searchQuery.toLowerCase())
      )

    const matchesSubject =
      selectedSubject === "all" ||
      tutor.subjects.includes(selectedSubject)

    const matchesPrice = tutor.hourlyRate <= maxPrice[0]
    const matchesRating = tutor.averageRating >= minRating[0]

    return matchesSearch && matchesSubject && matchesPrice&& matchesRating
  })
}, [tutors, searchQuery, selectedSubject, maxPrice, minRating])


  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Find Your Perfect Tutor</h1>
          <p className="text-muted-foreground">Browse verified AUB student tutors across all subjects</p>
        </div>

        <div className="grid lg:grid-cols-4 gap-8">
          {/* Filters Sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-20 space-y-6">
              <div>
                <Label htmlFor="search" className="text-base font-semibold mb-3 block">
                  Search
                </Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="search"
                    placeholder="Search tutors or subjects"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* <div>
                <Label htmlFor="subject" className="text-base font-semibold mb-3 block">
                  Subject
                </Label>
                <Select value={selectedSubject} onValueChange={setSelectedSubject}>
                  <SelectTrigger id="subject">
                    <SelectValue placeholder="All subjects" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All subjects</SelectItem>
                    {ALL_SUBJECTS.map((subject) => (
                      <SelectItem key={subject} value={subject}>
                        {subject}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div> */}

              <div>
                <Label className="text-base font-semibold mb-3 block">Max Price: ${maxPrice[0]}/hour</Label>
                <Slider value={maxPrice} onValueChange={setMaxPrice} max={20} min={10} step={0.5} className="mt-2" />
                <div className="flex justify-between text-xs text-muted-foreground mt-2">
                  <span>$10</span>
                  <span>$20</span>
                </div>
              </div>

              <div>
                <Label className="text-base font-semibold mb-3 block">Minimum Rating: {minRating[0].toFixed(1)}</Label>
                <Slider value={minRating} onValueChange={setMinRating} max={5} min={0} step={0.1} className="mt-2" />
                <div className="flex justify-between text-xs text-muted-foreground mt-2">
                  <span>0</span>
                  <span>5</span>
                </div>
              </div>
            </div>
          </div>

          {/* Tutors Grid */}
          <div className="lg:col-span-3">
            <div className="mb-4 text-sm text-muted-foreground">
              Showing {filteredTutors.length} {filteredTutors.length === 1 ? "tutor" : "tutors"}
            </div>
            {filteredTutors.length > 0 ? (
              <div className="grid md:grid-cols-2 gap-6">
                {filteredTutors.map((tutor) => (
                  <TutorCard key={tutor._id} tutor={tutor} />
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No tutors found matching your criteria.</p>
                <p className="text-sm text-muted-foreground mt-2">Try adjusting your filters.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
