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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string | null
          clinic_id: string | null
          id: string
          record_id: string | null
          table_name: string | null
          timestamp: string | null
          user_id: string | null
        }
        Insert: {
          action?: string | null
          clinic_id?: string | null
          id?: string
          record_id?: string | null
          table_name?: string | null
          timestamp?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string | null
          clinic_id?: string | null
          id?: string
          record_id?: string | null
          table_name?: string | null
          timestamp?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      alerts: {
        Row: {
          alert_type: string | null
          clinic_id: string | null
          created_at: string
          id: string
          message: string | null
          patient_id: string | null
          severity: string
          status: string
          visit_id: string | null
        }
        Insert: {
          alert_type?: string | null
          clinic_id?: string | null
          created_at?: string
          id?: string
          message?: string | null
          patient_id?: string | null
          severity?: string
          status?: string
          visit_id?: string | null
        }
        Update: {
          alert_type?: string | null
          clinic_id?: string | null
          created_at?: string
          id?: string
          message?: string | null
          patient_id?: string | null
          severity?: string
          status?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alerts_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          appointment_date: string
          appointment_time: string | null
          clinic_id: string | null
          created_at: string
          doctor_id: string | null
          id: string
          notes: string | null
          patient_id: string | null
          priority: string | null
          reason: string | null
          source: string | null
          status: string
          visit_id: string | null
        }
        Insert: {
          appointment_date: string
          appointment_time?: string | null
          clinic_id?: string | null
          created_at?: string
          doctor_id?: string | null
          id?: string
          notes?: string | null
          patient_id?: string | null
          priority?: string | null
          reason?: string | null
          source?: string | null
          status?: string
          visit_id?: string | null
        }
        Update: {
          appointment_date?: string
          appointment_time?: string | null
          clinic_id?: string | null
          created_at?: string
          doctor_id?: string | null
          id?: string
          notes?: string | null
          patient_id?: string | null
          priority?: string | null
          reason?: string | null
          source?: string | null
          status?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string | null
          clinic_id: string | null
          id: string
          record_id: string | null
          staff_id: string | null
          table_name: string | null
          timestamp: string | null
        }
        Insert: {
          action?: string | null
          clinic_id?: string | null
          id?: string
          record_id?: string | null
          staff_id?: string | null
          table_name?: string | null
          timestamp?: string | null
        }
        Update: {
          action?: string | null
          clinic_id?: string | null
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
      audit_logs: {
        Row: {
          action: string | null
          clinic_id: string | null
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string | null
          timestamp: string | null
          user_id: string | null
        }
        Insert: {
          action?: string | null
          clinic_id?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string | null
          timestamp?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string | null
          clinic_id?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string | null
          timestamp?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      auto_fix_logs: {
        Row: {
          action_taken: string
          clinic_id: string | null
          created_at: string
          details: Json | null
          id: string
          issue_detected: string
          status: string
        }
        Insert: {
          action_taken: string
          clinic_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          issue_detected: string
          status?: string
        }
        Update: {
          action_taken?: string
          clinic_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          issue_detected?: string
          status?: string
        }
        Relationships: []
      }
      billing: {
        Row: {
          amount_paid: number
          balance: number
          clinic_id: string | null
          consultation_fee: number
          created_at: string
          hmo_covered_amount: number | null
          hmo_id: string | null
          hmo_plan_id: string | null
          id: string
          items_total: number
          notes: string | null
          patient_id: string | null
          patient_payable: number | null
          payer_type: string
          status: string
          total_amount: number
          updated_at: string
          visit_id: string | null
        }
        Insert: {
          amount_paid?: number
          balance?: number
          clinic_id?: string | null
          consultation_fee?: number
          created_at?: string
          hmo_covered_amount?: number | null
          hmo_id?: string | null
          hmo_plan_id?: string | null
          id?: string
          items_total?: number
          notes?: string | null
          patient_id?: string | null
          patient_payable?: number | null
          payer_type?: string
          status?: string
          total_amount?: number
          updated_at?: string
          visit_id?: string | null
        }
        Update: {
          amount_paid?: number
          balance?: number
          clinic_id?: string | null
          consultation_fee?: number
          created_at?: string
          hmo_covered_amount?: number | null
          hmo_id?: string | null
          hmo_plan_id?: string | null
          id?: string
          items_total?: number
          notes?: string | null
          patient_id?: string | null
          patient_payable?: number | null
          payer_type?: string
          status?: string
          total_amount?: number
          updated_at?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_hmo_id_fkey"
            columns: ["hmo_id"]
            isOneToOne: false
            referencedRelation: "hmos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_hmo_plan_id_fkey"
            columns: ["hmo_plan_id"]
            isOneToOne: false
            referencedRelation: "hmo_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_items: {
        Row: {
          billing_id: string
          clinic_id: string | null
          created_at: string
          id: string
          inventory_id: string | null
          item_name: string
          item_type: string
          quantity: number
          total_price: number
          unit_price: number
        }
        Insert: {
          billing_id: string
          clinic_id?: string | null
          created_at?: string
          id?: string
          inventory_id?: string | null
          item_name: string
          item_type: string
          quantity?: number
          total_price?: number
          unit_price?: number
        }
        Update: {
          billing_id?: string
          clinic_id?: string | null
          created_at?: string
          id?: string
          inventory_id?: string | null
          item_name?: string
          item_type?: string
          quantity?: number
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "billing_items_billing_id_fkey"
            columns: ["billing_id"]
            isOneToOne: false
            referencedRelation: "billing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_items_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_feature_flags: {
        Row: {
          billing_enabled: boolean | null
          branch_id: string | null
          clinic_id: string
          hmo_enabled: boolean | null
          id: string
          pharmacy_enabled: boolean | null
        }
        Insert: {
          billing_enabled?: boolean | null
          branch_id?: string | null
          clinic_id: string
          hmo_enabled?: boolean | null
          id?: string
          pharmacy_enabled?: boolean | null
        }
        Update: {
          billing_enabled?: boolean | null
          branch_id?: string | null
          clinic_id?: string
          hmo_enabled?: boolean | null
          id?: string
          pharmacy_enabled?: boolean | null
        }
        Relationships: []
      }
      branches: {
        Row: {
          address: string | null
          clinic_id: string
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          address?: string | null
          clinic_id: string
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          address?: string | null
          clinic_id?: string
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      cache_refresh_queue: {
        Row: {
          clinic_id: string | null
          created_at: string | null
          id: string
          status: string | null
        }
        Insert: {
          clinic_id?: string | null
          created_at?: string | null
          id?: string
          status?: string | null
        }
        Update: {
          clinic_id?: string | null
          created_at?: string | null
          id?: string
          status?: string | null
        }
        Relationships: []
      }
      clinic_dashboard_cache: {
        Row: {
          clinic_id: string
          total_patients: number | null
          total_revenue: number | null
          total_visits: number | null
          updated_at: string | null
        }
        Insert: {
          clinic_id: string
          total_patients?: number | null
          total_revenue?: number | null
          total_visits?: number | null
          updated_at?: string | null
        }
        Update: {
          clinic_id?: string
          total_patients?: number | null
          total_revenue?: number | null
          total_visits?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      clinic_feature_flags: {
        Row: {
          appointments_enabled: boolean | null
          billing_enabled: boolean | null
          clinic_id: string
          created_at: string | null
          hmo_enabled: boolean | null
          id: string
          inventory_enabled: boolean | null
          pharmacy_enabled: boolean | null
          updated_at: string | null
        }
        Insert: {
          appointments_enabled?: boolean | null
          billing_enabled?: boolean | null
          clinic_id: string
          created_at?: string | null
          hmo_enabled?: boolean | null
          id?: string
          inventory_enabled?: boolean | null
          pharmacy_enabled?: boolean | null
          updated_at?: string | null
        }
        Update: {
          appointments_enabled?: boolean | null
          billing_enabled?: boolean | null
          clinic_id?: string
          created_at?: string | null
          hmo_enabled?: boolean | null
          id?: string
          inventory_enabled?: boolean | null
          pharmacy_enabled?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      clinic_health_scores: {
        Row: {
          clinic_id: string
          error_count: number | null
          health_score: number | null
          last_updated: string | null
          slow_queries: number | null
          uptime_percentage: number | null
        }
        Insert: {
          clinic_id: string
          error_count?: number | null
          health_score?: number | null
          last_updated?: string | null
          slow_queries?: number | null
          uptime_percentage?: number | null
        }
        Update: {
          clinic_id?: string
          error_count?: number | null
          health_score?: number | null
          last_updated?: string | null
          slow_queries?: number | null
          uptime_percentage?: number | null
        }
        Relationships: []
      }
      clinic_invites: {
        Row: {
          clinic_id: string | null
          created_at: string | null
          email: string | null
          expires_at: string
          id: string
          invited_by: string | null
          role: string | null
          status: string | null
          token: string | null
        }
        Insert: {
          clinic_id?: string | null
          created_at?: string | null
          email?: string | null
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: string | null
          status?: string | null
          token?: string | null
        }
        Update: {
          clinic_id?: string | null
          created_at?: string | null
          email?: string | null
          expires_at?: string
          id?: string
          invited_by?: string | null
          role?: string | null
          status?: string | null
          token?: string | null
        }
        Relationships: []
      }
      clinic_modules: {
        Row: {
          clinic_id: string
          created_at: string | null
          enabled: boolean | null
          id: string
          module: string
        }
        Insert: {
          clinic_id: string
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          module: string
        }
        Update: {
          clinic_id?: string
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          module?: string
        }
        Relationships: []
      }
      clinic_notifications: {
        Row: {
          clinic_id: string | null
          created_at: string | null
          email_enabled: boolean | null
          id: string
        }
        Insert: {
          clinic_id?: string | null
          created_at?: string | null
          email_enabled?: boolean | null
          id?: string
        }
        Update: {
          clinic_id?: string | null
          created_at?: string | null
          email_enabled?: boolean | null
          id?: string
        }
        Relationships: []
      }
      clinic_onboarding: {
        Row: {
          clinic_id: string | null
          completed: boolean | null
          created_at: string | null
          id: string
          step: string | null
          user_id: string | null
        }
        Insert: {
          clinic_id?: string | null
          completed?: boolean | null
          created_at?: string | null
          id?: string
          step?: string | null
          user_id?: string | null
        }
        Update: {
          clinic_id?: string | null
          completed?: boolean | null
          created_at?: string | null
          id?: string
          step?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      clinic_onboarding_log: {
        Row: {
          clinic_id: string | null
          created_at: string | null
          id: string
          status: string | null
          step: string | null
        }
        Insert: {
          clinic_id?: string | null
          created_at?: string | null
          id?: string
          status?: string | null
          step?: string | null
        }
        Update: {
          clinic_id?: string | null
          created_at?: string | null
          id?: string
          status?: string | null
          step?: string | null
        }
        Relationships: []
      }
      clinic_performance_logs: {
        Row: {
          action: string | null
          clinic_id: string | null
          created_at: string | null
          id: string
          response_time_ms: number | null
        }
        Insert: {
          action?: string | null
          clinic_id?: string | null
          created_at?: string | null
          id?: string
          response_time_ms?: number | null
        }
        Update: {
          action?: string | null
          clinic_id?: string | null
          created_at?: string | null
          id?: string
          response_time_ms?: number | null
        }
        Relationships: []
      }
      clinic_performance_metrics: {
        Row: {
          avg_response_time_ms: number | null
          calculated_at: string | null
          clinic_id: string | null
          id: string
          last_24h_requests: number | null
          record_growth_rate: number | null
          request_count: number | null
        }
        Insert: {
          avg_response_time_ms?: number | null
          calculated_at?: string | null
          clinic_id?: string | null
          id?: string
          last_24h_requests?: number | null
          record_growth_rate?: number | null
          request_count?: number | null
        }
        Update: {
          avg_response_time_ms?: number | null
          calculated_at?: string | null
          clinic_id?: string | null
          id?: string
          last_24h_requests?: number | null
          record_growth_rate?: number | null
          request_count?: number | null
        }
        Relationships: []
      }
      clinic_revenue_performance: {
        Row: {
          clinic_id: string | null
          health_score: number | null
          id: string
          plan: string | null
          revenue: number | null
          risk_level: string | null
          suggested_action: string | null
        }
        Insert: {
          clinic_id?: string | null
          health_score?: number | null
          id?: string
          plan?: string | null
          revenue?: number | null
          risk_level?: string | null
          suggested_action?: string | null
        }
        Update: {
          clinic_id?: string | null
          health_score?: number | null
          id?: string
          plan?: string | null
          revenue?: number | null
          risk_level?: string | null
          suggested_action?: string | null
        }
        Relationships: []
      }
      clinic_settings: {
        Row: {
          clinic_address: string | null
          clinic_id: string
          clinic_logo: string | null
          clinic_name: string
          clinic_phone: string | null
          created_at: string | null
          id: string
          primary_color: string | null
          secondary_color: string | null
          setup_completed: boolean | null
        }
        Insert: {
          clinic_address?: string | null
          clinic_id: string
          clinic_logo?: string | null
          clinic_name: string
          clinic_phone?: string | null
          created_at?: string | null
          id?: string
          primary_color?: string | null
          secondary_color?: string | null
          setup_completed?: boolean | null
        }
        Update: {
          clinic_address?: string | null
          clinic_id?: string
          clinic_logo?: string | null
          clinic_name?: string
          clinic_phone?: string | null
          created_at?: string | null
          id?: string
          primary_color?: string | null
          secondary_color?: string | null
          setup_completed?: boolean | null
        }
        Relationships: []
      }
      clinic_subscriptions: {
        Row: {
          branch_limit: number | null
          clinic_id: string | null
          created_at: string | null
          end_date: string | null
          id: string
          paystack_customer_id: string | null
          paystack_subscription_id: string | null
          plan: string | null
          start_date: string | null
          status: string | null
        }
        Insert: {
          branch_limit?: number | null
          clinic_id?: string | null
          created_at?: string | null
          end_date?: string | null
          id?: string
          paystack_customer_id?: string | null
          paystack_subscription_id?: string | null
          plan?: string | null
          start_date?: string | null
          status?: string | null
        }
        Update: {
          branch_limit?: number | null
          clinic_id?: string | null
          created_at?: string | null
          end_date?: string | null
          id?: string
          paystack_customer_id?: string | null
          paystack_subscription_id?: string | null
          plan?: string | null
          start_date?: string | null
          status?: string | null
        }
        Relationships: []
      }
      clinic_success_scores: {
        Row: {
          calculated_at: string
          clinic_id: string
          factors: Json | null
          id: string
          insights: string[] | null
          score: number
          status: string
        }
        Insert: {
          calculated_at?: string
          clinic_id: string
          factors?: Json | null
          id?: string
          insights?: string[] | null
          score?: number
          status?: string
        }
        Update: {
          calculated_at?: string
          clinic_id?: string
          factors?: Json | null
          id?: string
          insights?: string[] | null
          score?: number
          status?: string
        }
        Relationships: []
      }
      clinic_system_issues: {
        Row: {
          clinic_id: string | null
          detected_at: string | null
          id: string
          issue_type: string | null
          resolved: boolean | null
          severity: string | null
        }
        Insert: {
          clinic_id?: string | null
          detected_at?: string | null
          id?: string
          issue_type?: string | null
          resolved?: boolean | null
          severity?: string | null
        }
        Update: {
          clinic_id?: string | null
          detected_at?: string | null
          id?: string
          issue_type?: string | null
          resolved?: boolean | null
          severity?: string | null
        }
        Relationships: []
      }
      clinic_traffic_forecast: {
        Row: {
          clinic_id: string | null
          expected_spike_time: string | null
          id: string
          predicted_load_score: number | null
          status: string | null
        }
        Insert: {
          clinic_id?: string | null
          expected_spike_time?: string | null
          id?: string
          predicted_load_score?: number | null
          status?: string | null
        }
        Update: {
          clinic_id?: string | null
          expected_spike_time?: string | null
          id?: string
          predicted_load_score?: number | null
          status?: string | null
        }
        Relationships: []
      }
      clinic_users: {
        Row: {
          clinic_id: string | null
          created_at: string | null
          id: string
          role: string | null
          user_id: string | null
        }
        Insert: {
          clinic_id?: string | null
          created_at?: string | null
          id?: string
          role?: string | null
          user_id?: string | null
        }
        Update: {
          clinic_id?: string | null
          created_at?: string | null
          id?: string
          role?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clinic_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "my_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_access_context"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "clinic_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_active_clinic"
            referencedColumns: ["id"]
          },
        ]
      }
      clinical_rules: {
        Row: {
          action_type: string
          clinic_id: string
          condition_type: string
          created_at: string | null
          follow_up_days: number | null
          id: string
          operator: string
          rule_name: string
          threshold_value: string
        }
        Insert: {
          action_type: string
          clinic_id: string
          condition_type: string
          created_at?: string | null
          follow_up_days?: number | null
          id?: string
          operator: string
          rule_name: string
          threshold_value: string
        }
        Update: {
          action_type?: string
          clinic_id?: string
          condition_type?: string
          created_at?: string | null
          follow_up_days?: number | null
          id?: string
          operator?: string
          rule_name?: string
          threshold_value?: string
        }
        Relationships: []
      }
      clinics: {
        Row: {
          billing_enabled: boolean | null
          created_at: string | null
          custom_footer: string | null
          deactivated_at: string | null
          deactivation_reason: string | null
          display_name: string | null
          email: string | null
          first_patient_created: boolean | null
          first_patient_done: boolean | null
          hmo_enabled: boolean | null
          id: string
          is_active: boolean | null
          last_upgrade_prompt: string | null
          lifecycle_status: Database["public"]["Enums"]["clinic_lifecycle"]
          logo_url: string | null
          modules_configured: boolean | null
          modules_setup_done: boolean | null
          name: string
          onboarding_score: number | null
          onboarding_step: string | null
          parent_clinic_id: string | null
          pharmacy_enabled: boolean | null
          phone: string | null
          secondary_color: string | null
          setup_completed: boolean | null
          staff_added: boolean | null
          staff_setup_done: boolean | null
          subscription_status: string | null
          theme_color: string | null
          type: string | null
          updated_at: string | null
          upgrade_prompt_count: number | null
          website: string | null
          wizard_skipped: boolean | null
        }
        Insert: {
          billing_enabled?: boolean | null
          created_at?: string | null
          custom_footer?: string | null
          deactivated_at?: string | null
          deactivation_reason?: string | null
          display_name?: string | null
          email?: string | null
          first_patient_created?: boolean | null
          first_patient_done?: boolean | null
          hmo_enabled?: boolean | null
          id?: string
          is_active?: boolean | null
          last_upgrade_prompt?: string | null
          lifecycle_status?: Database["public"]["Enums"]["clinic_lifecycle"]
          logo_url?: string | null
          modules_configured?: boolean | null
          modules_setup_done?: boolean | null
          name: string
          onboarding_score?: number | null
          onboarding_step?: string | null
          parent_clinic_id?: string | null
          pharmacy_enabled?: boolean | null
          phone?: string | null
          secondary_color?: string | null
          setup_completed?: boolean | null
          staff_added?: boolean | null
          staff_setup_done?: boolean | null
          subscription_status?: string | null
          theme_color?: string | null
          type?: string | null
          updated_at?: string | null
          upgrade_prompt_count?: number | null
          website?: string | null
          wizard_skipped?: boolean | null
        }
        Update: {
          billing_enabled?: boolean | null
          created_at?: string | null
          custom_footer?: string | null
          deactivated_at?: string | null
          deactivation_reason?: string | null
          display_name?: string | null
          email?: string | null
          first_patient_created?: boolean | null
          first_patient_done?: boolean | null
          hmo_enabled?: boolean | null
          id?: string
          is_active?: boolean | null
          last_upgrade_prompt?: string | null
          lifecycle_status?: Database["public"]["Enums"]["clinic_lifecycle"]
          logo_url?: string | null
          modules_configured?: boolean | null
          modules_setup_done?: boolean | null
          name?: string
          onboarding_score?: number | null
          onboarding_step?: string | null
          parent_clinic_id?: string | null
          pharmacy_enabled?: boolean | null
          phone?: string | null
          secondary_color?: string | null
          setup_completed?: boolean | null
          staff_added?: boolean | null
          staff_setup_done?: boolean | null
          subscription_status?: string | null
          theme_color?: string | null
          type?: string | null
          updated_at?: string | null
          upgrade_prompt_count?: number | null
          website?: string | null
          wizard_skipped?: boolean | null
        }
        Relationships: []
      }
      drugs: {
        Row: {
          category: string | null
          clinic_id: string | null
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
          clinic_id?: string | null
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
          clinic_id?: string | null
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
      email_logs: {
        Row: {
          attempts: number | null
          clinic_id: string | null
          clinic_name: string | null
          created_at: string | null
          email: string | null
          email_type: string | null
          error: string | null
          error_message: string | null
          id: string
          invite_id: string | null
          provider: string | null
          provider_message_id: string | null
          role: string | null
          sent_at: string | null
          status: string | null
          subject: string | null
        }
        Insert: {
          attempts?: number | null
          clinic_id?: string | null
          clinic_name?: string | null
          created_at?: string | null
          email?: string | null
          email_type?: string | null
          error?: string | null
          error_message?: string | null
          id?: string
          invite_id?: string | null
          provider?: string | null
          provider_message_id?: string | null
          role?: string | null
          sent_at?: string | null
          status?: string | null
          subject?: string | null
        }
        Update: {
          attempts?: number | null
          clinic_id?: string | null
          clinic_name?: string | null
          created_at?: string | null
          email?: string | null
          email_type?: string | null
          error?: string | null
          error_message?: string | null
          id?: string
          invite_id?: string | null
          provider?: string | null
          provider_message_id?: string | null
          role?: string | null
          sent_at?: string | null
          status?: string | null
          subject?: string | null
        }
        Relationships: []
      }
      email_send_quota: {
        Row: {
          category: string
          daily_limit: number
          day: string
          id: string
          sent_count: number
          updated_at: string
        }
        Insert: {
          category?: string
          daily_limit?: number
          day: string
          id?: string
          sent_count?: number
          updated_at?: string
        }
        Update: {
          category?: string
          daily_limit?: number
          day?: string
          id?: string
          sent_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_suppressions: {
        Row: {
          clinic_id: string | null
          created_at: string
          details: Json | null
          email: string
          id: string
          reason: string
          source: string | null
        }
        Insert: {
          clinic_id?: string | null
          created_at?: string
          details?: Json | null
          email: string
          id?: string
          reason: string
          source?: string | null
        }
        Update: {
          clinic_id?: string | null
          created_at?: string
          details?: Json | null
          email?: string
          id?: string
          reason?: string
          source?: string | null
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          clinic_id: string | null
          feature: string | null
          id: string
        }
        Insert: {
          clinic_id?: string | null
          feature?: string | null
          id?: string
        }
        Update: {
          clinic_id?: string | null
          feature?: string | null
          id?: string
        }
        Relationships: []
      }
      feature_rollouts: {
        Row: {
          created_at: string | null
          enabled: boolean | null
          feature_name: string | null
          id: string
          rollout_percentage: number | null
        }
        Insert: {
          created_at?: string | null
          enabled?: boolean | null
          feature_name?: string | null
          id?: string
          rollout_percentage?: number | null
        }
        Update: {
          created_at?: string | null
          enabled?: boolean | null
          feature_name?: string | null
          id?: string
          rollout_percentage?: number | null
        }
        Relationships: []
      }
      feature_usage_logs: {
        Row: {
          action: string | null
          clinic_id: string | null
          created_at: string | null
          feature_name: string | null
          id: string
        }
        Insert: {
          action?: string | null
          clinic_id?: string | null
          created_at?: string | null
          feature_name?: string | null
          id?: string
        }
        Update: {
          action?: string | null
          clinic_id?: string | null
          created_at?: string | null
          feature_name?: string | null
          id?: string
        }
        Relationships: []
      }
      followups: {
        Row: {
          clinic_id: string | null
          created_at: string
          due_date: string
          id: string
          patient_id: string
          reason: string | null
          status: string
          visit_id: string | null
        }
        Insert: {
          clinic_id?: string | null
          created_at?: string
          due_date: string
          id?: string
          patient_id: string
          reason?: string | null
          status?: string
          visit_id?: string | null
        }
        Update: {
          clinic_id?: string | null
          created_at?: string
          due_date?: string
          id?: string
          patient_id?: string
          reason?: string | null
          status?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "followups_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followups_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      hmo_claims: {
        Row: {
          approved_amount: number
          billing_id: string | null
          clinic_id: string | null
          co_payment: number
          created_at: string
          hmo_id: string | null
          hmo_name: string | null
          id: string
          notes: string | null
          patient_id: string | null
          service_cost: number
          status: string
          updated_at: string
        }
        Insert: {
          approved_amount?: number
          billing_id?: string | null
          clinic_id?: string | null
          co_payment?: number
          created_at?: string
          hmo_id?: string | null
          hmo_name?: string | null
          id?: string
          notes?: string | null
          patient_id?: string | null
          service_cost?: number
          status?: string
          updated_at?: string
        }
        Update: {
          approved_amount?: number
          billing_id?: string | null
          clinic_id?: string | null
          co_payment?: number
          created_at?: string
          hmo_id?: string | null
          hmo_name?: string | null
          id?: string
          notes?: string | null
          patient_id?: string | null
          service_cost?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hmo_claims_billing_id_fkey"
            columns: ["billing_id"]
            isOneToOne: false
            referencedRelation: "billing"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hmo_claims_hmo_id_fkey"
            columns: ["hmo_id"]
            isOneToOne: false
            referencedRelation: "hmos"
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
      hmo_history: {
        Row: {
          change_reason: string | null
          changed_by: string | null
          clinic_id: string | null
          created_at: string
          id: string
          new_hmo_id: string | null
          new_hmo_plan_id: string | null
          new_payment_type: string | null
          old_hmo_id: string | null
          old_hmo_plan_id: string | null
          old_payment_type: string | null
          patient_id: string
        }
        Insert: {
          change_reason?: string | null
          changed_by?: string | null
          clinic_id?: string | null
          created_at?: string
          id?: string
          new_hmo_id?: string | null
          new_hmo_plan_id?: string | null
          new_payment_type?: string | null
          old_hmo_id?: string | null
          old_hmo_plan_id?: string | null
          old_payment_type?: string | null
          patient_id: string
        }
        Update: {
          change_reason?: string | null
          changed_by?: string | null
          clinic_id?: string | null
          created_at?: string
          id?: string
          new_hmo_id?: string | null
          new_hmo_plan_id?: string | null
          new_payment_type?: string | null
          old_hmo_id?: string | null
          old_hmo_plan_id?: string | null
          old_payment_type?: string | null
          patient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hmo_history_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      hmo_plans: {
        Row: {
          clinic_id: string | null
          coverage_limit: number | null
          created_at: string
          hmo_id: string
          id: string
          plan_name: string
          status: string
          used_amount: number | null
        }
        Insert: {
          clinic_id?: string | null
          coverage_limit?: number | null
          created_at?: string
          hmo_id: string
          id?: string
          plan_name: string
          status?: string
          used_amount?: number | null
        }
        Update: {
          clinic_id?: string | null
          coverage_limit?: number | null
          created_at?: string
          hmo_id?: string
          id?: string
          plan_name?: string
          status?: string
          used_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hmo_plans_hmo_id_fkey"
            columns: ["hmo_id"]
            isOneToOne: false
            referencedRelation: "hmos"
            referencedColumns: ["id"]
          },
        ]
      }
      hmos: {
        Row: {
          clinic_id: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          status: string
          updated_at: string
          website: string | null
        }
        Insert: {
          clinic_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          status?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          clinic_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          status?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      inventory: {
        Row: {
          branch_id: string | null
          category: string
          clinic_id: string | null
          created_at: string
          created_by: string | null
          drug_category: string | null
          expiry_date: string | null
          id: string
          image_url: string | null
          low_stock_threshold: number
          min_stock: number
          name: string
          price: number
          stock_quantity: number
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          category?: string
          clinic_id?: string | null
          created_at?: string
          created_by?: string | null
          drug_category?: string | null
          expiry_date?: string | null
          id?: string
          image_url?: string | null
          low_stock_threshold?: number
          min_stock?: number
          name: string
          price?: number
          stock_quantity?: number
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          category?: string
          clinic_id?: string | null
          created_at?: string
          created_by?: string | null
          drug_category?: string | null
          expiry_date?: string | null
          id?: string
          image_url?: string | null
          low_stock_threshold?: number
          min_stock?: number
          name?: string
          price?: number
          stock_quantity?: number
          updated_at?: string
        }
        Relationships: []
      }
      inventory_sale_items: {
        Row: {
          clinic_id: string | null
          id: string
          inventory_id: string
          quantity: number
          sale_id: string
          total_price: number
          unit_price: number
        }
        Insert: {
          clinic_id?: string | null
          id?: string
          inventory_id: string
          quantity?: number
          sale_id: string
          total_price?: number
          unit_price?: number
        }
        Update: {
          clinic_id?: string | null
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
          clinic_id: string | null
          created_at: string
          id: string
          patient_id: string | null
          sold_by: string | null
          total_amount: number
        }
        Insert: {
          clinic_id?: string | null
          created_at?: string
          id?: string
          patient_id?: string | null
          sold_by?: string | null
          total_amount?: number
        }
        Update: {
          clinic_id?: string | null
          created_at?: string
          id?: string
          patient_id?: string | null
          sold_by?: string | null
          total_amount?: number
        }
        Relationships: []
      }
      invites: {
        Row: {
          accepted: boolean | null
          clinic_id: string | null
          created_at: string | null
          email: string | null
          id: string
          role: string | null
          token: string | null
        }
        Insert: {
          accepted?: boolean | null
          clinic_id?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          role?: string | null
          token?: string | null
        }
        Update: {
          accepted?: boolean | null
          clinic_id?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          role?: string | null
          token?: string | null
        }
        Relationships: []
      }
      migration_log: {
        Row: {
          created_at: string | null
          error: string | null
          id: number
          query: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          error?: string | null
          id?: number
          query?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          error?: string | null
          id?: number
          query?: string | null
          status?: string | null
        }
        Relationships: []
      }
      notification_logs: {
        Row: {
          attempts: number | null
          bounced_at: string | null
          category: string | null
          channel: string
          clicked_at: string | null
          clinic_id: string | null
          complained_at: string | null
          created_at: string
          delivered_at: string | null
          error_message: string | null
          id: string
          metadata: Json | null
          notification_type: string
          opened_at: string | null
          plain_text_included: boolean | null
          provider: string | null
          provider_message_id: string | null
          recipient: string
          sent_at: string | null
          status: string
          subject: string | null
        }
        Insert: {
          attempts?: number | null
          bounced_at?: string | null
          category?: string | null
          channel?: string
          clicked_at?: string | null
          clinic_id?: string | null
          complained_at?: string | null
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          notification_type: string
          opened_at?: string | null
          plain_text_included?: boolean | null
          provider?: string | null
          provider_message_id?: string | null
          recipient: string
          sent_at?: string | null
          status?: string
          subject?: string | null
        }
        Update: {
          attempts?: number | null
          bounced_at?: string | null
          category?: string | null
          channel?: string
          clicked_at?: string | null
          clinic_id?: string | null
          complained_at?: string | null
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          notification_type?: string
          opened_at?: string | null
          plain_text_included?: boolean | null
          provider?: string | null
          provider_message_id?: string | null
          recipient?: string
          sent_at?: string | null
          status?: string
          subject?: string | null
        }
        Relationships: []
      }
      onboarding_progress: {
        Row: {
          clinic_id: string | null
          completed: boolean | null
          id: string
          step: string | null
          updated_at: string | null
        }
        Insert: {
          clinic_id?: string | null
          completed?: boolean | null
          id?: string
          step?: string | null
          updated_at?: string | null
        }
        Update: {
          clinic_id?: string | null
          completed?: boolean | null
          id?: string
          step?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      patient_number_counters: {
        Row: {
          clinic_id: string
          last_number: number
        }
        Insert: {
          clinic_id: string
          last_number?: number
        }
        Update: {
          clinic_id?: string
          last_number?: number
        }
        Relationships: []
      }
      patients: {
        Row: {
          active_hmo_id: string | null
          active_hmo_plan_id: string | null
          address: string | null
          age: number | null
          assigned_doctor: string | null
          branch_id: string | null
          clinic_id: string | null
          created_at: string
          created_by: string | null
          enrollee_number: string | null
          full_name: string
          gender: string | null
          id: string
          next_of_kin: string | null
          patient_number: string | null
          payment_type: string
          phone: string | null
          priority: string
          queue_number: number
          queue_status: string
          status: string
          updated_at: string
        }
        Insert: {
          active_hmo_id?: string | null
          active_hmo_plan_id?: string | null
          address?: string | null
          age?: number | null
          assigned_doctor?: string | null
          branch_id?: string | null
          clinic_id?: string | null
          created_at?: string
          created_by?: string | null
          enrollee_number?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          next_of_kin?: string | null
          patient_number?: string | null
          payment_type?: string
          phone?: string | null
          priority?: string
          queue_number?: number
          queue_status?: string
          status?: string
          updated_at?: string
        }
        Update: {
          active_hmo_id?: string | null
          active_hmo_plan_id?: string | null
          address?: string | null
          age?: number | null
          assigned_doctor?: string | null
          branch_id?: string | null
          clinic_id?: string | null
          created_at?: string
          created_by?: string | null
          enrollee_number?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          next_of_kin?: string | null
          patient_number?: string | null
          payment_type?: string
          phone?: string | null
          priority?: string
          queue_number?: number
          queue_status?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_reminders: {
        Row: {
          channel: string | null
          clinic_id: string | null
          created_at: string | null
          id: string
          last_sent_at: string | null
          max_retries: number | null
          reminder_type: string | null
          retry_count: number | null
          sent: boolean | null
          status: string | null
        }
        Insert: {
          channel?: string | null
          clinic_id?: string | null
          created_at?: string | null
          id?: string
          last_sent_at?: string | null
          max_retries?: number | null
          reminder_type?: string | null
          retry_count?: number | null
          sent?: boolean | null
          status?: string | null
        }
        Update: {
          channel?: string | null
          clinic_id?: string | null
          created_at?: string | null
          id?: string
          last_sent_at?: string | null
          max_retries?: number | null
          reminder_type?: string | null
          retry_count?: number | null
          sent?: boolean | null
          status?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          billing_id: string
          clinic_id: string | null
          created_at: string
          id: string
          method: string
          paid_by: string
          received_by: string | null
        }
        Insert: {
          amount: number
          billing_id: string
          clinic_id?: string | null
          created_at?: string
          id?: string
          method?: string
          paid_by?: string
          received_by?: string | null
        }
        Update: {
          amount?: number
          billing_id?: string
          clinic_id?: string | null
          created_at?: string
          id?: string
          method?: string
          paid_by?: string
          received_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_billing_id_fkey"
            columns: ["billing_id"]
            isOneToOne: false
            referencedRelation: "billing"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          company_name: string | null
          created_at: string | null
          favicon_url: string | null
          id: string
          logo_url: string | null
          powered_by_text: string | null
          show_powered_by: boolean | null
          support_email: string | null
          system_name: string | null
          updated_at: string | null
          white_label_enabled: boolean | null
        }
        Insert: {
          company_name?: string | null
          created_at?: string | null
          favicon_url?: string | null
          id?: string
          logo_url?: string | null
          powered_by_text?: string | null
          show_powered_by?: boolean | null
          support_email?: string | null
          system_name?: string | null
          updated_at?: string | null
          white_label_enabled?: boolean | null
        }
        Update: {
          company_name?: string | null
          created_at?: string | null
          favicon_url?: string | null
          id?: string
          logo_url?: string | null
          powered_by_text?: string | null
          show_powered_by?: boolean | null
          support_email?: string | null
          system_name?: string | null
          updated_at?: string | null
          white_label_enabled?: boolean | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active_clinic_id: string
          avatar_url: string | null
          branch_id: string | null
          clinic_id: string
          created_at: string | null
          full_name: string | null
          id: string
          is_active: boolean
          is_super_admin: boolean | null
          last_active_clinic_id: string | null
          phone: string | null
          role: string | null
          status: string | null
          title: string | null
        }
        Insert: {
          active_clinic_id: string
          avatar_url?: string | null
          branch_id?: string | null
          clinic_id: string
          created_at?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          is_super_admin?: boolean | null
          last_active_clinic_id?: string | null
          phone?: string | null
          role?: string | null
          status?: string | null
          title?: string | null
        }
        Update: {
          active_clinic_id?: string
          avatar_url?: string | null
          branch_id?: string | null
          clinic_id?: string
          created_at?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          is_super_admin?: boolean | null
          last_active_clinic_id?: string | null
          phone?: string | null
          role?: string | null
          status?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_active_clinic"
            columns: ["active_clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      query_performance_logs: {
        Row: {
          clinic_id: string | null
          created_at: string | null
          execution_time_ms: number | null
          id: string
          query: string | null
        }
        Insert: {
          clinic_id?: string | null
          created_at?: string | null
          execution_time_ms?: number | null
          id?: string
          query?: string | null
        }
        Update: {
          clinic_id?: string | null
          created_at?: string | null
          execution_time_ms?: number | null
          id?: string
          query?: string | null
        }
        Relationships: []
      }
      restock_history: {
        Row: {
          added_by: string | null
          clinic_id: string | null
          created_at: string
          id: string
          inventory_id: string | null
          new_stock: number | null
          note: string | null
          previous_stock: number | null
          quantity_added: number | null
        }
        Insert: {
          added_by?: string | null
          clinic_id?: string | null
          created_at?: string
          id?: string
          inventory_id?: string | null
          new_stock?: number | null
          note?: string | null
          previous_stock?: number | null
          quantity_added?: number | null
        }
        Update: {
          added_by?: string | null
          clinic_id?: string | null
          created_at?: string
          id?: string
          inventory_id?: string | null
          new_stock?: number | null
          note?: string | null
          previous_stock?: number | null
          quantity_added?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "restock_history_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
        ]
      }
      rls_policy_audit: {
        Row: {
          created_at: string | null
          id: number
          is_safe: boolean | null
          policy_name: string | null
          table_name: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          is_safe?: boolean | null
          policy_name?: string | null
          table_name?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          is_safe?: boolean | null
          policy_name?: string | null
          table_name?: string | null
        }
        Relationships: []
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
      roles: {
        Row: {
          name: string
        }
        Insert: {
          name: string
        }
        Update: {
          name?: string
        }
        Relationships: []
      }
      sales: {
        Row: {
          category: string | null
          clinic_id: string | null
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
          clinic_id?: string | null
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
          clinic_id?: string | null
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
      sandbox_clones: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          sandbox_clinic_id: string | null
          source_clinic_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          sandbox_clinic_id?: string | null
          source_clinic_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          sandbox_clinic_id?: string | null
          source_clinic_id?: string | null
        }
        Relationships: []
      }
      schema_drift_log: {
        Row: {
          detected_at: string | null
          id: number
          issue: string | null
          table_name: string | null
        }
        Insert: {
          detected_at?: string | null
          id?: number
          issue?: string | null
          table_name?: string | null
        }
        Update: {
          detected_at?: string | null
          id?: number
          issue?: string | null
          table_name?: string | null
        }
        Relationships: []
      }
      shifts: {
        Row: {
          break_end: string | null
          break_start: string | null
          clinic_id: string | null
          clock_in: string | null
          clock_out: string | null
          created_at: string | null
          id: string
          role: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          break_end?: string | null
          break_start?: string | null
          clinic_id?: string | null
          clock_in?: string | null
          clock_out?: string | null
          created_at?: string | null
          id?: string
          role?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          break_end?: string | null
          break_start?: string | null
          clinic_id?: string | null
          clock_in?: string | null
          clock_out?: string | null
          created_at?: string | null
          id?: string
          role?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      smart_alerts: {
        Row: {
          alert_type: string | null
          clinic_id: string
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string | null
          patient_id: string | null
          severity: string | null
        }
        Insert: {
          alert_type?: string | null
          clinic_id: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string | null
          patient_id?: string | null
          severity?: string | null
        }
        Update: {
          alert_type?: string | null
          clinic_id?: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string | null
          patient_id?: string | null
          severity?: string | null
        }
        Relationships: []
      }
      staff: {
        Row: {
          clinic_id: string | null
          created_at: string | null
          email: string | null
          full_name: string
          id: string
          password_hash: string | null
          phone: string | null
          role: string | null
        }
        Insert: {
          clinic_id?: string | null
          created_at?: string | null
          email?: string | null
          full_name: string
          id?: string
          password_hash?: string | null
          phone?: string | null
          role?: string | null
        }
        Update: {
          clinic_id?: string | null
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
      sync_logs: {
        Row: {
          clinic_id: string | null
          created_at: string | null
          device_id: string | null
          event: string | null
          id: string
          message: string | null
        }
        Insert: {
          clinic_id?: string | null
          created_at?: string | null
          device_id?: string | null
          event?: string | null
          id?: string
          message?: string | null
        }
        Update: {
          clinic_id?: string | null
          created_at?: string | null
          device_id?: string | null
          event?: string | null
          id?: string
          message?: string | null
        }
        Relationships: []
      }
      sync_metrics: {
        Row: {
          clinic_id: string | null
          created_at: string | null
          id: string
          last_sync_duration_ms: number | null
          total_failed: number | null
          total_synced: number | null
        }
        Insert: {
          clinic_id?: string | null
          created_at?: string | null
          id?: string
          last_sync_duration_ms?: number | null
          total_failed?: number | null
          total_synced?: number | null
        }
        Update: {
          clinic_id?: string | null
          created_at?: string | null
          id?: string
          last_sync_duration_ms?: number | null
          total_failed?: number | null
          total_synced?: number | null
        }
        Relationships: []
      }
      sync_queue: {
        Row: {
          action: string
          clinic_id: string
          created_at: string | null
          device_id: string
          id: number
          payload: Json | null
          status: string | null
          table_name: string
        }
        Insert: {
          action: string
          clinic_id: string
          created_at?: string | null
          device_id: string
          id?: number
          payload?: Json | null
          status?: string | null
          table_name: string
        }
        Update: {
          action?: string
          clinic_id?: string
          created_at?: string | null
          device_id?: string
          id?: number
          payload?: Json | null
          status?: string | null
          table_name?: string
        }
        Relationships: []
      }
      sync_state: {
        Row: {
          clinic_id: string
          device_id: string
          id: string
          last_online: string | null
          last_sync: string | null
          queue_count: number | null
          status: string
          updated_at: string | null
        }
        Insert: {
          clinic_id: string
          device_id: string
          id?: string
          last_online?: string | null
          last_sync?: string | null
          queue_count?: number | null
          status: string
          updated_at?: string | null
        }
        Update: {
          clinic_id?: string
          device_id?: string
          id?: string
          last_online?: string | null
          last_sync?: string | null
          queue_count?: number | null
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      sync_status: {
        Row: {
          clinic_id: string
          device_id: string
          id: string
          last_online_at: string | null
          last_synced_at: string | null
          pending_operations: number | null
          status: string
          updated_at: string | null
        }
        Insert: {
          clinic_id: string
          device_id: string
          id?: string
          last_online_at?: string | null
          last_synced_at?: string | null
          pending_operations?: number | null
          status: string
          updated_at?: string | null
        }
        Update: {
          clinic_id?: string
          device_id?: string
          id?: string
          last_online_at?: string | null
          last_synced_at?: string | null
          pending_operations?: number | null
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      system_action_approvals: {
        Row: {
          action_type: string | null
          approved_by: string | null
          clinic_id: string | null
          created_at: string | null
          description: string | null
          executed_at: string | null
          id: string
          requested_by: string | null
          severity: string | null
          status: string | null
        }
        Insert: {
          action_type?: string | null
          approved_by?: string | null
          clinic_id?: string | null
          created_at?: string | null
          description?: string | null
          executed_at?: string | null
          id?: string
          requested_by?: string | null
          severity?: string | null
          status?: string | null
        }
        Update: {
          action_type?: string | null
          approved_by?: string | null
          clinic_id?: string | null
          created_at?: string | null
          description?: string | null
          executed_at?: string | null
          id?: string
          requested_by?: string | null
          severity?: string | null
          status?: string | null
        }
        Relationships: []
      }
      system_safety_rules: {
        Row: {
          action_type: string | null
          auto_allowed: boolean | null
          id: string
          requires_approval: boolean | null
        }
        Insert: {
          action_type?: string | null
          auto_allowed?: boolean | null
          id?: string
          requires_approval?: boolean | null
        }
        Update: {
          action_type?: string | null
          auto_allowed?: boolean | null
          id?: string
          requires_approval?: boolean | null
        }
        Relationships: []
      }
      user_clinic_memberships: {
        Row: {
          clinic_id: string | null
          id: string | null
          is_active: boolean | null
          user_id: string | null
        }
        Insert: {
          clinic_id?: string | null
          id?: string | null
          is_active?: boolean | null
          user_id?: string | null
        }
        Update: {
          clinic_id?: string | null
          id?: string | null
          is_active?: boolean | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_clinics: {
        Row: {
          clinic_id: string | null
          created_at: string | null
          id: string
          role: string | null
          user_id: string | null
        }
        Insert: {
          clinic_id?: string | null
          created_at?: string | null
          id?: string
          role?: string | null
          user_id?: string | null
        }
        Update: {
          clinic_id?: string | null
          created_at?: string | null
          id?: string
          role?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_clinics_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          clinic_id: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          clinic_id?: string | null
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          clinic_id?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      visits: {
        Row: {
          active_hmo_id: string | null
          active_hmo_plan_id: string | null
          auto_od_axis: string | null
          auto_od_cyl: string | null
          auto_od_sphere: string | null
          auto_os_axis: string | null
          auto_os_cyl: string | null
          auto_os_sphere: string | null
          auto_va_od: string | null
          auto_va_os: string | null
          chief_complaint: string | null
          clinic_id: string | null
          completed_at: string | null
          created_at: string
          diagnosis: string | null
          doctor_id: string | null
          examination: string | null
          history: string | null
          id: string
          iop_od: number | null
          iop_od_time: string | null
          iop_os: number | null
          iop_os_time: string | null
          notes: string | null
          old_lens_prescription: string | null
          patient_id: string
          payment_type: string
          reading_add_aided_ou: string | null
          reading_add_unaided_ou: string | null
          status: string
          sub_od_axis: string | null
          sub_od_cyl: string | null
          sub_od_sphere: string | null
          sub_os_axis: string | null
          sub_os_cyl: string | null
          sub_os_sphere: string | null
          sub_reading_add: string | null
          sub_va_od: string | null
          sub_va_os: string | null
          sub_va_outcome: string | null
          treatment: string | null
          updated_at: string
          va_aided_near_ou: string | null
          va_aided_od: string | null
          va_aided_od_ph: string | null
          va_aided_os: string | null
          va_aided_os_ph: string | null
          va_aided_ou: string | null
          va_unaided_near_ou: string | null
          va_unaided_od: string | null
          va_unaided_od_ph: string | null
          va_unaided_os: string | null
          va_unaided_os_ph: string | null
          va_unaided_ou: string | null
        }
        Insert: {
          active_hmo_id?: string | null
          active_hmo_plan_id?: string | null
          auto_od_axis?: string | null
          auto_od_cyl?: string | null
          auto_od_sphere?: string | null
          auto_os_axis?: string | null
          auto_os_cyl?: string | null
          auto_os_sphere?: string | null
          auto_va_od?: string | null
          auto_va_os?: string | null
          chief_complaint?: string | null
          clinic_id?: string | null
          completed_at?: string | null
          created_at?: string
          diagnosis?: string | null
          doctor_id?: string | null
          examination?: string | null
          history?: string | null
          id?: string
          iop_od?: number | null
          iop_od_time?: string | null
          iop_os?: number | null
          iop_os_time?: string | null
          notes?: string | null
          old_lens_prescription?: string | null
          patient_id: string
          payment_type?: string
          reading_add_aided_ou?: string | null
          reading_add_unaided_ou?: string | null
          status?: string
          sub_od_axis?: string | null
          sub_od_cyl?: string | null
          sub_od_sphere?: string | null
          sub_os_axis?: string | null
          sub_os_cyl?: string | null
          sub_os_sphere?: string | null
          sub_reading_add?: string | null
          sub_va_od?: string | null
          sub_va_os?: string | null
          sub_va_outcome?: string | null
          treatment?: string | null
          updated_at?: string
          va_aided_near_ou?: string | null
          va_aided_od?: string | null
          va_aided_od_ph?: string | null
          va_aided_os?: string | null
          va_aided_os_ph?: string | null
          va_aided_ou?: string | null
          va_unaided_near_ou?: string | null
          va_unaided_od?: string | null
          va_unaided_od_ph?: string | null
          va_unaided_os?: string | null
          va_unaided_os_ph?: string | null
          va_unaided_ou?: string | null
        }
        Update: {
          active_hmo_id?: string | null
          active_hmo_plan_id?: string | null
          auto_od_axis?: string | null
          auto_od_cyl?: string | null
          auto_od_sphere?: string | null
          auto_os_axis?: string | null
          auto_os_cyl?: string | null
          auto_os_sphere?: string | null
          auto_va_od?: string | null
          auto_va_os?: string | null
          chief_complaint?: string | null
          clinic_id?: string | null
          completed_at?: string | null
          created_at?: string
          diagnosis?: string | null
          doctor_id?: string | null
          examination?: string | null
          history?: string | null
          id?: string
          iop_od?: number | null
          iop_od_time?: string | null
          iop_os?: number | null
          iop_os_time?: string | null
          notes?: string | null
          old_lens_prescription?: string | null
          patient_id?: string
          payment_type?: string
          reading_add_aided_ou?: string | null
          reading_add_unaided_ou?: string | null
          status?: string
          sub_od_axis?: string | null
          sub_od_cyl?: string | null
          sub_od_sphere?: string | null
          sub_os_axis?: string | null
          sub_os_cyl?: string | null
          sub_os_sphere?: string | null
          sub_reading_add?: string | null
          sub_va_od?: string | null
          sub_va_os?: string | null
          sub_va_outcome?: string | null
          treatment?: string | null
          updated_at?: string
          va_aided_near_ou?: string | null
          va_aided_od?: string | null
          va_aided_od_ph?: string | null
          va_aided_os?: string | null
          va_aided_os_ph?: string | null
          va_aided_ou?: string | null
          va_unaided_near_ou?: string | null
          va_unaided_od?: string | null
          va_unaided_od_ph?: string | null
          va_unaided_os?: string | null
          va_unaided_os_ph?: string | null
          va_unaided_ou?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visits_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      visits_local: {
        Row: {
          clinic_id: string | null
          created_at: string | null
          local_id: string
          patient_id: number | null
          patient_local_id: string | null
          pending_sync: boolean | null
          server_id: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          clinic_id?: string | null
          created_at?: string | null
          local_id: string
          patient_id?: number | null
          patient_local_id?: string | null
          pending_sync?: boolean | null
          server_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          clinic_id?: string | null
          created_at?: string | null
          local_id?: string
          patient_id?: number | null
          patient_local_id?: string | null
          pending_sync?: boolean | null
          server_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      your_table_name: {
        Row: {
          amount: number | null
          created_at: string | null
          id: string | null
          paid_at: string | null
          patient_id: number | null
          status: string | null
          visit_id: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          id?: string | null
          paid_at?: string | null
          patient_id?: number | null
          status?: string | null
          visit_id?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          id?: string | null
          paid_at?: string | null
          patient_id?: number | null
          status?: string | null
          visit_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      my_profile: {
        Row: {
          avatar_url: string | null
          branch_id: string | null
          clinic_id: string | null
          created_at: string | null
          full_name: string | null
          id: string | null
          is_super_admin: boolean | null
          phone: string | null
          role: string | null
          status: string | null
          title: string | null
        }
        Insert: {
          avatar_url?: string | null
          branch_id?: string | null
          clinic_id?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string | null
          is_super_admin?: boolean | null
          phone?: string | null
          role?: string | null
          status?: string | null
          title?: string | null
        }
        Update: {
          avatar_url?: string | null
          branch_id?: string | null
          clinic_id?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string | null
          is_super_admin?: boolean | null
          phone?: string | null
          role?: string | null
          status?: string | null
          title?: string | null
        }
        Relationships: []
      }
      user_access_context: {
        Row: {
          clinic_id: string | null
          clinic_name: string | null
          full_name: string | null
          is_super_admin: boolean | null
          lifecycle_status: string | null
          profile_role: string | null
          resolved_role: string | null
          setup_completed: boolean | null
          user_id: string | null
        }
        Relationships: []
      }
      user_active_clinic: {
        Row: {
          id: string | null
          is_super_admin: boolean | null
          resolved_clinic_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      activate_clinic_subscription: {
        Args: { _clinic_id: string }
        Returns: Json
      }
      analyze_clinic_revenue_health: { Args: never; Returns: undefined }
      approve_system_action: {
        Args: { approval_id: string }
        Returns: undefined
      }
      calculate_clinic_success_score: {
        Args: { _clinic_id: string }
        Returns: Json
      }
      calculate_health_score: { Args: { cid: string }; Returns: number }
      can_add_branch: { Args: { org_id: string }; Returns: boolean }
      check_policy_safety: { Args: { policy_text: string }; Returns: boolean }
      check_reminder: { Args: { p_clinic_id: string }; Returns: boolean }
      check_trial_expiration: { Args: never; Returns: number }
      clinic_match: { Args: never; Returns: boolean }
      clone_clinic: { Args: { source_clinic_id: string }; Returns: string }
      clone_clinic_to_sandbox: {
        Args: { sandbox_name: string; source_clinic: string }
        Returns: string
      }
      complete_clinic_setup: { Args: never; Returns: undefined }
      complete_onboarding: { Args: { _clinic_id: string }; Returns: undefined }
      create_clinic_with_admin:
        | { Args: { admin_id: string; clinic_name: string }; Returns: string }
        | {
            Args: {
              admin_email: string
              admin_id: string
              admin_name: string
              clinic_name: string
            }
            Returns: string
          }
        | {
            Args: {
              admin_name: string
              admin_user_id: string
              clinic_name: string
            }
            Returns: string
          }
      current_clinic_id: { Args: never; Returns: string }
      deactivate_clinic: {
        Args: { _clinic_id: string; _reason?: string }
        Returns: Json
      }
      detect_clinic_issues: { Args: never; Returns: undefined }
      detect_issue_to_approval: { Args: never; Returns: undefined }
      enforce_branch_limits: { Args: { p_org_id: string }; Returns: undefined }
      execute_approved_action: {
        Args: { approval_id: string }
        Returns: undefined
      }
      freeze_extra_branches: { Args: { p_org_id: string }; Returns: undefined }
      get_active_clinic_id: { Args: never; Returns: string }
      get_due_reminders: {
        Args: never
        Returns: {
          clinic_id: string
          email: string
          phone: string
          reminder_type: string
        }[]
      }
      get_my_clinic_id: { Args: never; Returns: string }
      get_my_profile: {
        Args: never
        Returns: {
          clinic_id: string
          full_name: string
          role: string
          user_id: string
        }[]
      }
      get_plan_features: {
        Args: { plan: string }
        Returns: {
          appointments: boolean
          billing: boolean
          hmo: boolean
          inventory: boolean
          pharmacy: boolean
        }[]
      }
      has_clinic_access: {
        Args: { target_clinic: string; uid: string }
        Returns: boolean
      }
      has_role:
        | {
            Args: {
              _role: Database["public"]["Enums"]["app_role"]
              _user_id: string
            }
            Returns: boolean
          }
        | { Args: { required_role: string }; Returns: boolean }
      is_clinic_unpaid: { Args: { p_clinic_id: string }; Returns: boolean }
      is_feature_enabled: {
        Args: { feature_name: string; p_clinic_id: string }
        Returns: boolean
      }
      is_feature_in_rollout: {
        Args: { clinic_id: string; feature: string }
        Returns: boolean
      }
      is_platform_super_admin: { Args: { uid: string }; Returns: boolean }
      is_super_admin:
        | { Args: never; Returns: boolean }
        | { Args: { _user_id: string }; Returns: boolean }
      is_table: { Args: { obj: string }; Returns: boolean }
      is_trial_active: { Args: { _clinic_id: string }; Returns: boolean }
      is_view: { Args: { obj: string }; Returns: boolean }
      lifecycle_allows_access: {
        Args: { _clinic_id: string }
        Returns: boolean
      }
      log_hmo_change: {
        Args: {
          p_changed_by: string
          p_new_hmo: string
          p_new_payment: string
          p_old_hmo: string
          p_old_payment: string
          p_patient_id: string
          p_reason: string
        }
        Returns: undefined
      }
      predict_clinic_load: { Args: never; Returns: undefined }
      predict_slow_clinic: {
        Args: never
        Returns: {
          clinic_id: string
          risk_level: string
        }[]
      }
      preload_clinic_cache: { Args: { cid: string }; Returns: undefined }
      process_cache_queue: { Args: never; Returns: undefined }
      process_retry_reminders: { Args: never; Returns: undefined }
      refresh_clinic_dashboard_cache: {
        Args: { cid: string }
        Returns: undefined
      }
      require_clinic: { Args: never; Returns: undefined }
      reset_sandbox_clinic: { Args: { sandbox_id: string }; Returns: undefined }
      run_auto_fix: { Args: { _clinic_id: string }; Returns: Json }
      seed_sandbox_data: { Args: { sandbox_id: string }; Returns: undefined }
      self_heal_clinic: { Args: { cid: string }; Returns: undefined }
      send_prescription_to_pharmacy: {
        Args: { p_visit_id: string }
        Returns: undefined
      }
      set_active_clinic: { Args: { target_clinic: string }; Returns: undefined }
      set_clinic_lifecycle: {
        Args: {
          _clinic_id: string
          _next: Database["public"]["Enums"]["clinic_lifecycle"]
          _reason?: string
        }
        Returns: Database["public"]["Enums"]["clinic_lifecycle"]
      }
      smart_initialize_clinic: {
        Args: { _clinic_id: string; _clinic_type: string }
        Returns: Json
      }
      suggest_query_fix: { Args: { q: string }; Returns: string }
      try_consume_email_quota: {
        Args: { _category: string; _limit: number }
        Returns: number
      }
      validate_target_object: { Args: { obj: string }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "doctor" | "receptionist" | "super_admin"
      clinic_lifecycle: "trial" | "active" | "suspended" | "deactivated"
      payment_type_enum: "private" | "hmo"
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
      app_role: ["admin", "doctor", "receptionist", "super_admin"],
      clinic_lifecycle: ["trial", "active", "suspended", "deactivated"],
      payment_type_enum: ["private", "hmo"],
    },
  },
} as const
