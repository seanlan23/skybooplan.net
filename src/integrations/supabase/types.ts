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
      anonymous_plan_attempts: {
        Row: {
          first_seen_at: string
          id: string
          ip_hash: string
          last_seen_at: string
          plan_count: number
          user_agent: string | null
        }
        Insert: {
          first_seen_at?: string
          id?: string
          ip_hash: string
          last_seen_at?: string
          plan_count?: number
          user_agent?: string | null
        }
        Update: {
          first_seen_at?: string
          id?: string
          ip_hash?: string
          last_seen_at?: string
          plan_count?: number
          user_agent?: string | null
        }
        Relationships: []
      }
      daily_plan_usage: {
        Row: {
          created_at: string
          id: string
          plans_generated: number
          updated_at: string
          usage_date: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          plans_generated?: number
          updated_at?: string
          usage_date?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          plans_generated?: number
          updated_at?: string
          usage_date?: string
          user_id?: string
        }
        Relationships: []
      }
      flight_searches: {
        Row: {
          cabin_class: string | null
          created_at: string
          depart_date: string
          destination: string
          id: string
          origin: string
          pax: number
          results_count: number
          return_date: string | null
          user_id: string
        }
        Insert: {
          cabin_class?: string | null
          created_at?: string
          depart_date: string
          destination: string
          id?: string
          origin: string
          pax?: number
          results_count?: number
          return_date?: string | null
          user_id: string
        }
        Update: {
          cabin_class?: string | null
          created_at?: string
          depart_date?: string
          destination?: string
          id?: string
          origin?: string
          pax?: number
          results_count?: number
          return_date?: string | null
          user_id?: string
        }
        Relationships: []
      }
      pdf_downloads: {
        Row: {
          byte_size: number | null
          created_at: string
          downloaded_at: string
          error_message: string | null
          id: string
          ip_hash: string | null
          plan_id: string
          referrer: string | null
          request_id: string | null
          runtime: string | null
          source: string | null
          status: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          byte_size?: number | null
          created_at?: string
          downloaded_at?: string
          error_message?: string | null
          id?: string
          ip_hash?: string | null
          plan_id: string
          referrer?: string | null
          request_id?: string | null
          runtime?: string | null
          source?: string | null
          status?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          byte_size?: number | null
          created_at?: string
          downloaded_at?: string
          error_message?: string | null
          id?: string
          ip_hash?: string | null
          plan_id?: string
          referrer?: string | null
          request_id?: string | null
          runtime?: string | null
          source?: string | null
          status?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdf_downloads_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "travel_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      place_cache: {
        Row: {
          country_code: string | null
          expires_at: string
          fetched_at: string
          formatted_address: string | null
          google_place_id: string | null
          id: string
          latitude: number | null
          longitude: number | null
          not_found: boolean
          photo_url: string | null
          place_name: string | null
          place_query: string
        }
        Insert: {
          country_code?: string | null
          expires_at?: string
          fetched_at?: string
          formatted_address?: string | null
          google_place_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          not_found?: boolean
          photo_url?: string | null
          place_name?: string | null
          place_query: string
        }
        Update: {
          country_code?: string | null
          expires_at?: string
          fetched_at?: string
          formatted_address?: string | null
          google_place_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          not_found?: boolean
          photo_url?: string | null
          place_name?: string | null
          place_query?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          country_code: string | null
          created_at: string
          email: string | null
          full_name: string | null
          home_city: string | null
          id: string
          preferred_currency:
            | Database["public"]["Enums"]["currency_code"]
            | null
          preferred_language: string | null
          travel_style: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          country_code?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          home_city?: string | null
          id?: string
          preferred_currency?:
            | Database["public"]["Enums"]["currency_code"]
            | null
          preferred_language?: string | null
          travel_style?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          country_code?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          home_city?: string | null
          id?: string
          preferred_currency?:
            | Database["public"]["Enums"]["currency_code"]
            | null
          preferred_language?: string | null
          travel_style?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          environment: string
          id: string
          plans_remaining: number | null
          price_amount: number | null
          price_currency: Database["public"]["Enums"]["currency_code"] | null
          price_id: string | null
          product_id: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tier: Database["public"]["Enums"]["subscription_tier"]
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          plans_remaining?: number | null
          price_amount?: number | null
          price_currency?: Database["public"]["Enums"]["currency_code"] | null
          price_id?: string | null
          product_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: Database["public"]["Enums"]["subscription_tier"]
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          plans_remaining?: number | null
          price_amount?: number | null
          price_currency?: Database["public"]["Enums"]["currency_code"] | null
          price_id?: string | null
          product_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: Database["public"]["Enums"]["subscription_tier"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      shared_packages: {
        Row: {
          created_at: string
          depart_date: string | null
          from_iata: string | null
          guests: number | null
          hotel_id: string | null
          id: string
          og_description: string
          og_image: string | null
          og_title: string
          payload: Json
          return_date: string | null
          to_iata: string | null
          trip_style: string | null
        }
        Insert: {
          created_at?: string
          depart_date?: string | null
          from_iata?: string | null
          guests?: number | null
          hotel_id?: string | null
          id: string
          og_description: string
          og_image?: string | null
          og_title: string
          payload: Json
          return_date?: string | null
          to_iata?: string | null
          trip_style?: string | null
        }
        Update: {
          created_at?: string
          depart_date?: string | null
          from_iata?: string | null
          guests?: number | null
          hotel_id?: string | null
          id?: string
          og_description?: string
          og_image?: string | null
          og_title?: string
          payload?: Json
          return_date?: string | null
          to_iata?: string | null
          trip_style?: string | null
        }
        Relationships: []
      }
      travel_plans: {
        Row: {
          ai_model: string | null
          cover_image_url: string | null
          created_at: string
          destination: string
          end_date: string | null
          id: string
          is_anonymous_preview: boolean
          is_favorite: boolean | null
          is_paid: boolean
          itinerary: Json
          start_date: string | null
          title: string
          travel_pace: string | null
          trip_id: string | null
          updated_at: string
          user_id: string
          wishes: string | null
        }
        Insert: {
          ai_model?: string | null
          cover_image_url?: string | null
          created_at?: string
          destination: string
          end_date?: string | null
          id?: string
          is_anonymous_preview?: boolean
          is_favorite?: boolean | null
          is_paid?: boolean
          itinerary?: Json
          start_date?: string | null
          title: string
          travel_pace?: string | null
          trip_id?: string | null
          updated_at?: string
          user_id: string
          wishes?: string | null
        }
        Update: {
          ai_model?: string | null
          cover_image_url?: string | null
          created_at?: string
          destination?: string
          end_date?: string | null
          id?: string
          is_anonymous_preview?: boolean
          is_favorite?: boolean | null
          is_paid?: boolean
          itinerary?: Json
          start_date?: string | null
          title?: string
          travel_pace?: string | null
          trip_id?: string | null
          updated_at?: string
          user_id?: string
          wishes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "travel_plans_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          budget_amount: number | null
          budget_currency: Database["public"]["Enums"]["currency_code"] | null
          cover_image_url: string | null
          created_at: string
          destination: string
          destination_country: string | null
          end_date: string | null
          id: string
          notes: string | null
          origin_city: string | null
          start_date: string | null
          title: string
          travel_pace: string | null
          travelers_adults: number | null
          travelers_children: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          budget_amount?: number | null
          budget_currency?: Database["public"]["Enums"]["currency_code"] | null
          cover_image_url?: string | null
          created_at?: string
          destination: string
          destination_country?: string | null
          end_date?: string | null
          id?: string
          notes?: string | null
          origin_city?: string | null
          start_date?: string | null
          title: string
          travel_pace?: string | null
          travelers_adults?: number | null
          travelers_children?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          budget_amount?: number | null
          budget_currency?: Database["public"]["Enums"]["currency_code"] | null
          cover_image_url?: string | null
          created_at?: string
          destination?: string
          destination_country?: string | null
          end_date?: string | null
          id?: string
          notes?: string | null
          origin_city?: string | null
          start_date?: string | null
          title?: string
          travel_pace?: string | null
          travelers_adults?: number | null
          travelers_children?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          created_at: string
          environment: string
          error_message: string | null
          event_type: string
          id: string
          payload_masked: Json | null
          processed_at: string | null
          status: string
          stripe_event_id: string | null
          stripe_object_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          environment: string
          error_message?: string | null
          event_type: string
          id?: string
          payload_masked?: Json | null
          processed_at?: string | null
          status?: string
          stripe_event_id?: string | null
          stripe_object_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          environment?: string
          error_message?: string | null
          event_type?: string
          id?: string
          payload_masked?: Json | null
          processed_at?: string | null
          status?: string
          stripe_event_id?: string | null
          stripe_object_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      webhook_replay_audits: {
        Row: {
          after_state: Json | null
          before_state: Json | null
          created_at: string
          diff: Json | null
          environment: string
          error_message: string | null
          id: string
          original_event_id: string
          outcome: string
          replay_event_id: string | null
          replayed_by: string
          target_user_id: string | null
        }
        Insert: {
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          diff?: Json | null
          environment: string
          error_message?: string | null
          id?: string
          original_event_id: string
          outcome: string
          replay_event_id?: string | null
          replayed_by: string
          target_user_id?: string | null
        }
        Update: {
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          diff?: Json | null
          environment?: string
          error_message?: string | null
          id?: string
          original_event_id?: string
          outcome?: string
          replay_event_id?: string | null
          replayed_by?: string
          target_user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_user_create_plan: { Args: { _user_id: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      currency_code: "EUR" | "USD"
      subscription_status: "active" | "cancelled" | "expired" | "pending"
      subscription_tier: "free" | "one_time" | "monthly" | "annual"
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
      app_role: ["admin", "user"],
      currency_code: ["EUR", "USD"],
      subscription_status: ["active", "cancelled", "expired", "pending"],
      subscription_tier: ["free", "one_time", "monthly", "annual"],
    },
  },
} as const
