"use client"

import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { 
  Menu, 
  MessageCircle, 
  LogOut, 
  User as UserIcon,
  LayoutDashboard,
  BookOpen,
  Settings,
  GraduationCap,
  Shield,
  Users,
  FileText,
  Calendar,
  Sparkles
} from "lucide-react"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { useEffect, useState } from "react"

export function Navbar() {
  const [unreadCount, setUnreadCount] = useState(0)
  const [scrolled, setScrolled] = useState(false)
  
  type User = {
    role: "admin" | "tutor" | "both" | "learner"
    name: string
    email: string
    avatarUrl?: string
  }
  
  const [user, setUser] = useState<User | null>(null)
  const { signOut } = useAuth()

  useEffect(() => {
    const storedUser = localStorage.getItem("user")
    if (storedUser) {
      setUser(JSON.parse(storedUser))
    }
  }, [])

  useEffect(() => {
    if (!user) return
    const conversations = JSON.parse(localStorage.getItem("levelup_conversations") || "[]")
    const total = conversations.reduce((sum: number, conv: any) => sum + (conv.unreadCount || 0), 0)
    setUnreadCount(total)
  }, [user])

  // Scroll effect
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10)
    }
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  const getRoleBadge = (role: string) => {
    const badges = {
      admin: { color: "bg-red-100 text-red-700", icon: Shield, label: "Admin" },
      tutor: { color: "bg-blue-100 text-blue-700", icon: GraduationCap, label: "Tutor" },
      both: { color: "bg-purple-100 text-purple-700", icon: Sparkles, label: "Tutor" },
      learner: { color: "bg-green-100 text-green-700", icon: BookOpen, label: "Learner" },
    }
    return badges[role as keyof typeof badges] || badges.learner
  }

  const NavLinks = () => (
    <>
      <a 
        href="/tutors" 
        className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors relative group"
      >
        Find Tutors
        <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-blue-600 to-purple-600 group-hover:w-full transition-all duration-300" />
      </a>
      <a 
        href="/dashboard" 
        className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors relative group"
      >
        Dashboard
        <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-blue-600 to-purple-600 group-hover:w-full transition-all duration-300" />
      </a>
      {(user?.role === "tutor" || user?.role === "both") && (
        <a 
          href="/tutor/dashboard" 
          className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors relative group"
        >
          Tutor Dashboard
          <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-blue-600 to-purple-600 group-hover:w-full transition-all duration-300" />
        </a>
      )}
      {(user?.role !== "tutor") && (
        <a 
          href="/apply" 
          className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors relative group"
        >
          Apply to become a tutor
          <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-blue-600 to-purple-600 group-hover:w-full transition-all duration-300" />
        </a>
      )}
      {user?.role === "admin" && (
        <a 
          href="/admin/dashboard" 
          className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors relative group"
        >
          Admin Panel
          <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-blue-600 to-purple-600 group-hover:w-full transition-all duration-300" />
        </a>
      )}
    </>
  )

  const roleBadge = user ? getRoleBadge(user.role) : null
  const RoleBadgeIcon = roleBadge?.icon

  return (
    <nav 
      className={`border-b sticky top-0 z-50 transition-all duration-300 ${
        scrolled 
          ? "bg-white/80 backdrop-blur-xl shadow-md" 
          : "bg-white/95 backdrop-blur-sm"
      }`}
    >
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <a href="/" className="flex items-center gap-3 group">
          <div className="relative">
            <div className="bg-gradient-to-br from-blue-600 to-purple-600 p-2 rounded-xl shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-105">
              <img 
                src="/logo.png" 
                alt="Level Up Logo" 
                className="h-8 w-8 object-cover rounded-lg"
              />
            </div>
            {/* Pulse effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl opacity-0 group-hover:opacity-20 blur-md transition-opacity duration-300" />
          </div>
          <span className="font-bold text-xl bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Level Up
          </span>
        </a>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-8">
          <NavLinks />
        </div>

        {/* Right Side Actions */}
        <div className="flex items-center gap-3">
          {/* Messages Button (commented out but styled for future use) */}
          {/* {user && (
            <a href="/messages">
              <Button 
                variant="ghost" 
                size="icon" 
                className="relative hover:bg-blue-50 hover:text-blue-600 transition-colors"
              >
                <MessageCircle className="h-5 w-5" />
                {unreadCount > 0 && (
                  <Badge
                    className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs bg-red-500 hover:bg-red-600 border-2 border-white"
                  >
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </Badge>
                )}
              </Button>
            </a>
          )} */}

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  className="relative h-10 w-auto rounded-full pl-2 pr-3 hover:bg-gray-100 transition-all"
                >
                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8 ring-2 ring-offset-2 ring-blue-500">
                      <AvatarImage src={user.avatarUrl || "/placeholder.svg"} alt={user.name} />
                      <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white font-semibold">
                        {user.name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="hidden lg:block text-left">
                      <p className="text-sm font-semibold text-gray-900">
                        {user.name.split(' ')[0]}
                      </p>
                    </div>
                  </div>
                </Button>
              </DropdownMenuTrigger>
              
              <DropdownMenuContent 
                align="end" 
                className="w-72 p-2 shadow-xl border-0 bg-white/95 backdrop-blur-sm"
              >
                <DropdownMenuLabel className="p-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12 ring-2 ring-offset-2 ring-blue-500">
                      <AvatarImage src={user.avatarUrl || "/placeholder.svg"} alt={user.name} />
                      <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white font-bold text-lg">
                        {user.name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {user.name}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {user.email}
                      </p>
                      {roleBadge && RoleBadgeIcon && (
                        <Badge className={`${roleBadge.color} mt-1.5 text-xs border-0`}>
                          <RoleBadgeIcon className="h-3 w-3 mr-1" />
                          {roleBadge.label}
                        </Badge>
                      )}
                    </div>
                  </div>
                </DropdownMenuLabel>
                
                <DropdownMenuSeparator className="my-2" />

                {user.role === "admin" ? (
                  <>
                    <DropdownMenuItem asChild className="cursor-pointer rounded-md hover:bg-blue-50">
                      <a href="/admin/dashboard" className="flex items-center gap-2 px-2 py-2">
                        <LayoutDashboard className="h-4 w-4 text-blue-600" />
                        <span className="font-medium">Admin Dashboard</span>
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild className="cursor-pointer rounded-md hover:bg-blue-50">
                      <a href="/admin/users" className="flex items-center gap-2 px-2 py-2">
                        <Users className="h-4 w-4 text-purple-600" />
                        <span className="font-medium">Manage Users</span>
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild className="cursor-pointer rounded-md hover:bg-blue-50">
                      <a href="/admin/applications" className="flex items-center gap-2 px-2 py-2">
                        <FileText className="h-4 w-4 text-emerald-600" />
                        <span className="font-medium">Applications</span>
                      </a>
                    </DropdownMenuItem>
                  </>
                ) : user.role === "tutor" || user.role === "both" ? (
                  <>
                    <DropdownMenuItem asChild className="cursor-pointer rounded-md hover:bg-blue-50">
                      <a href="/tutor/dashboard" className="flex items-center gap-2 px-2 py-2">
                        <LayoutDashboard className="h-4 w-4 text-blue-600" />
                        <span className="font-medium">Tutor Dashboard</span>
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild className="cursor-pointer rounded-md hover:bg-blue-50">
                      <a href="/tutor/profile" className="flex items-center gap-2 px-2 py-2">
                        <UserIcon className="h-4 w-4 text-purple-600" />
                        <span className="font-medium">Edit Profile</span>
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild className="cursor-pointer rounded-md hover:bg-blue-50">
                      <a href="/tutor/sessions" className="flex items-center gap-2 px-2 py-2">
                        <Calendar className="h-4 w-4 text-emerald-600" />
                        <span className="font-medium">My Sessions</span>
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="my-2" />
                    <DropdownMenuItem asChild className="cursor-pointer rounded-md hover:bg-blue-50">
                      <a href="/dashboard" className="flex items-center gap-2 px-2 py-2">
                        <BookOpen className="h-4 w-4 text-orange-600" />
                        <span className="font-medium">Learner Dashboard</span>
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild className="cursor-pointer rounded-md hover:bg-blue-50">
                      <a href="/bookings" className="flex items-center gap-2 px-2 py-2">
                        <Calendar className="h-4 w-4 text-pink-600" />
                        <span className="font-medium">My Bookings</span>
                      </a>
                    </DropdownMenuItem>
                  </>
                ) : (
                  <>
                    <DropdownMenuItem asChild className="cursor-pointer rounded-md hover:bg-blue-50">
                      <a href="/dashboard" className="flex items-center gap-2 px-2 py-2">
                        <LayoutDashboard className="h-4 w-4 text-blue-600" />
                        <span className="font-medium">Dashboard</span>
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild className="cursor-pointer rounded-md hover:bg-blue-50">
                      <a href="/profile" className="flex items-center gap-2 px-2 py-2">
                        <UserIcon className="h-4 w-4 text-purple-600" />
                        <span className="font-medium">Profile</span>
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild className="cursor-pointer rounded-md hover:bg-blue-50">
                      <a href="/bookings" className="flex items-center gap-2 px-2 py-2">
                        <Calendar className="h-4 w-4 text-emerald-600" />
                        <span className="font-medium">My Bookings</span>
                      </a>
                    </DropdownMenuItem>
                  </>
                )}

                {/* Messages Section (commented out but styled) */}
                {/* <DropdownMenuSeparator className="my-2" />
                <DropdownMenuItem asChild className="cursor-pointer rounded-md hover:bg-blue-50">
                  <a href="/messages" className="flex items-center justify-between px-2 py-2">
                    <div className="flex items-center gap-2">
                      <MessageCircle className="h-4 w-4 text-blue-600" />
                      <span className="font-medium">Messages</span>
                    </div>
                    {unreadCount > 0 && (
                      <Badge className="bg-red-500 hover:bg-red-600 text-white">
                        {unreadCount}
                      </Badge>
                    )}
                  </a>
                </DropdownMenuItem> */}

                <DropdownMenuSeparator className="my-2" />
                <DropdownMenuItem 
                  onClick={() => signOut()} 
                  className="cursor-pointer text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md"
                >
                  <div className="flex items-center gap-2 px-2 py-1">
                    <LogOut className="h-4 w-4" />
                    <span className="font-medium">Sign out</span>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <a href="/login" className="hidden md:block">
                <Button 
                  variant="ghost" 
                  className="font-semibold hover:bg-gray-100"
                >
                  Sign in
                </Button>
              </a>
              <a href="/signup">
                <Button className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 font-semibold shadow-md hover:shadow-lg transition-all">
                  Get Started
                </Button>
              </a>
            </>
          )}

          {/* Mobile Menu */}
          <Sheet>
            <SheetTrigger asChild className="md:hidden">
              <Button 
                variant="ghost" 
                size="icon"
                className="hover:bg-gray-100"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-80 bg-gradient-to-br from-white to-gray-50">
              <div className="flex flex-col gap-6 mt-8">
                {user && (
                  <div className="flex items-center gap-3 p-4 bg-white rounded-lg shadow-sm border">
                    <Avatar className="h-12 w-12 ring-2 ring-offset-2 ring-blue-500">
                      <AvatarImage src={user.avatarUrl || "/placeholder.svg"} alt={user.name} />
                      <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white font-bold">
                        {user.name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {user.name}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {user.email}
                      </p>
                      {roleBadge && RoleBadgeIcon && (
                        <Badge className={`${roleBadge.color} mt-1 text-xs border-0`}>
                          <RoleBadgeIcon className="h-3 w-3 mr-1" />
                          {roleBadge.label}
                        </Badge>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <NavLinks />
                  {!user && (
                    <a 
                      href="/login" 
                      className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors"
                    >
                      Sign in
                    </a>
                  )}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  )
}