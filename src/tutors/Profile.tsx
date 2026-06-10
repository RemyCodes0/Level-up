"use client";

import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Navbar } from "@/components/navbar/Navbar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
  GraduationCap,
} from "lucide-react";
import { motion } from "framer-motion";
import axios from "axios";

const TEACHING_STYLES = [
  {
    value: "structured",
    label: "Structured & Systematic",
    description: "Step-by-step approach with clear milestones",
  },
  {
    value: "interactive",
    label: "Interactive & Conversational",
    description: "Discussion-based with active engagement",
  },
  {
    value: "visual",
    label: "Visual & Hands-on",
    description: "Diagrams, examples, and practical demonstrations",
  },
  {
    value: "adaptive",
    label: "Adaptive & Flexible",
    description: "Tailored to each student's learning style",
  },
  {
    value: "exam-focused",
    label: "Exam-Focused",
    description: "Strategic preparation for tests and exams",
  },
];

const DEFAULT_BENEFITS = [
  "Personalized lesson plans based on your goals",
  "Practice problems with detailed explanations",
  "Exam preparation strategies",
  "Flexible scheduling options",
  "Follow-up resources after sessions",
];

const SECTIONS = [
  { id: "basic", label: "Basic Info", icon: User },
  { id: "subjects", label: "Subjects", icon: GraduationCap },
  { id: "location", label: "Location", icon: MapPin },
  { id: "style", label: "Teaching Style", icon: Target },
  { id: "benefits", label: "Benefits", icon: Sparkles },
];

// _id is optional — existing subjects from the DB have it, new ones don't
interface Subject {
  code: string;
  name: string;
  _id?: string;
}

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
  delay = 0,
  id,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  children: React.ReactNode;
  delay?: number;
  id?: string;
}) {
  return (
    <motion.div
      id={id}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      className="scroll-mt-24"
    >
      <Card className="border border-border/60 shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg">{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">{children}</CardContent>
      </Card>
    </motion.div>
  );
}

export default function TutorProfileEditPage() {
  const navigate = useNavigate();

  const [bio, setBio] = useState("");
  const [hourlyRate, setHourlyRate] = useState<number | "">("");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectInput, setSubjectInput] = useState("");

  const [location, setLocation] = useState("");
  const [teachingApproach, setTeachingApproach] = useState("");
  const [teachingStyle, setTeachingStyle] = useState("");
  const [studentBenefits, setStudentBenefits] =
    useState<string[]>(DEFAULT_BENEFITS);
  const [customBenefit, setCustomBenefit] = useState("");

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const storedUser = localStorage.getItem("user");
  const user = storedUser ? JSON.parse(storedUser) : null;
  const token = localStorage.getItem("token");

  useEffect(() => {
    if (!user || user.role !== "tutor") {
      navigate("/");
      return;
    }

    const fetchTutorData = async () => {
      try {
        const res = await axios.get(
          `${import.meta.env.VITE_API_URL}/api/tutor/${user._id}/getTutorWithUserId`,
        );
        const data = res.data.tutor;
        if (data) {
          setBio(data.bio || "");
          setHourlyRate(data.hourlyRate || "");
          setSubjects(data.subjects || []);
          setLocation(data.location || "");
          setTeachingApproach(data.teachingApproach || "");
          setTeachingStyle(data.teachingStyle || "");
          setStudentBenefits(data.studentBenefits || DEFAULT_BENEFITS);
        }
      } catch (error) {
        console.error("Failed to load tutor data:", error);
      }
    };

    fetchTutorData();
  }, []);

  if (!user || user.role !== "tutor") {
    return null;
  }

  const handleAddSubject = () => {
    const trimmed = subjectInput.trim();
    if (!trimmed) return;
    if (subjects.find((s) => s.name.toLowerCase() === trimmed.toLowerCase()))
      return;
    // No _id for new subjects — backend assigns one
    setSubjects([...subjects, { code: trimmed, name: trimmed }]);
    setSubjectInput("");
  };

  const handleRemoveSubject = (index: number) => {
    setSubjects(subjects.filter((_, i) => i !== index));
  };

  const addCustomBenefit = () => {
    if (customBenefit.trim()) {
      setStudentBenefits([...studentBenefits, customBenefit.trim()]);
      setCustomBenefit("");
    }
  };

  const removeBenefit = (index: number) => {
    setStudentBenefits(studentBenefits.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const updatedData = new FormData();
      updatedData.append("bio", bio);
      updatedData.append("hourlyRate", hourlyRate.toString());
      updatedData.append("location", location);
      updatedData.append("teachingApproach", teachingApproach);
      updatedData.append("teachingStyle", teachingStyle);
      updatedData.append("studentBenefits", JSON.stringify(studentBenefits));

      // Always strip _id before sending — avoids BSONError on fake temp IDs
      // and lets MongoDB manage ID assignment cleanly on every save.
      const subjectsPayload = subjects.map(({ code, name }) => ({ code, name }));
      updatedData.append("subjects", JSON.stringify(subjectsPayload));

      await axios.put(
        `${import.meta.env.VITE_API_URL}/api/tutor/updateProfile`,
        updatedData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
            Authorization: `Bearer ${token}`,
          },
        },
      );

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        navigate("/tutor/dashboard");
      }, 2000);
    } catch (error: any) {
      console.error("Failed to save:", error);
      alert(error.response?.data?.message || "Failed to save changes");
    } finally {
      setLoading(false);
    }
  };

  const profileFields = [
    bio,
    hourlyRate !== "" ? "rate" : "",
    subjects.length ? "subjects" : "",
    location,
    teachingStyle,
    teachingApproach,
  ];
  const completed = profileFields.filter(Boolean).length;
  const completion = Math.round((completed / profileFields.length) * 100);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Header band */}
      <div className="border-b border-border/60 bg-card">
        <div className="container mx-auto max-w-5xl px-4 py-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/tutor/dashboard")}
            className="mb-4 -ml-2 text-muted-foreground"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>

          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <Badge
                variant="secondary"
                className="mb-3 gap-1.5 bg-primary/10 text-primary hover:bg-primary/10"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Profile Settings
              </Badge>
              <h1 className="text-balance text-3xl font-bold tracking-tight md:text-4xl">
                Edit Tutor Profile
              </h1>
              <p className="mt-2 max-w-lg text-pretty text-muted-foreground">
                Keep your profile fresh and detailed to attract more students
                and stand out in search.
              </p>
            </div>

            {/* Completion meter */}
            <div className="w-full max-w-xs rounded-xl border border-border/60 bg-background p-4">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium">Profile completion</span>
                <span className="font-semibold text-primary">{completion}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${completion}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {completed} of {profileFields.length} key sections filled in
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto max-w-5xl px-4 py-8">
        {/* Success Alert */}
        {success && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            <Alert className="border-primary/30 bg-primary/5">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              <AlertDescription className="font-medium text-foreground">
                Profile updated successfully! Redirecting...
              </AlertDescription>
            </Alert>
          </motion.div>
        )}

        <div className="grid gap-8 lg:grid-cols-[200px_1fr]">
          {/* Section nav */}
          <aside className="hidden lg:block">
            <nav className="sticky top-24 space-y-1">
              {SECTIONS.map((section) => {
                const Icon = section.icon;
                return (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Icon className="h-4 w-4" />
                    {section.label}
                  </a>
                );
              })}
            </nav>
          </aside>

          {/* Form sections */}
          <div className="space-y-6">
            {/* Basic Information */}
            <SectionCard
              id="basic"
              icon={User}
              title="Basic Information"
              description="Update your profile details and bio"
              delay={0.05}
            >
              <div className="space-y-2">
                <Label
                  htmlFor="bio"
                  className="flex items-center gap-2 text-sm font-medium"
                >
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                  Bio
                </Label>
                <Textarea
                  id="bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell students about yourself, your teaching style, and experience..."
                  rows={6}
                  className="resize-none"
                  maxLength={500}
                />
                <p className="text-right text-xs text-muted-foreground">
                  {bio?.length || 0}/500 characters
                </p>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="rate"
                  className="flex items-center gap-2 text-sm font-medium"
                >
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
                  className="h-11"
                />
                <p className="text-xs text-muted-foreground">
                  Recommended: $15-30 per hour based on subject complexity
                </p>
              </div>
            </SectionCard>

            {/* Subjects */}
            <SectionCard
              id="subjects"
              icon={GraduationCap}
              title="Subjects"
              description="Type in the subjects you can tutor — add as many as you like"
              delay={0.1}
            >
              <div className="space-y-2">
                <Label htmlFor="subject" className="text-sm font-medium">
                  Add Subject
                </Label>
                <p className="text-xs text-muted-foreground">
                  Type a subject name and press{" "}
                  <kbd className="rounded border border-border px-1 py-0.5 font-mono text-xs">
                    Enter
                  </kbd>{" "}
                  or click <strong>+</strong>.
                </p>
                <div className="flex gap-2">
                  <Input
                    id="subject"
                    value={subjectInput}
                    onChange={(e) => setSubjectInput(e.target.value)}
                    placeholder="e.g. Linear Algebra, French, Web Development…"
                    className="h-11"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddSubject();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    onClick={handleAddSubject}
                    className="h-11 shrink-0"
                  >
                    <Plus className="h-5 w-5" />
                  </Button>
                </div>
              </div>

              {subjects.length > 0 ? (
                <div className="flex flex-wrap gap-2 rounded-lg border border-border/60 bg-muted/40 p-4">
                  {subjects.map((subject, index) => (
                    <Badge
                      key={index}
                      variant="secondary"
                      className="gap-1.5 px-3 py-1.5 text-sm"
                    >
                      {subject.name}
                      <button
                        type="button"
                        onClick={() => handleRemoveSubject(index)}
                        className="ml-0.5 text-muted-foreground transition-colors hover:text-destructive"
                        aria-label={`Remove ${subject.name}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg bg-muted/40 p-4 text-center text-sm text-muted-foreground">
                  No subjects added yet
                </p>
              )}
            </SectionCard>

            {/* Location */}
            <SectionCard
              id="location"
              icon={MapPin}
              title="Location"
              description="Specify where you prefer to teach"
              delay={0.15}
            >
              <div className="space-y-2">
                <Label htmlFor="location" className="text-sm font-medium">
                  Preferred Teaching Location
                </Label>
                <Input
                  id="location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g., AUB Campus Library, Online via Zoom, or Both"
                  className="h-11"
                />
              </div>
            </SectionCard>

            {/* Teaching Style & Approach */}
            <SectionCard
              id="style"
              icon={Target}
              title="Teaching Style & Approach"
              description="Define your teaching methodology"
              delay={0.2}
            >
              <div className="space-y-3">
                <Label className="text-sm font-medium">Teaching Style</Label>
                <RadioGroup
                  value={teachingStyle}
                  onValueChange={setTeachingStyle}
                  className="space-y-2.5"
                >
                  {TEACHING_STYLES.map((style) => {
                    const active = teachingStyle === style.value;
                    return (
                      <Label
                        key={style.value}
                        htmlFor={`${style.value}-edit`}
                        className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${
                          active
                            ? "border-primary bg-primary/5"
                            : "border-border/60 hover:border-primary/40 hover:bg-muted/40"
                        }`}
                      >
                        <RadioGroupItem
                          value={style.value}
                          id={`${style.value}-edit`}
                          className="mt-0.5"
                        />
                        <div className="flex-1">
                          <div className="font-medium text-foreground">
                            {style.label}
                          </div>
                          <div className="mt-1 text-sm text-muted-foreground">
                            {style.description}
                          </div>
                        </div>
                      </Label>
                    );
                  })}
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label htmlFor="teachingApproach" className="text-sm font-medium">
                  Teaching Approach Description
                </Label>
                <Textarea
                  id="teachingApproach"
                  value={teachingApproach}
                  onChange={(e) => setTeachingApproach(e.target.value)}
                  placeholder="Explain your methodology, how you adapt to different learning styles, and what makes your approach effective..."
                  rows={4}
                  className="resize-none"
                />
              </div>
            </SectionCard>

            {/* Student Benefits */}
            <SectionCard
              id="benefits"
              icon={Sparkles}
              title="What Students Will Get"
              description="List the benefits students receive from your sessions"
              delay={0.25}
            >
              <div className="space-y-2 rounded-lg border border-border/60 bg-muted/40 p-4">
                {studentBenefits.map((benefit, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-3 rounded-md bg-background p-2.5"
                  >
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <span className="flex-1 text-sm">{benefit}</span>
                    <button
                      type="button"
                      onClick={() => removeBenefit(index)}
                      className="text-muted-foreground transition-colors hover:text-destructive"
                      aria-label="Remove benefit"
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
                  className="h-11"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomBenefit();
                    }
                  }}
                />
                <Button
                  type="button"
                  onClick={addCustomBenefit}
                  variant="secondary"
                  className="h-11 shrink-0"
                >
                  <Plus className="h-5 w-5" />
                </Button>
              </div>
            </SectionCard>

            {/* Action Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.3 }}
              className="flex flex-col gap-3 pt-2 sm:flex-row"
            >
              <Button
                onClick={handleSave}
                disabled={loading}
                size="lg"
                className="h-12 flex-1 text-base font-semibold"
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
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
                size="lg"
                onClick={() => navigate("/tutor/dashboard")}
                className="h-12"
              >
                Cancel
              </Button>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}