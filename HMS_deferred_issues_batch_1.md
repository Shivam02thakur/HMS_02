# HMS_02 — Deferred Issues & Parallel Work Tracker

Generated from a direct read of the repo (not from the original `changes_01.md` spec alone — several of its claims about "missing" features turned out to be wrong once I actually checked the code). Everything below is verified against the real schema/components as of this session, not guessed.

**If you're working on this in a separate chat: read the "Already Working" section first.** Several of these look like gaps in the spec doc but aren't — building them again will create duplicate tables or dead components.

---

## ✅ Fixed in Batch 1 (this chat) — don't re-do these
- README merge-conflict markers removed
- Department Management page (Add/Edit/Search/Activate-Deactivate) — `src/pages/departments/DepartmentsPage.tsx`
- Doctor "delete" button no longer hard-deletes (was cascade-wiping appointment/prescription history) — now deactivate/activate
- Department filter dropdown on Doctors page
- Appointment booking: Department→Doctor cascade
- Appointment booking: slot dropdown now excludes already-booked times (never did before)
- Appointment booking: real DB-level unique constraint on `(doctor_id, appointment_date, appointment_time)` — migration `006_batch1_fixes.sql`
- Distinct empty-state messages on the appointment form (no doctors / no departments / doctor off that day / fully booked)

## ✅ Already working before I touched anything — do not rebuild
- Doctor CRUD, department linkage, `is_active`, `consultation_fee`, `available_days`/`available_time_start/end` — schema and `DoctorsPage.tsx`/`DoctorDetailPage.tsx` already existed
- Bed auto-flip on admit/discharge — handled by a DB trigger, `handle_admission_bed()` in `003_functions.sql`. You do **not** need to write app-side code to flip bed status; the trigger already does `VACANT → OCCUPIED` on admission insert and `OCCUPIED → VACANT` on discharge.
- Discharge workflow — `AdmissionsPage.tsx` already sets status to `DISCHARGED` + `discharge_date`, bed release happens via the trigger above
- Dashboard — already pulls **real** data via `supabase.rpc('get_dashboard_stats')`, not fake numbers as the original spec claimed. It's just missing 3 metrics (see below).
- `invoice_items` table already has `item_type` (medicine/lab_test/consultation/bed_charge/other) and `reference_id` columns. The DB is basically ready for type-based billing — it's only the UI form that's still generic (see Billing section below).
- Auth/RBAC — do not touch, already audited correct per the repo's own `FIXES.md` and my own read of `002_rls.sql`.

---

## 🔴 Real bugs found (not in the original spec, found by reading code)

1. **Bed double-assignment race condition.** Same class of bug the appointments fix addressed: two admissions could theoretically grab the same `VACANT` bed if submitted near-simultaneously — nothing at the DB level stops two `admissions` rows pointing at one bed with status `ADMITTED`. Fix is the same pattern as migration 006: a partial unique index, e.g. `CREATE UNIQUE INDEX ... ON admissions(bed_id) WHERE status = 'ADMITTED'`. Small, contained — good candidate for a quick follow-up batch.
2. **Patient Admission form has no Department step and doesn't filter Doctor by department.** `AdmissionsPage.tsx` lists *all* active doctors regardless of department — it never got the Department→Doctor cascade that Appointments just did. Mirrors exactly what was fixed in `AppointmentsPage.tsx` this session, so it's a fast follow using the same pattern.
3. **No "add new patient inline" during admission.** The spec's own item #7 says "Existing patient or new patient" — the current admission form's patient field only lists existing patients.
4. **`npm run lint` is broken** — `package.json` has a `lint` script that calls `eslint`, but `eslint` isn't in `devDependencies` at all. Unrelated to any of this work, one-line fix whenever convenient (`npm i -D eslint` + whatever config you want).
5. **Thin git history** (from my first message, repeating so it's in one place) — 4 commits, no feature branches. Worth branching per feature from here if your report needs to show iterative work.

---

## 🟡 Genuinely missing (spec was right) — organized by size

### Small-ish (single migration + 1-2 components each)
- **Doctor Admission Department/Doctor cascade** (bug #2 above)
- **Bed double-booking DB constraint** (bug #1 above)
- **Dashboard: 3 missing metrics** — `total_departments`, `today's admissions`, `today's discharges`. `get_dashboard_stats()` RPC needs extending (add 3 fields), plus one stat card each on `DashboardPage.tsx`. `available_beds` is already derivable (`total - occupied`) so no new query needed there.
- **Appointment "Reschedule"** — currently only Cancel/Complete/No-show exist, no edit-date/time action.
- **Specialization filter on Doctors page** — batch 1 added a Department filter; the spec also wants filter-by-specialization as a separate control (currently only reachable via the text search box).
- **Patient profile has no "current state" summary.** Verified: `PatientDetailPage.tsx` already shows full history — Appointments, Prescriptions, Lab, Billing, and Admissions tabs all work and pull real data (including ward/bed per past admission). What it does *not* do is highlight which admission is currently active (`status = 'ADMITTED'`) or show that admission's doctor/department up top — everything's a flat historical list, there's no "Current Doctor / Current Admission" summary as the spec's item #9 wants. Fix is small: find the admission with `status === 'ADMITTED'` in the already-fetched `admissions` array, and if one exists, render a summary card in the header or Overview tab. The doctor's department isn't currently joined into that query either (`doctor:doctors(full_name)` only) — needs `doctor:doctors(full_name, department:departments(name))` to show department too. No schema change needed, just a query tweak + a bit of JSX.

### Medium (new table + migration + multi-component rewrite)
- **`rooms` table.** Schema is currently `wards → beds` directly; spec wants `wards → rooms → beds`. Needs: new table, FK from `beds`, RLS policy, and updates to the admission form's bed-selection step (currently beds are picked directly from a flat list, grouped by ward name in the label, not a real Ward→Room→Bed drilldown).
- **`procedures` table** — doesn't exist at all. Needed for Procedure billing (spec #16). Also requires adding `'procedure'` to the `item_type` CHECK constraint on `invoice_items`.
- **Bed/room daily rate.** Spec's Bed Charge billing (#15) needs a daily rate per bed/ward to auto-calculate `rate × days`. **Neither `wards` nor `beds` has a price column right now** — this needs a new column (probably `wards.daily_rate`, since rate is more naturally per ward-type than per individual bed) before Bed Charge billing can work at all.

### Large (the doc's own scale-of-change territory — this is what I originally flagged as "dramatic")
- **Doctor schedule model — full rebuild.** You confirmed you want the full version (per-day custom hours + break time + On Leave status), not the simplified fallback. This replaces `doctors.available_days`/`available_time_start`/`available_time_end` with a new `doctor_schedules` table (one row per doctor per day-of-week, with break_start/break_end), plus a `doctor_leave` table or a leave-dates mechanism, plus a full rewrite of the appointment slot-generation logic in `AppointmentsPage.tsx` to read from the new tables instead of the flat fields, plus a schedule-editor UI for admins (currently doesn't exist in any form) and a way to mark a doctor "On Leave" for a date range.
- **Billing — full type-based rebuild.** The DB columns exist (`item_type`, `reference_id`) but are unused by the UI. Needs: 5 new search/select sub-components (Medicine, Lab Test, Consultation, Bed Charge, Procedure), each auto-populating price and setting `reference_id`, wired into `InvoiceDetailPage.tsx`'s item-add form, replacing the current free-text description/qty/unit_price inputs. "Other" stays manual per spec. This is the single biggest remaining chunk of work in the whole list.
- **Seed data expansion.** Current `004_seed.sql` has: 8 departments ✅, 6 wards ✅ (spec wants 3+), 18 beds ✅ (spec wants 15-20), 10 lab tests (spec wants 20+, gap), 15 medicines (spec wants 20+, gap), **0 doctors seeded** (spec wants 2+ per major department — right now a fresh DB has departments but zero doctors, so Appointments/Admissions will show empty-state messages until an admin manually adds doctors through the new UI). No `rooms` or `procedures` seed data yet since those tables don't exist. Best done *after* the rooms/procedures/schedule tables above are built, not before, or you'll seed twice.

---

## Notes for whoever picks these up
- `check_appointment_availability()` in `003_functions.sql` is now effectively unused — Batch 1 solved double-booking with a DB constraint instead of calling this function. It's harmless left in place, but if you want a nicer "this slot might be taken" warning *before* the user hits submit (rather than finding out from a failed insert), this function is the natural thing to call for that pre-check. Not required, just an option.
- Next new migration should be `007_...`, keep incrementing — don't renumber 001-006.
- The nav structure in the spec (`Dashboard / Patients / Doctors / Departments / Admissions / Beds / Appointments / Billing` as 8 flat top-level items) doesn't exactly match what exists (Admissions and Beds are both reached through the IPD page, not separate top-level nav items). That's a structural choice, not a bug — flagging in case you want to split them, not because it's wrong as-is.
