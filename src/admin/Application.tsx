"use client";

import { useAuth } from "@/lib/auth-context";
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
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TutorApplication } from "@/lib/types";
import {
  CheckCircle2,
  XCircle,
  Mail,
  Calendar,
  Clock,
  DollarSign,
  BookOpen,
  User,
  ArrowLeft,
  AlertCircle,
  GraduationCap,
  Layers,
} from "lucide-react";
import axios from "axios";

export default function AdminApplicationsPage() {
  const { user } = useAuth();
  const router = useNavigate();
  const [applications, setApplications] = useState<TutorApplication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    const fetchApplications = async () => {
      setIsLoading(true);
      try {
        const res = await axios.get(
          `${import.meta.env.VITE_API_URL}/api/tutor/applications`,
        );
        setApplications(res.data);
      } catch (error) {
        console.error("Error fetching applications:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchApplications();
  }, []);

  const handleApprove = async (appId: string) => {
    setProcessingId(appId);
    try {
      await axios.patch(
        `${import.meta.env.VITE_API_URL}/api/tutor/${appId}/approve`,
      );
      setApplications(
        applications.map((app) =>
          app._id === appId
            ? {
                ...app,
                status: "approved" as const,
                reviewedAt: new Date(),
                reviewedBy: user._id,
              }
            : app,
        ),
      );
    } catch (error) {
      console.error("Error approving application:", error);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (appId: string) => {
    setProcessingId(appId);
    try {
      await axios.patch(
        `${import.meta.env.VITE_API_URL}/api/tutor/${appId}/reject`,
      );
      setApplications(
        applications.map((app) =>
          app._id === appId
            ? {
                ...app,
                status: "rejected" as const,
                reviewedAt: new Date(),
                reviewedBy: user._id,
              }
            : app,
        ),
      );
    } catch (error) {
      console.error("Error rejecting application:", error);
    } finally {
      setProcessingId(null);
    }
  };

  const pendingApps  = applications.filter((app) => app.status === "pending");
  const approvedApps = applications.filter((app) => app.status === "approved");
  const rejectedApps = applications.filter((app) => app.status === "rejected");

  const getStatusColor = (status: string) => {
    switch (status) {
      case "approved": return "bg-emerald-100 text-emerald-700 border-emerald-200";
      case "pending":  return "bg-amber-100 text-amber-700 border-amber-200";
      case "rejected": return "bg-red-100 text-red-700 border-red-200";
      default:         return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  const ApplicationCard = ({
    app,
    index,
  }: {
    app: TutorApplication;
    index: number;
  }) => (
    <Card
      className="border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden"
      style={{
        animation: "fadeUp 0.25s ease both",
        animationDelay: `${index * 50}ms`,
      }}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          {/* Avatar + info */}
          <div className="flex items-center gap-3">
            <div className="relative flex-shrink-0">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
                {app.user.name.charAt(0)}
              </div>
              <span
                className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${
                  app.status === "approved"
                    ? "bg-emerald-500"
                    : app.status === "rejected"
                    ? "bg-red-400"
                    : "bg-amber-400"
                }`}
              />
            </div>
            <div>
              <CardTitle className="text-base font-semibold text-gray-900 leading-tight">
                {app.user.name}
              </CardTitle>
              <CardDescription className="flex items-center gap-1.5 mt-0.5 text-xs">
                <Mail className="h-3 w-3" />
                {app.user.email}
              </CardDescription>
            </div>
          </div>

          <Badge
            className={`${getStatusColor(app.status)} border text-xs font-semibold px-2.5 py-0.5 rounded-full flex-shrink-0`}
          >
            {app.status.charAt(0).toUpperCase() + app.status.slice(1)}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        <div className="h-px bg-gray-100" />

        {/* Bio */}
        <div>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest flex items-center gap-1.5 mb-2">
            <User className="h-3 w-3" /> About
          </p>
          <p className="text-sm text-gray-600 leading-relaxed bg-gray-50 rounded-lg px-3.5 py-3 border border-gray-100">
            {app.bio}
          </p>
        </div>

        {/* Subjects */}
        <div>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest flex items-center gap-1.5 mb-2">
            <BookOpen className="h-3 w-3" /> Subjects
          </p>
          <div className="flex flex-wrap gap-1.5">
            {app.subjects.map((subject) => (
              <span
                key={subject.code}
                className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-100 rounded-lg px-2.5 py-1 text-xs font-medium hover:bg-blue-100 transition-colors duration-150 cursor-default"
              >
                <span className="font-semibold">{subject.code}</span>
                <span className="text-blue-300">·</span>
                {subject.name}
              </span>
            ))}
          </div>
        </div>

        {/* Meta row */}
        <div className="flex items-center justify-between pt-1 border-t border-gray-100">
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Calendar className="h-3.5 w-3.5" />
            Applied{" "}
            {app.createdAt
              ? new Date(app.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : "—"}
          </div>
          <div className="flex items-center gap-0.5 text-emerald-600 font-bold text-base">
            <DollarSign className="h-4 w-4" />
            {app.hourlyRate}
            <span className="text-xs font-normal text-gray-400 ml-0.5">/hr</span>
          </div>
        </div>

        {/* Action buttons */}
        {app.status === "pending" && (
          <div className="flex gap-2.5">
            <Button
              onClick={() => handleApprove(app._id)}
              disabled={processingId === app._id}
              size="sm"
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm hover:shadow-md transition-all duration-200 h-9 text-xs font-semibold rounded-lg"
            >
              {processingId === app._id ? (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin mr-1.5" />
              ) : (
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              )}
              Approve
            </Button>
            <Button
              onClick={() => handleReject(app._id)}
              disabled={processingId === app._id}
              size="sm"
              variant="destructive"
              className="flex-1 shadow-sm hover:shadow-md transition-all duration-200 h-9 text-xs font-semibold rounded-lg"
            >
              {processingId === app._id ? (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin mr-1.5" />
              ) : (
                <XCircle className="mr-1.5 h-3.5 w-3.5" />
              )}
              Reject
            </Button>
          </div>
        )}

        {/* Reviewed timestamp */}
        {app.status !== "pending" && app.reviewedAt && (
          <div className="flex items-center gap-1.5 text-xs text-gray-400 pt-1 border-t border-gray-100">
            <Clock className="h-3 w-3" />
            Reviewed on{" "}
            {new Date(app.reviewedAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );

  const EmptyState = ({
    icon,
    title,
    sub,
  }: {
    icon: React.ReactNode;
    title: string;
    sub: string;
  }) => (
    <div className="flex flex-col items-center justify-center py-16 gap-3 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/60 text-center">
      <div className="text-gray-300">{icon}</div>
      <p className="font-semibold text-gray-500">{title}</p>
      <p className="text-sm text-gray-400">{sub}</p>
    </div>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <Navbar />
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-96">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-[3px] border-blue-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-gray-500 text-sm font-medium">Loading applications…</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-indigo-50/30 to-blue-50/30">
        <Navbar />
        <div className="container mx-auto px-4 py-8 max-w-4xl">

          {/* Back */}
          <Button
            variant="ghost"
            onClick={() => router("/admin/dashboard")}
            className="mb-6 text-gray-500 hover:text-gray-800 hover:bg-white hover:shadow-sm transition-all duration-200 rounded-lg text-sm"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>

          {/* Header */}
          <div className="mb-8 flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-white rounded-xl shadow-sm border border-gray-200 mt-0.5">
                <GraduationCap className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 tracking-tight leading-tight">
                  Tutor Applications
                </h1>
                <p className="text-gray-500 mt-1 text-sm">
                  Review and manage tutor applications
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 bg-white rounded-xl border border-gray-200 shadow-sm px-3 py-2 text-xs text-gray-500 font-medium">
              <Layers className="h-3.5 w-3.5 text-indigo-400" />
              {applications.length} total
            </div>
          </div>

          {/* Stats */}
          <div className="grid md:grid-cols-3 gap-4 mb-6">
            {[
              {
                label: "Pending Review",
                value: pendingApps.length,
                sub: pendingApps.length > 0 ? "Needs attention" : "All caught up!",
                iconBg: "bg-amber-50",
                iconColor: "text-amber-500",
                valueColor: "text-amber-600",
                border: "hover:border-amber-200",
                icon: <Clock className="h-4.5 w-4.5" />,
              },
              {
                label: "Approved",
                value: approvedApps.length,
                sub: "Active tutors",
                iconBg: "bg-emerald-50",
                iconColor: "text-emerald-500",
                valueColor: "text-emerald-600",
                border: "hover:border-emerald-200",
                icon: <CheckCircle2 className="h-4.5 w-4.5" />,
              },
              {
                label: "Rejected",
                value: rejectedApps.length,
                sub: "Not qualified",
                iconBg: "bg-red-50",
                iconColor: "text-red-400",
                valueColor: "text-red-500",
                border: "hover:border-red-200",
                icon: <XCircle className="h-4.5 w-4.5" />,
              },
            ].map((s) => (
              <Card
                key={s.label}
                className={`border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 ${s.border}`}
              >
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">
                      {s.label}
                    </p>
                    <div className={`p-1.5 rounded-lg ${s.iconBg} ${s.iconColor}`}>
                      {s.icon}
                    </div>
                  </div>
                  <div className={`text-3xl font-bold ${s.valueColor} leading-none mb-1`}>
                    {s.value}
                  </div>
                  <p className="text-xs text-gray-400">{s.sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Alert Banner */}
          {pendingApps.length > 0 && (
            <div className="mb-6 flex items-center gap-4 bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
              <div className="p-2 bg-amber-100 rounded-lg flex-shrink-0">
                <AlertCircle className="h-4.5 w-4.5 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 text-sm">
                  {pendingApps.length} Application
                  {pendingApps.length !== 1 ? "s" : ""} Awaiting Review
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Review applications to approve qualified tutors and grow your platform.
                </p>
              </div>
              <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full flex-shrink-0 border border-amber-200">
                {pendingApps.length} pending
              </span>
            </div>
          )}

          {/* Tabs */}
          <Card className="border border-gray-200 shadow-sm">
            <CardContent className="p-6">
              <Tabs defaultValue="pending" className="space-y-5">
                <TabsList className="grid w-full grid-cols-3 bg-gray-100 p-1 rounded-xl h-auto gap-1">
                  {[
                    { value: "pending",  label: "Pending",  count: pendingApps.length,  icon: <Clock className="h-3.5 w-3.5" /> },
                    { value: "approved", label: "Approved", count: approvedApps.length, icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
                    { value: "rejected", label: "Rejected", count: rejectedApps.length, icon: <XCircle className="h-3.5 w-3.5" /> },
                  ].map((t) => (
                    <TabsTrigger
                      key={t.value}
                      value={t.value}
                      className="flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm transition-all duration-150"
                    >
                      {t.icon}
                      {t.label}
                      <span className="ml-0.5 bg-gray-200 text-gray-600 rounded-full px-1.5 py-0.5 text-[10px] font-bold data-[state=active]:bg-indigo-100 data-[state=active]:text-indigo-700">
                        {t.count}
                      </span>
                    </TabsTrigger>
                  ))}
                </TabsList>

                <TabsContent value="pending" className="space-y-3 mt-0">
                  {pendingApps.length === 0 ? (
                    <EmptyState
                      icon={<CheckCircle2 className="h-12 w-12" />}
                      title="No pending applications"
                      sub="All applications have been reviewed"
                    />
                  ) : (
                    pendingApps.map((app, i) => (
                      <ApplicationCard key={app._id} app={app} index={i} />
                    ))
                  )}
                </TabsContent>

                <TabsContent value="approved" className="space-y-3 mt-0">
                  {approvedApps.length === 0 ? (
                    <EmptyState
                      icon={<CheckCircle2 className="h-12 w-12" />}
                      title="No approved applications yet"
                      sub="Approved tutors will appear here"
                    />
                  ) : (
                    approvedApps.map((app, i) => (
                      <ApplicationCard key={app._id} app={app} index={i} />
                    ))
                  )}
                </TabsContent>

                <TabsContent value="rejected" className="space-y-3 mt-0">
                  {rejectedApps.length === 0 ? (
                    <EmptyState
                      icon={<XCircle className="h-12 w-12" />}
                      title="No rejected applications"
                      sub="Rejected applications will appear here"
                    />
                  ) : (
                    rejectedApps.map((app, i) => (
                      <ApplicationCard key={app._id} app={app} index={i} />
                    ))
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

        </div>
      </div>
    </>
  );
}