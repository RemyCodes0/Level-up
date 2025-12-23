"use client"

import type React from "react"
import axios from "axios"

import { useState } from "react"
import { useNavigate } from "react-router-dom"

import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const { signIn } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    console.log("handlesubmit triggered")
    e.preventDefault()
    setError("")
    setLoading(true)

    // try {
    //   await signIn(email, password)
    //   navigate("/dashboard")
    // } catch (err) {
    //   setError("Invalid email or password.")
    // } finally {
    //   setLoading(false)
    // }
 

  try{
    const res = await axios.post("http://localhost:5000/api/auth/login", {email,password})
    console.log("Login was successful", res.data)
    localStorage.setItem('token', res.data.token)

    localStorage.setItem("user", JSON.stringify({
      _id: res.data._id,
      name: res.data.name,
      email: res.data.email,
      role: res.data.role
    }))
    console.log("navigate now")
   
    navigate('/dashboard')
  }catch(error){
    console.error(error)
    setError("Invalid Email or password")
    alert("An error arised")

  }finally{
    setLoading(false)
  }
   }
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-200 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-primary overflow-hidden text-primary-foreground p-2 rounded-full">
            <img src="/logo.png" alt="No image" className="h-10 object-cover w-10 rounded-full"/>
          </div>
          </div>
          <CardTitle className="text-2xl font-bold">Welcome back</CardTitle>
          <CardDescription>Sign in to your Level Up account</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2 flex-col text-start">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="your-email@mail.aub.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2 text-start">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </Button>
            <p className="text-sm text-center text-muted-foreground">
              Don't have an account?{" "}
              <a href="/signup" className="text-primary hover:underline font-medium">
                Sign up
              </a>
            </p>
            <p className="text-sm text-center text-muted-foreground">
              Want to become a tutor?{" "}
              <a href="/apply" className="text-primary hover:underline font-medium">
                Apply
              </a>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
