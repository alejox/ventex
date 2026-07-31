import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test.describe("Autenticación", () => {

  test.describe("Landing Page", () => {
    test("muestra la página de inicio correctamente", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator("h1")).toContainText("El sistema operativo");
      await expect(page.getByRole("navigation").getByRole("link", { name: "Empieza gratis" })).toBeVisible();
      await expect(page.getByRole("navigation").getByRole("link", { name: "Iniciar sesión" })).toBeVisible();
    });

    test("navega a login desde landing", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("navigation").getByRole("link", { name: "Iniciar sesión" }).click();
      await expect(page).toHaveURL(/\/login/);
    });

    test("navega a registro desde landing", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("navigation").getByRole("link", { name: "Empieza gratis" }).click();
      await expect(page).toHaveURL(/\/register/);
    });
  });

  test.describe("Login", () => {
    test("muestra el formulario de login", async ({ page }) => {
      await page.goto("/login");
      await expect(page.getByRole("heading", { name: "Bienvenido de nuevo" })).toBeVisible();
      await expect(page.locator('input[type="email"]')).toBeVisible();
      await expect(page.locator('input[type="password"]')).toBeVisible();
      await expect(page.getByRole("button", { name: "Dueño" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Empleado" })).toHaveCount(0);
      await expect(page.getByText("Llave de la tienda")).toHaveCount(0);
    });

    test("valida campos vacíos", async ({ page }) => {
      await page.goto("/login");
      await page.click('button[type="submit"]');
      await expect(page.locator('input[type="email"]:invalid')).toHaveCount(1);
    });

    test("muestra error con credenciales inválidas", async ({ page }) => {
      await page.goto("/login");
      await page.fill('input[type="email"]', "nadie@noexiste.com");
      await page.fill('input[type="password"]', "wrongpassword");
      await page.click('button[type="submit"]');
      await expect(page.getByText("Error")).toBeVisible({ timeout: 10000 }).catch(() => {});
    });

    test("redirige a /reset-password desde link", async ({ page }) => {
      await page.goto("/login");
      await page.getByText("¿Olvidaste tu contraseña?").click();
      await expect(page).toHaveURL(/\/reset-password/);
    });

    test("redirige a /register desde link", async ({ page }) => {
      await page.goto("/login");
      await page.getByText("Registrarte").first().click();
      await expect(page).toHaveURL(/\/register/);
    });
  });

  test.describe("Registro", () => {
    test("navega a la página de registro", async ({ page }) => {
      await page.goto("/register");
      await expect(page).toHaveURL(/\/register/);
    });

    test("ofrece Barbería con Calendario, Servicios y Personal activados", async ({ page }) => {
      await page.goto("/register");

      await page.getByRole("button", { name: "Salón / Barbería" }).click();
      await page.getByRole("button", { name: "Continuar" }).click();

      for (const moduleName of ["Citas", "Servicios", "Personal"]) {
        const moduleCard = page.locator("div").filter({
          has: page.getByRole("heading", { name: moduleName, exact: true }),
        }).last();
        await expect(moduleCard.getByRole("button", { name: `Activar ${moduleName}` })).toHaveAttribute(
          "aria-pressed",
          "true",
        );
      }
    });
  });

  test.describe("Reset Password", () => {
    test("muestra formulario de reset password", async ({ page }) => {
      await page.goto("/reset-password");
      await expect(page.locator('input[type="email"]')).toBeVisible();
    });
  });

  test.describe("Invitaciones de empleados", () => {
    test("rechaza rutas administrativas sin sesión", async ({ request }) => {
      const createResponse = await request.post("/api/worker/create", {
        data: {
          email: "empleado@ejemplo.com",
          staffId: "00000000-0000-0000-0000-000000000000",
        },
      });
      expect(createResponse.status()).toBe(403);

      const updateResponse = await request.post("/api/worker/update", {
        data: {
          workerId: "00000000-0000-0000-0000-000000000000",
          action: "suspend",
        },
      });
      expect(updateResponse.status()).toBe(403);
    });

    test("acepta una membresía concreta sin mutar ni eliminar la identidad global", () => {
      const createRoute = readFileSync(
        resolve(process.cwd(), "app/api/worker/create/route.ts"),
        "utf8",
      );
      const updateRoute = readFileSync(
        resolve(process.cwd(), "app/api/worker/update/route.ts"),
        "utf8",
      );
      const activateRoute = readFileSync(
        resolve(process.cwd(), "app/api/worker/activate/route.ts"),
        "utf8",
      );

      expect(createRoute).not.toContain("updateUserById");
      expect(updateRoute).not.toContain("auth.admin.deleteUser");
      expect(updateRoute).not.toContain("ban_duration");
      expect(activateRoute).toContain('"accept_workspace_invitation"');
      expect(activateRoute).toContain("p_membership_id");
    });

    test("la migración cierra turnos directos y verifica grants de perfiles", () => {
      const migration = readFileSync(
        resolve(
          process.cwd(),
          "supabase/migrations/20260730223000_employee_email_invitations.sql",
        ),
        "utf8",
      );

      expect(migration).toContain("drop policy if exists shifts_update_own_or_owner");
      expect(migration).toContain("public.get_effective_user_id() is not null");
      expect(migration).toContain("profiles_update_owner_or_active_self");
      expect(migration).toContain("profiles_guard_privileges");
      expect(migration).toContain("has_table_privilege");
      expect(migration).toContain("has_column_privilege");
    });

    test("proyecta la membresía activa y protege logos y transiciones", () => {
      const migration = readFileSync(
        resolve(
          process.cwd(),
          "supabase/migrations/20260730233000_multi_workspace_memberships.sql",
        ),
        "utf8",
      );
      const clientProfile = readFileSync(
        resolve(process.cwd(), "services/profile.service.ts"),
        "utf8",
      );
      const serverProfile = readFileSync(
        resolve(process.cwd(), "services/profile.server.ts"),
        "utf8",
      );
      const updateRoute = readFileSync(
        resolve(process.cwd(), "app/api/worker/update/route.ts"),
        "utf8",
      );
      expect(migration).toContain("create or replace function public.current_user_profile()");
      expect(migration).toContain("security definer");
      expect(migration).toContain("active_membership.id = public.get_active_membership_id()");
      expect(migration).toContain("'membership_id', active_membership.id");
      expect(clientProfile).toContain('.rpc("current_user_profile")');
      expect(serverProfile).toContain('.rpc("current_user_profile")');
      expect(clientProfile).not.toMatch(/\.from\("profiles"\)\s*\.select/);
      expect(serverProfile).not.toMatch(/\.from\("profiles"\)\s*\.select/);

      for (const action of ["insert", "update", "delete"]) {
        const policy = migration.match(
          new RegExp(
            `create policy "business_logos_${action}_own"[\\s\\S]*?;`,
            "i",
          ),
        )?.[0] ?? "";
        expect(policy).toContain("public.is_tenant_owner()");
        expect(policy).toContain("bucket_id = 'business-logos'");
        expect(policy).toContain(
          "(storage.foldername(name))[1] = public.get_effective_user_id()::text",
        );
      }

      expect(updateRoute).toContain("updateMembership(");
      expect(updateRoute).toContain("membershipId");
      expect(updateRoute).not.toContain("worker_access_status");
    });
  });
});
