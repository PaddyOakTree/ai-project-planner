"use client"

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Loader2, Send, Users, Minimize2 } from "lucide-react"
import { useSupabaseAuth } from '@/components/supabase-auth-provider'
import { useToast } from "@/hooks/use-toast"
import { useSocket, SocketEvent } from '@/lib/services/socket.service'

interface User {
  id: string
  name: string
  email: string
  avatar?: string
  status: "online" | "offline" | "away"
  role: "owner" | "admin" | "editor" | "viewer"
  joinedAt: string
  lastActive: string
}

interface Team {
  id: string
  name: string
  description: string
  members: User[]
  createdAt: string
  isPublic: boolean
  category: string
  owner: string
}

interface ChatMessage {
  id: string
  senderId: string
  senderName: string
  content: string
  timestamp: string
  teamId: string
  type: "text" | "system"
  senderAvatar?: string
}

interface TeamChatProps {
  team: Team
  onClose: () => void
}

export function TeamChat({ team, onClose }: TeamChatProps) {
  const { user } = useSupabaseAuth()
  const socket = useSocket(user?.id || null)
  const { toast } = useToast()
  
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [isTyping, setIsTyping] = useState<Record<string, boolean>>({})
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const typingTimeoutsRef = useRef<Record<string, NodeJS.Timeout>>({})
  
  // API helper function
  const apiCall = useCallback(async (url: string, options: RequestInit = {}) => {
    const response = await fetch(url, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Network error' }))
      throw new Error(error.error || `HTTP ${response.status}`)
    }

    return response.json()
  }, [])
  
  // Load chat messages
  const loadMessages = useCallback(async () => {
    if (!team?.id) return
    
    try {
      setIsLoading(true)
      
      const data = await apiCall(`/api/collaborate/messages?teamId=${team.id}&limit=50`)
      
      if (data.success) {
        const formattedMessages: ChatMessage[] = data.messages.map((msg: any) => ({
          id: msg.id,
          senderId: msg.sender_id,
          senderName: msg.sender?.full_name || 'Unknown User',
          senderAvatar: msg.sender?.avatar_url,
          content: msg.content,
          timestamp: msg.created_at,
          teamId: msg.team_id,
          type: msg.message_type || "text",
        }))
        
        setMessages(formattedMessages)
      }
    } catch (error) {
      console.error('Error loading messages:', error)
      toast({
        title: "Error",
        description: "Failed to load chat messages",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }, [team?.id, apiCall, toast])
  
  // Initialize data
  useEffect(() => {
    if (team?.id) {
      loadMessages()
    }
  }, [team?.id, loadMessages])
  
  // Socket event handlers
  useEffect(() => {
    if (!socket || !team?.id) return

    const handleNewMessage = (data: any) => {
      if (data.teamId === team.id) {
        const newMessage: ChatMessage = {
          id: data.id,
          senderId: data.senderId,
          senderName: data.senderName,
          senderAvatar: data.senderAvatar,
          content: data.content,
          timestamp: data.timestamp,
          teamId: data.teamId,
          type: data.type || "text",
        }
        setMessages(prev => [...prev, newMessage])
        
        // Clear typing indicator for the sender
        if (typingTimeoutsRef.current[data.senderId]) {
          clearTimeout(typingTimeoutsRef.current[data.senderId])
          setIsTyping(prev => ({ ...prev, [data.senderId]: false }))
        }
      }
    }

    const handleTyping = (data: { userId: string; teamId: string; isTyping: boolean; userName: string }) => {
      if (data.teamId === team.id && data.userId !== user?.id) {
        setIsTyping(prev => ({ ...prev, [data.userId]: data.isTyping }))
        
        // Clear previous timeout
        if (typingTimeoutsRef.current[data.userId]) {
          clearTimeout(typingTimeoutsRef.current[data.userId])
        }
        
        // Auto-clear typing indicator after 3 seconds
        if (data.isTyping) {
          typingTimeoutsRef.current[data.userId] = setTimeout(() => {
            setIsTyping(prev => ({ ...prev, [data.userId]: false }))
          }, 3000)
        }
      }
    }

    const handleMemberUpdate = () => {
      // Refresh messages to get latest member info
      loadMessages()
    }

    // Join team room
    socket.emit(SocketEvent.JOIN_TEAM, { teamId: team.id, userId: user?.id })

    // Subscribe to events
    socket.on(SocketEvent.NEW_MESSAGE, handleNewMessage)
    socket.on(SocketEvent.TYPING, handleTyping)
    socket.on('member-joined', handleMemberUpdate)
    socket.on('member-left', handleMemberUpdate)

    return () => {
      // Leave team room
      socket.emit(SocketEvent.LEAVE_TEAM, { teamId: team.id, userId: user?.id })
      
      // Unsubscribe from events
      socket.off(SocketEvent.NEW_MESSAGE, handleNewMessage)
      socket.off(SocketEvent.TYPING, handleTyping)
      socket.off('member-joined', handleMemberUpdate)
      socket.off('member-left', handleMemberUpdate)
      
      // Clear all typing timeouts
      Object.values(typingTimeoutsRef.current).forEach(timeout => clearTimeout(timeout))
    }
  }, [socket, team?.id, user?.id, loadMessages])
  
  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])
  
  // Handle sending a new message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!user || !team?.id || !newMessage.trim()) return
    
    try {
      setIsSending(true)
      
      // Send typing indicator (stopped typing)
      if (socket) {
        socket.emit(SocketEvent.STOP_TYPING, {
          teamId: team.id,
          userId: user.id,
        })
      }
      
      // Send message via API
      const data = await apiCall('/api/collaborate/messages', {
        method: 'POST',
        body: JSON.stringify({
          teamId: team.id,
          content: newMessage.trim(),
          type: 'text',
        }),
      })
      
      if (data.success) {
        setNewMessage('')
        // Message will be added via socket event
      }
    } catch (error) {
      console.error('Error sending message:', error)
      toast({
        title: "Message failed",
        description: error instanceof Error ? error.message : "Could not send message. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSending(false)
    }
  }
  
  // Handle typing indicator
  const handleTypingIndicator = () => {
    if (!user || !team?.id || !socket) return
    
    socket.emit(SocketEvent.TYPING, {
      teamId: team.id,
      userId: user.id,
    })
  }
  
  // Get user status based on team members
  const getUserStatus = (userId: string): "online" | "offline" | "away" => {
    const member = team.members.find(m => m.id === userId)
    return member?.status || 'offline'
  }
  
  // Get member info by ID
  const getMemberInfo = (userId: string) => {
    const member = team.members.find(m => m.id === userId)
    if (member) {
      return {
        name: member.name,
        avatar: member.avatar,
        status: member.status
      }
    }
    
    // Fallback for system messages or unknown users
    if (userId === 'system') {
      return {
        name: 'System',
        avatar: undefined,
        status: 'online' as const
      }
    }
    
    return {
      name: 'Unknown User',
      avatar: undefined,
      status: 'offline' as const
    }
  }
  
  // Get initials for avatar fallback
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .substring(0, 2)
  }
  
  // Format message timestamp
  const formatTime = (timestamp: string) => {
    try {
      const date = new Date(timestamp)
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch {
      return 'Invalid time'
    }
  }
  
  // Format message date
  const formatDate = (timestamp: string) => {
    try {
      const date = new Date(timestamp)
      const now = new Date()
      const isToday = date.toDateString() === now.toDateString()
      const isYesterday = date.toDateString() === new Date(now.getTime() - 86400000).toDateString()
      
      if (isToday) return 'Today'
      if (isYesterday) return 'Yesterday'
      return date.toLocaleDateString()
    } catch {
      return 'Invalid date'
    }
  }
  
  // Group messages by date
  const groupMessagesByDate = (messages: ChatMessage[]) => {
    const groups: { [key: string]: ChatMessage[] } = {}
    
    messages.forEach(message => {
      const dateKey = formatDate(message.timestamp)
      if (!groups[dateKey]) {
        groups[dateKey] = []
      }
      groups[dateKey].push(message)
    })
    
    return groups
  }
  
  // Get status badge color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return 'bg-green-500'
      case 'away':
        return 'bg-yellow-500'
      case 'offline':
        return 'bg-gray-400'
      default:
        return 'bg-gray-400'
    }
  }
  
  // Get typing users
  const getTypingUsers = () => {
    return Object.entries(isTyping)
      .filter(([userId, typing]) => typing && userId !== user?.id)
      .map(([userId]) => {
        const memberInfo = getMemberInfo(userId)
        return memberInfo.name
      })
  }
  
  const typingUsers = getTypingUsers()
  const groupedMessages = groupMessagesByDate(messages)
  
  return (
    <div className="flex flex-col h-full bg-white rounded-lg border shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-gray-50 rounded-t-lg">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Users className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold">{team.name}</h3>
            <p className="text-sm text-gray-600">{team.members.length} members</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <Minimize2 className="h-4 w-4" />
        </Button>
      </div>
      
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2 text-sm text-gray-600">Loading messages...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Users className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p className="text-lg font-medium mb-2">No messages yet</p>
            <p className="text-sm">Start the conversation with your team</p>
          </div>
        ) : (
          Object.entries(groupedMessages).map(([date, dateMessages]) => (
            <div key={date}>
              {/* Date divider */}
              <div className="flex items-center my-4">
                <div className="flex-1 border-t border-gray-200" />
                <Badge variant="outline" className="mx-4 text-xs">
                  {date}
                </Badge>
                <div className="flex-1 border-t border-gray-200" />
              </div>
              
              {/* Messages for this date */}
              {dateMessages.map((message) => {
                const memberInfo = getMemberInfo(message.senderId)
                
                return (
                  <div key={message.id}>
                    {message.type === "system" ? (
                      <div className="text-center">
                        <Badge variant="outline" className="text-xs">
                          {message.content}
                        </Badge>
                      </div>
                    ) : (
                      <div className="flex gap-3 hover:bg-gray-50 p-2 rounded">
                        <div className="relative">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={message.senderAvatar || memberInfo.avatar} />
                            <AvatarFallback className="text-xs">
                              {getInitials(message.senderName)}
                            </AvatarFallback>
                          </Avatar>
                          <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${getStatusColor(memberInfo.status)}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm">{message.senderName}</span>
                            <span className="text-xs text-gray-500">{formatTime(message.timestamp)}</span>
                          </div>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">
                            {message.content}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))
        )}
        
        {/* Typing indicator */}
        {typingUsers.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>
              {typingUsers.length === 1
                ? `${typingUsers[0]} is typing...`
                : `${typingUsers.slice(0, -1).join(', ')} and ${typingUsers[typingUsers.length - 1]} are typing...`
              }
            </span>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>
      
      {/* Message input */}
      <div className="p-4 border-t bg-gray-50 rounded-b-lg">
        <form onSubmit={handleSendMessage} className="flex gap-2">
          <Input
            placeholder="Type your message..."
            value={newMessage}
            onChange={(e) => {
              setNewMessage(e.target.value)
              handleTypingIndicator()
            }}
            className="flex-1"
            disabled={isSending}
          />
          <Button 
            type="submit" 
            disabled={!newMessage.trim() || isSending}
            size="sm"
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </div>
    </div>
  )
}
