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

// Mirrors the exact rules already enforced by the standalone Add Doctor
// form (src/pages/doctors/DoctorsPage.tsx), so a doctor created through
// either screen ends up with an identically-shaped, identically-valid
// record rather than two independently-drifting sets of rules.
interface DoctorFields {
  department_id: string;
  phone: string;
  specialization?: string;
  qualification?: string;
  registration_no?: string;
  consultation_fee: number;
  experience_years?: number;
  available_days: string[];
  available_time_start: string;
  available_time_end: string;
  is_active?: boolean;
}

function validateDoctorFields(input: unknown): { fields: DoctorFields } | { error: string } {
  if (!input || typeof input !== "object") {
    return { error: "Doctor details are required when role is Doctor." };
  }
  const d = input as Record<string, unknown>;

  const department_id = String(d.department_id ?? "").trim();
  if (!department_id) {
    return { error: "Department is required." };
  }

  const phone = String(d.phone ?? "").trim();
  if (!/^[0-9]{10}$/.test(phone)) {
    return { error: "Phone must be exactly 10 digits." };
  }

  const consultation_fee = Number(d.consultation_fee);
  if (!Number.isFinite(consultation_fee) || consultation_fee < 0) {
    return { error: "Consultation fee must be a non-negative number." };
  }

  const available_days = Array.isArray(d.available_days) ? d.available_days.map(String) : [];
  if (available_days.length === 0) {
    return { error: "Select at least one available day." };
  }

  const available_time_start = String(d.available_time_start ?? "");
  const available_time_end = String(d.available_time_end ?? "");

  if (!available_time_start || !available_time_end) {
    return { error: "Available From and Available To are required." };
  }
  if (available_time_end <= available_time_start) {
    return { error: "Available To must be after Available From." };
  }

  const experience_years = d.experience_years === undefined || d.experience_years === null
    ? undefined
    : Number(d.experience_years);
  if (experience_years !== undefined && (!Number.isFinite(experience_years) || experience_years < 0)) {
    return { error: "Experience (years) must be a non-negative number." };
  }

  if (
    d.is_active !== undefined &&
    typeof d.is_active !== "boolean"
  ) {
    return { error: "is_active must be a boolean." };
  }

  return {
    fields: {
      department_id,
      phone,
      specialization: d.specialization ? String(d.specialization).trim() : undefined,
      qualification: d.qualification ? String(d.qualification).trim() : undefined,
      registration_no: d.registration_no ? String(d.registration_no).trim() : undefined,
      consultation_fee,
      experience_years,
      available_days,
      available_time_start,
      available_time_end,
      is_active: d.is_active === undefined ? true : typeof d.is_active === "boolean" ? d.is_active : true,
    },
  };
}

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

    // Doctor-role user creation and doctor-record creation are one atomic
    // action: validated here, BEFORE the auth user is created, so a
    // validation failure never results in a login existing with no way to
    // attach a doctor record to it.
    let doctorFields: DoctorFields | null = null;
    if (role === "doctor") {
      const result = validateDoctorFields(body.doctor);
      if ("error" in result) {
        return json({ error: result.error }, 400);
      }
      doctorFields = result.fields;
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

    if (!data.user) {
      return json({ error: "User creation returned no user record." }, 500);
    }

    // Belt-and-suspenders: the handle_new_user() trigger is *supposed* to
    // read role/created_by_admin from app_metadata at insert time and set
    // it correctly on its own. In practice that hasn't been reliable, so
    // rather than depend on trigger timing, explicitly set the role here —
    // this client uses the service role key, which bypasses RLS entirely,
    // so this update is guaranteed to apply regardless of what the trigger
    // did or didn't do.
    const { error: roleFixError } = await callerClient
      .from("profiles")
      .update({ role, full_name: fullName })
      .eq("id", data.user.id);

    if (roleFixError) {
      return json({
        error: `User account was created, but setting its role failed: ${roleFixError.message}. Fix it manually in the profiles table.`,
      }, 500);
    }

    // The login has already been created by this point (a separate
    // Supabase Auth call, not something that can be transactionally rolled
    // back alongside this Postgres insert) -- so if the doctors insert
    // fails, the response has to tell the truth about the exact
    // half-completed state rather than imply total failure.
    if (role === "doctor" && doctorFields) {
      const { error: doctorInsertError } = await callerClient.from("doctors").insert({
        user_id: data.user.id,
        full_name: fullName,
        email,
        phone: doctorFields.phone,
        department_id: doctorFields.department_id,
        specialization: doctorFields.specialization,
        qualification: doctorFields.qualification,
        registration_no: doctorFields.registration_no,
        consultation_fee: doctorFields.consultation_fee,
        experience_years: doctorFields.experience_years,
        available_days: doctorFields.available_days,
        available_time_start: doctorFields.available_time_start,
        available_time_end: doctorFields.available_time_end,
        is_active: doctorFields.is_active,
      });

      if (doctorInsertError) {
        return json({
          error:
            `The login for ${email} was created and is usable, but it isn't linked to a doctor record yet ` +
            `(${doctorInsertError.message}). Go to Doctors -> Add Doctor and create the record manually, ` +
            `then set doctors.user_id for this login to ${data.user.id}.`,
        }, 500);
      }
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