import { redirect } from "next/navigation";

export default function TelephonySettingsIndex() {
  redirect("/settings/telephony/providers");
}
