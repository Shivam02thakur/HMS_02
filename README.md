# MediCare HMS - Hospital Management System

A full-featured, production-ready Hospital Management System built with **React + Vite + TypeScript + Tailwind CSS** and **Supabase** backend.

## Features

- **Authentication & RBAC** - JWT-based auth with 5 roles (Admin, Receptionist, Doctor, Pharmacist, Lab Technician)
- **Patient Management** - Register, edit, search patients with medical history
- **Doctor & Department Management** - Manage doctors, specializations, availability
- **Appointment Management** - Book appointments with doctor availability validation
- **Prescription Management** - Create prescriptions with medicines, dosage, frequency
- **Pharmacy Management** - Medicine inventory with stock alerts and dispensing
- **Laboratory Management** - Order tests, record results with abnormal flagging
- **Billing** - Create invoices, add items, record payments (Cash/UPI/Card)
- **IPD / Ward Management** - Bed occupancy visualization, admissions, discharges
- **Dashboard** - Real-time stats with charts and alerts

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, Recharts |
| Backend | Supabase (PostgreSQL + Auth + Realtime) |
| Icons | Lucide React |
| Date | date-fns |

## Quick Start

### 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Copy your **Project URL** and **Anon Key** from Project Settings > API

### 2. Run Database Migrations

In the Supabase SQL Editor, run the migration files in order:

1. `supabase/migrations/001_schema.sql` - Creates all tables
2. `supabase/migrations/002_rls.sql` - Sets up Row Level Security
3. `supabase/migrations/003_functions.sql` - Creates triggers and functions
4. `supabase/migrations/004_seed.sql` - Inserts demo data

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and add your Supabase credentials:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 4. Install & Run

```bash
npm install
npm run dev
```

### 5. Create Demo Users

Use the Settings page to create users, or run this SQL in Supabase:

```sql
-- Create demo users (run in Supabase SQL Editor after enabling email confirmations)
-- Note: In production, use Supabase Auth UI or Edge Functions
```

## Demo Credentials (for local testing)

After creating users via Settings page:
- **Admin**: admin@medicare.com
- **Doctor**: doctor@medicare.com
- **Receptionist**: reception@medicare.com
- **Pharmacist**: pharmacy@medicare.com
- **Lab Tech**: lab@medicare.com


## Authentication Setup (fixed)

This project uses Supabase Auth. The application must have both an Auth user and a matching `public.profiles` row.

### First admin account

1. In Supabase Dashboard, open **Authentication → Users → Add user**.
2. Create an admin account with a strong unique password.
3. Enable **Auto Confirm User** for local/testing use.
4. Run migration `005_auth_profiles.sql`. It creates/backfills the matching `profiles` row.
5. Copy the new user's UUID.
6. In Supabase SQL Editor, run:

```sql
UPDATE public.profiles
SET role = 'admin'
WHERE id = 'PASTE_AUTH_USER_UUID_HERE';
```

### Apply the new database migration

Run these migrations in order:

1. `001_schema.sql`
2. `002_rls.sql`
3. `003_functions.sql`
4. `004_seed.sql`
5. `005_auth_profiles.sql`

Migration 005 automatically creates an HMS profile when a Supabase Auth user is created.

### Admin user creation

The Settings page already contains **Create New User**, but the old implementation incorrectly used `supabase.auth.signUp()` from the browser. That can create/sign in the new account and can also fail to insert the profile because of RLS.

The fixed version calls the `create-user` Edge Function instead. The function:

- verifies the caller's Supabase access token
- checks that the caller's `profiles.role` is `admin`
- creates the Auth user with the Supabase Admin API
- confirms the email for local/admin-created accounts
- stores the selected role in protected `app_metadata`
- lets migration 005 create the matching `profiles` row
- does **not** expose the service-role key to the browser
- does **not** replace the current admin session

### Deploy the Edge Function

Install the Supabase CLI if you do not already have it, then from the project root:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy create-user
```

The deployed Edge Function receives `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from Supabase's server environment. **Never put the service-role key in `.env`, React code, or any `VITE_*` variable.**

After deploying the function, restart Vite:

```bash
npm run dev
```

Then sign in as the admin and open **Settings → User Management → Create New User**.

## Deployment

### Build for Production
```bash
npm run build
```

### Deploy to Vercel/Netlify
1. Connect your repo to Vercel or Netlify
2. Set environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
3. Deploy!

## Database Schema

15 tables with full referential integrity:
- `profiles`, `departments`, `doctors`, `patients`
- `appointments`, `wards`, `beds`, `admissions`
- `medicines`, `prescriptions`, `prescription_items`
- `lab_tests`, `lab_orders`, `lab_results`
- `invoices`, `invoice_items`, `payments`

## License

MIT License - Free for educational and commercial use.
