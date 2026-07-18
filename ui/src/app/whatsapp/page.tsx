"use client";

import { MessageCircle, Plus, Search, Send, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppConfig } from "@/context/AppConfigContext";
import { resolveBrowserBackendUrl } from "@/lib/apiClient";
import { useAuth } from "@/lib/auth";

import { ChatHeader } from "./components/ChatHeader";
import { ChatView } from "./components/ChatView";
import { ContactList } from "./components/ContactList";

interface WhatsAppSession {
  id: number;
  sender_phone_number: string;
  is_active: boolean;
  auto_reply: boolean;
  last_message_at: string | null;
  created_at: string | null;
  messaging_configuration_id?: number;
  organization_id?: number;
  workflow_id?: number;
  workflow_run_id?: number;
}

interface Message {
  role: "user" | "assistant";
  text: string;
  timestamp: string | null;
}

export default function WhatsAppInboxPage() {
  const { user, getAccessToken, redirectToLogin, loading } = useAuth();
  const { config } = useAppConfig();
  const [sessions, setSessions] = useState<WhatsAppSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<WhatsAppSession | null>(null);
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

  const baseUrl = resolveBrowserBackendUrl(config?.backendApiEndpoint ?? null);

  useEffect(() => {
    if (!loading && !user) {
      redirectToLogin();
    }
  }, [loading, user, redirectToLogin]);

  const fetchSessions = useCallback(async () => {
    try {
      const token = await getAccessToken();
      const res = await fetch(`${baseUrl}/api/v1/integrations/whatsapp/sessions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
      }
    } catch (err) {
      console.error("Failed to fetch sessions:", err);
    } finally {
      setIsLoading(false);
    }
  }, [baseUrl, getAccessToken]);

  const fetchMessages = useCallback(async (sessionId: number) => {
    try {
      const token = await getAccessToken();
      const res = await fetch(
        `${baseUrl}/api/v1/integrations/whatsapp/sessions/${sessionId}/messages`,
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
      fetchSessions();
      pollRef.current = setInterval(fetchSessions, 3000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loading, user, fetchSessions]);

  useEffect(() => {
    if (selectedSession) {
      fetchMessages(selectedSession.id);
      messagePollRef.current = setInterval(
        () => fetchMessages(selectedSession.id),
        2000
      );
    }
    return () => {
      if (messagePollRef.current) clearInterval(messagePollRef.current);
    };
  }, [selectedSession, fetchMessages]);

  const handleSendReply = async () => {
    if (!selectedSession || !replyText.trim()) return;
    setIsSending(true);
    try {
      const token = await getAccessToken();
      await fetch(
        `${baseUrl}/api/v1/integrations/whatsapp/sessions/${selectedSession.id}/reply`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text: replyText }),
        }
      );
      setReplyText("");
      fetchMessages(selectedSession.id);
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
      setNewPhoneNumber("");
      setNewMessage("");
      setShowNewChat(false);
      fetchSessions();
    } catch (err) {
      console.error("Failed to send message:", err);
    } finally {
      setIsSendingNew(false);
    }
  };

  const handleToggleAutoReply = async (autoReply: boolean) => {
    if (!selectedSession) return;
    try {
      const token = await getAccessToken();
      await fetch(
        `${baseUrl}/api/v1/integrations/whatsapp/sessions/${selectedSession.id}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ auto_reply: autoReply }),
        }
      );
      setSelectedSession({ ...selectedSession, auto_reply: autoReply });
    } catch (err) {
      console.error("Failed to toggle auto-reply:", err);
    }
  };

  const filteredSessions = sessions.filter((s) =>
    s.sender_phone_number.includes(searchQuery)
  );

  if (loading || !user) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Left panel — contact list */}
      <div className="flex w-80 flex-col border-r bg-sidebar">
        <div className="border-b p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">WhatsApp Inbox</h2>
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
        <ContactList
          sessions={filteredSessions}
          selectedId={selectedSession?.id ?? null}
          onSelect={(session) => {
            setSelectedSession(session);
            setShowNewChat(false);
          }}
          isLoading={isLoading}
        />
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
        ) : selectedSession ? (
          <>
            <ChatHeader
              session={selectedSession}
              onToggleAutoReply={handleToggleAutoReply}
            />
            <ChatView messages={messages} />
            <div className="border-t p-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Type a reply..."
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
