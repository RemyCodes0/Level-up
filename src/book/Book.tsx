"use client";

import type React from "react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { Navbar } from "@/components/navbar/Navbar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  Clock,
  MapPin,
  DollarSign,
  CheckCircle2,
  ArrowLeft,
  Sparkles,
  Info,
} from "lucide-react";
import axios from "axios";

export default function BookSessionPage() {
  const { id } = useParams();
  const router = useNavigate();
  const [user, setUser] = useState(null);
  const [tutor, setTutor] = useState<any>();

  const [subject, setSubject] = useState("");
  const [selectedSlot, setSelectedSlot] = useState();
  const [duration, setDuration] = useState("60");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const token = localStorage.getItem("token");

  useEffect(() => {
    const fetchTutor = async () => {
      try {
        const res = await axios.get(
          `${import.meta.env.VITE_API_URL}/api/tutor/${id}/getTutor`,
        );
        setTutor(res.data.tutor);
        setSelectedSlot(res.data.tutor.availability[0] || null);
      } catch (error) {
        console.error(error);
        alert("A problem occurred while fetching tutor.");
      }
    };
    fetchTutor();
  }, [id]);

  if (!tutor) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center">
        <Navbar />
        <div className="container mx-auto px-4 py-8">
          <Card className="max-w-md mx-auto border-none shadow-lg">
            <CardContent className="pt-6 text-center">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <Calendar className="h-8 w-8 text-muted-foreground" />
              </div>
              <h1 className="text-2xl font-bold mb-2">Tutor not found</h1>
              <p className="text-muted-foreground mb-6">
                We couldn't find the tutor you're looking for.
              </p>
              <Button onClick={() => router("/tutors")} className="w-full">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Tutors
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const totalAmount = (tutor.hourlyRate * Number.parseInt(duration)) / 60;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedSlot) {
      alert("Please select an available slot.");
      return;
    }

    setLoading(true);
    console.log(selectedSlot);
    try {
      const res = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/book/${id}`,
        {
          slot: selectedSlot,
          subject,
          duration,
          totalAmount,
          notes,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      setTimeout(() => {
        setLoading(false);
        setSuccess(true);

        setTimeout(() => {
          router("/bookings");
        }, 2000);
      }, 1000);
    } catch (error) {
      alert("bad request" + error);
      setLoading(false);
      console.error(error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        <Button
          variant="ghost"
          onClick={() => router(`/tutors/${id}`)}
          className="mb-6 hover:bg-accent group"
        >
          <ArrowLeft className="mr-2 h-4 w-4 group-hover:-translate-x-1 transition-transform" />
          Back to Profile
        </Button>

        <div className="max-w-6xl mx-auto">
          {/* Header Section */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-5 w-5 text-primary" />
              <Badge variant="secondary" className="text-xs">
                New Booking
              </Badge>
            </div>
            <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              Book a Session
            </h1>
            <p className="text-lg text-muted-foreground">
              Schedule your tutoring session with {tutor.user.name}
            </p>
          </div>

          {success && (
            <Alert className="mb-6 border-none shadow-lg bg-gradient-to-r from-emerald-500/10 to-emerald-600/5 border-emerald-500/20">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <AlertDescription className="text-emerald-800 dark:text-emerald-200 font-medium">
                🎉 Session booked successfully! Redirecting to your bookings...
              </AlertDescription>
            </Alert>
          )}

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Booking Form */}
            <div className="lg:col-span-2">
              <Card className="border-none shadow-lg">
                <CardHeader className="border-b bg-gradient-to-r from-primary/5 to-transparent">
                  <CardTitle className="text-2xl">Session Details</CardTitle>
                  <CardDescription>
                    Fill in the details for your tutoring session
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Subject */}
                    <div className="space-y-2">
                      <Label
                        htmlFor="subject"
                        className="text-base font-semibold flex items-center gap-2"
                      >
                        Subject <span className="text-destructive">*</span>
                      </Label>
                      <Select
                        value={subject}
                        onValueChange={setSubject}
                        required
                      >
                        <SelectTrigger
                          id="subject"
                          className="h-12 border-2 hover:border-primary/50 transition-colors"
                        >
                          <SelectValue placeholder="Select a subject" />
                        </SelectTrigger>
                        <SelectContent>
                          {tutor.subjects.map((subj: any) => (
                            <SelectItem
                              key={subj.code}
                              value={subj.name}
                              className="cursor-pointer"
                            >
                              <div className="flex items-center justify-between w-full">
                                <span>{subj.name}</span>
                                <Badge
                                  variant="outline"
                                  className="ml-2 text-xs"
                                >
                                  {subj.code}
                                </Badge>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Availability */}
                    <div className="space-y-2">
                      <Label className="text-base font-semibold flex items-center gap-2">
                        Available Slots{" "}
                        <span className="text-destructive">*</span>
                      </Label>
                      <Select
                        value={
                          selectedSlot
                            ? `${selectedSlot.day}-${selectedSlot.from}-${selectedSlot.to}`
                            : ""
                        }
                        onValueChange={(slotValue) => {
                          const slot = tutor.availability.find(
                            (s) => `${s.day}-${s.from}-${s.to}` === slotValue,
                          );
                          setSelectedSlot(slot);
                        }}
                        required
                      >
                        <SelectTrigger className="h-12 border-2 hover:border-primary/50 transition-colors">
                          <SelectValue placeholder="Choose an available time" />
                        </SelectTrigger>
                        <SelectContent>
                          {tutor.availability.length === 0 && (
                            <SelectItem value="none" disabled>
                              No availability
                            </SelectItem>
                          )}
                          {tutor.availability.map((slot) => {
                            const slotValue = `${slot.day}-${slot.from}-${slot.to}`;
                            return (
                              <SelectItem
                                key={slotValue}
                                value={slotValue}
                                className="cursor-pointer"
                              >
                                <div className="flex items-center gap-2">
                                  <Calendar className="h-4 w-4 text-primary" />
                                  <span className="font-medium">
                                    {slot.day}
                                  </span>
                                  <span className="text-muted-foreground">
                                    •
                                  </span>
                                  <Clock className="h-4 w-4 text-primary" />
                                  <span>
                                    {slot.from} – {slot.to}
                                  </span>
                                </div>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Duration */}
                    <div className="space-y-2">
                      <Label
                        htmlFor="duration"
                        className="text-base font-semibold flex items-center gap-2"
                      >
                        Duration <span className="text-destructive">*</span>
                      </Label>
                      <Select
                        value={duration}
                        onValueChange={setDuration}
                        required
                      >
                        <SelectTrigger
                          id="duration"
                          className="h-12 border-2 hover:border-primary/50 transition-colors"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="30" className="cursor-pointer">
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4" />
                              30 minutes
                            </div>
                          </SelectItem>
                          <SelectItem value="60" className="cursor-pointer">
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4" />1 hour
                            </div>
                          </SelectItem>
                          <SelectItem value="90" className="cursor-pointer">
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4" />
                              1.5 hours
                            </div>
                          </SelectItem>
                          <SelectItem value="120" className="cursor-pointer">
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4" />2 hours
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Notes */}
                    <div className="space-y-2">
                      <Label
                        htmlFor="notes"
                        className="text-base font-semibold"
                      >
                        Notes{" "}
                        <span className="text-muted-foreground text-sm font-normal">
                          (Optional)
                        </span>
                      </Label>
                      <Textarea
                        id="notes"
                        placeholder="Any specific topics or questions you'd like to cover?"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={4}
                        className="resize-none border-2 hover:border-primary/50 transition-colors"
                      />
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Info className="h-3 w-3" />
                        This helps the tutor prepare for your session
                      </p>
                    </div>

                    <Button
                      type="submit"
                      className="w-full h-14 text-lg font-semibold bg-gradient-to-r from-primary to-primary/90 hover:opacity-90 transition-all shadow-lg hover:shadow-xl"
                      size="lg"
                      disabled={loading || success}
                    >
                      {loading ? (
                        <>
                          <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
                          Booking Session...
                        </>
                      ) : success ? (
                        <>
                          <CheckCircle2 className="mr-2 h-5 w-5" />
                          Booked Successfully!
                        </>
                      ) : (
                        <>
                          <Calendar className="mr-2 h-5 w-5" />
                          Confirm Booking
                        </>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>

            {/* Booking Summary - Sticky */}
            <div className="lg:col-span-1">
              <div className="sticky top-24">
                <Card className="border-none shadow-xl bg-gradient-to-br from-card via-card to-primary/5">
                  <CardHeader className="border-b bg-gradient-to-r from-primary/10 to-transparent">
                    <CardTitle className="text-xl">Booking Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6 pt-6">
                    {/* Tutor Info */}
                    <div className="flex items-center gap-4 p-4 rounded-xl bg-accent/50 border border-border/50">
                      <Avatar className="h-14 w-14 ring-2 ring-primary/20">
                        <AvatarImage
                          src={tutor.avatarUrl || "/placeholder.svg"}
                          alt={tutor.user.name}
                        />
                        <AvatarFallback className="bg-gradient-to-br from-primary to-primary/80 text-white text-lg">
                          {tutor.user.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-base truncate">
                          {tutor.user.name}
                        </p>
                        <p className="text-sm text-muted-foreground truncate">
                          {subject || "No subject selected"}
                        </p>
                      </div>
                    </div>

                    {/* Session Details */}
                    <div className="space-y-4">
                      <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-accent/50 transition-colors">
                        <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                          <Calendar className="h-5 w-5 text-blue-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-muted-foreground mb-1">
                            Date
                          </p>
                          <p className="text-sm font-semibold truncate">
                            {selectedSlot
                              ? selectedSlot.day
                              : "No slot selected"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-accent/50 transition-colors">
                        <div className="h-9 w-9 rounded-lg bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                          <Clock className="h-5 w-5 text-violet-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-muted-foreground mb-1">
                            Time & Duration
                          </p>
                          <p className="text-sm font-semibold">
                            {selectedSlot
                              ? `${selectedSlot.from} – ${selectedSlot.to}`
                              : "No time selected"}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {duration} minutes session
                          </p>
                        </div>
                      </div>

                      {location && (
                        <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-accent/50 transition-colors">
                          <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                            <MapPin className="h-5 w-5 text-emerald-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-muted-foreground mb-1">
                              Location
                            </p>
                            <p className="text-sm font-semibold truncate">
                              {location}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Pricing Breakdown */}
                    <div className="border-t pt-4 space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          Hourly Rate
                        </span>
                        <span className="font-medium">
                          ${tutor.hourlyRate.toFixed(2)}/hour
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Duration</span>
                        <span className="font-medium">{duration} minutes</span>
                      </div>
                      <div className="flex items-center justify-between pt-3 border-t">
                        <span className="font-semibold text-base">
                          Total Amount
                        </span>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-primary">
                            ${totalAmount.toFixed(2)}
                          </div>
                          <p className="text-xs text-muted-foreground">USD</p>
                        </div>
                      </div>
                    </div>

                    {/* Payment Notice */}
                    <Alert className="border-amber-500/20 bg-amber-500/5">
                      <DollarSign className="h-4 w-4 text-amber-600" />
                      <AlertDescription className="text-xs text-amber-800 dark:text-amber-200">
                        Payment will be arranged directly with the tutor after
                        the session is confirmed.
                      </AlertDescription>
                    </Alert>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
