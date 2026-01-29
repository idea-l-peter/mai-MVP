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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      allowed_domains: {
        Row: {
          created_at: string
          created_by: string | null
          domain: string
          id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          domain: string
          id?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          domain?: string
          id?: string
        }
        Relationships: []
      }
      contact_profile_tags: {
        Row: {
          contact_profile_id: string
          tag_id: string
        }
        Insert: {
          contact_profile_id: string
          tag_id: string
        }
        Update: {
          contact_profile_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_profile_tags_contact_profile_id_fkey"
            columns: ["contact_profile_id"]
            isOneToOne: false
            referencedRelation: "contact_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_profile_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "contact_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_profiles: {
        Row: {
          anniversary_date: string | null
          birthday: string | null
          created_at: string
          custom_dates: Json | null
          email: string | null
          google_contact_id: string
          id: string
          last_contact_date: string | null
          next_followup_date: string | null
          notes: string | null
          observed_holidays: string[] | null
          tier: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          anniversary_date?: string | null
          birthday?: string | null
          created_at?: string
          custom_dates?: Json | null
          email?: string | null
          google_contact_id: string
          id?: string
          last_contact_date?: string | null
          next_followup_date?: string | null
          notes?: string | null
          observed_holidays?: string[] | null
          tier?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          anniversary_date?: string | null
          birthday?: string | null
          created_at?: string
          custom_dates?: Json | null
          email?: string | null
          google_contact_id?: string
          id?: string
          last_contact_date?: string | null
          next_followup_date?: string | null
          notes?: string | null
          observed_holidays?: string[] | null
          tier?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      contact_tags: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      email_tracking: {
        Row: {
          contact_tier: number | null
          created_at: string
          from_email: string
          from_name: string | null
          gmail_message_id: string
          gmail_thread_id: string | null
          id: string
          received_at: string
          responded: boolean
          response_due_by: string | null
          subject: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          contact_tier?: number | null
          created_at?: string
          from_email: string
          from_name?: string | null
          gmail_message_id: string
          gmail_thread_id?: string | null
          id?: string
          received_at: string
          responded?: boolean
          response_due_by?: string | null
          subject?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          contact_tier?: number | null
          created_at?: string
          from_email?: string
          from_name?: string | null
          gmail_message_id?: string
          gmail_thread_id?: string | null
          id?: string
          received_at?: string
          responded?: boolean
          response_due_by?: string | null
          subject?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      encrypted_integration_tokens: {
        Row: {
          created_at: string | null
          encrypted_value: string
          id: string
          provider: string
          token_type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          encrypted_value: string
          id?: string
          provider: string
          token_type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          encrypted_value?: string
          id?: string
          provider?: string
          token_type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      holidays: {
        Row: {
          created_at: string
          days_notice: number | null
          description: string | null
          holiday_date: string
          id: string
          name: string
          regions: string[] | null
          type: string
        }
        Insert: {
          created_at?: string
          days_notice?: number | null
          description?: string | null
          holiday_date: string
          id?: string
          name: string
          regions?: string[] | null
          type: string
        }
        Update: {
          created_at?: string
          days_notice?: number | null
          description?: string | null
          holiday_date?: string
          id?: string
          name?: string
          regions?: string[] | null
          type?: string
        }
        Relationships: []
      }
      user_integrations: {
        Row: {
          access_token_secret_id: string | null
          created_at: string
          id: string
          metadata: Json | null
          provider: string
          provider_email: string | null
          provider_user_id: string | null
          refresh_token_secret_id: string | null
          scopes: string[] | null
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_secret_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          provider: string
          provider_email?: string | null
          provider_user_id?: string | null
          refresh_token_secret_id?: string | null
          scopes?: string[] | null
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_secret_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          provider?: string
          provider_email?: string | null
          provider_user_id?: string | null
          refresh_token_secret_id?: string | null
          scopes?: string[] | null
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_phone_mappings: {
        Row: {
          created_at: string
          id: string
          phone_number: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          phone_number: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          phone_number?: string
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          action_security_overrides: Json | null
          created_at: string
          emoji_confirmations_enabled: boolean
          failed_security_attempts: number | null
          id: string
          observed_holidays: string[] | null
          security_lockout_until: string | null
          security_phrase_color: string | null
          security_phrase_emoji: string | null
          security_phrase_object: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          action_security_overrides?: Json | null
          created_at?: string
          emoji_confirmations_enabled?: boolean
          failed_security_attempts?: number | null
          id?: string
          observed_holidays?: string[] | null
          security_lockout_until?: string | null
          security_phrase_color?: string | null
          security_phrase_emoji?: string | null
          security_phrase_object?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          action_security_overrides?: Json | null
          created_at?: string
          emoji_confirmations_enabled?: boolean
          failed_security_attempts?: number | null
          id?: string
          observed_holidays?: string[] | null
          security_lockout_until?: string | null
          security_phrase_color?: string | null
          security_phrase_emoji?: string | null
          security_phrase_object?: string | null
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
          role: Database["public"]["Enums"]["app_role"]
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
      verification_codes: {
        Row: {
          action_type: string
          code_hash: string
          created_at: string
          expires_at: string
          id: string
          user_id: string
        }
        Insert: {
          action_type: string
          code_hash: string
          created_at?: string
          expires_at: string
          id?: string
          user_id: string
        }
        Update: {
          action_type?: string
          code_hash?: string
          created_at?: string
          expires_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_messages: {
        Row: {
          content: string | null
          created_at: string
          direction: string
          id: string
          message_id: string | null
          message_type: string
          metadata: Json | null
          phone_number: string
          status: string
          user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          direction: string
          id?: string
          message_id?: string | null
          message_type?: string
          metadata?: Json | null
          phone_number: string
          status?: string
          user_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          direction?: string
          id?: string
          message_id?: string | null
          message_type?: string
          metadata?: Json | null
          phone_number?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_default_contact_tags: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      delete_integration_token: {
        Args: { p_secret_id: string; p_user_id: string }
        Returns: undefined
      }
      get_integration_token: {
        Args: { p_secret_id: string; p_user_id: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_domain_allowed: { Args: { _email: string }; Returns: boolean }
      store_integration_token: {
        Args: {
          p_provider: string
          p_token_type: string
          p_token_value: string
          p_user_id: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
