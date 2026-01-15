export interface User {
  id: string
  email: string
  fullName: string
  role: "learner" | "tutor" | "both" | "admin"
  avatarUrl?: string


}



export interface TutorProfile {
  id: string
  userId: string
  bio: string
  subjects: string[]
  hourlyRate: number
  availability?: Availability[]
  totalSessions: number
  averageRating: number
  isVerified: boolean
}

export interface Session {
  id: string
  tutorId: string
  learnerId: string
  subject: string
  sessionDate: Date
  durationMinutes: number
  status: "pending" | "confirmed" | "completed" | "cancelled"
  location: string
  notes?: string
  totalAmount: number
  paymentStatus: "pending" | "paid" | "refunded"
}

export interface Review {
  id: string
  sessionId: string
  tutorId: string
  learnerId: string
  rating: number
  comment?: string
  createdAt: Date
}

export interface TutorWithProfile extends User {
  profile: TutorProfile
}

export interface TutorApplication {
  _id: string
  user: {
    _id: string
    name: string
    email: string
  }
  bio: string
  subjects: { code: string; name: string }[]
  status: "pending" | "approved" | "rejected"
  createdAt: string
  hourlyRate: String
}

export interface Availability {
  day: string
  slots: { start: string; end: string }[]
}

export interface Message {
  id: string
  conversationId: string
  senderId: string
  receiverId: string
  content: string
  createdAt: Date
  read: boolean
}

export interface Conversation {
  id: string
  participants: {
    learnerId: string
    learnerName: string
    learnerAvatar?: string
    tutorId: string
    tutorName: string
    tutorAvatar?: string
  }
  lastMessage?: Message
  unreadCount: number
  createdAt: Date
}
