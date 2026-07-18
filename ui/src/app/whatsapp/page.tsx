"use client";

import { MessageCircle, Plus, Search, Send, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppConfig } from "@/context/AppConfigContext";
import { resolveBrowserBackendUrl } from "@/lib/apiClient";
import { useAuth } from "@/lib/auth";

interface Conversation {
  phone_number: string;
  last_message_at: string | null;
  message_count: number;
  last_message: string | null;
}

interface Message {
  id: number;
  direction: "inbound" | "outbound";
  role: "user" | "assistant";
  text: string;
  message_type: string;
  template_name: string | null;
  timestamp: string | null;
}

export default function WhatsAppInboxPage() {
  const { user, getAccessToken, redirectToLogin, loading } = useAuth();
  const { config } = useAppConfig();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [replyText, setReplyText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [newPhoneNumber, setNewPhoneNumber] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [isSendingNew, setIsSendingNew] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const messagePollRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const baseUrl = resolveBrowserBackendUrl(config?.backendApiEndpoint ?? null);

  useEffect(() => {
    if (!loading && !user) {
      redirectToLogin();
    }
  }, [loading, user, redirectToLogin]);

  const fetchConversations = useCallback(async () => {
    try {
      const token = await getAccessToken();
      const res = await fetch(`${baseUrl}/api/v1/integrations/whatsapp/conversations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    } catch (err) {
      console.error("Failed to fetch conversations:", err);
    } finally {
      setIsLoading(false);
    }
  }, [baseUrl, getAccessToken]);

  const fetchMessages = useCallback(async (phone: string) => {
    try {
      const token = await getAccessToken();
      const res = await fetch(
        `${baseUrl}/api/v1/integrations/whatsapp/conversations/${phone}/messages`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch (err) {
      console.error("Failed to fetch messages:", err);
    }
  }, [baseUrl, getAccessToken]);

  useEffect(() => {
    if (!loading && user) {
      fetchConversations();
      pollRef.current = setInterval(fetchConversations, 5000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loading, user, fetchConversations]);

  useEffect(() => {
    if (selectedPhone) {
      fetchMessages(selectedPhone);
      messagePollRef.current = setInterval(() => fetchMessages(selectedPhone), 3000);
    }
    return () => {
      if (messagePollRef.current) clearInterval(messagePollRef.current);
    };
  }, [selectedPhone, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendReply = async () => {
    if (!selectedPhone || !replyText.trim()) return;
    setIsSending(true);
    try {
      const token = await getAccessToken();
      await fetch(`${baseUrl}/api/v1/integrations/whatsapp/send`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ to: selectedPhone, text: replyText.trim() }),
      });
      setReplyText("");
      fetchMessages(selectedPhone);
    } catch (err) {
      console.error("Failed to send reply:", err);
    } finally {
      setIsSending(false);
    }
  };

  const handleSendNewMessage = async () => {
    if (!newPhoneNumber.trim() || !newMessage.trim()) return;
    setIsSendingNew(true);
    try {
      const token = await getAccessToken();
      await fetch(`${baseUrl}/api/v1/integrations/whatsapp/send`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: newPhoneNumber.trim(),
          text: newMessage.trim(),
        }),
      });
      const phone = newPhoneNumber.trim().replace(/^\+/, "");
      setNewPhoneNumber("");
      setNewMessage("");
      setShowNewChat(false);
      setSelectedPhone(phone);
      fetchConversations();
      fetchMessages(phone);
    } catch (err) {
      console.error("Failed to send message:", err);
    } finally {
      setIsSendingNew(false);
    }
  };

  const filteredConversations = conversations.filter((c) =>
    c.phone_number.includes(searchQuery)
  );

  const formatTime = (ts: string | null) => {
    if (!ts) return "";
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  if (loading || !user) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Left panel — conversations list */}
      <div className="flex w-80 flex-col border-r bg-sidebar">
        <div className="border-b p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">WhatsApp</h2>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setShowNewChat(true)}
              title="New message"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by phone..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">Loading...</div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No conversations yet
            </div>
          ) : (
            filteredConversations.map((conv) => (
              <button
                key={conv.phone_number}
                onClick={() => {
                  setSelectedPhone(conv.phone_number);
                  setShowNewChat(false);
                }}
                className={`w-full border-b px-4 py-3 text-left transition-colors hover:bg-accent ${
                  selectedPhone === conv.phone_number ? "bg-accent" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">+{conv.phone_number}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatTime(conv.last_message_at)}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {conv.last_message || "No messages"}
                </p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right panel — chat view or new message form */}
      <div className="flex flex-1 flex-col">
        {showNewChat ? (
          <div className="flex flex-1 flex-col">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h3 className="text-base font-medium">New Message</h3>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setShowNewChat(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8">
              <div className="w-full max-w-md space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                    Phone Number
                  </label>
                  <Input
                    placeholder="e.g. 919876543210"
                    value={newPhoneNumber}
                    onChange={(e) => setNewPhoneNumber(e.target.value)}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Include country code without + (e.g. 91 for India)
                  </p>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                    Message
                  </label>
                  <textarea
                    className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="Type your message..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                  />
                </div>
                <Button
                  onClick={handleSendNewMessage}
                  disabled={isSendingNew || !newPhoneNumber.trim() || !newMessage.trim()}
                  className="w-full"
                >
                  <Send className="mr-2 h-4 w-4" />
                  {isSendingNew ? "Sending..." : "Send Message"}
                </Button>
              </div>
            </div>
          </div>
        ) : selectedPhone ? (
          <>
            {/* Chat header */}
            <div className="flex items-center justify-between border-b px-6 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
                  <MessageCircle className="h-4 w-4 text-green-700 dark:text-green-300" />
                </div>
                <span className="font-medium">+{selectedPhone}</span>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto bg-muted/30 px-4 py-4">
              {messages.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No messages yet
                </div>
              ) : (
                <div className="space-y-2">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[70%] rounded-lg px-3 py-2 text-sm ${
                          msg.direction === "outbound"
                            ? "bg-green-600 text-white"
                            : "bg-background border"
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{msg.text}</p>
                        <p
                          className={`mt-1 text-[10px] ${
                            msg.direction === "outbound"
                              ? "text-green-100"
                              : "text-muted-foreground"
                          }`}
                        >
                          {formatTime(msg.timestamp)}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Reply input */}
            <div className="border-t p-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Type a message..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendReply();
                    }
                  }}
                />
                <Button
                  onClick={handleSendReply}
                  disabled={isSending || !replyText.trim()}
                  size="icon"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
            <MessageCircle className="h-12 w-12 opacity-30" />
            <p>Select a conversation or start a new one</p>
            <Button variant="outline" onClick={() => setShowNewChat(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Message
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
