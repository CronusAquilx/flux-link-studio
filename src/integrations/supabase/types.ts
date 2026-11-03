export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      activity: {
        Row: {
          action: string;
          created_at: string;
          detail: string;
          id: string;
          user_id: string;
        };
        Insert: {
          action: string;
          created_at?: string;
          detail?: string;
          id?: string;
          user_id?: string;
        };
        Update: {
          action?: string;
          created_at?: string;
          detail?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      assistant_plans: {
        Row: {
          actions: Json;
          created_at: string;
          id: string;
          prompt: string;
          summary: string;
          user_id: string;
        };
        Insert: {
          actions?: Json;
          created_at?: string;
          id?: string;
          prompt: string;
          summary?: string;
          user_id?: string;
        };
        Update: {
          actions?: Json;
          created_at?: string;
          id?: string;
          prompt?: string;
          summary?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      automation_rules: {
        Row: {
          bucket_id: string;
          created_at: string;
          enabled: boolean;
          expires_days: number | null;
          id: string;
          link_kind: string;
          name: string;
          prefix: string;
          user_id: string;
        };
        Insert: {
          bucket_id: string;
          created_at?: string;
          enabled?: boolean;
          expires_days?: number | null;
          id?: string;
          link_kind?: string;
          name: string;
          prefix?: string;
          user_id?: string;
        };
        Update: {
          bucket_id?: string;
          created_at?: string;
          enabled?: boolean;
          expires_days?: number | null;
          id?: string;
          link_kind?: string;
          name?: string;
          prefix?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "automation_rules_bucket_id_fkey";
            columns: ["bucket_id"];
            isOneToOne: false;
            referencedRelation: "buckets";
            referencedColumns: ["id"];
          },
        ];
      };
      aws_connections: {
        Row: {
          aws_account_id: string | null;
          created_at: string;
          external_id: string;
          id: string;
          label: string;
          last_error: string | null;
          region: string;
          role_arn: string;
          status: string;
          user_id: string;
          verified_at: string | null;
        };
        Insert: {
          aws_account_id?: string | null;
          created_at?: string;
          external_id?: string;
          id?: string;
          label: string;
          last_error?: string | null;
          region?: string;
          role_arn: string;
          status?: string;
          user_id?: string;
          verified_at?: string | null;
        };
        Update: {
          aws_account_id?: string | null;
          created_at?: string;
          external_id?: string;
          id?: string;
          label?: string;
          last_error?: string | null;
          region?: string;
          role_arn?: string;
          status?: string;
          user_id?: string;
          verified_at?: string | null;
        };
        Relationships: [];
      };
      buckets: {
        Row: {
          browser_uploads: boolean;
          connection_id: string;
          discovered_at: string;
          id: string;
          name: string;
          provisioned_by_flux: boolean;
          region: string;
          user_id: string;
        };
        Insert: {
          browser_uploads?: boolean;
          connection_id: string;
          discovered_at?: string;
          id?: string;
          name: string;
          provisioned_by_flux?: boolean;
          region: string;
          user_id?: string;
        };
        Update: {
          browser_uploads?: boolean;
          connection_id?: string;
          discovered_at?: string;
          id?: string;
          name?: string;
          provisioned_by_flux?: boolean;
          region?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "buckets_connection_id_fkey";
            columns: ["connection_id"];
            isOneToOne: false;
            referencedRelation: "aws_connections";
            referencedColumns: ["id"];
          },
        ];
      };
      links: {
        Row: {
          bucket_id: string | null;
          clicks: number;
          created_at: string;
          expires_at: string | null;
          id: string;
          kind: string;
          label: string | null;
          object_key: string | null;
          revoked: boolean;
          sign_seconds: number;
          slug: string;
          source: string;
          target_url: string | null;
          user_id: string;
        };
        Insert: {
          bucket_id?: string | null;
          clicks?: number;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          kind: string;
          label?: string | null;
          object_key?: string | null;
          revoked?: boolean;
          sign_seconds?: number;
          slug: string;
          source: string;
          target_url?: string | null;
          user_id?: string;
        };
        Update: {
          bucket_id?: string | null;
          clicks?: number;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          kind?: string;
          label?: string | null;
          object_key?: string | null;
          revoked?: boolean;
          sign_seconds?: number;
          slug?: string;
          source?: string;
          target_url?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "links_bucket_id_fkey";
            columns: ["bucket_id"];
            isOneToOne: false;
            referencedRelation: "buckets";
            referencedColumns: ["id"];
          },
        ];
      };
      presets: {
        Row: {
          created_at: string;
          expires_days: number | null;
          id: string;
          key_prefix: string;
          link_kind: string;
          name: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          expires_days?: number | null;
          id?: string;
          key_prefix?: string;
          link_kind?: string;
          name: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          expires_days?: number | null;
          id?: string;
          key_prefix?: string;
          link_kind?: string;
          name?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          company: string | null;
          created_at: string;
          display_name: string | null;
          id: string;
          onboarded: boolean;
        };
        Insert: {
          company?: string | null;
          created_at?: string;
          display_name?: string | null;
          id: string;
          onboarded?: boolean;
        };
        Update: {
          company?: string | null;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          onboarded?: boolean;
        };
        Relationships: [];
      };
      projects: {
        Row: {
          created_at: string;
          disabled: boolean;
          id: string;
          last_check_status: number | null;
          link_id: string | null;
          lovable_url: string;
          name: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          disabled?: boolean;
          id?: string;
          last_check_status?: number | null;
          link_id?: string | null;
          lovable_url: string;
          name: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          disabled?: boolean;
          id?: string;
          last_check_status?: number | null;
          link_id?: string | null;
          lovable_url?: string;
          name?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "projects_link_id_fkey";
            columns: ["link_id"];
            isOneToOne: false;
            referencedRelation: "links";
            referencedColumns: ["id"];
          },
        ];
      };
      uploads: {
        Row: {
          bucket_id: string;
          created_at: string;
          id: string;
          object_key: string;
          size_bytes: number;
          user_id: string;
        };
        Insert: {
          bucket_id: string;
          created_at?: string;
          id?: string;
          object_key: string;
          size_bytes?: number;
          user_id?: string;
        };
        Update: {
          bucket_id?: string;
          created_at?: string;
          id?: string;
          object_key?: string;
          size_bytes?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "uploads_bucket_id_fkey";
            columns: ["bucket_id"];
            isOneToOne: false;
            referencedRelation: "buckets";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      flux_random_hex: { Args: never; Returns: string };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
