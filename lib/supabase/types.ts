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
    PostgrestVersion: "17.1"
  }
  public: {
    Tables: {
      crop_aliases: {
        Row: {
          alias: string
          crop_id: string
        }
        Insert: {
          alias: string
          crop_id: string
        }
        Update: {
          alias?: string
          crop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crop_aliases_crop_id_fkey"
            columns: ["crop_id"]
            isOneToOne: false
            referencedRelation: "crops"
            referencedColumns: ["id"]
          },
        ]
      }
      crops: {
        Row: {
          id: string
          name_en: string
          name_kn: string
          storable: boolean
          storage_loss_pct_per_month: number
          transit_loss_pct: number
        }
        Insert: {
          id: string
          name_en: string
          name_kn: string
          storable: boolean
          storage_loss_pct_per_month?: number
          transit_loss_pct?: number
        }
        Update: {
          id?: string
          name_en?: string
          name_kn?: string
          storable?: boolean
          storage_loss_pct_per_month?: number
          transit_loss_pct?: number
        }
        Relationships: []
      }
      farmers: {
        Row: {
          created_at: string
          fpo_id: string | null
          id: string
          phone: string
          village_id: string | null
        }
        Insert: {
          created_at?: string
          fpo_id?: string | null
          id?: string
          phone: string
          village_id?: string | null
        }
        Update: {
          created_at?: string
          fpo_id?: string | null
          id?: string
          phone?: string
          village_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "farmers_fpo_id_fkey"
            columns: ["fpo_id"]
            isOneToOne: false
            referencedRelation: "fpos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "farmers_village_id_fkey"
            columns: ["village_id"]
            isOneToOne: false
            referencedRelation: "villages"
            referencedColumns: ["id"]
          },
        ]
      }
      forecasts: {
        Row: {
          computed_at: string
          crop_id: string
          horizon_weeks: number
          iso_week: number
          mandi_id: string
          r10: number
          r50: number
          r90: number
          years_of_data: number
        }
        Insert: {
          computed_at?: string
          crop_id: string
          horizon_weeks?: number
          iso_week: number
          mandi_id: string
          r10: number
          r50: number
          r90: number
          years_of_data: number
        }
        Update: {
          computed_at?: string
          crop_id?: string
          horizon_weeks?: number
          iso_week?: number
          mandi_id?: string
          r10?: number
          r50?: number
          r90?: number
          years_of_data?: number
        }
        Relationships: [
          {
            foreignKeyName: "forecasts_crop_id_fkey"
            columns: ["crop_id"]
            isOneToOne: false
            referencedRelation: "crops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forecasts_mandi_id_fkey"
            columns: ["mandi_id"]
            isOneToOne: false
            referencedRelation: "mandis"
            referencedColumns: ["id"]
          },
        ]
      }
      fpos: {
        Row: {
          created_at: string
          district: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          district: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          district?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      mandis: {
        Row: {
          commission_pct: number | null
          district: string
          id: string
          location: unknown
          name: string
        }
        Insert: {
          commission_pct?: number | null
          district: string
          id?: string
          location: unknown
          name: string
        }
        Update: {
          commission_pct?: number | null
          district?: string
          id?: string
          location?: unknown
          name?: string
        }
        Relationships: []
      }
      operators: {
        Row: {
          fpo_id: string
          name: string | null
          user_id: string
        }
        Insert: {
          fpo_id: string
          name?: string | null
          user_id: string
        }
        Update: {
          fpo_id?: string
          name?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operators_fpo_id_fkey"
            columns: ["fpo_id"]
            isOneToOne: false
            referencedRelation: "fpos"
            referencedColumns: ["id"]
          },
        ]
      }
      pool_members: {
        Row: {
          id: string
          pool_id: string
          responded_at: string | null
          response: string
          sale_request_id: string
        }
        Insert: {
          id?: string
          pool_id: string
          responded_at?: string | null
          response?: string
          sale_request_id: string
        }
        Update: {
          id?: string
          pool_id?: string
          responded_at?: string | null
          response?: string
          sale_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pool_members_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pool_members_sale_request_id_fkey"
            columns: ["sale_request_id"]
            isOneToOne: false
            referencedRelation: "sale_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      pools: {
        Row: {
          created_at: string
          crop_id: string
          fpo_id: string | null
          id: string
          pickup_date: string | null
          pickup_place: string | null
          sale_week: string
          status: string
          target_mandi_id: string | null
          target_warehouse_id: string | null
          total_qtl: number
          type: string
          vehicle_note: string | null
        }
        Insert: {
          created_at?: string
          crop_id: string
          fpo_id?: string | null
          id?: string
          pickup_date?: string | null
          pickup_place?: string | null
          sale_week: string
          status?: string
          target_mandi_id?: string | null
          target_warehouse_id?: string | null
          total_qtl: number
          type: string
          vehicle_note?: string | null
        }
        Update: {
          created_at?: string
          crop_id?: string
          fpo_id?: string | null
          id?: string
          pickup_date?: string | null
          pickup_place?: string | null
          sale_week?: string
          status?: string
          target_mandi_id?: string | null
          target_warehouse_id?: string | null
          total_qtl?: number
          type?: string
          vehicle_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pools_crop_id_fkey"
            columns: ["crop_id"]
            isOneToOne: false
            referencedRelation: "crops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pools_fpo_id_fkey"
            columns: ["fpo_id"]
            isOneToOne: false
            referencedRelation: "fpos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pools_target_mandi_id_fkey"
            columns: ["target_mandi_id"]
            isOneToOne: false
            referencedRelation: "mandis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pools_target_warehouse_id_fkey"
            columns: ["target_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      prices: {
        Row: {
          crop_id: string
          mandi_id: string
          max_price: number
          min_price: number
          modal_price: number
          price_date: string
          source: string
        }
        Insert: {
          crop_id: string
          mandi_id: string
          max_price: number
          min_price: number
          modal_price: number
          price_date: string
          source?: string
        }
        Update: {
          crop_id?: string
          mandi_id?: string
          max_price?: number
          min_price?: number
          modal_price?: number
          price_date?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "prices_crop_id_fkey"
            columns: ["crop_id"]
            isOneToOne: false
            referencedRelation: "crops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prices_mandi_id_fkey"
            columns: ["mandi_id"]
            isOneToOne: false
            referencedRelation: "mandis"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_requests: {
        Row: {
          call_duration_s: number | null
          call_id: string | null
          created_at: string
          crop_id: string
          debt_rupees: number
          farmer_id: string
          fpo_id: string | null
          id: string
          location: unknown
          options: Json
          pool_interest: boolean | null
          quantity_qtl: number
          sale_week: string
          status: string
        }
        Insert: {
          call_duration_s?: number | null
          call_id?: string | null
          created_at?: string
          crop_id: string
          debt_rupees?: number
          farmer_id: string
          fpo_id?: string | null
          id?: string
          location: unknown
          options: Json
          pool_interest?: boolean | null
          quantity_qtl: number
          sale_week: string
          status?: string
        }
        Update: {
          call_duration_s?: number | null
          call_id?: string | null
          created_at?: string
          crop_id?: string
          debt_rupees?: number
          farmer_id?: string
          fpo_id?: string | null
          id?: string
          location?: unknown
          options?: Json
          pool_interest?: boolean | null
          quantity_qtl?: number
          sale_week?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_requests_crop_id_fkey"
            columns: ["crop_id"]
            isOneToOne: false
            referencedRelation: "crops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_requests_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_requests_fpo_id_fkey"
            columns: ["fpo_id"]
            isOneToOne: false
            referencedRelation: "fpos"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_log: {
        Row: {
          created_at: string
          error: string | null
          farmer_id: string | null
          id: string
          kind: string
          provider_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          farmer_id?: string | null
          id?: string
          kind: string
          provider_id?: string | null
          status: string
        }
        Update: {
          created_at?: string
          error?: string | null
          farmer_id?: string | null
          id?: string
          kind?: string
          provider_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_log_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
        ]
      }
      villages: {
        Row: {
          district: string
          fpo_id: string | null
          id: string
          location: unknown
          name: string
          name_kn: string | null
          taluk: string | null
        }
        Insert: {
          district: string
          fpo_id?: string | null
          id?: string
          location: unknown
          name: string
          name_kn?: string | null
          taluk?: string | null
        }
        Update: {
          district?: string
          fpo_id?: string | null
          id?: string
          location?: unknown
          name?: string
          name_kn?: string | null
          taluk?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "villages_fpo_id_fkey"
            columns: ["fpo_id"]
            isOneToOne: false
            referencedRelation: "fpos"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          capacity_qtl: number | null
          charge_per_qtl_month: number | null
          id: string
          location: unknown
          name: string
          wdra_registered: boolean
        }
        Insert: {
          capacity_qtl?: number | null
          charge_per_qtl_month?: number | null
          id?: string
          location: unknown
          name: string
          wdra_registered?: boolean
        }
        Update: {
          capacity_qtl?: number | null
          charge_per_qtl_month?: number | null
          id?: string
          location?: unknown
          name?: string
          wdra_registered?: boolean
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_fpo: { Args: never; Returns: string }
      mandi_prices_near: {
        Args: {
          p_crop_id: string
          p_lat: number
          p_lng: number
          p_max_km?: number
          p_stale_days?: number
        }
        Returns: {
          commission_pct: number
          crop_id: string
          distance_km: number
          district: string
          mandi_id: string
          mandi_name: string
          modal_price: number
          price_age_days: number
          price_date: string
        }[]
      }
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
