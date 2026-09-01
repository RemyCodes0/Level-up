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
import {
  Menu,
  LogOut,
  User as UserIcon,
  LayoutDashboard,
  ChevronDown
} from "lucide-react"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { useEffect, useRef, useState } from "react"

export function Navbar() {
  const [scrolled, setScrolled] = useState(false)

  type User = {
    name: string
    email: string
    avatarUrl?: string
  }

  const [user, setUser] = useState<User | null>(null)
  const { signOut } = useAuth()

  // Hover-to-open user menu, ChatGPT-style — a short close delay so moving
  // the pointer from the trigger button into the dropdown content (which
  // Radix portals elsewhere in the DOM, so it isn't a child of the trigger)
  // doesn't flicker the menu shut in the gap between them. Click still works
  // too, since DropdownMenu is just a controlled `open` state either way.
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const closeMenuTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const openUserMenu = () => {
    if (closeMenuTimer.current) clearTimeout(closeMenuTimer.current)
    setUserMenuOpen(true)
  }
  const scheduleCloseUserMenu = () => {
    if (closeMenuTimer.current) clearTimeout(closeMenuTimer.current)
    closeMenuTimer.current = setTimeout(() => setUserMenuOpen(false), 150)
  }
  useEffect(() => () => { if (closeMenuTimer.current) clearTimeout(closeMenuTimer.current) }, [])

  useEffect(() => {
    const storedUser = localStorage.getItem("user")
    if (storedUser) {
      setUser(JSON.parse(storedUser))
    }
  }, [])

  // Scroll effect
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10)
    }
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  const NavLinks = () => (
    <>
      <a
        href="/dashboard"
        className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors relative group"
      >
        Dashboard
        <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-blue-600 to-purple-600 group-hover:w-full transition-all duration-300" />
      </a>
      <a
        href="/collab"
        className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors relative group"
      >
        Study Groups
        <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-blue-600 to-purple-600 group-hover:w-full transition-all duration-300" />
      </a>
      <a
        href="/gallery"
        className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors relative group"
      >
        Course Gallery
        <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-blue-600 to-purple-600 group-hover:w-full transition-all duration-300" />
      </a>
    </>
  )

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
          {user ? (
            <DropdownMenu open={userMenuOpen} onOpenChange={setUserMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="relative h-10 w-auto rounded-full pl-2 pr-3 hover:bg-gray-100 transition-all"
                  onMouseEnter={openUserMenu}
                  onMouseLeave={scheduleCloseUserMenu}
                >
                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8 ring-2 ring-offset-2 ring-blue-500">
                      <AvatarImage src={user.avatarUrl || "/placeholder.svg"} alt={user.name} />
                      <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white font-semibold">
                        {user.name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="hidden lg:flex items-center gap-1 text-left">
                      <p className="text-sm font-semibold text-gray-900">
                        {user.name.split(' ')[0]}
                      </p>
                      <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform ${userMenuOpen ? "rotate-180" : ""}`} />
                    </div>
                  </div>
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent
                align="end"
                className="w-72 p-2 shadow-xl border-0 bg-white/95 backdrop-blur-sm"
                onMouseEnter={openUserMenu}
                onMouseLeave={scheduleCloseUserMenu}
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
                    </div>
                  </div>
                </DropdownMenuLabel>

                <DropdownMenuSeparator className="my-2" />

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
