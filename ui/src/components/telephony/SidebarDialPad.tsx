"use client";

import { Delete, Loader2, Mic, MicOff, Phone, PhoneOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  getTurnCredentialsApiV1TurnCredentialsGet,
  initiateCallApiV1TelephonyInitiateCallPost,
  listPhoneNumbersApiV1OrganizationsTelephonyConfigsConfigIdPhoneNumbersGet,
  listTelephonyConfigurationsApiV1OrganizationsTelephonyConfigsGet,
} from "@/client/sdk.gen";
import type {
  PhoneNumberResponse,
  TelephonyConfigurationListItem,
} from "@/client/types.gen";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { client } from "@/client/client.gen";
import { useAuth } from "@/lib/auth";
import { resolveBrowserBackendUrl } from "@/lib/apiClient";
import { cn } from "@/lib/utils";

const DIAL_KEYS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["*", "0", "#"],
];

const KEY_LETTERS: Record<string, string> = {
  "2": "ABC",
  "3": "DEF",
  "4": "GHI",
  "5": "JKL",
  "6": "MNO",
  "7": "PQRS",
  "8": "TUV",
  "9": "WXYZ",
  "0": "+",
};

type CallStatus = "idle" | "connecting" | "ringing" | "connected" | "ended" | "failed";

export function SidebarDialPad() {
  const { getAccessToken } = useAuth();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState(0);

  const [telephonyConfigs, setTelephonyConfigs] = useState<TelephonyConfigurationListItem[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState<string>("");
  const [fromPhoneNumbers, setFromPhoneNumbers] = useState<PhoneNumberResponse[]>([]);
  const [selectedFromNumberId, setSelectedFromNumberId] = useState<string>("");

  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const cfgRes = await listTelephonyConfigurationsApiV1OrganizationsTelephonyConfigsGet({});
        const cfgs = cfgRes.data?.configurations ?? [];
        setTelephonyConfigs(cfgs);
        const defaultCfg = cfgs.find((c) => c.is_default_outbound) ?? cfgs[0];
        if (defaultCfg) setSelectedConfigId(String(defaultCfg.id));
      } catch {
        // silently fail — configs are optional
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (!selectedConfigId) {
      setFromPhoneNumbers([]);
      setSelectedFromNumberId("");
      return;
    }
    let cancelled = false;
    const fetchNumbers = async () => {
      try {
        const res = await listPhoneNumbersApiV1OrganizationsTelephonyConfigsConfigIdPhoneNumbersGet({
          path: { config_id: Number(selectedConfigId) },
        });
        if (cancelled) return;
        const active = (res.data?.phone_numbers ?? []).filter((p) => p.is_active);
        setFromPhoneNumbers(active);
        const def = active.find((p) => p.is_default_caller_id) ?? active[0];
        setSelectedFromNumberId(def ? String(def.id) : "");
      } catch {
        if (!cancelled) setFromPhoneNumbers([]);
      }
    };
    fetchNumbers();
    return () => { cancelled = true; };
  }, [selectedConfigId]);

  const startTimer = useCallback(() => {
    setDuration(0);
    timerRef.current = setInterval(() => {
      setDuration((d) => d + 1);
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleKeyPress = useCallback((key: string) => {
    if (callStatus !== "idle" && callStatus !== "failed" && callStatus !== "ended") return;
    setPhoneNumber((prev) => prev + key);
    setError(null);
  }, [callStatus]);

  const handleBackspace = useCallback(() => {
    setPhoneNumber((prev) => prev.slice(0, -1));
  }, []);

  // Allow typing numbers from keyboard when not focused on the input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (callStatus !== "idle" && callStatus !== "failed" && callStatus !== "ended") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (/^[0-9*#]$/.test(e.key)) {
        setPhoneNumber((prev) => prev + e.key);
        setError(null);
      } else if (e.key === "+" && phoneNumber === "") {
        setPhoneNumber("+");
      } else if (e.key === "Backspace") {
        setPhoneNumber((prev) => prev.slice(0, -1));
      } else if (e.key === "Enter" && phoneNumber) {
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [callStatus, phoneNumber]);

  const cleanup = useCallback(() => {
    stopTimer();
    if (wsRef.current) {
      try { wsRef.current.close(); } catch {}
      wsRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
  }, [stopTimer]);

  const handleCall = async () => {
    if (!phoneNumber) return;

    setCallStatus("connecting");
    setError(null);

    try {
      const token = await getAccessToken();

      // 1. Initiate manual call session on backend
      const initiateRes = await fetch("/api/v1/manual-call/initiate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          phone_number: phoneNumber.startsWith("+") ? phoneNumber : `+${phoneNumber}`,
          telephony_configuration_id: selectedConfigId ? Number(selectedConfigId) : null,
          from_phone_number_id: selectedFromNumberId ? Number(selectedFromNumberId) : null,
        }),
      });

      if (!initiateRes.ok) {
        const err = await initiateRes.json().catch(() => ({ detail: "Failed to initiate call" }));
        throw new Error(err.detail || "Failed to initiate call");
      }

      const { session_id } = await initiateRes.json();

      // 2. Get TURN credentials
      const turnRes = await getTurnCredentialsApiV1TurnCredentialsGet({});
      const turnCreds = turnRes.data;

      // 3. Get user media (microphone)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;

      // 4. Create WebRTC peer connection
      const iceServers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
      if (turnCreds) {
        iceServers.push({
          urls: turnCreds.uris,
          username: turnCreds.username,
          credential: turnCreds.password,
        });
      }

      const pc = new RTCPeerConnection({ iceServers });
      pcRef.current = pc;

      // Add local audio track
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      // Handle remote audio
      pc.ontrack = (event) => {
        if (remoteAudioRef.current && event.streams[0]) {
          remoteAudioRef.current.srcObject = event.streams[0];
          remoteAudioRef.current.play().catch(() => {});
        }
      };

      // 5. Connect signaling WebSocket (connect directly to backend, not through Next.js proxy)
      const baseUrl = client.getConfig().baseUrl || resolveBrowserBackendUrl();
      const wsUrl = baseUrl.replace(/^http/, "ws");
      const ws = new WebSocket(`${wsUrl}/api/v1/manual-call/ws/${session_id}?token=${token}`);
      wsRef.current = ws;

      ws.onopen = async () => {
        // Create and send offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        ws.send(JSON.stringify({
          type: "offer",
          payload: {
            sdp: offer.sdp,
            type: offer.type,
            pc_id: session_id,
          },
        }));
      };

      ws.onmessage = async (event) => {
        const msg = JSON.parse(event.data);

        if (msg.type === "answer") {
          await pc.setRemoteDescription(new RTCSessionDescription({
            sdp: msg.payload.sdp,
            type: msg.payload.type,
          }));
        } else if (msg.type === "call-status") {
          const status = msg.payload.status;
          if (status === "ringing") {
            setCallStatus("ringing");
          } else if (status === "connected" || status === "answered") {
            setCallStatus("connected");
            startTimer();
          } else if (status === "ended") {
            setCallStatus("ended");
            stopTimer();
            cleanup();
          } else if (status === "failed") {
            setCallStatus("failed");
            setError(msg.payload.error || "Call failed");
            cleanup();
          }
        } else if (msg.type === "error") {
          setCallStatus("failed");
          setError(msg.payload.message || "Connection error");
          cleanup();
        }
      };

      ws.onerror = () => {
        setCallStatus("failed");
        setError("WebSocket connection failed");
        cleanup();
      };

      ws.onclose = () => {
        if (callStatus !== "idle" && callStatus !== "ended" && callStatus !== "failed") {
          setCallStatus("ended");
          stopTimer();
        }
      };

      // Send ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: "ice-candidate",
            payload: {
              candidate: {
                candidate: event.candidate.candidate,
                sdpMid: event.candidate.sdpMid,
                sdpMLineIndex: event.candidate.sdpMLineIndex,
              },
            },
          }));
        }
      };

      setCallStatus("ringing");
    } catch (err) {
      setCallStatus("failed");
      setError(err instanceof Error ? err.message : "Failed to start call");
      cleanup();
    }
  };

  const handleHangup = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "hangup" }));
    }
    setCallStatus("ended");
    stopTimer();
    cleanup();
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setMuted(!audioTrack.enabled);
      }
    }
  };

  const isInCall = callStatus === "connecting" || callStatus === "ringing" || callStatus === "connected";

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      {/* Hidden audio element for remote audio */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {/* Telephony config (only show when idle) */}
      {!isInCall && telephonyConfigs.length > 1 && (
        <Select value={selectedConfigId} onValueChange={setSelectedConfigId}>
          <SelectTrigger className="w-full h-8 text-xs">
            <SelectValue placeholder="Provider" />
          </SelectTrigger>
          <SelectContent>
            {telephonyConfigs.map((cfg) => (
              <SelectItem key={cfg.id} value={String(cfg.id)}>
                {cfg.name} ({cfg.provider})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {!isInCall && fromPhoneNumbers.length > 1 && (
        <Select value={selectedFromNumberId} onValueChange={setSelectedFromNumberId}>
          <SelectTrigger className="w-full h-8 text-xs">
            <SelectValue placeholder="Caller ID" />
          </SelectTrigger>
          <SelectContent>
            {fromPhoneNumbers.map((pn) => (
              <SelectItem key={pn.id} value={String(pn.id)}>
                {pn.label ? `${pn.label} - ${pn.address}` : pn.address}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Phone number display/input */}
      <div className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2 text-center min-h-[44px] flex items-center justify-center">
        {isInCall ? (
          <div className="flex flex-col items-center gap-0.5">
            <span className="font-mono text-lg font-semibold text-foreground">{phoneNumber}</span>
            <span className={cn(
              "text-xs font-medium",
              callStatus === "connecting" && "text-yellow-600",
              callStatus === "ringing" && "text-blue-600",
              callStatus === "connected" && "text-green-600",
            )}>
              {callStatus === "connecting" && "Connecting..."}
              {callStatus === "ringing" && "Ringing..."}
              {callStatus === "connected" && formatDuration(duration)}
            </span>
          </div>
        ) : (
          <input
            type="tel"
            value={phoneNumber}
            onChange={(e) => {
              const val = e.target.value.replace(/[^0-9+*#]/g, "");
              setPhoneNumber(val);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && phoneNumber) {
                e.preventDefault();
                handleCall();
              }
            }}
            placeholder="Enter number"
            className="w-full bg-transparent text-center font-mono text-lg font-semibold text-foreground placeholder:text-sm placeholder:font-normal placeholder:text-muted-foreground outline-none"
          />
        )}
      </div>

      {/* Dial pad grid (hide during call) */}
      {!isInCall && (
        <div className="grid grid-cols-3 gap-2 w-full">
          {DIAL_KEYS.map((row) =>
            row.map((key) => (
              <button
                key={key}
                onClick={() => handleKeyPress(key)}
                className="h-12 rounded-lg border border-border bg-background hover:bg-accent active:bg-accent/80 transition-all flex flex-col items-center justify-center cursor-pointer shadow-sm active:shadow-none active:scale-95"
              >
                <span className="text-base font-semibold text-foreground">{key}</span>
                {KEY_LETTERS[key] && (
                  <span className="text-[9px] text-muted-foreground tracking-widest">
                    {KEY_LETTERS[key]}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-3 mt-1">
        {!isInCall ? (
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBackspace}
              disabled={!phoneNumber}
              className="h-11 w-11 rounded-full"
            >
              <Delete className="h-4 w-4" />
            </Button>

            <Button
              onClick={handleCall}
              disabled={!phoneNumber}
              className="h-12 w-12 rounded-full bg-green-600 hover:bg-green-700 text-white shadow-lg"
            >
              <Phone className="h-5 w-5" />
            </Button>

            <div className="h-11 w-11" />
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleMute}
              className={cn(
                "h-11 w-11 rounded-full",
                muted && "bg-red-100 text-red-600 hover:bg-red-200"
              )}
            >
              {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>

            <Button
              onClick={handleHangup}
              className="h-12 w-12 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-lg"
            >
              <PhoneOff className="h-5 w-5" />
            </Button>

            <div className="h-11 w-11" />
          </>
        )}
      </div>

      {/* Status messages */}
      {error && (
        <div className="w-full text-center text-xs text-red-500 bg-red-50 dark:bg-red-950/20 rounded-md px-2 py-1.5">
          {error}
        </div>
      )}
      {callStatus === "ended" && !error && (
        <div className="w-full text-center text-xs text-muted-foreground bg-muted/50 rounded-md px-2 py-1.5">
          Call ended{duration > 0 ? ` · ${formatDuration(duration)}` : ""}
        </div>
      )}
    </div>
  );
}
