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
      customer_months: {
        Row: {
          aging_count: number | null
          aging_sum: number | null
          amount_pending: number | null
          amount_recovered: number | null
          avg_loan_aging: number | null
          collection_active_days: number | null
          collection_amount: number | null
          interest_accrued: number | null
          loan_amount: number | null
          loan_count: number | null
          month: string
          npl_value: number | null
          phone: string
          pos_active_days: number | null
          pos_collection: number | null
          repayment_amount: number | null
          repayment_count: number | null
          txn_count: number | null
          updated_at: string
        }
        Insert: {
          aging_count?: number | null
          aging_sum?: number | null
          amount_pending?: number | null
          amount_recovered?: number | null
          avg_loan_aging?: number | null
          collection_active_days?: number | null
          collection_amount?: number | null
          interest_accrued?: number | null
          loan_amount?: number | null
          loan_count?: number | null
          month: string
          npl_value?: number | null
          phone: string
          pos_active_days?: number | null
          pos_collection?: number | null
          repayment_amount?: number | null
          repayment_count?: number | null
          txn_count?: number | null
          updated_at?: string
        }
        Update: {
          aging_count?: number | null
          aging_sum?: number | null
          amount_pending?: number | null
          amount_recovered?: number | null
          avg_loan_aging?: number | null
          collection_active_days?: number | null
          collection_amount?: number | null
          interest_accrued?: number | null
          loan_amount?: number | null
          loan_count?: number | null
          month?: string
          npl_value?: number | null
          phone?: string
          pos_active_days?: number | null
          pos_collection?: number | null
          repayment_amount?: number | null
          repayment_count?: number | null
          txn_count?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          agent: string | null
          loan_type: string | null
          market: string | null
          max_loan_aging: number | null
          name: string | null
          npl_value: number | null
          onboarding_date: string | null
          phone: string
          pl_balance: number | null
          pl_limit: number | null
          pos_installed: string | null
          ref: string | null
          state: string | null
          total_pending: number | null
          updated_at: string
        }
        Insert: {
          agent?: string | null
          loan_type?: string | null
          market?: string | null
          max_loan_aging?: number | null
          name?: string | null
          npl_value?: number | null
          onboarding_date?: string | null
          phone: string
          pl_balance?: number | null
          pl_limit?: number | null
          pos_installed?: string | null
          ref?: string | null
          state?: string | null
          total_pending?: number | null
          updated_at?: string
        }
        Update: {
          agent?: string | null
          loan_type?: string | null
          market?: string | null
          max_loan_aging?: number | null
          name?: string | null
          npl_value?: number | null
          onboarding_date?: string | null
          phone?: string
          pl_balance?: number | null
          pl_limit?: number | null
          pos_installed?: string | null
          ref?: string | null
          state?: string | null
          total_pending?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      data_uploads: {
        Row: {
          created_at: string
          dataset: string
          file_name: string | null
          id: string
          rows_processed: number | null
        }
        Insert: {
          created_at?: string
          dataset: string
          file_name?: string | null
          id?: string
          rows_processed?: number | null
        }
        Update: {
          created_at?: string
          dataset?: string
          file_name?: string | null
          id?: string
          rows_processed?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
