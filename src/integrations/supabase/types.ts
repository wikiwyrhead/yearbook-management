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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      asset_audit_log: {
        Row: {
          action: string
          asset_id: string
          created_at: string
          id: string
          metadata: Json | null
          new_status: Database["public"]["Enums"]["asset_status"] | null
          old_status: Database["public"]["Enums"]["asset_status"] | null
          performed_by: string
          yearbook_id: string
        }
        Insert: {
          action: string
          asset_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          new_status?: Database["public"]["Enums"]["asset_status"] | null
          old_status?: Database["public"]["Enums"]["asset_status"] | null
          performed_by: string
          yearbook_id: string
        }
        Update: {
          action?: string
          asset_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          new_status?: Database["public"]["Enums"]["asset_status"] | null
          old_status?: Database["public"]["Enums"]["asset_status"] | null
          performed_by?: string
          yearbook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_audit_log_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_audit_log_yearbook_id_fkey"
            columns: ["yearbook_id"]
            isOneToOne: false
            referencedRelation: "yearbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          asset_type: Database["public"]["Enums"]["asset_type"]
          category: string | null
          class_id: string | null
          created_at: string
          faculty_id: string | null
          file_name: string
          file_size: number | null
          file_type: string | null
          id: string
          is_current: boolean
          notes: string | null
          section_id: string | null
          status: Database["public"]["Enums"]["asset_status"]
          storage_path: string
          storage_provider: Database["public"]["Enums"]["storage_provider"]
          student_id: string | null
          updated_at: string
          uploaded_by: string
          validation_metadata: Json | null
          version: number
          yearbook_id: string
        }
        Insert: {
          asset_type?: Database["public"]["Enums"]["asset_type"]
          category?: string | null
          class_id?: string | null
          created_at?: string
          faculty_id?: string | null
          file_name: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          is_current?: boolean
          notes?: string | null
          section_id?: string | null
          status?: Database["public"]["Enums"]["asset_status"]
          storage_path: string
          storage_provider?: Database["public"]["Enums"]["storage_provider"]
          student_id?: string | null
          updated_at?: string
          uploaded_by: string
          validation_metadata?: Json | null
          version?: number
          yearbook_id: string
        }
        Update: {
          asset_type?: Database["public"]["Enums"]["asset_type"]
          category?: string | null
          class_id?: string | null
          created_at?: string
          faculty_id?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          is_current?: boolean
          notes?: string | null
          section_id?: string | null
          status?: Database["public"]["Enums"]["asset_status"]
          storage_path?: string
          storage_provider?: Database["public"]["Enums"]["storage_provider"]
          student_id?: string | null
          updated_at?: string
          uploaded_by?: string
          validation_metadata?: Json | null
          version?: number
          yearbook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assets_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_faculty_id_fkey"
            columns: ["faculty_id"]
            isOneToOne: false
            referencedRelation: "faculty"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_yearbook_id_fkey"
            columns: ["yearbook_id"]
            isOneToOne: false
            referencedRelation: "yearbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          created_at: string
          grade: string | null
          homeroom: string | null
          id: string
          name: string
          updated_at: string
          yearbook_id: string
        }
        Insert: {
          created_at?: string
          grade?: string | null
          homeroom?: string | null
          id?: string
          name: string
          updated_at?: string
          yearbook_id: string
        }
        Update: {
          created_at?: string
          grade?: string | null
          homeroom?: string | null
          id?: string
          name?: string
          updated_at?: string
          yearbook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_yearbook_id_fkey"
            columns: ["yearbook_id"]
            isOneToOne: false
            referencedRelation: "yearbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      faculty: {
        Row: {
          created_at: string
          department: string | null
          email: string | null
          first_name: string
          id: string
          last_name: string
          middle_name: string | null
          preferred_name: string | null
          suffix: string | null
          title: string | null
          updated_at: string
          user_id: string | null
          yearbook_id: string
        }
        Insert: {
          created_at?: string
          department?: string | null
          email?: string | null
          first_name: string
          id?: string
          last_name: string
          middle_name?: string | null
          preferred_name?: string | null
          suffix?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string | null
          yearbook_id: string
        }
        Update: {
          created_at?: string
          department?: string | null
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string
          middle_name?: string | null
          preferred_name?: string | null
          suffix?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string | null
          yearbook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "faculty_yearbook_id_fkey"
            columns: ["yearbook_id"]
            isOneToOne: false
            referencedRelation: "yearbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      page_assets: {
        Row: {
          asset_id: string
          created_at: string
          id: string
          page_id: string
          requirement_id: string | null
        }
        Insert: {
          asset_id: string
          created_at?: string
          id?: string
          page_id: string
          requirement_id?: string | null
        }
        Update: {
          asset_id?: string
          created_at?: string
          id?: string
          page_id?: string
          requirement_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "page_assets_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_assets_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_assets_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "page_requirements"
            referencedColumns: ["id"]
          },
        ]
      }
      page_assignments: {
        Row: {
          created_at: string
          id: string
          kind: string
          page_id: string
          user_id: string
          yearbook_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          page_id: string
          user_id: string
          yearbook_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          page_id?: string
          user_id?: string
          yearbook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_assignments_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_assignments_yearbook_id_fkey"
            columns: ["yearbook_id"]
            isOneToOne: false
            referencedRelation: "yearbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      page_requirements: {
        Row: {
          created_at: string
          have: number
          id: string
          label: string
          needed: number
          page_id: string
          position: number
          updated_at: string
          yearbook_id: string
        }
        Insert: {
          created_at?: string
          have?: number
          id?: string
          label: string
          needed?: number
          page_id: string
          position?: number
          updated_at?: string
          yearbook_id: string
        }
        Update: {
          created_at?: string
          have?: number
          id?: string
          label?: string
          needed?: number
          page_id?: string
          position?: number
          updated_at?: string
          yearbook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_requirements_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_requirements_yearbook_id_fkey"
            columns: ["yearbook_id"]
            isOneToOne: false
            referencedRelation: "yearbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      page_statuses: {
        Row: {
          color: string
          created_at: string
          id: string
          is_terminal: boolean
          name: string
          position: number
          yearbook_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_terminal?: boolean
          name: string
          position?: number
          yearbook_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_terminal?: boolean
          name?: string
          position?: number
          yearbook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_statuses_yearbook_id_fkey"
            columns: ["yearbook_id"]
            isOneToOne: false
            referencedRelation: "yearbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      page_types: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          position: number
          yearbook_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          position?: number
          yearbook_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          position?: number
          yearbook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_types_yearbook_id_fkey"
            columns: ["yearbook_id"]
            isOneToOne: false
            referencedRelation: "yearbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      pages: {
        Row: {
          blocking_reason: string | null
          canva_design_id: string | null
          canva_design_url: string | null
          canva_synced_at: string | null
          created_at: string
          description: string | null
          id: string
          notes: string | null
          page_number: number | null
          page_type_id: string | null
          position: number
          required_assets: string | null
          section_id: string | null
          status_id: string | null
          title: string | null
          updated_at: string
          yearbook_id: string
        }
        Insert: {
          blocking_reason?: string | null
          canva_design_id?: string | null
          canva_design_url?: string | null
          canva_synced_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          notes?: string | null
          page_number?: number | null
          page_type_id?: string | null
          position?: number
          required_assets?: string | null
          section_id?: string | null
          status_id?: string | null
          title?: string | null
          updated_at?: string
          yearbook_id: string
        }
        Update: {
          blocking_reason?: string | null
          canva_design_id?: string | null
          canva_design_url?: string | null
          canva_synced_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          notes?: string | null
          page_number?: number | null
          page_type_id?: string | null
          position?: number
          required_assets?: string | null
          section_id?: string | null
          status_id?: string | null
          title?: string | null
          updated_at?: string
          yearbook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pages_page_type_id_fkey"
            columns: ["page_type_id"]
            isOneToOne: false
            referencedRelation: "page_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pages_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pages_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "page_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pages_yearbook_id_fkey"
            columns: ["yearbook_id"]
            isOneToOne: false
            referencedRelation: "yearbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      schools: {
        Row: {
          address: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          created_by: string
          id: string
          logo_url: string | null
          name: string
          notes: string | null
          short_name: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string
          id?: string
          logo_url?: string | null
          name: string
          notes?: string | null
          short_name?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string
          id?: string
          logo_url?: string | null
          name?: string
          notes?: string | null
          short_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sections: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          position: number
          yearbook_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          position?: number
          yearbook_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          position?: number
          yearbook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sections_yearbook_id_fkey"
            columns: ["yearbook_id"]
            isOneToOne: false
            referencedRelation: "yearbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          class_id: string | null
          created_at: string
          email: string | null
          first_name: string
          grade: string | null
          id: string
          last_name: string
          middle_name: string | null
          notes: string | null
          preferred_name: string | null
          student_number: string | null
          submission_status: string
          suffix: string | null
          updated_at: string
          user_id: string | null
          yearbook_id: string
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          email?: string | null
          first_name: string
          grade?: string | null
          id?: string
          last_name: string
          middle_name?: string | null
          notes?: string | null
          preferred_name?: string | null
          student_number?: string | null
          submission_status?: string
          suffix?: string | null
          updated_at?: string
          user_id?: string | null
          yearbook_id: string
        }
        Update: {
          class_id?: string | null
          created_at?: string
          email?: string | null
          first_name?: string
          grade?: string | null
          id?: string
          last_name?: string
          middle_name?: string | null
          notes?: string | null
          preferred_name?: string | null
          student_number?: string | null
          submission_status?: string
          suffix?: string | null
          updated_at?: string
          user_id?: string | null
          yearbook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_yearbook_id_fkey"
            columns: ["yearbook_id"]
            isOneToOne: false
            referencedRelation: "yearbooks"
            referencedColumns: ["id"]
          },
        ]
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
      yearbook_invitations: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["yearbook_role"]
          status: string
          token: string
          yearbook_id: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          role?: Database["public"]["Enums"]["yearbook_role"]
          status?: string
          token?: string
          yearbook_id: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["yearbook_role"]
          status?: string
          token?: string
          yearbook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "yearbook_invitations_yearbook_id_fkey"
            columns: ["yearbook_id"]
            isOneToOne: false
            referencedRelation: "yearbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      yearbook_members: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["yearbook_role"]
          user_id: string
          yearbook_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["yearbook_role"]
          user_id: string
          yearbook_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["yearbook_role"]
          user_id?: string
          yearbook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "yearbook_members_yearbook_id_fkey"
            columns: ["yearbook_id"]
            isOneToOne: false
            referencedRelation: "yearbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      yearbooks: {
        Row: {
          created_at: string
          created_by: string
          deadline: string | null
          id: string
          page_count: number
          school_id: string
          theme: string | null
          title: string | null
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          created_by?: string
          deadline?: string | null
          id?: string
          page_count?: number
          school_id: string
          theme?: string | null
          title?: string | null
          updated_at?: string
          year: number
        }
        Update: {
          created_at?: string
          created_by?: string
          deadline?: string | null
          id?: string
          page_count?: number
          school_id?: string
          theme?: string | null
          title?: string | null
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "yearbooks_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_school: {
        Args: { _school_id: string; _user_id: string }
        Returns: boolean
      }
      can_edit_yearbook: {
        Args: { _user_id: string; _yearbook_id: string }
        Returns: boolean
      }
      can_manage_yearbook: {
        Args: { _user_id: string; _yearbook_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_yearbook_role: {
        Args: {
          _role: Database["public"]["Enums"]["yearbook_role"]
          _user_id: string
          _yearbook_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      is_yearbook_member: {
        Args: { _user_id: string; _yearbook_id: string }
        Returns: boolean
      }
      is_yearbook_staff_member: {
        Args: { _user_id: string; _yearbook_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "super_admin"
      asset_status:
        | "missing"
        | "requested"
        | "uploaded"
        | "under_review"
        | "approved"
        | "rejected"
        | "replacement_required"
        | "archived"
      asset_type:
        | "photo"
        | "document"
        | "pdf"
        | "logo"
        | "artwork"
        | "message"
        | "other"
      storage_provider:
        | "lovable"
        | "google_drive"
        | "onedrive"
        | "dropbox"
        | "external"
      yearbook_role:
        | "coordinator"
        | "staff"
        | "proofreader"
        | "corrector"
        | "student"
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
      app_role: ["super_admin"],
      asset_status: [
        "missing",
        "requested",
        "uploaded",
        "under_review",
        "approved",
        "rejected",
        "replacement_required",
        "archived",
      ],
      asset_type: [
        "photo",
        "document",
        "pdf",
        "logo",
        "artwork",
        "message",
        "other",
      ],
      storage_provider: [
        "lovable",
        "google_drive",
        "onedrive",
        "dropbox",
        "external",
      ],
      yearbook_role: [
        "coordinator",
        "staff",
        "proofreader",
        "corrector",
        "student",
      ],
    },
  },
} as const
