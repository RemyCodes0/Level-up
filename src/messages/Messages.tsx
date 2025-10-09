"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/lib/auth-context"
import { useNavigate } from "react-router-dom"
import { Navbar } from "@/components/navbar/Navbar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { MessageCircle, Send, Search, ArrowLeft } from "lucide-react"
import type { Conversation, Message } from "@/lib/types"

export default function MessagesPage() {
  const { user, loading } = useAuth()
  const router = useNavigate()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState("")
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => {
    if (!loading && !user) {
      router("/login")
      return
    }

    if (user) {
      // Load conversations from localStorage
      const storedConversations = JSON.parse(localStorage.getItem("levelup_conversations") || "[]")
      setConversations(storedConversations)
    }
  }, [user, loading, router])

  useEffect(() => {
    if (selectedConversation) {
      // Load messages for selected conversation
      const storedMessages = JSON.parse(localStorage.getItem("levelup_messages") || "[]")
      const conversationMessages = storedMessages.filter((m: Message) => m.conversationId === selectedConversation.id)
      setMessages(conversationMessages)
    }
  }, [selectedConversation])

  const handleSendMessage = () => {
    if (!newMessage.trim() || !selectedConversation || !user) return

    const message: Message = {
      id: crypto.randomUUID(),
      conversationId: selectedConversation.id,
      senderId: user.id,
      receiverId:
        user.id === selectedConversation.participants.learnerId
          ? selectedConversation.participants.tutorId
          : selectedConversation.participants.learnerId,
      content: newMessage,
      createdAt: new Date(),
      read: false,
    }

    // Save message
    const storedMessages = JSON.parse(localStorage.getItem("levelup_messages") || "[]")
    storedMessages.push(message)
    localStorage.setItem("levelup_messages", JSON.stringify(storedMessages))

    // Update conversation
    const updatedConversations = conversations.map((conv) => {
      if (conv.id === selectedConversation.id) {
        return { ...conv, lastMessage: message }
      }
      return conv
    })
    setConversations(updatedConversations)
    localStorage.setItem("levelup_conversations", JSON.stringify(updatedConversations))

    setMessages([...messages, message])
    setNewMessage("")
  }

  const filteredConversations = conversations.filter((conv) => {
    const searchLower = searchQuery.toLowerCase()
    return (
      conv.participants.tutorName.toLowerCase().includes(searchLower) ||
      conv.participants.learnerName.toLowerCase().includes(searchLower)
    )
  })

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">Loading...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Messages</h1>
          <p className="text-muted-foreground">Connect with tutors and learners</p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6 h-[calc(100vh-250px)]">
          {/* Conversations List */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-lg">Conversations</CardTitle>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search conversations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[calc(100vh-400px)]">
                {filteredConversations.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground">
                    <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">No conversations yet</p>
                    <p className="text-xs mt-1">Start by messaging a tutor!</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {filteredConversations.map((conversation) => {
                      const otherParticipant =
                        user?.id === conversation.participants.learnerId
                          ? {
                              name: conversation.participants.tutorName,
                              avatar: conversation.participants.tutorAvatar,
                            }
                          : {
                              name: conversation.participants.learnerName,
                              avatar: conversation.participants.learnerAvatar,
                            }

                      return (
                        <button
                          key={conversation.id}
                          onClick={() => setSelectedConversation(conversation)}
                          className={`w-full p-4 text-left hover:bg-muted/50 transition-colors ${
                            selectedConversation?.id === conversation.id ? "bg-muted" : ""
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <Avatar className="h-10 w-10">
                              <AvatarImage
                                src={otherParticipant.avatar || "/placeholder.svg"}
                                alt={otherParticipant.name}
                              />
                              <AvatarFallback>{otherParticipant.name.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-semibold text-sm truncate">{otherParticipant.name}</span>
                                {conversation.unreadCount > 0 && (
                                  <Badge
                                    variant="default"
                                    className="ml-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
                                  >
                                    {conversation.unreadCount}
                                  </Badge>
                                )}
                              </div>
                              {conversation.lastMessage && (
                                <p className="text-xs text-muted-foreground truncate">
                                  {conversation.lastMessage.content}
                                </p>
                              )}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Message Thread */}
          <Card className="lg:col-span-2">
            {selectedConversation ? (
              <>
                <CardHeader className="border-b">
                  <div className="flex items-center gap-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="lg:hidden"
                      onClick={() => setSelectedConversation(null)}
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <Avatar className="h-10 w-10">
                      <AvatarImage
                        src={
                          user?.id === selectedConversation.participants.learnerId
                            ? selectedConversation.participants.tutorAvatar
                            : selectedConversation.participants.learnerAvatar
                        }
                        alt="Avatar"
                      />
                      <AvatarFallback>
                        {(user?.id === selectedConversation.participants.learnerId
                          ? selectedConversation.participants.tutorName
                          : selectedConversation.participants.learnerName
                        ).charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <CardTitle className="text-lg">
                        {user?.id === selectedConversation.participants.learnerId
                          ? selectedConversation.participants.tutorName
                          : selectedConversation.participants.learnerName}
                      </CardTitle>
                      <CardDescription className="text-xs">Active now</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0 flex flex-col h-[calc(100vh-450px)]">
                  <ScrollArea className="flex-1 p-4">
                    <div className="space-y-4">
                      {messages.length === 0 ? (
                        <div className="text-center text-muted-foreground py-8">
                          <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                          <p className="text-sm">No messages yet</p>
                          <p className="text-xs mt-1">Start the conversation!</p>
                        </div>
                      ) : (
                        messages.map((message) => {
                          const isCurrentUser = message.senderId === user?.id
                          return (
                            <div key={message.id} className={`flex ${isCurrentUser ? "justify-end" : "justify-start"}`}>
                              <div
                                className={`max-w-[70%] rounded-lg p-3 ${
                                  isCurrentUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                                }`}
                              >
                                <p className="text-sm">{message.content}</p>
                                <p
                                  className={`text-xs mt-1 ${
                                    isCurrentUser ? "text-primary-foreground/70" : "text-muted-foreground"
                                  }`}
                                >
                                  {new Date(message.createdAt).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </p>
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </ScrollArea>
                  <Separator />
                  <div className="p-4">
                    <div className="flex gap-2">
                      <Textarea
                        placeholder="Type your message..."
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault()
                            handleSendMessage()
                          }
                        }}
                        rows={2}
                        className="resize-none"
                      />
                      <Button onClick={handleSendMessage} disabled={!newMessage.trim()} size="icon" className="h-auto">
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </>
            ) : (
              <CardContent className="flex items-center justify-center h-full">
                <div className="text-center text-muted-foreground">
                  <MessageCircle className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">Select a conversation</p>
                  <p className="text-sm mt-1">Choose a conversation from the list to start messaging</p>
                </div>
              </CardContent>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
