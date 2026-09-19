import { redirect } from "next/navigation";
import { fetchProfileServer } from "@/services/profile.server";

export default async function LandingLayout({ children }: { children: React.ReactNode }) {
  const profile = await fetchProfileServer();
  if (profile?.isWorker) redirect("/dashboard");
  return children;
}
