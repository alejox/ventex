import { redirect } from "next/navigation";

/** Preserve links to the former haircut-only report. */
export default function HaircutsRedirect() {
  redirect("/dashboard/staff/servicios");
}
