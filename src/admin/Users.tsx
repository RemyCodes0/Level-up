"use client";

import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Navbar } from "@/components/navbar/Navbar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Mail, MoreVertical, Users, GraduationCap, BookOpen, ArrowLeft, UserCircle2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import axios from "axios";

type User = {
  _id: string;
  name: string;
  email: string;
  role: "admin" | "tutor" | "both" | "learner";
  avatarUrl?: string;
};

const getRoleStyle = (role: string) => {
  switch (role) {
    case "tutor":  return "bg-blue-50 text-blue-700 border border-blue-100";
    case "both":   return "bg-indigo-50 text-indigo-700 border border-indigo-100";
    case "admin":  return "bg-purple-50 text-purple-700 border border-purple-100";
    case "learner":return "bg-emerald-50 text-emerald-700 border border-emerald-100";
    default:       return "bg-gray-100 text-gray-600 border border-gray-200";
  }
};

export default function AdminUsersPage() {
  const [user, setUser] = useState(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const router = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) setUser(JSON.parse(storedUser));
  }, []);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/auth/getUsers`);
        setAllUsers(res.data.user);
      } catch (err) {
        console.error(err);
      }
    };
    fetchUsers();
  }, []);

  const filteredUsers = allUsers.filter(
    (u) =>
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const tutors   = filteredUsers.filter((u) => u.role === "tutor" || u.role === "both");
  const learners = filteredUsers.filter((u) => u.role === "learner");

  const UserCard = ({ userData, index }: { userData: User; index: number }) => (
    <Card
      className="border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden"
      style={{ animation: "fadeUp 0.25s ease both", animationDelay: `${index * 40}ms` }}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar className="h-10 w-10 rounded-xl border border-gray-200 shadow-sm flex-shrink-0">
              <AvatarImage src={userData.avatarUrl || "/placeholder.svg"} alt={userData.name} />
              <AvatarFallback className="rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-semibold text-sm">
                {userData.name.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="font-semibold text-gray-900 text-sm leading-tight truncate">
                {userData.name}
              </div>
              <div className="text-xs text-gray-400 flex items-center gap-1 mt-0.5 truncate">
                <Mail className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{userData.email}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full capitalize ${getRoleStyle(userData.role)}`}>
              {userData.role}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="text-sm">
                <DropdownMenuItem>View Profile</DropdownMenuItem>
                <DropdownMenuItem>Send Message</DropdownMenuItem>
                <DropdownMenuItem className="text-destructive">Delete User</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const EmptyState = ({ label }: { label: string }) => (
    <div className="flex flex-col items-center justify-center py-16 gap-3 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/60 text-center">
      <UserCircle2 className="h-12 w-12 text-gray-300" />
      <p className="font-semibold text-gray-500">No {label} found</p>
      <p className="text-sm text-gray-400">
        {searchQuery ? "Try a different search term" : `${label} will appear here`}
      </p>
    </div>
  );

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
          <div className="mb-8 flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-white rounded-xl shadow-sm border border-gray-200 mt-0.5">
                <Users className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 tracking-tight leading-tight">
                  User Management
                </h1>
                <p className="text-gray-500 mt-1 text-sm">
                  Search, filter, and manage all platform users
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 bg-white rounded-xl border border-gray-200 shadow-sm px-3 py-2 text-xs text-gray-500 font-medium flex-shrink-0">
              <Users className="h-3.5 w-3.5 text-indigo-400" />
              {allUsers.length} total
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              { label: "All Users", value: allUsers.length, icon: <Users className="h-4 w-4" />, iconBg: "bg-indigo-50", iconColor: "text-indigo-500", valueColor: "text-indigo-600", border: "hover:border-indigo-200" },
              { label: "Tutors",    value: tutors.length,   icon: <GraduationCap className="h-4 w-4" />, iconBg: "bg-blue-50",   iconColor: "text-blue-500",   valueColor: "text-blue-600",   border: "hover:border-blue-200" },
              { label: "Learners",  value: learners.length, icon: <BookOpen className="h-4 w-4" />,      iconBg: "bg-emerald-50", iconColor: "text-emerald-500", valueColor: "text-emerald-600", border: "hover:border-emerald-200" },
            ].map((s) => (
              <Card key={s.label} className={`border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 ${s.border}`}>
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">{s.label}</p>
                    <div className={`p-1.5 rounded-lg ${s.iconBg} ${s.iconColor}`}>{s.icon}</div>
                  </div>
                  <div className={`text-3xl font-bold ${s.valueColor} leading-none mb-1`}>{s.value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Search */}
          <div className="relative mb-6">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <Input
              placeholder="Search by name or email…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-10 bg-white border-gray-200 shadow-sm rounded-xl text-sm placeholder:text-gray-400 focus-visible:ring-indigo-300"
            />
          </div>

          {/* Tabs */}
          <Card className="border border-gray-200 shadow-sm">
            <CardContent className="p-6">
              <Tabs defaultValue="all" className="space-y-5">
                <TabsList className="grid w-full grid-cols-3 bg-gray-100 p-1 rounded-xl h-auto gap-1">
                  {[
                    { value: "all",      label: "All Users", count: filteredUsers.length, icon: <Users className="h-3.5 w-3.5" /> },
                    { value: "tutors",   label: "Tutors",    count: tutors.length,         icon: <GraduationCap className="h-3.5 w-3.5" /> },
                    { value: "learners", label: "Learners",  count: learners.length,        icon: <BookOpen className="h-3.5 w-3.5" /> },
                  ].map((t) => (
                    <TabsTrigger
                      key={t.value}
                      value={t.value}
                      className="flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm transition-all duration-150"
                    >
                      {t.icon}
                      {t.label}
                      <span className="ml-0.5 bg-gray-200 text-gray-600 rounded-full px-1.5 py-0.5 text-[10px] font-bold">
                        {t.count}
                      </span>
                    </TabsTrigger>
                  ))}
                </TabsList>

                <TabsContent value="all" className="space-y-2.5 mt-0">
                  {filteredUsers.length === 0 ? (
                    <EmptyState label="users" />
                  ) : (
                    filteredUsers.map((u, i) => <UserCard key={u._id} userData={u} index={i} />)
                  )}
                </TabsContent>

                <TabsContent value="tutors" className="space-y-2.5 mt-0">
                  {tutors.length === 0 ? (
                    <EmptyState label="tutors" />
                  ) : (
                    tutors.map((u, i) => <UserCard key={u._id} userData={u} index={i} />)
                  )}
                </TabsContent>

                <TabsContent value="learners" className="space-y-2.5 mt-0">
                  {learners.length === 0 ? (
                    <EmptyState label="learners" />
                  ) : (
                    learners.map((u, i) => <UserCard key={u._id} userData={u} index={i} />)
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