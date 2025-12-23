"use client"

// import { useAuth } from "@/lib/auth-context"
import { useNavigate } from "react-router-dom"
import { useEffect, useState } from "react"
import { Navbar } from "@/components/navbar/Navbar"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MOCK_TUTORS } from "@/lib/mock-data"
import { Search, Mail, MoreVertical } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import axios from "axios"

type User = {
  _id: string
  name: string
  email: string
  role: "admin" | "tutor" | "both" | "learner"
  avatarUrl?: string
}

export default function AdminUsersPage() {
  const [user, setUser] = useState(null)
  const [allUsers, setAllUsers] = useState<User[]>([])
  const router = useNavigate()
  const [searchQuery, setSearchQuery] = useState("")



  useEffect(()=>{
  const storedUser = localStorage.getItem("user")

    if(storedUser){
      setUser(JSON.parse(storedUser))
    }
  },[])

//   useEffect(() => {
//     if (!user || user.role !== "admin") {
//       router.push("/")
//     }
//   }, [user, router])

//   if (!user || user.role !== "admin") {
//     return null
//   }

useEffect(()=>{
  const fetchUsers = async()=>{
  try{
  const res = await axios.get("http://localhost:5000/api/auth/getUsers")
  setAllUsers(res.data.user)
  }catch(err){
    console.error(err)
  }
  }
  fetchUsers()

},[])

  // const allUsers = [
  //   ...MOCK_TUTORS,
  //   {
  //     id: "learner-1",
  //     email: "nour.m@aub.edu.lb",
  //     fullName: "Nour M.",
  //     role: "learner" as const,
  //     avatarUrl: undefined,
  //   },
  //   {
  //     id: "learner-2",
  //     email: "ali.k@aub.edu.lb",
  //     fullName: "Ali K.",
  //     role: "learner" as const,
  //     avatarUrl: undefined,
  //   },
  // ]

  const filteredUsers = allUsers.filter(
    (u) =>
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const tutors = filteredUsers.filter((u) => u.role === "tutor" || u.role === "both")
  const learners = filteredUsers.filter((u) => u.role === "learner")

  const UserCard = ({ userData }: { userData: any }) => (
    <Card>
      <CardContent className="p-6  text-start">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Avatar className="h-12 w-12">
              <AvatarImage src={userData.avatarUrl || "/placeholder.svg"} alt={userData.name} />
              <AvatarFallback>{userData.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <div>
              <div className="font-semibold">{userData.name}</div>
              <div className="text-sm text-muted-foreground flex items-center gap-1">
                <Mail className="h-3 w-3" />
                {userData.email}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="capitalize">
              {userData.role}
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>View Profile</DropdownMenuItem>
                <DropdownMenuItem>Send Message</DropdownMenuItem>
                <DropdownMenuItem className="text-destructive">Suspend User</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  )

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        <Button variant="ghost" onClick={() => router("/admin/dashboard")} className="mb-6">
          ← Back to Dashboard
        </Button>

        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-4">User Management</h1>
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <Tabs defaultValue="all" className="space-y-6">
          <TabsList>
            <TabsTrigger value="all">All Users ({filteredUsers.length})</TabsTrigger>
            <TabsTrigger value="tutors">Tutors ({tutors.length})</TabsTrigger>
            <TabsTrigger value="learners">Learners ({learners.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-4">
            {filteredUsers.map((userData) => (
              <UserCard key={userData._id} userData={userData} />
            ))}
          </TabsContent>

          <TabsContent value="tutors" className="space-y-4">
            {tutors.map((userData) => (
              <UserCard key={userData._id} userData={userData} />
            ))}
          </TabsContent>

          <TabsContent value="learners" className="space-y-4">
            {learners.map((userData) => (
              <UserCard key={userData._id} userData={userData} />
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
