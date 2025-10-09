"use client"

import { useAuth } from "@/lib/auth-context"
import { useNavigate } from "react-router-dom"
import { useEffect, useState } from "react"
import { Navbar } from "@/components/navbar/Navbar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { X } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface TimeSlot {
  start: string
  end: string
}

interface DayAvailability {
  day: string
  enabled: boolean
  slots: TimeSlot[]
}

export default function TutorAvailabilityPage() {
  const { user } = useAuth()
  const router = useNavigate()
  const { toast } = useToast()

  const [availability, setAvailability] = useState<DayAvailability[]>([
    { day: "Monday", enabled: true, slots: [{ start: "10:00", end: "14:00" }] },
    { day: "Tuesday", enabled: true, slots: [{ start: "14:00", end: "18:00" }] },
    {
      day: "Wednesday",
      enabled: true,
      slots: [
        { start: "10:00", end: "12:00" },
        { start: "15:00", end: "19:00" },
      ],
    },
    { day: "Thursday", enabled: true, slots: [{ start: "13:00", end: "17:00" }] },
    { day: "Friday", enabled: true, slots: [{ start: "09:00", end: "13:00" }] },
    { day: "Saturday", enabled: false, slots: [] },
    { day: "Sunday", enabled: false, slots: [] },
  ])

//   useEffect(() => {
//     if (!user || (user.role !== "tutor" && user.role !== "both")) {
//       router("/")
//     }
//   }, [user, router])

  if (!user || (user.role !== "tutor" && user.role !== "both")) {
    return null
  }

  const toggleDay = (dayIndex: number) => {
    setAvailability(availability.map((day, idx) => (idx === dayIndex ? { ...day, enabled: !day.enabled } : day)))
  }

  const addSlot = (dayIndex: number) => {
    setAvailability(
      availability.map((day, idx) =>
        idx === dayIndex ? { ...day, slots: [...day.slots, { start: "09:00", end: "10:00" }] } : day,
      ),
    )
  }

  const removeSlot = (dayIndex: number, slotIndex: number) => {
    setAvailability(
      availability.map((day, idx) =>
        idx === dayIndex ? { ...day, slots: day.slots.filter((_, sIdx) => sIdx !== slotIndex) } : day,
      ),
    )
  }

  const updateSlot = (dayIndex: number, slotIndex: number, field: "start" | "end", value: string) => {
    setAvailability(
      availability.map((day, idx) =>
        idx === dayIndex
          ? {
              ...day,
              slots: day.slots.map((slot, sIdx) => (sIdx === slotIndex ? { ...slot, [field]: value } : slot)),
            }
          : day,
      ),
    )
  }

  const handleSave = () => {
    toast({
      title: "Availability Updated",
      description: "Your availability schedule has been saved successfully.",
    })
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Button variant="ghost" onClick={() => router("/tutor/dashboard")} className="mb-6">
          ← Back to Dashboard
        </Button>

        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Manage Availability</h1>
          <p className="text-muted-foreground">Set your weekly availability for tutoring sessions</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Weekly Schedule</CardTitle>
            <CardDescription>Select days and time slots when you're available to tutor</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {availability.map((day, dayIndex) => (
              <div key={day.day} className="space-y-3 pb-6 border-b last:border-b-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id={`day-${dayIndex}`}
                      checked={day.enabled}
                      onCheckedChange={() => toggleDay(dayIndex)}
                    />
                    <Label htmlFor={`day-${dayIndex}`} className="text-base font-semibold cursor-pointer">
                      {day.day}
                    </Label>
                  </div>
                  {day.enabled && (
                    <Button variant="outline" size="sm" onClick={() => addSlot(dayIndex)}>
                      Add Time Slot
                    </Button>
                  )}
                </div>

                {day.enabled && (
                  <div className="ml-8 space-y-2">
                    {day.slots.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No time slots added</p>
                    ) : (
                      day.slots.map((slot, slotIndex) => (
                        <div key={slotIndex} className="flex items-center gap-3">
                          <input
                            type="time"
                            value={slot.start}
                            onChange={(e) => updateSlot(dayIndex, slotIndex, "start", e.target.value)}
                            className="px-3 py-2 border rounded-md text-sm"
                          />
                          <span className="text-muted-foreground">to</span>
                          <input
                            type="time"
                            value={slot.end}
                            onChange={(e) => updateSlot(dayIndex, slotIndex, "end", e.target.value)}
                            className="px-3 py-2 border rounded-md text-sm"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeSlot(dayIndex, slotIndex)}
                            className="text-destructive hover:text-destructive"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex gap-4 mt-6">
          <Button onClick={handleSave} size="lg" className="flex-1">
            Save Availability
          </Button>
          <Button variant="outline" onClick={() => router("/tutor/dashboard")} size="lg">
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}
