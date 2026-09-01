"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import type { User } from "./types"

interface AuthContextType {
  user: User | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, fullName: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Mock users for development
const MOCK_USERS: User[] = [
  {
    id: "a7b8c9d0-e1f2-0a1b-4c5d-6e7f8a9b0c1d",
    email: "learner@aub.edu.lb",
    fullName: "Nour Mansour",
    avatarUrl: "/placeholder.svg?height=100&width=100",
  },
]

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check for stored user session
    const storedUser = localStorage.getItem("levelup_user")
    if (storedUser) {
      setUser(JSON.parse(storedUser))
    }
    setLoading(false)
  }, [])

  const signIn = async (email: string, password: string) => {
    // Mock authentication - in production, this would call your auth API
    const mockUser = MOCK_USERS.find((u) => u.email === email)
    if (mockUser) {
      setUser(mockUser)
      localStorage.setItem("levelup_user", JSON.stringify(mockUser))
    } else {
      throw new Error("Invalid credentials")
    }
  }

  const signUp = async (email: string, password: string, fullName: string) => {
    // Mock signup - in production, this would call your auth API
    const newUser: User = {
      id: crypto.randomUUID(),
      email,
      fullName,
      avatarUrl: "/placeholder.svg?height=100&width=100",
    }
    setUser(newUser)
    localStorage.setItem("levelup_user", JSON.stringify(newUser))
  }

  const signOut = async () => {
    setUser(null)
    localStorage.removeItem("levelup_user")
  }

  return <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
