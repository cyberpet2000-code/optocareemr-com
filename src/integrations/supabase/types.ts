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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      appointments: {
        Row: {
          appointment_date: string | null
          appointment_time: string | null
          created_at: string | null
          doctor_id: string | null
          id: string
          notes: string | null
          patient_id: number | null
          reason: string | null
          reminder_sent: boolean | null
          staff_id: string | null
          status: string | null
          visit_created: boolean | null
        }
        Insert: {
          appointment_date?: string | null
          appointment_time?: string | null
          created_at?: string | null
          doctor_id?: string | null
          id?: string
          notes?: string | null
          patient_id?: number | null
          reason?: string | null
          reminder_sent?: boolean | null
          staff_id?: string | null
          status?: string | null
          visit_created?: boolean | null
        }
        Update: {
          appointment_date?: string | null
          appointment_time?: string | null
          created_at?: string | null
          doctor_id?: string | null
          id?: string
          notes?: string | null
          patient_id?: number | null
          reason?: string | null
          reminder_sent?: boolean | null
          staff_id?: string | null
          status?: string | null
          visit_created?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_patient_fk"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string | null
          id: string
          record_id: string | null
          staff_id: string | null
          table_name: string | null
          timestamp: string | null
        }
        Insert: {
          action?: string | null
          id?: string
          record_id?: string | null
          staff_id?: string | null
          table_name?: string | null
          timestamp?: string | null
        }
        Update: {
          action?: string | null
          id?: string
          record_id?: string | null
          staff_id?: string | null
          table_name?: string | null
          timestamp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      billings: {
        Row: {
          amount_paid: number
          balance: number
          consultation_fee: number
          created_at: string
          drug_cost: number
          glasses_cost: number
          hmo_name: string | null
          id: string
          other_charges: number
          patient_id: number | null
          patient_type: string
          payer_type: string | null
          payment_method: string | null
          payment_status: string
          total_amount: number
          updated_at: string
          visit_id: number | null
        }
        Insert: {
          amount_paid?: number
          balance?: number
          consultation_fee?: number
          created_at?: string
          drug_cost?: number
          glasses_cost?: number
          hmo_name?: string | null
          id?: string
          other_charges?: number
          patient_id?: number | null
          patient_type?: string
          payer_type?: string | null
          payment_method?: string | null
          payment_status?: string
          total_amount?: number
          updated_at?: string
          visit_id?: number | null
        }
        Update: {
          amount_paid?: number
          balance?: number
          consultation_fee?: number
          created_at?: string
          drug_cost?: number
          glasses_cost?: number
          hmo_name?: string | null
          id?: string
          other_charges?: number
          patient_id?: number | null
          patient_type?: string
          payer_type?: string | null
          payment_method?: string | null
          payment_status?: string
          total_amount?: number
          updated_at?: string
          visit_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "billings_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billings_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      claims: {
        Row: {
          created_at: string
          id: number
        }
        Insert: {
          created_at?: string
          id?: number
        }
        Update: {
          created_at?: string
          id?: number
        }
        Relationships: []
      }
      consultations: {
        Row: {
          chief_complaint: string | null
          created_at: string | null
          diagnosis: string | null
          id: string
          notes: string | null
          patient_id: string | null
          refraction: string | null
          treatment: string | null
          va_od: string | null
          va_os: string | null
        }
        Insert: {
          chief_complaint?: string | null
          created_at?: string | null
          diagnosis?: string | null
          id?: string
          notes?: string | null
          patient_id?: string | null
          refraction?: string | null
          treatment?: string | null
          va_od?: string | null
          va_os?: string | null
        }
        Update: {
          chief_complaint?: string | null
          created_at?: string | null
          diagnosis?: string | null
          id?: string
          notes?: string | null
          patient_id?: string | null
          refraction?: string | null
          treatment?: string | null
          va_od?: string | null
          va_os?: string | null
        }
        Relationships: []
      }
      dispensing: {
        Row: {
          dispensed_at: string | null
          dispensed_by: string | null
          drug_id: string | null
          id: string
          prescription_id: string | null
          price: number | null
          quantity: number
        }
        Insert: {
          dispensed_at?: string | null
          dispensed_by?: string | null
          drug_id?: string | null
          id?: string
          prescription_id?: string | null
          price?: number | null
          quantity: number
        }
        Update: {
          dispensed_at?: string | null
          dispensed_by?: string | null
          drug_id?: string | null
          id?: string
          prescription_id?: string | null
          price?: number | null
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "dispensing_dispensed_by_fkey"
            columns: ["dispensed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispensing_drug_id_fkey"
            columns: ["drug_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispensing_prescription_id_fkey"
            columns: ["prescription_id"]
            isOneToOne: false
            referencedRelation: "prescriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      drugs: {
        Row: {
          category: string | null
          created_at: string | null
          created_by: string | null
          expiry_date: string | null
          id: string
          name: string
          price: number | null
          stock: number | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          expiry_date?: string | null
          id?: string
          name: string
          price?: number | null
          stock?: number | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          expiry_date?: string | null
          id?: string
          name?: string
          price?: number | null
          stock?: number | null
        }
        Relationships: []
      }
      history: {
        Row: {
          created_at: string
          id: number
        }
        Insert: {
          created_at?: string
          id?: number
        }
        Update: {
          created_at?: string
          id?: number
        }
        Relationships: []
      }
      hmo_claims: {
        Row: {
          approved_amount: number
          billing_id: string | null
          co_payment: number
          created_at: string
          hmo_name: string
          id: string
          notes: string | null
          patient_id: number | null
          service_cost: number
          status: string
          updated_at: string
        }
        Insert: {
          approved_amount?: number
          billing_id?: string | null
          co_payment?: number
          created_at?: string
          hmo_name: string
          id?: string
          notes?: string | null
          patient_id?: number | null
          service_cost?: number
          status?: string
          updated_at?: string
        }
        Update: {
          approved_amount?: number
          billing_id?: string | null
          co_payment?: number
          created_at?: string
          hmo_name?: string
          id?: string
          notes?: string | null
          patient_id?: number | null
          service_cost?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hmo_claims_billing_id_fkey"
            columns: ["billing_id"]
            isOneToOne: false
            referencedRelation: "billings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hmo_claims_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      hmos: {
        Row: {
          created_at: string
          id: number
        }
        Insert: {
          created_at?: string
          id?: number
        }
        Update: {
          created_at?: string
          id?: number
        }
        Relationships: []
      }
      inventory: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          drug_category: string | null
          expiry_date: string | null
          id: string
          image_url: string | null
          low_stock_threshold: number
          name: string
          price: number
          stock_quantity: number
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          drug_category?: string | null
          expiry_date?: string | null
          id?: string
          image_url?: string | null
          low_stock_threshold?: number
          name: string
          price?: number
          stock_quantity?: number
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          drug_category?: string | null
          expiry_date?: string | null
          id?: string
          image_url?: string | null
          low_stock_threshold?: number
          name?: string
          price?: number
          stock_quantity?: number
          updated_at?: string
        }
        Relationships: []
      }
      inventory_sale_items: {
        Row: {
          id: string
          inventory_id: string
          quantity: number
          sale_id: string
          total_price: number
          unit_price: number
        }
        Insert: {
          id?: string
          inventory_id: string
          quantity?: number
          sale_id: string
          total_price?: number
          unit_price?: number
        }
        Update: {
          id?: string
          inventory_id?: string
          quantity?: number
          sale_id?: string
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_sale_items_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "inventory_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_sales: {
        Row: {
          created_at: string
          id: string
          patient_id: number | null
          sold_by: string | null
          total_amount: number
        }
        Insert: {
          created_at?: string
          id?: string
          patient_id?: number | null
          sold_by?: string | null
          total_amount?: number
        }
        Update: {
          created_at?: string
          id?: string
          patient_id?: number | null
          sold_by?: string | null
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_sales_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      lens_prescriptions: {
        Row: {
          created_at: string | null
          id: string
          ipd: string | null
          lens_type: string | null
          notes: string | null
          od_axis: string | null
          od_cyl: string | null
          od_sph: string | null
          os_axis: string | null
          os_cyl: string | null
          os_sph: string | null
          patient_id: number | null
          va: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          ipd?: string | null
          lens_type?: string | null
          notes?: string | null
          od_axis?: string | null
          od_cyl?: string | null
          od_sph?: string | null
          os_axis?: string | null
          os_cyl?: string | null
          os_sph?: string | null
          patient_id?: number | null
          va?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          ipd?: string | null
          lens_type?: string | null
          notes?: string | null
          od_axis?: string | null
          od_cyl?: string | null
          od_sph?: string | null
          os_axis?: string | null
          os_cyl?: string | null
          os_sph?: string | null
          patient_id?: number | null
          va?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lens_prescriptions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          address: string | null
          age: number | null
          created_at: string
          enrollee_number: string | null
          full_name: string
          gender: string | null
          hmo_provider: string | null
          id: number
          insurance_name: string | null
          next_of_kin: string | null
          patient_type: string
          patient_uid: string | null
          phone: string | null
        }
        Insert: {
          address?: string | null
          age?: number | null
          created_at?: string
          enrollee_number?: string | null
          full_name?: string
          gender?: string | null
          hmo_provider?: string | null
          id?: number
          insurance_name?: string | null
          next_of_kin?: string | null
          patient_type?: string
          patient_uid?: string | null
          phone?: string | null
        }
        Update: {
          address?: string | null
          age?: number | null
          created_at?: string
          enrollee_number?: string | null
          full_name?: string
          gender?: string | null
          hmo_provider?: string | null
          id?: number
          insurance_name?: string | null
          next_of_kin?: string | null
          patient_type?: string
          patient_uid?: string | null
          phone?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          billing_id: string | null
          created_at: string | null
          id: string
          paid_by: string | null
          patient_id: number | null
          payment_method: string | null
          visit_id: number | null
        }
        Insert: {
          amount: number
          billing_id?: string | null
          created_at?: string | null
          id?: string
          paid_by?: string | null
          patient_id?: number | null
          payment_method?: string | null
          visit_id?: number | null
        }
        Update: {
          amount?: number
          billing_id?: string | null
          created_at?: string | null
          id?: string
          paid_by?: string | null
          patient_id?: number | null
          payment_method?: string | null
          visit_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_billing_fk"
            columns: ["billing_id"]
            isOneToOne: false
            referencedRelation: "billings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_patient_fk"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_visit_fk"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      prescriptions: {
        Row: {
          add_power: string | null
          consultation_id: string | null
          created_at: string | null
          id: string
          notes: string | null
          od_axis: string | null
          od_cylinder: string | null
          od_sphere: string | null
          os_axis: string | null
          os_cylinder: string | null
          os_sphere: string | null
          patient_id: string | null
          pd: string | null
          status: string | null
        }
        Insert: {
          add_power?: string | null
          consultation_id?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          od_axis?: string | null
          od_cylinder?: string | null
          od_sphere?: string | null
          os_axis?: string | null
          os_cylinder?: string | null
          os_sphere?: string | null
          patient_id?: string | null
          pd?: string | null
          status?: string | null
        }
        Update: {
          add_power?: string | null
          consultation_id?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          od_axis?: string | null
          od_cylinder?: string | null
          od_sphere?: string | null
          os_axis?: string | null
          os_cylinder?: string | null
          os_sphere?: string | null
          patient_id?: string | null
          pd?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prescriptions_consultation_id_fkey"
            columns: ["consultation_id"]
            isOneToOne: false
            referencedRelation: "consultations"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string
          id: number
        }
        Insert: {
          created_at?: string
          id?: number
        }
        Update: {
          created_at?: string
          id?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          full_name: string | null
          id: string
          role: string | null
        }
        Insert: {
          created_at?: string | null
          full_name?: string | null
          id?: string
          role?: string | null
        }
        Update: {
          created_at?: string | null
          full_name?: string | null
          id?: string
          role?: string | null
        }
        Relationships: []
      }
      receipts: {
        Row: {
          created_at: string | null
          id: string
          issued_by: string | null
          payment_method: string | null
          receipt_number: string | null
          sale_id: string | null
          total_amount: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          issued_by?: string | null
          payment_method?: string | null
          receipt_number?: string | null
          sale_id?: string | null
          total_amount?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          issued_by?: string | null
          payment_method?: string | null
          receipt_number?: string | null
          sale_id?: string | null
          total_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "receipts_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      role: {
        Row: {
          created_at: string
          id: number
        }
        Insert: {
          created_at?: string
          id?: number
        }
        Update: {
          created_at?: string
          id?: number
        }
        Relationships: []
      }
      sales: {
        Row: {
          category: string | null
          created_at: string | null
          id: string
          inventory_id: string | null
          item_name: string | null
          patient_id: string | null
          payment_status: string | null
          price: number | null
          quantity: number | null
          total: number | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          id?: string
          inventory_id?: string | null
          item_name?: string | null
          patient_id?: string | null
          payment_status?: string | null
          price?: number | null
          quantity?: number | null
          total?: number | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          id?: string
          inventory_id?: string | null
          item_name?: string | null
          patient_id?: string | null
          payment_status?: string | null
          price?: number | null
          quantity?: number | null
          total?: number | null
        }
        Relationships: []
      }
      staff: {
        Row: {
          created_at: string | null
          email: string | null
          full_name: string
          id: string
          password_hash: string | null
          phone: string | null
          role: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          full_name: string
          id?: string
          password_hash?: string | null
          phone?: string | null
          role?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          password_hash?: string | null
          phone?: string | null
          role?: string | null
        }
        Relationships: []
      }
      user_role: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      visits: {
        Row: {
          aided_va: string | null
          auto_od_axis: string | null
          auto_od_cylinder: string | null
          auto_od_sphere: string | null
          auto_os_axis: string | null
          auto_os_cylinder: string | null
          auto_os_sphere: string | null
          auto_va_od: string | null
          auto_va_os: string | null
          case_history: string | null
          chief_complaint: string | null
          created_at: string
          diagnosis: string | null
          drugs_given: string | null
          duration: string | null
          examination: string | null
          ext_conjunctiva: string | null
          ext_cornea: string | null
          ext_lids: string | null
          final_prescription: string | null
          glasses_prescribed: string | null
          id: number
          int_cdr_od: string | null
          int_cdr_os: string | null
          int_fundoscopy_od: string | null
          int_fundoscopy_os: string | null
          int_fundus_bg: string | null
          medical_history: string | null
          ocular_history: string | null
          patient_id: number | null
          pinhole_od: string | null
          pinhole_os: string | null
          reading_add_od: string | null
          reading_add_os: string | null
          reading_add_va_od: string | null
          reading_add_va_os: string | null
          refraction: string | null
          status: string | null
          sub_od_axis: string | null
          sub_od_cylinder: string | null
          sub_od_sphere: string | null
          sub_os_axis: string | null
          sub_os_cylinder: string | null
          sub_os_sphere: string | null
          sub_va_od: string | null
          sub_va_os: string | null
          tonometry_ampm: string | null
          tonometry_od: string | null
          tonometry_os: string | null
          tonometry_time: string | null
          treatment: string | null
          unaided_va: string | null
          va_od_distance: string | null
          va_od_near: string | null
          va_os_distance: string | null
          va_os_near: string | null
          va_ou_distance: string | null
          va_ou_near: string | null
        }
        Insert: {
          aided_va?: string | null
          auto_od_axis?: string | null
          auto_od_cylinder?: string | null
          auto_od_sphere?: string | null
          auto_os_axis?: string | null
          auto_os_cylinder?: string | null
          auto_os_sphere?: string | null
          auto_va_od?: string | null
          auto_va_os?: string | null
          case_history?: string | null
          chief_complaint?: string | null
          created_at?: string
          diagnosis?: string | null
          drugs_given?: string | null
          duration?: string | null
          examination?: string | null
          ext_conjunctiva?: string | null
          ext_cornea?: string | null
          ext_lids?: string | null
          final_prescription?: string | null
          glasses_prescribed?: string | null
          id?: number
          int_cdr_od?: string | null
          int_cdr_os?: string | null
          int_fundoscopy_od?: string | null
          int_fundoscopy_os?: string | null
          int_fundus_bg?: string | null
          medical_history?: string | null
          ocular_history?: string | null
          patient_id?: number | null
          pinhole_od?: string | null
          pinhole_os?: string | null
          reading_add_od?: string | null
          reading_add_os?: string | null
          reading_add_va_od?: string | null
          reading_add_va_os?: string | null
          refraction?: string | null
          status?: string | null
          sub_od_axis?: string | null
          sub_od_cylinder?: string | null
          sub_od_sphere?: string | null
          sub_os_axis?: string | null
          sub_os_cylinder?: string | null
          sub_os_sphere?: string | null
          sub_va_od?: string | null
          sub_va_os?: string | null
          tonometry_ampm?: string | null
          tonometry_od?: string | null
          tonometry_os?: string | null
          tonometry_time?: string | null
          treatment?: string | null
          unaided_va?: string | null
          va_od_distance?: string | null
          va_od_near?: string | null
          va_os_distance?: string | null
          va_os_near?: string | null
          va_ou_distance?: string | null
          va_ou_near?: string | null
        }
        Update: {
          aided_va?: string | null
          auto_od_axis?: string | null
          auto_od_cylinder?: string | null
          auto_od_sphere?: string | null
          auto_os_axis?: string | null
          auto_os_cylinder?: string | null
          auto_os_sphere?: string | null
          auto_va_od?: string | null
          auto_va_os?: string | null
          case_history?: string | null
          chief_complaint?: string | null
          created_at?: string
          diagnosis?: string | null
          drugs_given?: string | null
          duration?: string | null
          examination?: string | null
          ext_conjunctiva?: string | null
          ext_cornea?: string | null
          ext_lids?: string | null
          final_prescription?: string | null
          glasses_prescribed?: string | null
          id?: number
          int_cdr_od?: string | null
          int_cdr_os?: string | null
          int_fundoscopy_od?: string | null
          int_fundoscopy_os?: string | null
          int_fundus_bg?: string | null
          medical_history?: string | null
          ocular_history?: string | null
          patient_id?: number | null
          pinhole_od?: string | null
          pinhole_os?: string | null
          reading_add_od?: string | null
          reading_add_os?: string | null
          reading_add_va_od?: string | null
          reading_add_va_os?: string | null
          refraction?: string | null
          status?: string | null
          sub_od_axis?: string | null
          sub_od_cylinder?: string | null
          sub_od_sphere?: string | null
          sub_os_axis?: string | null
          sub_os_cylinder?: string | null
          sub_os_sphere?: string | null
          sub_va_od?: string | null
          sub_va_os?: string | null
          tonometry_ampm?: string | null
          tonometry_od?: string | null
          tonometry_os?: string | null
          tonometry_time?: string | null
          treatment?: string | null
          unaided_va?: string | null
          va_od_distance?: string | null
          va_od_near?: string | null
          va_os_distance?: string | null
          va_os_near?: string | null
          va_ou_distance?: string | null
          va_ou_near?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "Visits_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      daily_income: {
        Row: {
          date: string | null
          total_income: number | null
        }
        Relationships: []
      }
      payment_breakdown: {
        Row: {
          paid_by: string | null
          total: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      has_role:
        | {
            Args: {
              _role: Database["public"]["Enums"]["app_role"]
              _user_id: string
            }
            Returns: boolean
          }
        | { Args: { required_role: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "doctor" | "receptionist"
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
      app_role: ["admin", "doctor", "receptionist"],
    },
  },
} as const
