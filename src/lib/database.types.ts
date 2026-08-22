export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string;
          role: 'admin' | 'receptionist' | 'doctor' | 'pharmacist' | 'lab_technician';
          phone?: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name: string;
          role?: 'admin' | 'receptionist' | 'doctor' | 'pharmacist' | 'lab_technician';
          phone?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string;
          role?: 'admin' | 'receptionist' | 'doctor' | 'pharmacist' | 'lab_technician';
          phone?: string;
        };
        Relationships: [];
      };
      departments: {
        Row: {
          id: string;
          name: string;
          description?: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          name: string;
          description?: string;
          is_active?: boolean;
        };
        Update: {
          name?: string;
          description?: string;
          is_active?: boolean;
        };
        Relationships: [];
      };
      doctors: {
        Row: {
          id: string;
          user_id?: string;
          full_name: string;
          email?: string;
          phone?: string;
          department_id?: string;
          specialization?: string;
          consultation_fee: number;
          experience_years: number;
          available_days: string[];
          available_time_start?: string;
          available_time_end?: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          user_id?: string;
          full_name: string;
          email?: string;
          phone?: string;
          department_id?: string;
          specialization?: string;
          consultation_fee?: number;
          experience_years?: number;
          available_days?: string[];
          available_time_start?: string;
          available_time_end?: string;
          is_active?: boolean;
        };
        Update: {
          full_name?: string;
          email?: string;
          phone?: string;
          department_id?: string;
          specialization?: string;
          consultation_fee?: number;
          experience_years?: number;
          available_days?: string[];
          available_time_start?: string;
          available_time_end?: string;
          is_active?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "doctors_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "doctors_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          }
        ];
      };
      patients: {
        Row: {
          id: string;
          patient_code: string;
          full_name: string;
          email?: string;
          phone: string;
          date_of_birth?: string;
          gender?: 'male' | 'female' | 'other';
          blood_group?: string;
          address?: string;
          emergency_contact_name?: string;
          emergency_contact_phone?: string;
          allergies?: string;
          medical_history?: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          full_name: string;
          email?: string;
          phone: string;
          date_of_birth?: string;
          gender?: 'male' | 'female' | 'other';
          blood_group?: string;
          address?: string;
          emergency_contact_name?: string;
          emergency_contact_phone?: string;
          allergies?: string;
          medical_history?: string;
        };
        Update: {
          full_name?: string;
          email?: string;
          phone?: string;
          date_of_birth?: string;
          gender?: 'male' | 'female' | 'other';
          blood_group?: string;
          address?: string;
          emergency_contact_name?: string;
          emergency_contact_phone?: string;
          allergies?: string;
          medical_history?: string;
        };
        Relationships: [];
      };
      appointments: {
        Row: {
          id: string;
          patient_id: string;
          doctor_id: string;
          appointment_date: string;
          appointment_time: string;
          status: 'BOOKED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
          notes?: string;
          created_by?: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          patient_id: string;
          doctor_id: string;
          appointment_date: string;
          appointment_time: string;
          status?: 'BOOKED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
          notes?: string;
          created_by?: string;
        };
        Update: {
          patient_id?: string;
          doctor_id?: string;
          appointment_date?: string;
          appointment_time?: string;
          status?: 'BOOKED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
          notes?: string;
        };
        Relationships: [
          {
            foreignKeyName: "appointments_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_doctor_id_fkey";
            columns: ["doctor_id"];
            isOneToOne: false;
            referencedRelation: "doctors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      wards: {
        Row: {
          id: string;
          name: string;
          ward_type: 'General' | 'ICU' | 'Private';
          capacity: number;
          created_at: string;
        };
        Insert: {
          name: string;
          ward_type: 'General' | 'ICU' | 'Private';
          capacity?: number;
        };
        Update: {
          name?: string;
          ward_type?: 'General' | 'ICU' | 'Private';
          capacity?: number;
        };
        Relationships: [];
      };
      beds: {
        Row: {
          id: string;
          ward_id: string;
          bed_number: string;
          status: 'VACANT' | 'OCCUPIED' | 'MAINTENANCE';
          created_at: string;
        };
        Insert: {
          ward_id: string;
          bed_number: string;
          status?: 'VACANT' | 'OCCUPIED' | 'MAINTENANCE';
        };
        Update: {
          ward_id?: string;
          bed_number?: string;
          status?: 'VACANT' | 'OCCUPIED' | 'MAINTENANCE';
        };
        Relationships: [
          {
            foreignKeyName: "beds_ward_id_fkey";
            columns: ["ward_id"];
            isOneToOne: false;
            referencedRelation: "wards";
            referencedColumns: ["id"];
          }
        ];
      };
      admissions: {
        Row: {
          id: string;
          patient_id: string;
          doctor_id?: string;
          bed_id?: string;
          diagnosis?: string;
          admission_date: string;
          discharge_date?: string;
          status: 'ADMITTED' | 'DISCHARGED';
          notes?: string;
          created_at: string;
        };
        Insert: {
          patient_id: string;
          doctor_id?: string;
          bed_id?: string;
          diagnosis?: string;
          admission_date?: string;
          discharge_date?: string;
          status?: 'ADMITTED' | 'DISCHARGED';
          notes?: string;
        };
        Update: {
          patient_id?: string;
          doctor_id?: string;
          bed_id?: string;
          diagnosis?: string;
          admission_date?: string;
          discharge_date?: string;
          status?: 'ADMITTED' | 'DISCHARGED';
          notes?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admissions_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "admissions_doctor_id_fkey";
            columns: ["doctor_id"];
            isOneToOne: false;
            referencedRelation: "doctors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "admissions_bed_id_fkey";
            columns: ["bed_id"];
            isOneToOne: false;
            referencedRelation: "beds";
            referencedColumns: ["id"];
          }
        ];
      };
      medicines: {
        Row: {
          id: string;
          name: string;
          generic_name?: string;
          category?: string;
          manufacturer?: string;
          stock_quantity: number;
          reorder_level: number;
          unit_price: number;
          expiry_date?: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          name: string;
          generic_name?: string;
          category?: string;
          manufacturer?: string;
          stock_quantity?: number;
          reorder_level?: number;
          unit_price?: number;
          expiry_date?: string;
        };
        Update: {
          name?: string;
          generic_name?: string;
          category?: string;
          manufacturer?: string;
          stock_quantity?: number;
          reorder_level?: number;
          unit_price?: number;
          expiry_date?: string;
        };
        Relationships: [];
      };
      prescriptions: {
        Row: {
          id: string;
          patient_id: string;
          doctor_id: string;
          appointment_id?: string;
          diagnosis?: string;
          notes?: string;
          created_at: string;
        };
        Insert: {
          patient_id: string;
          doctor_id: string;
          appointment_id?: string;
          diagnosis?: string;
          notes?: string;
        };
        Update: {
          patient_id?: string;
          doctor_id?: string;
          appointment_id?: string;
          diagnosis?: string;
          notes?: string;
        };
        Relationships: [
          {
            foreignKeyName: "prescriptions_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "prescriptions_doctor_id_fkey";
            columns: ["doctor_id"];
            isOneToOne: false;
            referencedRelation: "doctors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "prescriptions_appointment_id_fkey";
            columns: ["appointment_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["id"];
          }
        ];
      };
      prescription_items: {
        Row: {
          id: string;
          prescription_id: string;
          medicine_id: string;
          dosage: string;
          frequency: string;
          duration: string;
          instructions?: string;
          created_at: string;
        };
        Insert: {
          prescription_id: string;
          medicine_id: string;
          dosage: string;
          frequency: string;
          duration: string;
          instructions?: string;
        };
        Update: {
          prescription_id?: string;
          medicine_id?: string;
          dosage?: string;
          frequency?: string;
          duration?: string;
          instructions?: string;
        };
        Relationships: [
          {
            foreignKeyName: "prescription_items_prescription_id_fkey";
            columns: ["prescription_id"];
            isOneToOne: false;
            referencedRelation: "prescriptions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "prescription_items_medicine_id_fkey";
            columns: ["medicine_id"];
            isOneToOne: false;
            referencedRelation: "medicines";
            referencedColumns: ["id"];
          }
        ];
      };
      lab_tests: {
        Row: {
          id: string;
          name: string;
          code?: string;
          description?: string;
          normal_range?: string;
          unit?: string;
          price: number;
          created_at: string;
        };
        Insert: {
          name: string;
          code?: string;
          description?: string;
          normal_range?: string;
          unit?: string;
          price?: number;
        };
        Update: {
          name?: string;
          code?: string;
          description?: string;
          normal_range?: string;
          unit?: string;
          price?: number;
        };
        Relationships: [];
      };
      lab_orders: {
        Row: {
          id: string;
          patient_id: string;
          doctor_id?: string;
          test_id: string;
          status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
          ordered_at: string;
          completed_at?: string;
          notes?: string;
          created_by?: string;
        };
        Insert: {
          patient_id: string;
          doctor_id?: string;
          test_id: string;
          status?: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
          notes?: string;
          created_by?: string;
        };
        Update: {
          patient_id?: string;
          doctor_id?: string;
          test_id?: string;
          status?: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
          completed_at?: string;
          notes?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lab_orders_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lab_orders_doctor_id_fkey";
            columns: ["doctor_id"];
            isOneToOne: false;
            referencedRelation: "doctors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lab_orders_test_id_fkey";
            columns: ["test_id"];
            isOneToOne: false;
            referencedRelation: "lab_tests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lab_orders_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      lab_results: {
        Row: {
          id: string;
          lab_order_id: string;
          result_value?: string;
          remarks?: string;
          is_abnormal: boolean;
          recorded_by?: string;
          recorded_at: string;
        };
        Insert: {
          lab_order_id: string;
          result_value?: string;
          remarks?: string;
          is_abnormal?: boolean;
          recorded_by?: string;
        };
        Update: {
          lab_order_id?: string;
          result_value?: string;
          remarks?: string;
          is_abnormal?: boolean;
          recorded_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lab_results_lab_order_id_fkey";
            columns: ["lab_order_id"];
            isOneToOne: false;
            referencedRelation: "lab_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lab_results_recorded_by_fkey";
            columns: ["recorded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      invoices: {
        Row: {
          id: string;
          patient_id: string;
          invoice_number?: string;
          invoice_date: string;
          subtotal: number;
          discount: number;
          total_amount: number;
          paid_amount: number;
          status: 'PENDING' | 'PARTIAL' | 'PAID';
          notes?: string;
          created_by?: string;
          created_at: string;
        };
        Insert: {
          patient_id: string;
          invoice_date?: string;
          subtotal?: number;
          discount?: number;
          total_amount?: number;
          paid_amount?: number;
          status?: 'PENDING' | 'PARTIAL' | 'PAID';
          notes?: string;
          created_by?: string;
        };
        Update: {
          patient_id?: string;
          invoice_date?: string;
          subtotal?: number;
          discount?: number;
          total_amount?: number;
          paid_amount?: number;
          status?: 'PENDING' | 'PARTIAL' | 'PAID';
          notes?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invoices_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invoices_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      invoice_items: {
        Row: {
          id: string;
          invoice_id: string;
          description: string;
          quantity: number;
          unit_price: number;
          total_price: number;
          item_type?: string;
          reference_id?: string;
          created_at: string;
        };
        Insert: {
          invoice_id: string;
          description: string;
          quantity?: number;
          unit_price: number;
          total_price: number;
          item_type?: string;
          reference_id?: string;
        };
        Update: {
          invoice_id?: string;
          description?: string;
          quantity?: number;
          unit_price?: number;
          total_price?: number;
          item_type?: string;
          reference_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          }
        ];
      };
      payments: {
        Row: {
          id: string;
          invoice_id: string;
          amount: number;
          payment_mode: string;
          transaction_id?: string;
          paid_at: string;
          received_by?: string;
          notes?: string;
          created_at: string;
        };
        Insert: {
          invoice_id: string;
          amount: number;
          payment_mode: string;
          transaction_id?: string;
          received_by?: string;
          notes?: string;
        };
        Update: {
          invoice_id?: string;
          amount?: number;
          payment_mode?: string;
          transaction_id?: string;
          received_by?: string;
          notes?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_received_by_fkey";
            columns: ["received_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_dashboard_stats: {
        Args: Record<string, never>;
        Returns: Json;
      };
      check_appointment_availability: {
        Args: {
          p_doctor_id: string;
          p_date: string;
          p_time: string;
        };
        Returns: boolean;
      };
      dispense_medicine: {
        Args: {
          p_medicine_id: string;
          p_quantity: number;
          p_prescription_id?: string;
        };
        Returns: boolean;
      };
      calculate_invoice_total: {
        Args: {
          p_invoice_id: string;
        };
        Returns: number;
      };
    };
    Enums: {
      user_role: 'admin' | 'receptionist' | 'doctor' | 'pharmacist' | 'lab_technician';
      appointment_status: 'BOOKED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
      bed_status: 'VACANT' | 'OCCUPIED' | 'MAINTENANCE';
      admission_status: 'ADMITTED' | 'DISCHARGED';
      lab_order_status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
      invoice_status: 'PENDING' | 'PARTIAL' | 'PAID';
      payment_mode: 'Cash' | 'UPI' | 'Card';
    };
  };
}
