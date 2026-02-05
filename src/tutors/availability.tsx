"use client";

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/navbar/Navbar";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import axios from "axios";
import { X } from "lucide-react";

interface DayAvailability {
  day: string;
  from: string;
  to: string;
}

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

export default function TutorAvailabilityPage() {
  const router = useNavigate();
  const user = JSON.parse(localStorage.getItem("user"));
  const token = localStorage.getItem("token");

  const [availability, setAvailability] = useState<DayAvailability[]>([]);

  // Load existing tutor availability
  useEffect(() => {
    const fetchTutorData = async () => {
      try {
        const res = await axios.get(
          `http://localhost:5000/api/tutor/${user._id}/getTutorWithUserId`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = res.data.tutor;

        // Normalize availability: ensure from/to exist
        const normalized = (data.availability || []).map((day: any) => ({
          day: WEEKDAYS.includes(day.day) ? day.day : WEEKDAYS[0],
          from: day.from || "00:00",
          to: day.to || "00:00",
        }));

        setAvailability(normalized);
      } catch (error) {
        console.error("Failed to load tutor data:", error);
        alert("Failed to load availability");
      }
    };

    if (user && token) fetchTutorData();
  }, []);

  const updateSlot = (
    index: number,
    field: "from" | "to" | "day",
    value: string
  ) => {
    setAvailability((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const addDay = () => {
    // Default to first weekday that is not already in availability
    const usedDays = availability.map((d) => d.day);
    const newDay = WEEKDAYS.find((d) => !usedDays.includes(d)) || WEEKDAYS[0];

    setAvailability((prev) => [
      ...prev,
      { day: newDay, from: "00:00", to: "00:00" },
    ]);
  };

  const removeDay = (index: number) => {
    setAvailability((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSave = async () => {
    try {
      await axios.put(
        `http://localhost:5000/api/tutor/${user._id}/updateAvailability`,
        { availability },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      alert("Availability saved successfully!");
    } catch (error) {
      console.error("Failed to save availability:", error);
      alert("Failed to save availability");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Button
          variant="ghost"
          onClick={() => router("/tutor/dashboard")}
          className="mb-6"
        >
          ← Back to Dashboard
        </Button>

        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Manage Availability</h1>
          <p className="text-muted-foreground">
            Set your weekly availability for tutoring sessions
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Weekly Schedule</CardTitle>
            <CardDescription>
              Set the time range for each day you are available
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {availability.map((day, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between border-b last:border-b-0 pb-3"
              >
                {/* Day dropdown */}
                <select
                  value={day.day}
                  onChange={(e) => updateSlot(idx, "day", e.target.value)}
                  className="px-3 py-2 border rounded-md text-sm"
                >
                  {WEEKDAYS.map((d) => (
                    <option
                      key={d}
                      value={d}
                      disabled={availability.some(
                        (av, i) => av.day === d && i !== idx
                      )}
                    >
                      {d}
                    </option>
                  ))}
                </select>

                {/* Time inputs */}
                <div className="flex items-center gap-3">
                  <input
                    type="time"
                    value={day.from}
                    onChange={(e) => updateSlot(idx, "from", e.target.value)}
                    className="px-3 py-2 border rounded-md text-sm"
                  />
                  <span className="text-muted-foreground">to</span>
                  <input
                    type="time"
                    value={day.to}
                    onChange={(e) => updateSlot(idx, "to", e.target.value)}
                    className="px-3 py-2 border rounded-md text-sm"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeDay(idx)}
                    className="text-destructive hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}

            <Button
              onClick={addDay}
              variant="outline"
              size="sm"
              className="mt-2"
              disabled={availability.length >= WEEKDAYS.length} // can't exceed Monday-Friday
            >
              + Add Day
            </Button>
          </CardContent>
        </Card>

        <div className="flex gap-4 mt-6">
          <Button onClick={handleSave} size="lg" className="flex-1">
            Save Availability
          </Button>
          <Button
            variant="outline"
            onClick={() => router("/tutor/dashboard")}
            size="lg"
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
