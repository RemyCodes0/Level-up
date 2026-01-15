"use client"

import { useAuth } from "@/lib/auth-context"
import { useNavigate } from "react-router-dom"
import { useEffect, useState } from "react"
import { Navbar } from "@/components/navbar/Navbar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MOCK_APPLICATIONS } from "@/lib/mock-data"
import type { TutorApplication } from "@/lib/types"
import { CheckCircle2, XCircle, Mail, Calendar } from "lucide-react"
// import { useToast } from "@/hooks/use-toast"
import axios from "axios"


export default function AdminApplicationsPage() {
  const { user } = useAuth()
  const router = useNavigate()
  // const { toast } = useToast()
  const [applications, setApplications] = useState<TutorApplication[]>([])

  useEffect(()=>{
    const fetchApplications = async()=>{
      const res = await axios.get("http://localhost:5000/api/tutor/applications")
      setApplications(res.data)
    }
    fetchApplications()
  },[])

//   useEffect(() => {
//     if (!user || user.role !== "admin") {
//       router("/")
//     }
//   }, [user, router])

//   if (!user || user.role !== "admin") {
//     return null
//   }

  const handleApprove = async(appId: string) => {
  
    const res = await axios.patch(`http://localhost:5000/api/tutor/${appId}/approve`)

    const data = res.data;
      setApplications(
      applications.map((app) =>
        app._id === appId ? { ...app, status: "approved" as const, reviewedAt: new Date(), reviewedBy: user._id } : app,
      ),
    )
  }

  const handleReject = (appId: string) => {
    setApplications(
      applications.map((app) =>
        app._id === appId ? { ...app, status: "rejected" as const, reviewedAt: new Date(), reviewedBy: user._id } : app,
      ),
    )
  
  }

  const pendingApps = applications.filter((app) => app.status === "pending")
  const approvedApps = applications.filter((app) => app.status === "approved")
  const rejectedApps = applications.filter((app) => app.status === "rejected")

  const ApplicationCard = ({ app }: { app: TutorApplication }) => (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between  text-start">
          <div>
            <CardTitle>{app.user.name}</CardTitle>
            <CardDescription className="flex items-center gap-2 mt-1">
              <Mail className="h-3 w-3" />
              {app.user.email}
            </CardDescription>
          </div>
          <Badge
            variant={app.status === "approved" ? "default" : app.status === "rejected" ? "destructive" : "secondary"}
          >
            {app.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4  text-start">
        <div>
          <h4 className="font-semibold mb-2">Bio</h4>
          <p className="text-sm text-muted-foreground">{app.bio}</p>
        </div>

        <div>
          <h4 className="font-semibold mb-2">Subjects</h4>
          <div className="flex flex-wrap gap-2">
            {app.subjects.map((subject) => (
              <Badge key={subject.code} variant="outline">
               {subject.code} - {subject.name}
              </Badge>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>Applied {app.createdAt? new Date(app.createdAt).toLocaleDateString(): "unknown"}</span>
          </div>
          <div className="font-semibold">${app.hourlyRate}/hour</div>
        </div>

        {app.status === "pending" && (
          <div className="flex gap-2 pt-2">
            <Button onClick={() => handleApprove(app._id) } className="flex-1">
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Approve
            </Button>
            <Button onClick={() => handleReject(app._id)} variant="destructive" className="flex-1">
              <XCircle className="mr-2 h-4 w-4" />
              Reject
            </Button>
          </div>
        )}
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

        <h1 className="text-3xl font-bold mb-8">Tutor Applications</h1>

        <Tabs defaultValue="pending" className="space-y-6">
          <TabsList>
            <TabsTrigger value="pending">Pending ({pendingApps.length})</TabsTrigger>
            <TabsTrigger value="approved">Approved ({approvedApps.length})</TabsTrigger>
            <TabsTrigger value="rejected">Rejected ({rejectedApps.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="space-y-4">
            {pendingApps.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">No pending applications</CardContent>
              </Card>
            ) : (
              pendingApps.map((app) => <ApplicationCard key={app._id} app={app} />)
            )}
          </TabsContent>

          <TabsContent value="approved" className="space-y-4">
            {approvedApps.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No approved applications yet
                </CardContent>
              </Card>
            ) : (
              approvedApps.map((app) => <ApplicationCard key={app._id} app={app} />)
            )}
          </TabsContent>

          <TabsContent value="rejected" className="space-y-4">
            {rejectedApps.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">No rejected applications</CardContent>
              </Card>
            ) : (
              rejectedApps.map((app) => <ApplicationCard key={app._id} app={app} />)
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
