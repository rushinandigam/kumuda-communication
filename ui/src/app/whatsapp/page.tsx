"use client";

import { MessageCircle, Search, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { resolveBrowserBackendUrl } from "@/lib/apiClient";
import { useAppConfig } from "@/context/AppConfigContext";

import { ContactList } from "./components/ContactList";
import { ChatView } from "./components/ChatView";
import { ChatHeader } from "./components/ChatHeader";

interface WhatsAppSession {
  id: number;
  messaging_configuration_id: number;
  organization_id: number;
  workflow_id: number;
  workflow_run_id: number;
  sender_phone_number: string;
  is_active: boolean;
  auto_reply: boolean;
  last_message_at: string | null;
  created_at: string | null;
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
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const messagePollRef = useRef<NodeJS.Timeout | null>(null);

  const baseUrl = resolveBrowserBackendUrl(config?.backendApiEndpoint ?? null);

  useEffect(() => {
    if (!loading && !user) {
      redirectToLogin();
    }
  }, [loading, user, redirectToLogin]);

  const fetchSessions = async () => {
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
  };

  const fetchMessages = async (sessionId: number) => {
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
  };

  useEffect(() => {
    if (!loading && user) {
      fetchSessions();
      pollRef.current = setInterval(fetchSessions, 3000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loading, user]);

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
  }, [selectedSession?.id]);

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
          <h2 className="mb-3 text-lg font-semibold">WhatsApp Inbox</h2>
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
          onSelect={(session) => setSelectedSession(session)}
          isLoading={isLoading}
        />
      </div>

      {/* Right panel — chat view */}
      <div className="flex flex-1 flex-col">
        {selectedSession ? (
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
            <p>Select a conversation to view messages</p>
          </div>
        )}
      </div>
    </div>
  );
}
