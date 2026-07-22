"use client";

import { Delete, Loader2, Phone, PhoneOff } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  getWorkflowsApiV1WorkflowFetchGet,
  initiateCallApiV1TelephonyInitiateCallPost,
  listPhoneNumbersApiV1OrganizationsTelephonyConfigsConfigIdPhoneNumbersGet,
  listTelephonyConfigurationsApiV1OrganizationsTelephonyConfigsGet,
} from "@/client/sdk.gen";
import type {
  PhoneNumberResponse,
  TelephonyConfigurationListItem,
  WorkflowListResponse,
} from "@/client/types.gen";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

export function DialPad() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [calling, setCalling] = useState(false);
  const [callActive, setCallActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [workflows, setWorkflows] = useState<WorkflowListResponse[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>("");
  const [telephonyConfigs, setTelephonyConfigs] = useState<TelephonyConfigurationListItem[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState<string>("");
  const [fromPhoneNumbers, setFromPhoneNumbers] = useState<PhoneNumberResponse[]>([]);
  const [selectedFromNumberId, setSelectedFromNumberId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [wfRes, cfgRes] = await Promise.all([
          getWorkflowsApiV1WorkflowFetchGet({}),
          listTelephonyConfigurationsApiV1OrganizationsTelephonyConfigsGet({}),
        ]);

        const wfs = wfRes.data ?? [];
        setWorkflows(wfs);
        if (wfs.length > 0) setSelectedWorkflowId(String(wfs[0].id));

        const cfgs = cfgRes.data?.configurations ?? [];
        setTelephonyConfigs(cfgs);
        const defaultCfg = cfgs.find((c) => c.is_default_outbound) ?? cfgs[0];
        if (defaultCfg) setSelectedConfigId(String(defaultCfg.id));
      } catch {
        setError("Failed to load configuration");
      } finally {
        setLoading(false);
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

  const handleKeyPress = useCallback((key: string) => {
    setPhoneNumber((prev) => prev + key);
    setError(null);
    setSuccess(null);
  }, []);

  const handleBackspace = useCallback(() => {
    setPhoneNumber((prev) => prev.slice(0, -1));
  }, []);

  const handleCall = async () => {
    if (!phoneNumber || !selectedWorkflowId) return;

    setCalling(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await initiateCallApiV1TelephonyInitiateCallPost({
        body: {
          workflow_id: Number(selectedWorkflowId),
          phone_number: phoneNumber.startsWith("+") ? phoneNumber : `+${phoneNumber}`,
          telephony_configuration_id: selectedConfigId ? Number(selectedConfigId) : null,
          from_phone_number_id: selectedFromNumberId ? Number(selectedFromNumberId) : null,
        },
      });

      if (response.error) {
        const errMsg = typeof response.error === "string"
          ? response.error
          : (response.error as { detail?: string }).detail || "Call failed";
        setError(errMsg);
      } else {
        setCallActive(true);
        setSuccess("Call initiated successfully");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to initiate call");
    } finally {
      setCalling(false);
    }
  };

  const handleHangup = () => {
    setCallActive(false);
    setSuccess(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-[320px] mx-auto">
      {/* Voice Agent selector */}
      <div className="w-full space-y-3">
        <Select value={selectedWorkflowId} onValueChange={setSelectedWorkflowId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select voice agent" />
          </SelectTrigger>
          <SelectContent>
            {workflows.map((wf) => (
              <SelectItem key={wf.id} value={String(wf.id)}>
                {wf.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {telephonyConfigs.length > 1 && (
          <Select value={selectedConfigId} onValueChange={setSelectedConfigId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Telephony provider" />
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

        {fromPhoneNumbers.length > 1 && (
          <Select value={selectedFromNumberId} onValueChange={setSelectedFromNumberId}>
            <SelectTrigger className="w-full">
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
      </div>

      {/* Phone number display */}
      <div className="w-full rounded-xl border border-border bg-muted/30 px-4 py-3 text-center min-h-[56px] flex items-center justify-center">
        <span className={cn(
          "font-mono tracking-wider transition-all",
          phoneNumber ? "text-2xl font-semibold text-foreground" : "text-lg text-muted-foreground"
        )}>
          {phoneNumber || "Enter number"}
        </span>
      </div>

      {/* Dial pad grid */}
      <div className="grid grid-cols-3 gap-3 w-full">
        {DIAL_KEYS.map((row) =>
          row.map((key) => (
            <button
              key={key}
              onClick={() => handleKeyPress(key)}
              className="h-16 rounded-xl border border-border bg-white hover:bg-accent active:bg-accent/80 transition-all flex flex-col items-center justify-center cursor-pointer shadow-sm active:shadow-none active:scale-95"
            >
              <span className="text-xl font-semibold text-foreground">{key}</span>
              {KEY_LETTERS[key] && (
                <span className="text-[10px] text-muted-foreground tracking-widest mt-0.5">
                  {KEY_LETTERS[key]}
                </span>
              )}
            </button>
          ))
        )}
      </div>

      {/* Action buttons row */}
      <div className="flex items-center gap-4 mt-2">
        {/* Backspace */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleBackspace}
          disabled={!phoneNumber}
          className="h-14 w-14 rounded-full"
        >
          <Delete className="h-5 w-5" />
        </Button>

        {/* Call / Hangup button */}
        {!callActive ? (
          <Button
            onClick={handleCall}
            disabled={calling || !phoneNumber || !selectedWorkflowId}
            className="h-14 w-14 rounded-full bg-green-600 hover:bg-green-700 text-white shadow-lg"
          >
            {calling ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <Phone className="h-6 w-6" />
            )}
          </Button>
        ) : (
          <Button
            onClick={handleHangup}
            className="h-14 w-14 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-lg"
          >
            <PhoneOff className="h-6 w-6" />
          </Button>
        )}

        {/* Spacer for symmetry */}
        <div className="h-14 w-14" />
      </div>

      {/* Status messages */}
      {error && (
        <div className="w-full text-center text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">
          {error}
        </div>
      )}
      {success && (
        <div className="w-full text-center text-sm text-green-600 bg-green-50 rounded-lg px-3 py-2">
          {success}
        </div>
      )}
    </div>
  );
}
