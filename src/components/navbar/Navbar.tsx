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
// import { Badge } from "@/components/ui/badge"
import { Menu, MessageCircle } from "lucide-react"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { useEffect, useState } from "react"

export function Navbar() {
  const [unreadCount, setUnreadCount] = useState(0)
  type User = {
  role: "admin" | "tutor" | "both" | "learner"
  name: string
  email: string
  avatarUrl?: string
}
  const [user, setUser] = useState<User | null >(null)
  const {signOut} = useAuth()
  useEffect(()=>{
    
 const storedUser = localStorage.getItem("user")

 if(storedUser){
 setUser(JSON.parse(storedUser))
 }
  },[])

  useEffect(() => {
    if(!user) return
    if (user) {

      const conversations = JSON.parse(localStorage.getItem("levelup_conversations") || "[]")
      const total = conversations.reduce((sum: number, conv: any) => sum + (conv.unreadCount || 0), 0)
      setUnreadCount(total)
    }
  }, [user])

  const NavLinks = () => (
    <>
      <a href="/tutors" className="text-sm font-medium hover:text-primary transition-colors">
        Find Tutors
      </a>
      <a href="/how-it-works" className="text-sm font-medium hover:text-primary transition-colors">
        How It Works
      </a>
      {(user?.role === "tutor" || user?.role === "both") && (
        <a href="/tutor/dashboard" className="text-sm font-medium hover:text-primary transition-colors">
          Tutor Dashboard
        </a>
      )}
      {user?.role === "admin" && (
        <a href="/admin/dashboard" className="text-sm font-medium hover:text-primary transition-colors">
          Admin Panel
        </a>
      )}
    </>
  )

  return (
    <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2 font-bold text-xl">
           <div className="bg-primary overflow-hidden text-primary-foreground p-2 rounded-full">
            <img src="/logo.png" alt="No image" className="h-10 w-10 object-cover rounded-full"/>
          </div>
          <span>Level Up</span>
        </a>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-6">
          <NavLinks />
        </div>

        <div className="flex items-center gap-4">
          {/* {user && (
            <a href="/messages">
              <Button variant="ghost" size="icon" className="relative">
                <MessageCircle className="h-5 w-5" />
                {unreadCount > 0 && (
                  <Badge
                    variant="destructive"
                    className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
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
                <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                  <Avatar>
                    <AvatarImage src={user.avatarUrl || "/placeholder.svg"} alt={user.name} />
                    <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium">{user.name}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {user.role === "admin" ? (
                  <>
                    <DropdownMenuItem asChild>
                      <a href="/admin/dashboard">Admin Dashboard</a>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a href="/admin/users">Manage Users</a>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a href="/admin/applications">Applications</a>
                    </DropdownMenuItem>
                  </>
                ) : user.role === "tutor" || user.role === "both" ? (
                  <>
                    <DropdownMenuItem asChild>
                      <a href="/tutor/dashboard">Tutor Dashboard</a>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a href="/tutor/profile">Edit Profile</a>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a href="/tutor/sessions">My Sessions</a>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <a href="/dashboard">Learner Dashboard</a>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a href="/bookings">My Bookings</a>
                    </DropdownMenuItem>
                  </>
                ) : (
                  <>
                    <DropdownMenuItem asChild>
                      <a href="/dashboard">Dashboard</a>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a href="/profile">Profile</a>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a href="/bookings">My Bookings</a>
                    </DropdownMenuItem>
                  </>
                )}
                {/* <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <a href="/messages" className="flex items-center justify-between">
                    <span>Messages</span>
                    {unreadCount > 0 && (
                      <Badge variant="destructive" className="ml-2">
                        {unreadCount}
                      </Badge>
                    )}
                  </a>
                </DropdownMenuItem>
                <DropdownMenuSeparator /> */}
                <DropdownMenuItem onClick={() => signOut()} className="text-destructive">
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <a href="/login" className="hidden md:block">
                <Button variant="ghost">Sign in</Button>
              </a>
              <a href="/signup">
                <Button>Get Started</Button>
              </a>
            </>
          )}

          {/* Mobile Menu */}
          <Sheet>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right">
              <div className="flex flex-col gap-4 mt-8">
                <NavLinks />
                {/* {user && (
                  <a
                    href="/messages"
                    className="text-sm font-medium hover:text-primary transition-colors flex items-center gap-2"
                  >
                    Messages
                    {unreadCount > 0 && (
                      <Badge variant="destructive" className="h-5 px-2">
                        {unreadCount}
                      </Badge>
                    )}
                  </a>
                )} */}
                {!user && (
                  <a href="/login" className="text-sm font-medium hover:text-primary transition-colors">
                    Sign in
                  </a>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  )
}
