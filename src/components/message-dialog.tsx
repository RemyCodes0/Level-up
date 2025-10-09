"use client"

import type React from "react"

import { useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { useNavigate } from "react-router-dom"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Mail, Send } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import type { TutorWithProfile } from "@/lib/types"

interface MessageDialogProps {
  tutor: TutorWithProfile
  trigger?: React.ReactNode
}

export function MessageDialog({ tutor, trigger }: MessageDialogProps) {
  const { user } = useAuth()
  const router = useNavigate()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState("")
  const [sending, setSending] = useState(false)

  const handleSendMessage = async () => {
    if (!user) {
    //   toast({
    //     title: "Authentication required",
    //     description: "Please sign in to send messages",
    //     variant: "destructive",
    //   })
      router("/login")
      return
    }

    if (!message.trim()) {
    //   toast({
    //     title: "Message required",
    //     description: "Please enter a message",
    //     variant: "destructive",
    //   })
      return
    }

    setSending(true)

    // Simulate sending message
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Store message in localStorage for demo
    const conversations = JSON.parse(localStorage.getItem("levelup_conversations") || "[]")
    const conversationId = `${user.id}-${tutor.id}`

    const newMessage = {
      id: crypto.randomUUID(),
      conversationId,
      senderId: user.id,
      receiverId: tutor.id,
      content: message,
      createdAt: new Date().toISOString(),
      read: false,
    }

    const existingConversation = conversations.find((c: any) => c.id === conversationId)

    if (existingConversation) {
      existingConversation.lastMessage = newMessage
      existingConversation.unreadCount += 1
    } else {
      conversations.push({
        id: conversationId,
        participants: {
          learnerId: user.id,
          learnerName: user.fullName,
          learnerAvatar: user.avatarUrl,
          tutorId: tutor.id,
          tutorName: tutor.fullName,
          tutorAvatar: tutor.avatarUrl,
        },
        lastMessage: newMessage,
        unreadCount: 1,
        createdAt: new Date().toISOString(),
      })
    }

    localStorage.setItem("levelup_conversations", JSON.stringify(conversations))

    setSending(false)
    setMessage("")
    setOpen(false)

    // toast({
    //   title: "Message sent!",
    //   description: `Your message has been sent to ${tutor.fullName}`,
    // })

    // Optionally redirect to messages page
    router("/messages")
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" className="w-full bg-transparent">
            <Mail className="mr-2 h-4 w-4" />
            Send Message
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Message {tutor.fullName}</DialogTitle>
          <DialogDescription>Send a message to discuss your tutoring needs before booking a session</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="message">Your Message</Label>
            <Textarea
              id="message"
              placeholder="Hi! I'm interested in tutoring for..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              className="resize-none"
            />
            <p className="text-sm text-muted-foreground">
              Introduce yourself and let {tutor.fullName.split(" ")[0]} know what you need help with
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSendMessage} disabled={sending || !message.trim()}>
            {sending ? (
              <>Sending...</>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Send Message
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
