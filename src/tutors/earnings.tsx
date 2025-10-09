"use client"

import { useAuth } from "@/lib/auth-context"
import { useNavigate } from "react-router-dom"
import { useEffect } from "react"
import { Navbar } from "@/components/navbar/Navbar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DollarSign, TrendingUp, Calendar, Download } from "lucide-react"

export default function TutorEarningsPage() {
  const { user } = useAuth()
  const router = useNavigate()

//   useEffect(() => {
//     if (!user || (user.role !== "tutor" && user.role !== "both")) {
//       router("/")
//     }
//   }, [user, router])

  if (!user || (user.role !== "tutor" && user.role !== "both")) {
    return null
  }

  const earnings = {
    total: 1245.5,
    thisMonth: 385.0,
    lastMonth: 420.0,
    pending: 67.5,
  }

  const transactions = [
    {
      id: "1",
      date: "Jan 20, 2024",
      student: "Nour M.",
      subject: "Data Structures",
      amount: 15.0,
      status: "paid",
    },
    {
      id: "2",
      date: "Jan 18, 2024",
      student: "Ali K.",
      subject: "Algorithms",
      amount: 22.5,
      status: "paid",
    },
    {
      id: "3",
      date: "Jan 24, 2024",
      student: "Layla H.",
      subject: "Programming",
      amount: 15.0,
      status: "pending",
    },
    {
      id: "4",
      date: "Jan 15, 2024",
      student: "Omar S.",
      subject: "Data Structures",
      amount: 30.0,
      status: "paid",
    },
  ]

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        <Button variant="ghost" onClick={() => router("/tutor/dashboard")} className="mb-6">
          ← Back to Dashboard
        </Button>

        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Earnings</h1>
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export Report
          </Button>
        </div>

        <div className="grid md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Earnings</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${earnings.total.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground mt-1">All-time</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">This Month</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${earnings.thisMonth.toFixed(2)}</div>
              <p className="text-xs text-green-600 mt-1">
                +{((earnings.thisMonth / earnings.lastMonth - 1) * 100).toFixed(1)}% from last month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Last Month</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${earnings.lastMonth.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground mt-1">Previous period</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${earnings.pending.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground mt-1">Awaiting payment</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Transaction History</CardTitle>
            <CardDescription>Your recent earnings from tutoring sessions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {transactions.map((transaction) => (
                <div key={transaction.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="space-y-1">
                    <div className="font-medium">{transaction.subject}</div>
                    <div className="text-sm text-muted-foreground">
                      {transaction.student} • {transaction.date}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="font-semibold">${transaction.amount.toFixed(2)}</div>
                    <Badge variant={transaction.status === "paid" ? "default" : "secondary"} className="capitalize">
                      {transaction.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
