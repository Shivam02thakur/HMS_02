import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Role =
  | "admin"
  | "receptionist"
  | "doctor"
  | "pharmacist"
  | "lab_technician";

const allowedRoles: Role[] = [
  "admin",
  "receptionist",
  "doctor",
  "pharmacist",
  "lab_technician",
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: "Supabase server environment is not configured." }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Missing authentication token." }, 401);
    }

    const accessToken = authHeader.replace("Bearer ", "").trim();

    // Client using the caller's access token: used only to identify the caller.
    const callerClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const {
      data: { user: caller },
      error: callerError,
    } = await callerClient.auth.getUser(accessToken);

    if (callerError || !caller) {
      return json({ error: "Invalid or expired authentication session." }, 401);
    }

    const { data: callerProfile, error: profileError } = await callerClient
      .from("profiles")
      .select("role")
      .eq("id", caller.id)
      .maybeSingle();

    if (profileError || callerProfile?.role !== "admin") {
      return json({ error: "Only administrators can create users." }, 403);
    }

    const body = await req.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const fullName = String(body.full_name ?? "").trim();
    const role = body.role as Role;

    if (!email || !password || !fullName || !role) {
      return json({ error: "Full name, email, password and role are required." }, 400);
    }

    if (password.length < 8) {
      return json({ error: "Password must be at least 8 characters." }, 400);
    }

    if (!allowedRoles.includes(role)) {
      return json({ error: "Invalid role selected." }, 400);
    }

    const { data, error: createError } =
      await callerClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
        },
        app_metadata: {
          role,
          created_by_admin: true,
        },
      });

    if (createError) {
      return json({ error: createError.message }, 400);
    }

    return json({
      message: "User created successfully.",
      user: {
        id: data.user?.id,
        email: data.user?.email,
        role,
      },
    });
  } catch (error) {
    console.error(error);
    return json(
      { error: error instanceof Error ? error.message : "Unexpected server error." },
      500
    );
  }
});
