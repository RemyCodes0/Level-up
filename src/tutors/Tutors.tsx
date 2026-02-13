"use client";

import { useState, useMemo, useEffect } from "react";
import { Navbar } from "@/components/navbar/Navbar";
import { TutorCard } from "@/components/tutor-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Filter,
  Star,
  DollarSign,
  Users,
  TrendingUp,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default function TutorsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSubject, setSelectedSubject] = useState<string>("all");
  const [maxPrice, setMaxPrice] = useState([20]);
  const [minRating, setMinRating] = useState([0]);
  const [tutors, setTutors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const fetchTutors = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/tutor/allTutors`);

        if (!res.ok) {
          throw new Error("Failed to fetch tutors");
        }

        const data = await res.json();
        setTutors(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchTutors();
  }, []);

  const filteredTutors = useMemo(() => {
    return tutors.filter((tutor) => {
      const matchesSearch =
        searchQuery === "" ||
        tutor.user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tutor.subjects.some((subject: any) =>
          subject.name.toLowerCase().includes(searchQuery.toLowerCase()),
        );

      const matchesSubject =
        selectedSubject === "all" ||
        tutor.subjects.some((subject: any) => subject.name === selectedSubject);

      const matchesPrice = tutor.hourlyRate <= maxPrice[0];
      const matchesRating = tutor.averageRating >= minRating[0];

      return matchesSearch && matchesSubject && matchesPrice && matchesRating;
    });
  }, [tutors, searchQuery, selectedSubject, maxPrice, minRating]);

  const allSubjects = useMemo(() => {
    const subjects = new Set<string>();
    tutors.forEach((tutor) => {
      tutor.subjects.forEach((subject: any) => {
        subjects.add(subject.name);
      });
    });
    return Array.from(subjects).sort();
  }, [tutors]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedSubject !== "all") count++;
    if (maxPrice[0] < 20) count++;
    if (minRating[0] > 0) count++;
    return count;
  }, [selectedSubject, maxPrice, minRating]);

  const clearFilters = () => {
    setSelectedSubject("all");
    setMaxPrice([20]);
    setMinRating([0]);
    setSearchQuery("");
  };

  const stats = useMemo(() => {
    return {
      total: tutors.length,
      avgRating:
        tutors.length > 0
          ? (
              tutors.reduce((sum, t) => sum + t.averageRating, 0) /
              tutors.length
            ).toFixed(1)
          : "0.0",
      avgPrice:
        tutors.length > 0
          ? (
              tutors.reduce((sum, t) => sum + t.hourlyRate, 0) / tutors.length
            ).toFixed(2)
          : "0.00",
      subjects: allSubjects.length,
    };
  }, [tutors, allSubjects]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <Navbar />
        <div className="flex items-center justify-center py-20">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-muted-foreground">Loading tutors...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <Navbar />
        <div className="container mx-auto px-4 py-20 text-center">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md mx-auto">
            <p className="text-red-600 font-semibold">Error loading tutors</p>
            <p className="text-red-500 text-sm mt-2">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20">
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        {/* Header Section */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
            Find Your Perfect Tutor
          </h1>
          <p className="text-muted-foreground text-lg">
            Browse verified AUB student tutors across all subjects
          </p>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="p-4 border-0 shadow-md hover:shadow-lg transition-shadow bg-white/80 backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">
                  {stats.total}
                </p>
                <p className="text-xs text-muted-foreground">Total Tutors</p>
              </div>
            </div>
          </Card>

          <Card className="p-4 border-0 shadow-md hover:shadow-lg transition-shadow bg-white/80 backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <Star className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">
                  {stats.avgRating}
                </p>
                <p className="text-xs text-muted-foreground">Avg Rating</p>
              </div>
            </div>
          </Card>

          <Card className="p-4 border-0 shadow-md hover:shadow-lg transition-shadow bg-white/80 backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <DollarSign className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">
                  ${stats.avgPrice}
                </p>
                <p className="text-xs text-muted-foreground">Avg Price/hr</p>
              </div>
            </div>
          </Card>

          <Card className="p-4 border-0 shadow-md hover:shadow-lg transition-shadow bg-white/80 backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <TrendingUp className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">
                  {stats.subjects}
                </p>
                <p className="text-xs text-muted-foreground">Subjects</p>
              </div>
            </div>
          </Card>
        </div>

        <div className="grid lg:grid-cols-4 gap-6">
          {/* Filters Sidebar */}
          <div className="lg:col-span-1">
            <Card className="border-0 shadow-lg sticky top-20 bg-white/80 backdrop-blur">
              <div className="p-6 border-b bg-gradient-to-r from-slate-50 to-blue-50">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Filter className="h-5 w-5 text-primary" />
                    Filters
                  </h2>
                  {activeFiltersCount > 0 && (
                    <Badge
                      variant="secondary"
                      className="bg-primary/10 text-primary"
                    >
                      {activeFiltersCount}
                    </Badge>
                  )}
                </div>
                {activeFiltersCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearFilters}
                    className="text-xs text-muted-foreground hover:text-primary mt-2 p-0 h-auto"
                  >
                    <X className="h-3 w-3 mr-1" />
                    Clear all filters
                  </Button>
                )}
              </div>

              <div className="p-6 space-y-6">
                {/* Search */}
                <div>
                  <Label
                    htmlFor="search"
                    className="text-sm font-semibold mb-3 block"
                  >
                    Search
                  </Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="search"
                      placeholder="Search tutors or subjects"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 border-slate-200 focus:border-primary focus:ring-primary"
                    />
                  </div>
                  {searchQuery && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSearchQuery("")}
                      className="text-xs text-muted-foreground mt-2 p-0 h-auto"
                    >
                      <X className="h-3 w-3 mr-1" />
                      Clear search
                    </Button>
                  )}
                </div>

                {/* Subject Filter */}
                <div>
                  <Label
                    htmlFor="subject"
                    className="text-sm font-semibold mb-3 block"
                  >
                    Subject
                  </Label>
                  <Select
                    value={selectedSubject}
                    onValueChange={setSelectedSubject}
                  >
                    <SelectTrigger
                      id="subject"
                      className="border-slate-200 focus:border-primary focus:ring-primary"
                    >
                      <SelectValue placeholder="All subjects" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All subjects</SelectItem>
                      {allSubjects.map((subject) => (
                        <SelectItem key={subject} value={subject}>
                          {subject}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Price Filter */}
                <div>
                  <Label className="text-sm font-semibold mb-3 block">
                    Max Price:
                    <span className="ml-2 text-primary font-bold">
                      ${maxPrice[0]}/hour
                    </span>
                  </Label>
                  <Slider
                    value={maxPrice}
                    onValueChange={setMaxPrice}
                    max={20}
                    min={10}
                    step={0.5}
                    className="mt-3"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-3">
                    <span className="font-medium">$10</span>
                    <span className="font-medium">$20</span>
                  </div>
                </div>

                {/* Rating Filter */}
                <div>
                  <Label className="text-sm font-semibold mb-3 block">
                    Minimum Rating:
                    <span className="ml-2 text-primary font-bold">
                      {minRating[0].toFixed(1)}{" "}
                      <Star className="inline h-3 w-3 fill-amber-400 text-amber-400" />
                    </span>
                  </Label>
                  <Slider
                    value={minRating}
                    onValueChange={setMinRating}
                    max={5}
                    min={0}
                    step={0.1}
                    className="mt-3"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-3">
                    <span className="font-medium">0</span>
                    <span className="font-medium">5</span>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Tutors Grid */}
          <div className="lg:col-span-3">
            {/* Results Header */}
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  Showing{" "}
                  <span className="font-semibold text-slate-900">
                    {filteredTutors.length}
                  </span>{" "}
                  {filteredTutors.length === 1 ? "tutor" : "tutors"}
                </p>
                {(searchQuery || activeFiltersCount > 0) && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {searchQuery && `Searching for "${searchQuery}"`}
                    {searchQuery && activeFiltersCount > 0 && " with "}
                    {activeFiltersCount > 0 &&
                      `${activeFiltersCount} filter${activeFiltersCount > 1 ? "s" : ""} active`}
                  </p>
                )}
              </div>

              {/* Mobile Filter Toggle */}
              <Button
                variant="outline"
                size="sm"
                className="lg:hidden"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="h-4 w-4 mr-2" />
                Filters
                {activeFiltersCount > 0 && (
                  <Badge
                    variant="secondary"
                    className="ml-2 bg-primary/10 text-primary"
                  >
                    {activeFiltersCount}
                  </Badge>
                )}
              </Button>
            </div>

            {/* Tutors Grid */}
            {filteredTutors.length > 0 ? (
              <div className="grid md:grid-cols-2 gap-6">
                {filteredTutors.map((tutor) => (
                  <TutorCard key={tutor._id} tutor={tutor} />
                ))}
              </div>
            ) : (
              <Card className="border-0 shadow-lg bg-white/80 backdrop-blur">
                <div className="text-center py-16 px-6">
                  <div className="w-20 h-20 bg-gradient-to-br from-slate-100 to-slate-200 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Search className="h-10 w-10 text-slate-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">
                    No tutors found
                  </h3>
                  <p className="text-muted-foreground mb-4">
                    We couldn't find any tutors matching your criteria.
                  </p>
                  <Button onClick={clearFilters} variant="outline">
                    <X className="h-4 w-4 mr-2" />
                    Clear all filters
                  </Button>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
