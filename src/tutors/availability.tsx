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
import { Badge } from "@/components/ui/badge";
import axios from "axios";
import {
  X,
  ArrowLeft,
  Plus,
  Clock,
  Calendar,
  Save,
  Trash2,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

interface DayAvailability {
  day: string;
  from: string;
  to: string;
}

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

const WEEKDAY_COLORS = {
  Monday: "from-blue-500 to-indigo-600",
  Tuesday: "from-purple-500 to-pink-600",
  Wednesday: "from-emerald-500 to-teal-600",
  Thursday: "from-orange-500 to-red-600",
  Friday: "from-cyan-500 to-blue-600",
};

export default function TutorAvailabilityPage() {
  const router = useNavigate();
  const user = JSON.parse(localStorage.getItem("user"));
  const token = localStorage.getItem("token");

  const [availability, setAvailability] = useState<DayAvailability[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Load existing tutor availability
  useEffect(() => {
    const fetchTutorData = async () => {
      setIsLoading(true);
      try {
        const res = await axios.get(
          `${import.meta.env.VITE_API_URL}/api/tutor/${user._id}/getTutorWithUserId`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const data = res.data.tutor;

        // Normalize availability: ensure from/to exist
        const normalized = (data.availability || []).map((day: any) => ({
          day: WEEKDAYS.includes(day.day) ? day.day : WEEKDAYS[0],
          from: day.from || "09:00",
          to: day.to || "17:00",
        }));

        setAvailability(normalized);
      } catch (error) {
        console.error("Failed to load tutor data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    if (user && token) fetchTutorData();
  }, []);

  const updateSlot = (
    index: number,
    field: "from" | "to" | "day",
    value: string,
  ) => {
    setAvailability((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const addDay = () => {
    const usedDays = availability.map((d) => d.day);
    const newDay = WEEKDAYS.find((d) => !usedDays.includes(d)) || WEEKDAYS[0];

    setAvailability((prev) => [
      ...prev,
      { day: newDay, from: "09:00", to: "17:00" },
    ]);
  };

  const removeDay = (index: number) => {
    setAvailability((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await axios.put(
        `${import.meta.env.VITE_API_URL}/api/tutor/${user._id}/updateAvailability`,
        { availability },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error("Failed to save availability:", error);
      alert("Failed to save availability");
    } finally {
      setIsSaving(false);
    }
  };

  const calculateTotalHours = () => {
    return availability.reduce((total, day) => {
      const [fromHour, fromMin] = day.from.split(":").map(Number);
      const [toHour, toMin] = day.to.split(":").map(Number);
      const hours = (toHour * 60 + toMin - (fromHour * 60 + fromMin)) / 60;
      return total + (hours > 0 ? hours : 0);
    }, 0);
  };

  const LoadingSkeleton = () => (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex items-center justify-between p-4 border rounded-lg"
        >
          <div className="h-10 w-32 bg-gray-200 rounded animate-pulse" />
          <div className="flex items-center gap-3">
            <div className="h-10 w-24 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 w-8 bg-gray-200 rounded animate-pulse" />
            <div className="h-10 w-24 bg-gray-200 rounded animate-pulse" />
            <div className="h-10 w-10 bg-gray-200 rounded-full animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30">
        <Navbar />
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <div className="flex items-center justify-center h-96">
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-gray-600 font-medium">
                Loading your availability...
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30">
      <Navbar />

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => router("/tutor/dashboard")}
            className="mb-4 hover:bg-white/50"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>

          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 via-blue-800 to-purple-800 bg-clip-text text-transparent mb-2">
                Manage Availability
              </h1>
              <p className="text-gray-600 text-lg">
                Set your weekly availability for tutoring sessions
              </p>
            </div>

            {/* Total Hours Badge */}
            <div className="bg-white rounded-lg shadow-md px-6 py-3 border border-gray-100">
              <div className="text-sm text-gray-600 mb-1">Weekly Hours</div>
              <div className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                {calculateTotalHours().toFixed(1)}h
              </div>
            </div>
          </div>
        </div>

        {/* Success Message */}
        {saveSuccess && (
          <div className="mb-6 bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-center gap-3 animate-fade-in">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <p className="text-emerald-700 font-medium">
              Availability saved successfully!
            </p>
          </div>
        )}

        {/* Main Card */}
        <Card className="border-0 shadow-lg">
          <CardHeader className="border-b bg-gradient-to-r from-blue-50 to-purple-50">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl flex items-center gap-2">
                  <Calendar className="h-6 w-6 text-blue-600" />
                  Weekly Schedule
                </CardTitle>
                <CardDescription className="mt-1">
                  Set the time range for each day you are available
                </CardDescription>
              </div>
              <Badge variant="secondary" className="text-sm px-3 py-1">
                {availability.length}{" "}
                {availability.length === 1 ? "day" : "days"} active
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="p-6">
            {availability.length === 0 ? (
              <div className="text-center py-12">
                <Calendar className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 font-medium mb-2">
                  No availability set
                </p>
                <p className="text-sm text-gray-400 mb-4">
                  Add your first available day to get started
                </p>
                <Button
                  onClick={addDay}
                  className="bg-gradient-to-r from-blue-600 to-purple-600"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Your First Day
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {availability.map((day, idx) => {
                  const gradient =
                    WEEKDAY_COLORS[day.day as keyof typeof WEEKDAY_COLORS];

                  return (
                    <div
                      key={idx}
                      className="group relative p-5 border-2 border-gray-100 rounded-xl hover:border-blue-200 hover:shadow-md transition-all duration-300 bg-white"
                    >
                      {/* Colored accent bar */}
                      <div
                        className={`absolute top-0 left-0 w-2 h-full bg-gradient-to-b ${gradient} rounded-l-xl`}
                      />

                      <div className="flex items-center justify-between pl-4">
                        {/* Day Selector */}
                        <div className="flex items-center gap-3">
                          <div
                            className={`p-2 rounded-lg bg-gradient-to-br ${gradient} bg-opacity-10`}
                          >
                            <Calendar className="h-5 w-5 text-gray-700" />
                          </div>
                          <select
                            value={day.day}
                            onChange={(e) =>
                              updateSlot(idx, "day", e.target.value)
                            }
                            className="px-4 py-2.5 border-2 border-gray-200 rounded-lg text-sm font-semibold hover:border-gray-300 focus:border-blue-500 focus:outline-none transition-colors bg-white"
                          >
                            {WEEKDAYS.map((d) => (
                              <option
                                key={d}
                                value={d}
                                disabled={availability.some(
                                  (av, i) => av.day === d && i !== idx,
                                )}
                              >
                                {d}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Time Inputs */}
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg">
                            <Clock className="h-4 w-4 text-gray-500" />
                            <input
                              type="time"
                              value={day.from}
                              onChange={(e) =>
                                updateSlot(idx, "from", e.target.value)
                              }
                              className="px-3 py-1.5 border-2 border-gray-200 rounded-lg text-sm font-medium hover:border-gray-300 focus:border-blue-500 focus:outline-none transition-colors bg-white"
                            />
                          </div>

                          <span className="text-gray-400 font-medium">→</span>

                          <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg">
                            <Clock className="h-4 w-4 text-gray-500" />
                            <input
                              type="time"
                              value={day.to}
                              onChange={(e) =>
                                updateSlot(idx, "to", e.target.value)
                              }
                              className="px-3 py-1.5 border-2 border-gray-200 rounded-lg text-sm font-medium hover:border-gray-300 focus:border-blue-500 focus:outline-none transition-colors bg-white"
                            />
                          </div>

                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeDay(idx)}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Duration indicator */}
                      <div className="mt-3 pl-4 flex items-center gap-2 text-sm text-gray-500">
                        <AlertCircle className="h-3.5 w-3.5" />
                        <span>
                          Duration:{" "}
                          {(() => {
                            const [fromHour, fromMin] = day.from
                              .split(":")
                              .map(Number);
                            const [toHour, toMin] = day.to
                              .split(":")
                              .map(Number);
                            const hours =
                              (toHour * 60 +
                                toMin -
                                (fromHour * 60 + fromMin)) /
                              60;
                            return hours > 0
                              ? `${hours.toFixed(1)} hours`
                              : "Invalid time range";
                          })()}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {/* Add Day Button */}
                {availability.length < WEEKDAYS.length && (
                  <Button
                    onClick={addDay}
                    variant="outline"
                    className="w-full mt-4 border-2 border-dashed border-gray-300 hover:border-blue-500 hover:bg-blue-50 h-14 text-blue-600 font-semibold"
                  >
                    <Plus className="h-5 w-5 mr-2" />
                    Add Another Day
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Action Buttons */}
        {availability.length > 0 && (
          <div className="flex gap-4 mt-6">
            <Button
              onClick={handleSave}
              size="lg"
              disabled={isSaving}
              className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 h-14 text-lg font-semibold shadow-lg hover:shadow-xl transition-all"
            >
              {isSaving ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-5 w-5 mr-2" />
                  Save Availability
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => router("/tutor/dashboard")}
              size="lg"
              disabled={isSaving}
              className="h-14 px-8 text-lg font-semibold border-2"
            >
              Cancel
            </Button>
          </div>
        )}

        {/* Info Card */}
        <Card className="mt-6 bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-900">
                <p className="font-semibold mb-1">
                  Tips for setting availability:
                </p>
                <ul className="list-disc list-inside space-y-1 text-blue-800">
                  <li>
                    Students can only book sessions during your available hours
                  </li>
                  <li>
                    Make sure to set realistic time ranges you can commit to
                  </li>
                  <li>You can update your availability anytime</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
