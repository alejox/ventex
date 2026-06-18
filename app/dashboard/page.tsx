import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import DashboardHome from "@/components/DashboardHome";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const fullName = user.user_metadata?.full_name || "Admin";

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-on-surface">
          Bienvenido de nuevo, {fullName.split(" ")[0]}
        </h1>
        <p className="text-on-surface-variant text-sm mt-1">
          {new Date().toLocaleDateString("es-ES", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      <DashboardHome />
    </div>
  );
}
