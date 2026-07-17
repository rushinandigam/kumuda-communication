"use client";

import { MessageCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface WhatsAppSession {
  id: number;
  sender_phone_number: string;
  is_active: boolean;
  auto_reply: boolean;
  last_message_at: string | null;
  created_at: string | null;
}

interface ContactListProps {
  sessions: WhatsAppSession[];
  selectedId: number | null;
  onSelect: (session: WhatsAppSession) => void;
  isLoading: boolean;
}

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
}

export function ContactList({
  sessions,
  selectedId,
  onSelect,
  isLoading,
}: ContactListProps) {
  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Loading sessions...
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center text-sm text-muted-foreground">
        <MessageCircle className="h-8 w-8 opacity-30" />
        <p>No conversations yet</p>
        <p className="text-xs">
          Incoming WhatsApp messages will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {sessions.map((session) => (
        <button
          key={session.id}
          type="button"
          onClick={() => onSelect(session)}
          className={cn(
            "flex w-full items-center gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-accent/50",
            selectedId === session.id && "bg-accent"
          )}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <MessageCircle className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <span className="truncate text-sm font-medium">
                {session.sender_phone_number}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatTimeAgo(session.last_message_at)}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              {session.auto_reply ? (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  AI
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  Manual
                </Badge>
              )}
              {!session.is_active && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                  Expired
                </Badge>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
