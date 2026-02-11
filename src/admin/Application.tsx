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
  TrendingUp,
  AlertCircle,
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
          "http://localhost:5000/api/tutor/applications"
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
      const res = await axios.patch(
        `http://localhost:5000/api/tutor/${appId}/approve`
      );
      const data = res.data;
      setApplications(
        applications.map((app) =>
          app._id === appId
            ? {
                ...app,
                status: "approved" as const,
                reviewedAt: new Date(),
                reviewedBy: user._id,
              }
            : app
        )
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
      const res = await axios.patch(
        `http://localhost:5000/api/tutor/${appId}/reject`
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
            : app
        )
      );
    } catch (error) {
      console.error("Error rejecting application:", error);
    } finally {
      setProcessingId(null);
    }
  };

  const pendingApps = applications.filter((app) => app.status === "pending");
  const approvedApps = applications.filter((app) => app.status === "approved");
  const rejectedApps = applications.filter((app) => app.status === "rejected");

  const getStatusColor = (status: string) => {
    switch (status) {
      case "approved":
        return "bg-emerald-100 text-emerald-700 border-emerald-200";
      case "pending":
        return "bg-amber-100 text-amber-700 border-amber-200";
      case "rejected":
        return "bg-red-100 text-red-700 border-red-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  const ApplicationCard = ({ app }: { app: TutorApplication }) => (
    <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden group">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      <CardHeader className="relative">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-xl flex-shrink-0 shadow-md">
              {app.user.name.charAt(0)}
            </div>

            {/* User Info */}
            <div>
              <CardTitle className="text-xl mb-1">{app.user.name}</CardTitle>
              <CardDescription className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5" />
                {app.user.email}
              </CardDescription>
            </div>
          </div>

          {/* Status Badge */}
          <Badge className={`${getStatusColor(app.status)} border font-medium`}>
            {app.status}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 relative">
        {/* Bio Section */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <User className="h-4 w-4 text-gray-600" />
            <h4 className="font-semibold text-gray-900">Bio</h4>
          </div>
          <p className="text-sm text-gray-700 leading-relaxed">{app.bio}</p>
        </div>

        {/* Subjects Section */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="h-4 w-4 text-gray-600" />
            <h4 className="font-semibold text-gray-900">Subjects</h4>
          </div>
          <div className="flex flex-wrap gap-2">
            {app.subjects.map((subject, index) => (
              <Badge
                key={subject.code}
                variant="outline"
                className="bg-white border-2 border-blue-100 text-blue-700 hover:bg-blue-50 font-medium"
              >
                {subject.code} - {subject.name}
              </Badge>
            ))}
          </div>
        </div>

        {/* Info Bar */}
        <div className="flex items-center justify-between pt-2 border-t-2 border-gray-100">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Calendar className="h-4 w-4" />
            <span>
              Applied{" "}
              {app.createdAt
                ? new Date(app.createdAt).toLocaleDateString()
                : "unknown"}
            </span>
          </div>
          <div className="flex items-center gap-1.5 font-bold text-lg text-emerald-600">
            <DollarSign className="h-5 w-5" />
            <span>{app.hourlyRate}/hr</span>
          </div>
        </div>

        {/* Action Buttons */}
        {app.status === "pending" && (
          <div className="flex gap-3 pt-2">
            <Button
              onClick={() => handleApprove(app._id)}
              disabled={processingId === app._id}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 shadow-md hover:shadow-lg transition-all duration-200"
            >
              {processingId === app._id ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              Approve
            </Button>
            <Button
              onClick={() => handleReject(app._id)}
              disabled={processingId === app._id}
              variant="destructive"
              className="flex-1 shadow-md hover:shadow-lg transition-all duration-200"
            >
              {processingId === app._id ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
              ) : (
                <XCircle className="mr-2 h-4 w-4" />
              )}
              Reject
            </Button>
          </div>
        )}

        {/* Reviewed Status */}
        {app.status !== "pending" && app.reviewedAt && (
          <div className="flex items-center gap-2 text-xs text-gray-500 pt-2 border-t border-gray-100">
            <Clock className="h-3 w-3" />
            <span>
              Reviewed on {new Date(app.reviewedAt).toLocaleDateString()}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <Navbar />
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-96">
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-gray-600 font-medium">
                Loading applications...
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-indigo-50/30 to-blue-50/30">
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        {/* Back Button */}
        <Button
          variant="ghost"
          onClick={() => router("/admin/dashboard")}
          className="mb-6 hover:bg-white hover:shadow-md transition-all duration-200"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>

        {/* Header Section */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 via-indigo-800 to-blue-800 bg-clip-text text-transparent mb-2">
            Tutor Applications
          </h1>
          <p className="text-gray-600 text-lg">
            Review and manage tutor applications
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Pending Review
              </CardTitle>
              <div className="p-2 bg-amber-100 rounded-lg">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900">
                {pendingApps.length}
              </div>
              <p className="text-xs text-gray-600 mt-1">
                {pendingApps.length > 0
                  ? "Needs attention"
                  : "All caught up!"}
              </p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Approved
              </CardTitle>
              <div className="p-2 bg-emerald-100 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900">
                {approvedApps.length}
              </div>
              <p className="text-xs text-gray-600 mt-1">Active tutors</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Rejected
              </CardTitle>
              <div className="p-2 bg-red-100 rounded-lg">
                <XCircle className="h-5 w-5 text-red-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900">
                {rejectedApps.length}
              </div>
              <p className="text-xs text-gray-600 mt-1">Not qualified</p>
            </CardContent>
          </Card>
        </div>

        {/* Pending Alert Banner */}
        {pendingApps.length > 0 && (
          <Card className="mb-8 border-2 border-amber-500 bg-gradient-to-r from-amber-50 to-orange-50 shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-amber-100 rounded-full">
                  <AlertCircle className="h-6 w-6 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg text-gray-900">
                    {pendingApps.length} Application
                    {pendingApps.length !== 1 ? "s" : ""} Awaiting Review
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Review applications to approve qualified tutors and grow
                    your platform
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Applications Tabs */}
        <Card className="border-0 shadow-lg">
          <CardContent className="p-6">
            <Tabs defaultValue="pending" className="space-y-6">
              <TabsList className="grid w-full grid-cols-3 bg-gray-100 p-1 rounded-lg">
                <TabsTrigger
                  value="pending"
                  className="data-[state=active]:bg-white data-[state=active]:shadow-sm"
                >
                  <Clock className="h-4 w-4 mr-2" />
                  Pending ({pendingApps.length})
                </TabsTrigger>
                <TabsTrigger
                  value="approved"
                  className="data-[state=active]:bg-white data-[state=active]:shadow-sm"
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Approved ({approvedApps.length})
                </TabsTrigger>
                <TabsTrigger
                  value="rejected"
                  className="data-[state=active]:bg-white data-[state=active]:shadow-sm"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Rejected ({rejectedApps.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="pending" className="space-y-4">
                {pendingApps.length === 0 ? (
                  <Card className="border-2 border-dashed border-gray-200">
                    <CardContent className="py-12 text-center">
                      <CheckCircle2 className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500 font-medium">
                        No pending applications
                      </p>
                      <p className="text-sm text-gray-400 mt-1">
                        All applications have been reviewed
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  pendingApps.map((app) => (
                    <ApplicationCard key={app._id} app={app} />
                  ))
                )}
              </TabsContent>

              <TabsContent value="approved" className="space-y-4">
                {approvedApps.length === 0 ? (
                  <Card className="border-2 border-dashed border-gray-200">
                    <CardContent className="py-12 text-center">
                      <CheckCircle2 className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500 font-medium">
                        No approved applications yet
                      </p>
                      <p className="text-sm text-gray-400 mt-1">
                        Approved tutors will appear here
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  approvedApps.map((app) => (
                    <ApplicationCard key={app._id} app={app} />
                  ))
                )}
              </TabsContent>

              <TabsContent value="rejected" className="space-y-4">
                {rejectedApps.length === 0 ? (
                  <Card className="border-2 border-dashed border-gray-200">
                    <CardContent className="py-12 text-center">
                      <XCircle className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500 font-medium">
                        No rejected applications
                      </p>
                      <p className="text-sm text-gray-400 mt-1">
                        Rejected applications will appear here
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  rejectedApps.map((app) => (
                    <ApplicationCard key={app._id} app={app} />
                  ))
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}