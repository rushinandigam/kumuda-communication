"use client";

import { Bot, User } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface WhatsAppSession {
  id: number;
  sender_phone_number: string;
  is_active: boolean;
  auto_reply: boolean;
  last_message_at: string | null;
}

interface ChatHeaderProps {
  session: WhatsAppSession;
  onToggleAutoReply: (value: boolean) => void;
}

export function ChatHeader({ session, onToggleAutoReply }: ChatHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b px-6 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
          <User className="h-4 w-4 text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold">{session.sender_phone_number}</p>
          <div className="flex items-center gap-2">
            {session.is_active ? (
              <Badge variant="default" className="text-[10px] px-1.5 py-0">
                Active
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                Expired
              </Badge>
            )}
          </div>
        </div>
      </div>
      <Button
        variant={session.auto_reply ? "default" : "outline"}
        size="sm"
        onClick={() => onToggleAutoReply(!session.auto_reply)}
        className="gap-1.5"
      >
        <Bot className="h-3.5 w-3.5" />
        {session.auto_reply ? "AI On" : "AI Off"}
      </Button>
    </div>
  );
}
