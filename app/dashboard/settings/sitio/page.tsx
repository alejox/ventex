import { redirect } from "next/navigation";

export default function LegacySiteSettingsPage() {
  redirect("/dashboard/landing");
}
