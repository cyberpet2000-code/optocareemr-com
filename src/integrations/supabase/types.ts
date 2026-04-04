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
          appointment_date: string
          appointment_time: string
          created_at: string
          created_by: string | null
          id: string
          patient_id: number | null
          reason: string | null
          status: string
          updated_at: string
        }
        Insert: {
          appointment_date: string
          appointment_time: string
          created_at?: string
          created_by?: string | null
          id?: string
          patient_id?: number | null
          reason?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          appointment_date?: string
          appointment_time?: string
          created_at?: string
          created_by?: string | null
          id?: string
          patient_id?: number | null
          reason?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "Patients"
            referencedColumns: ["id"]
          },
        ]
      }
      Appointments: {
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
      Billing: {
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
      Claims: {
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
          complaint: string | null
          created_at: string | null
          diagnosis: string | null
          doctor_id: string | null
          id: string
          patient_id: string | null
          prescription: string | null
          treatment: string | null
          visual_acuity_left: string | null
          visual_acuity_right: string | null
        }
        Insert: {
          complaint?: string | null
          created_at?: string | null
          diagnosis?: string | null
          doctor_id?: string | null
          id?: string
          patient_id?: string | null
          prescription?: string | null
          treatment?: string | null
          visual_acuity_left?: string | null
          visual_acuity_right?: string | null
        }
        Update: {
          complaint?: string | null
          created_at?: string | null
          diagnosis?: string | null
          doctor_id?: string | null
          id?: string
          patient_id?: string | null
          prescription?: string | null
          treatment?: string | null
          visual_acuity_left?: string | null
          visual_acuity_right?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consultations_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      drugs: {
        Row: {
          category: string | null
          created_at: string | null
          created_by: string | null
          id: string
          name: string
          price: number | null
          stock: number | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          name: string
          price?: number | null
          stock?: number | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          name?: string
          price?: number | null
          stock?: number | null
        }
        Relationships: []
      }
      History: {
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
          stock: number
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
          stock?: number
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
          stock?: number
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
            referencedRelation: "Patients"
            referencedColumns: ["id"]
          },
        ]
      }
      Medication: {
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
      patients: {
        Row: {
          address: string | null
          created_at: string | null
          created_by: string | null
          date_of_birth: string | null
          doctor_id: string | null
          full_name: string
          gender: string | null
          id: string
          phone: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          created_by?: string | null
          date_of_birth?: string | null
          doctor_id?: string | null
          full_name: string
          gender?: string | null
          id?: string
          phone?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string | null
          created_by?: string | null
          date_of_birth?: string | null
          doctor_id?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          phone?: string | null
        }
        Relationships: []
      }
      Patients: {
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
      Products: {
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
      Profile: {
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
      Role: {
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
          created_at: string | null
          drug_id: string | null
          id: string
          patient_id: string | null
          quantity: number
          sold_by: string | null
          total_price: number | null
        }
        Insert: {
          created_at?: string | null
          drug_id?: string | null
          id?: string
          patient_id?: string | null
          quantity: number
          sold_by?: string | null
          total_price?: number | null
        }
        Update: {
          created_at?: string | null
          drug_id?: string | null
          id?: string
          patient_id?: string | null
          quantity?: number
          sold_by?: string | null
          total_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_drug_id_fkey"
            columns: ["drug_id"]
            isOneToOne: false
            referencedRelation: "drugs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      Sales: {
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
      user_roles: {
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
      Visits: {
        Row: {
          auto_od_axis: string | null
          auto_od_cylinder: string | null
          auto_od_sphere: string | null
          auto_os_axis: string | null
          auto_os_cylinder: string | null
          auto_os_sphere: string | null
          auto_va_od: string | null
          auto_va_os: string | null
          chief_complaint: string | null
          created_at: string
          diagnosis: string | null
          drugs_given: string | null
          duration: string | null
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
          va_od_distance: string | null
          va_od_near: string | null
          va_os_distance: string | null
          va_os_near: string | null
          va_ou_distance: string | null
          va_ou_near: string | null
        }
        Insert: {
          auto_od_axis?: string | null
          auto_od_cylinder?: string | null
          auto_od_sphere?: string | null
          auto_os_axis?: string | null
          auto_os_cylinder?: string | null
          auto_os_sphere?: string | null
          auto_va_od?: string | null
          auto_va_os?: string | null
          chief_complaint?: string | null
          created_at?: string
          diagnosis?: string | null
          drugs_given?: string | null
          duration?: string | null
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
          va_od_distance?: string | null
          va_od_near?: string | null
          va_os_distance?: string | null
          va_os_near?: string | null
          va_ou_distance?: string | null
          va_ou_near?: string | null
        }
        Update: {
          auto_od_axis?: string | null
          auto_od_cylinder?: string | null
          auto_od_sphere?: string | null
          auto_os_axis?: string | null
          auto_os_cylinder?: string | null
          auto_os_sphere?: string | null
          auto_va_od?: string | null
          auto_va_os?: string | null
          chief_complaint?: string | null
          created_at?: string
          diagnosis?: string | null
          drugs_given?: string | null
          duration?: string | null
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
            referencedRelation: "Patients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
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
