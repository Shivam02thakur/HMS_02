export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      admission_ward_history: {
        Row: {
          admission_id: string
          bed_id: string | null
          created_at: string
          daily_rate: number
          ended_at: string | null
          id: string
          invoice_item_id: string | null
          started_at: string
          ward_id: string | null
        }
        Insert: {
          admission_id: string
          bed_id?: string | null
          created_at?: string
          daily_rate: number
          ended_at?: string | null
          id?: string
          invoice_item_id?: string | null
          started_at?: string
          ward_id?: string | null
        }
        Update: {
          admission_id?: string
          bed_id?: string | null
          created_at?: string
          daily_rate?: number
          ended_at?: string | null
          id?: string
          invoice_item_id?: string | null
          started_at?: string
          ward_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admission_ward_history_admission_id_fkey"
            columns: ["admission_id"]
            isOneToOne: false
            referencedRelation: "admissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_ward_history_bed_id_fkey"
            columns: ["bed_id"]
            isOneToOne: false
            referencedRelation: "beds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_ward_history_invoice_item_id_fkey"
            columns: ["invoice_item_id"]
            isOneToOne: false
            referencedRelation: "invoice_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_ward_history_ward_id_fkey"
            columns: ["ward_id"]
            isOneToOne: false
            referencedRelation: "wards"
            referencedColumns: ["id"]
          },
        ]
      }
      admissions: {
        Row: {
          admission_date: string | null
          bed_id: string | null
          created_at: string | null
          diagnosis: string | null
          discharge_date: string | null
          doctor_id: string | null
          id: string
          notes: string | null
          patient_id: string
          status: Database["public"]["Enums"]["admission_status"] | null
        }
        Insert: {
          admission_date?: string | null
          bed_id?: string | null
          created_at?: string | null
          diagnosis?: string | null
          discharge_date?: string | null
          doctor_id?: string | null
          id?: string
          notes?: string | null
          patient_id: string
          status?: Database["public"]["Enums"]["admission_status"] | null
        }
        Update: {
          admission_date?: string | null
          bed_id?: string | null
          created_at?: string | null
          diagnosis?: string | null
          discharge_date?: string | null
          doctor_id?: string | null
          id?: string
          notes?: string | null
          patient_id?: string
          status?: Database["public"]["Enums"]["admission_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "admissions_bed_id_fkey"
            columns: ["bed_id"]
            isOneToOne: false
            referencedRelation: "beds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admissions_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admissions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          appointment_date: string
          appointment_time: string
          created_at: string | null
          created_by: string | null
          doctor_id: string
          id: string
          notes: string | null
          patient_id: string
          status: Database["public"]["Enums"]["appointment_status"] | null
          updated_at: string | null
        }
        Insert: {
          appointment_date: string
          appointment_time: string
          created_at?: string | null
          created_by?: string | null
          doctor_id: string
          id?: string
          notes?: string | null
          patient_id: string
          status?: Database["public"]["Enums"]["appointment_status"] | null
          updated_at?: string | null
        }
        Update: {
          appointment_date?: string
          appointment_time?: string
          created_at?: string | null
          created_by?: string | null
          doctor_id?: string
          id?: string
          notes?: string | null
          patient_id?: string
          status?: Database["public"]["Enums"]["appointment_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      beds: {
        Row: {
          bed_number: string
          created_at: string | null
          id: string
          room_id: string
          status: Database["public"]["Enums"]["bed_status"] | null
          ward_id: string
        }
        Insert: {
          bed_number: string
          created_at?: string | null
          id?: string
          room_id: string
          status?: Database["public"]["Enums"]["bed_status"] | null
          ward_id: string
        }
        Update: {
          bed_number?: string
          created_at?: string | null
          id?: string
          room_id?: string
          status?: Database["public"]["Enums"]["bed_status"] | null
          ward_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "beds_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beds_ward_id_fkey"
            columns: ["ward_id"]
            isOneToOne: false
            referencedRelation: "wards"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_episodes: {
        Row: {
          admission_id: string | null
          appointment_id: string | null
          closed_at: string | null
          created_at: string
          created_by: string | null
          episode_type: string
          id: string
          opened_at: string
          patient_id: string
          status: string
        }
        Insert: {
          admission_id?: string | null
          appointment_id?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          episode_type: string
          id?: string
          opened_at?: string
          patient_id: string
          status?: string
        }
        Update: {
          admission_id?: string | null
          appointment_id?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          episode_type?: string
          id?: string
          opened_at?: string
          patient_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_episodes_admission_id_fkey"
            columns: ["admission_id"]
            isOneToOne: false
            referencedRelation: "admissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_episodes_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_episodes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_episodes_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_logs: {
        Row: {
          cleaned_at: string
          created_at: string
          id: string
          logged_by: string
          notes: string | null
          zone_id: string
        }
        Insert: {
          cleaned_at?: string
          created_at?: string
          id?: string
          logged_by: string
          notes?: string | null
          zone_id: string
        }
        Update: {
          cleaned_at?: string
          created_at?: string
          id?: string
          logged_by?: string
          notes?: string | null
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_logs_logged_by_fkey"
            columns: ["logged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_logs_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "cleaning_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_zones: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          ward_id: string | null
          zone_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          ward_id?: string | null
          zone_type: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          ward_id?: string | null
          zone_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_zones_ward_id_fkey"
            columns: ["ward_id"]
            isOneToOne: false
            referencedRelation: "wards"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      doctors: {
        Row: {
          available_days: string[] | null
          available_time_end: string | null
          available_time_start: string | null
          consultation_fee: number | null
          created_at: string | null
          department_id: string | null
          email: string | null
          experience_years: number | null
          full_name: string
          id: string
          is_active: boolean | null
          phone: string | null
          qualification: string | null
          registration_no: string | null
          specialization: string | null
          user_id: string | null
        }
        Insert: {
          available_days?: string[] | null
          available_time_end?: string | null
          available_time_start?: string | null
          consultation_fee?: number | null
          created_at?: string | null
          department_id?: string | null
          email?: string | null
          experience_years?: number | null
          full_name: string
          id?: string
          is_active?: boolean | null
          phone?: string | null
          qualification?: string | null
          registration_no?: string | null
          specialization?: string | null
          user_id?: string | null
        }
        Update: {
          available_days?: string[] | null
          available_time_end?: string | null
          available_time_start?: string | null
          consultation_fee?: number | null
          created_at?: string | null
          department_id?: string | null
          email?: string | null
          experience_years?: number | null
          full_name?: string
          id?: string
          is_active?: boolean | null
          phone?: string | null
          qualification?: string | null
          registration_no?: string | null
          specialization?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doctors_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_adjustments: {
        Row: {
          adjustment_type: string
          amount: number
          created_at: string
          created_by: string | null
          id: string
          invoice_id: string
          reason: string
        }
        Insert: {
          adjustment_type?: string
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id: string
          reason: string
        }
        Update: {
          adjustment_type?: string
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_adjustments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_adjustments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          created_at: string | null
          description: string
          dispensed: boolean
          id: string
          invoice_id: string
          item_type: string | null
          prescription_item_id: string | null
          quantity: number | null
          quantity_override_at: string | null
          quantity_override_by: string | null
          quantity_override_reason: string | null
          reference_id: string | null
          total_price: number
          unit_price: number
        }
        Insert: {
          created_at?: string | null
          description: string
          dispensed?: boolean
          id?: string
          invoice_id: string
          item_type?: string | null
          prescription_item_id?: string | null
          quantity?: number | null
          quantity_override_at?: string | null
          quantity_override_by?: string | null
          quantity_override_reason?: string | null
          reference_id?: string | null
          total_price: number
          unit_price: number
        }
        Update: {
          created_at?: string | null
          description?: string
          dispensed?: boolean
          id?: string
          invoice_id?: string
          item_type?: string | null
          prescription_item_id?: string | null
          quantity?: number | null
          quantity_override_at?: string | null
          quantity_override_by?: string | null
          quantity_override_reason?: string | null
          reference_id?: string | null
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_prescription_item_id_fkey"
            columns: ["prescription_item_id"]
            isOneToOne: false
            referencedRelation: "prescription_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_quantity_override_by_fkey"
            columns: ["quantity_override_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          created_by: string | null
          discount: number
          episode_id: string | null
          id: string
          invoice_date: string
          invoice_number: string | null
          notes: string | null
          paid_amount: number
          patient_id: string
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          total_amount: number
          waived_amount: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          discount?: number
          episode_id?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: string | null
          notes?: string | null
          paid_amount?: number
          patient_id: string
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          total_amount?: number
          waived_amount?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          discount?: number
          episode_id?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: string | null
          notes?: string | null
          paid_amount?: number
          patient_id?: string
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          total_amount?: number
          waived_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: true
            referencedRelation: "billing_episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_orders: {
        Row: {
          completed_at: string | null
          created_by: string | null
          doctor_id: string | null
          id: string
          notes: string | null
          ordered_at: string | null
          patient_id: string
          prescription_id: string | null
          status: Database["public"]["Enums"]["lab_order_status"] | null
          test_id: string
        }
        Insert: {
          completed_at?: string | null
          created_by?: string | null
          doctor_id?: string | null
          id?: string
          notes?: string | null
          ordered_at?: string | null
          patient_id: string
          prescription_id?: string | null
          status?: Database["public"]["Enums"]["lab_order_status"] | null
          test_id: string
        }
        Update: {
          completed_at?: string | null
          created_by?: string | null
          doctor_id?: string | null
          id?: string
          notes?: string | null
          ordered_at?: string | null
          patient_id?: string
          prescription_id?: string | null
          status?: Database["public"]["Enums"]["lab_order_status"] | null
          test_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lab_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_orders_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_orders_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_orders_prescription_id_fkey"
            columns: ["prescription_id"]
            isOneToOne: false
            referencedRelation: "prescriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_orders_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "lab_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_results: {
        Row: {
          id: string
          is_abnormal: boolean | null
          lab_order_id: string
          recorded_at: string | null
          recorded_by: string | null
          remarks: string | null
          result_value: string | null
        }
        Insert: {
          id?: string
          is_abnormal?: boolean | null
          lab_order_id: string
          recorded_at?: string | null
          recorded_by?: string | null
          remarks?: string | null
          result_value?: string | null
        }
        Update: {
          id?: string
          is_abnormal?: boolean | null
          lab_order_id?: string
          recorded_at?: string | null
          recorded_by?: string | null
          remarks?: string | null
          result_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lab_results_lab_order_id_fkey"
            columns: ["lab_order_id"]
            isOneToOne: false
            referencedRelation: "lab_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_results_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_tests: {
        Row: {
          abnormal_values: string[] | null
          code: string | null
          created_at: string | null
          default_abnormal_remark: string | null
          description: string | null
          id: string
          name: string
          normal_max: number | null
          normal_min: number | null
          normal_range: string | null
          price: number
          qualitative_options: string[] | null
          result_type: string
          unit: string | null
        }
        Insert: {
          abnormal_values?: string[] | null
          code?: string | null
          created_at?: string | null
          default_abnormal_remark?: string | null
          description?: string | null
          id?: string
          name: string
          normal_max?: number | null
          normal_min?: number | null
          normal_range?: string | null
          price?: number
          qualitative_options?: string[] | null
          result_type?: string
          unit?: string | null
        }
        Update: {
          abnormal_values?: string[] | null
          code?: string | null
          created_at?: string | null
          default_abnormal_remark?: string | null
          description?: string | null
          id?: string
          name?: string
          normal_max?: number | null
          normal_min?: number | null
          normal_range?: string | null
          price?: number
          qualitative_options?: string[] | null
          result_type?: string
          unit?: string | null
        }
        Relationships: []
      }
      medicines: {
        Row: {
          category: string | null
          created_at: string | null
          expiry_date: string | null
          generic_name: string | null
          id: string
          manufacturer: string | null
          name: string
          reorder_level: number
          stock_quantity: number
          unit_price: number
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          expiry_date?: string | null
          generic_name?: string | null
          id?: string
          manufacturer?: string | null
          name: string
          reorder_level?: number
          stock_quantity?: number
          unit_price?: number
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          expiry_date?: string | null
          generic_name?: string | null
          id?: string
          manufacturer?: string | null
          name?: string
          reorder_level?: number
          stock_quantity?: number
          unit_price?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      patients: {
        Row: {
          address: string | null
          allergies: string | null
          blood_group: string | null
          created_at: string | null
          date_of_birth: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          full_name: string
          gender: string | null
          id: string
          medical_history: string | null
          patient_code: string
          phone: string
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          allergies?: string | null
          blood_group?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name: string
          gender?: string | null
          id?: string
          medical_history?: string | null
          patient_code: string
          phone: string
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          allergies?: string | null
          blood_group?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          medical_history?: string | null
          patient_code?: string
          phone?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          client_request_id: string | null
          created_at: string | null
          id: string
          invoice_id: string
          notes: string | null
          paid_at: string | null
          payment_mode: Database["public"]["Enums"]["payment_mode"]
          received_by: string | null
          transaction_id: string | null
        }
        Insert: {
          amount: number
          client_request_id?: string | null
          created_at?: string | null
          id?: string
          invoice_id: string
          notes?: string | null
          paid_at?: string | null
          payment_mode: Database["public"]["Enums"]["payment_mode"]
          received_by?: string | null
          transaction_id?: string | null
        }
        Update: {
          amount?: number
          client_request_id?: string | null
          created_at?: string | null
          id?: string
          invoice_id?: string
          notes?: string | null
          paid_at?: string | null
          payment_mode?: Database["public"]["Enums"]["payment_mode"]
          received_by?: string | null
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      prescription_items: {
        Row: {
          created_at: string | null
          dosage: string
          duration: string
          frequency: string
          id: string
          instructions: string | null
          medicine_id: string
          prescription_id: string
          quantity: number | null
        }
        Insert: {
          created_at?: string | null
          dosage: string
          duration: string
          frequency: string
          id?: string
          instructions?: string | null
          medicine_id: string
          prescription_id: string
          quantity?: number | null
        }
        Update: {
          created_at?: string | null
          dosage?: string
          duration?: string
          frequency?: string
          id?: string
          instructions?: string | null
          medicine_id?: string
          prescription_id?: string
          quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "prescription_items_medicine_id_fkey"
            columns: ["medicine_id"]
            isOneToOne: false
            referencedRelation: "medicines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescription_items_prescription_id_fkey"
            columns: ["prescription_id"]
            isOneToOne: false
            referencedRelation: "prescriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      prescriptions: {
        Row: {
          appointment_id: string | null
          bp: string | null
          created_at: string | null
          diagnosis: string | null
          doctor_id: string
          id: string
          notes: string | null
          patient_id: string
          prescription_number: string
          pulse_bpm: number | null
          revision_of: string | null
          spo2_percent: number | null
          superseded_at: string | null
          superseded_by: string | null
          temperature_f: number | null
          weight_kg: number | null
        }
        Insert: {
          appointment_id?: string | null
          bp?: string | null
          created_at?: string | null
          diagnosis?: string | null
          doctor_id: string
          id?: string
          notes?: string | null
          patient_id: string
          prescription_number?: string
          pulse_bpm?: number | null
          revision_of?: string | null
          spo2_percent?: number | null
          superseded_at?: string | null
          superseded_by?: string | null
          temperature_f?: number | null
          weight_kg?: number | null
        }
        Update: {
          appointment_id?: string | null
          bp?: string | null
          created_at?: string | null
          diagnosis?: string | null
          doctor_id?: string
          id?: string
          notes?: string | null
          patient_id?: string
          prescription_number?: string
          pulse_bpm?: number | null
          revision_of?: string | null
          spo2_percent?: number | null
          superseded_at?: string | null
          superseded_by?: string | null
          temperature_f?: number | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "prescriptions_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_revision_of_fkey"
            columns: ["revision_of"]
            isOneToOne: false
            referencedRelation: "prescriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: true
            referencedRelation: "prescriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      procedures: {
        Row: {
          category: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          price: number
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          price?: number
        }
        Update: {
          category?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          price?: number
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          is_read: boolean
          link: string | null
          title: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_change_requests: {
        Row: {
          changes: Json
          created_at: string
          id: string
          requested_by: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          target_id: string
          target_table: string
        }
        Insert: {
          changes: Json
          created_at?: string
          id?: string
          requested_by: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          target_id: string
          target_table: string
        }
        Update: {
          changes?: Json
          created_at?: string
          id?: string
          requested_by?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          target_id?: string
          target_table?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_change_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_change_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string
          full_name: string
          id: string
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          full_name: string
          id: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
        }
        Relationships: []
      }
      rooms: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          room_number: string
          ward_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          room_number: string
          ward_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          room_number?: string
          ward_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rooms_ward_id_fkey"
            columns: ["ward_id"]
            isOneToOne: false
            referencedRelation: "wards"
            referencedColumns: ["id"]
          },
        ]
      }
      wards: {
        Row: {
          capacity: number
          created_at: string | null
          daily_rate: number
          id: string
          name: string
          ward_type: string
        }
        Insert: {
          capacity?: number
          created_at?: string | null
          daily_rate?: number
          id?: string
          name: string
          ward_type: string
        }
        Update: {
          capacity?: number
          created_at?: string | null
          daily_rate?: number
          id?: string
          name?: string
          ward_type?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_profile_change_request: {
        Args: { request_id: string; notes?: string }
        Returns: undefined
      }
      reject_profile_change_request: {
        Args: { request_id: string; notes?: string }
        Returns: undefined
      }
      calculate_invoice_total: {
        Args: { p_invoice_id: string }
        Returns: number
      }
      check_appointment_availability: {
        Args: { p_date: string; p_doctor_id: string; p_time: string }
        Returns: boolean
      }
      dispense_medicine: {
        Args: {
          p_medicine_id: string
          p_prescription_id?: string
          p_quantity: number
        }
        Returns: boolean
      }
      get_current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      get_dashboard_stats: {
        Args: {
          p_today_start?: string
          p_today_end?: string
          p_today_date?: string
        }
        Returns: {
          total_patients: number
          total_doctors: number
          total_departments: number
          today_appointments: number
          pending_lab_orders: number
          occupied_beds: number
          total_beds: number
          low_stock_medicines: number
          today_revenue: number
          pending_invoices: number
          today_admissions: number
          today_discharges: number
        }
      }
      reconcile_invoice_totals: {
        Args: { p_invoice_id: string }
        Returns: undefined
      }
      delete_unpaid_invoice: {
        Args: { p_invoice_id: string }
        Returns: undefined
      }
      restock_medicine: {
        Args: { p_medicine_id: string; p_quantity: number }
        Returns: boolean
      }
    }
    Enums: {
      admission_status: "ADMITTED" | "DISCHARGED"
      appointment_status: "BOOKED" | "COMPLETED" | "CANCELLED" | "NO_SHOW"
      bed_status: "VACANT" | "OCCUPIED" | "MAINTENANCE"
      invoice_status: "PENDING" | "PARTIAL" | "PAID"
      lab_order_status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED"
      payment_mode: "Cash" | "UPI" | "Card"
      user_role:
        | "admin"
        | "receptionist"
        | "doctor"
        | "pharmacist"
        | "lab_technician"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      admission_status: ["ADMITTED", "DISCHARGED"],
      appointment_status: ["BOOKED", "COMPLETED", "CANCELLED", "NO_SHOW"],
      bed_status: ["VACANT", "OCCUPIED", "MAINTENANCE"],
      invoice_status: ["PENDING", "PARTIAL", "PAID"],
      lab_order_status: ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
      payment_mode: ["Cash", "UPI", "Card"],
      user_role: [
        "admin",
        "receptionist",
        "doctor",
        "pharmacist",
        "lab_technician",
      ],
    },
  },
} as const
