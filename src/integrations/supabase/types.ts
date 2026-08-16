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
          external_file_id: string | null
          external_filename: string | null
          external_folder_id: string | null
          external_url: string | null
          faculty_id: string | null
          file_name: string
          file_size: number | null
          file_type: string | null
          id: string
          imported_at: string | null
          is_current: boolean
          last_synced_at: string | null
          notes: string | null
          section_id: string | null
          source_metadata: Json | null
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
          external_file_id?: string | null
          external_filename?: string | null
          external_folder_id?: string | null
          external_url?: string | null
          faculty_id?: string | null
          file_name: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          imported_at?: string | null
          is_current?: boolean
          last_synced_at?: string | null
          notes?: string | null
          section_id?: string | null
          source_metadata?: Json | null
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
          external_file_id?: string | null
          external_filename?: string | null
          external_folder_id?: string | null
          external_url?: string | null
          faculty_id?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          imported_at?: string | null
          is_current?: boolean
          last_synced_at?: string | null
          notes?: string | null
          section_id?: string | null
          source_metadata?: Json | null
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
      canva_integrations: {
        Row: {
          access_token_encrypted: string | null
          created_at: string
          folder_id: string | null
          id: string
          refresh_token_encrypted: string | null
          team_id: string | null
          updated_at: string
          yearbook_id: string
        }
        Insert: {
          access_token_encrypted?: string | null
          created_at?: string
          folder_id?: string | null
          id?: string
          refresh_token_encrypted?: string | null
          team_id?: string | null
          updated_at?: string
          yearbook_id: string
        }
        Update: {
          access_token_encrypted?: string | null
          created_at?: string
          folder_id?: string | null
          id?: string
          refresh_token_encrypted?: string | null
          team_id?: string | null
          updated_at?: string
          yearbook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "canva_integrations_yearbook_id_fkey"
            columns: ["yearbook_id"]
            isOneToOne: true
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
      correction_comments: {
        Row: {
          content: string
          correction_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          content: string
          correction_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          content?: string
          correction_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "correction_comments_correction_id_fkey"
            columns: ["correction_id"]
            isOneToOne: false
            referencedRelation: "corrections"
            referencedColumns: ["id"]
          },
        ]
      }
      corrections: {
        Row: {
          annotation_type: Database["public"]["Enums"]["annotation_type"]
          assigned_to: string | null
          category: Database["public"]["Enums"]["correction_category"]
          coordinates: Json
          created_at: string
          created_by: string
          description: string | null
          id: string
          page_id: string
          priority: string | null
          proof_id: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["correction_status"]
          title: string
          verified_at: string | null
          verified_by: string | null
          yearbook_id: string
        }
        Insert: {
          annotation_type: Database["public"]["Enums"]["annotation_type"]
          assigned_to?: string | null
          category?: Database["public"]["Enums"]["correction_category"]
          coordinates: Json
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          page_id: string
          priority?: string | null
          proof_id: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["correction_status"]
          title: string
          verified_at?: string | null
          verified_by?: string | null
          yearbook_id: string
        }
        Update: {
          annotation_type?: Database["public"]["Enums"]["annotation_type"]
          assigned_to?: string | null
          category?: Database["public"]["Enums"]["correction_category"]
          coordinates?: Json
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          page_id?: string
          priority?: string | null
          proof_id?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["correction_status"]
          title?: string
          verified_at?: string | null
          verified_by?: string | null
          yearbook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "corrections_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corrections_proof_id_fkey"
            columns: ["proof_id"]
            isOneToOne: false
            referencedRelation: "proofs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corrections_yearbook_id_fkey"
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
      member_storage_connections: {
        Row: {
          account_email: string | null
          created_at: string
          credentials: Json | null
          external_account_id: string | null
          id: string
          last_checked_at: string | null
          last_error: string | null
          provider: Database["public"]["Enums"]["storage_provider"]
          status: Database["public"]["Enums"]["provider_connection_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          account_email?: string | null
          created_at?: string
          credentials?: Json | null
          external_account_id?: string | null
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          provider: Database["public"]["Enums"]["storage_provider"]
          status?: Database["public"]["Enums"]["provider_connection_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          account_email?: string | null
          created_at?: string
          credentials?: Json | null
          external_account_id?: string | null
          id?: string
          last_checked_at?: string | null
          last_error?: string | null
          provider?: Database["public"]["Enums"]["storage_provider"]
          status?: Database["public"]["Enums"]["provider_connection_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      organization_storage_connections: {
        Row: {
          account_email: string | null
          connected_by: string | null
          created_at: string
          credentials: Json | null
          display_name: string | null
          external_account_id: string | null
          id: string
          is_default: boolean
          last_checked_at: string | null
          last_error: string | null
          provider: Database["public"]["Enums"]["storage_provider"]
          root_folder_id: string | null
          root_folder_path: string | null
          status: Database["public"]["Enums"]["provider_connection_status"]
          updated_at: string
        }
        Insert: {
          account_email?: string | null
          connected_by?: string | null
          created_at?: string
          credentials?: Json | null
          display_name?: string | null
          external_account_id?: string | null
          id?: string
          is_default?: boolean
          last_checked_at?: string | null
          last_error?: string | null
          provider: Database["public"]["Enums"]["storage_provider"]
          root_folder_id?: string | null
          root_folder_path?: string | null
          status?: Database["public"]["Enums"]["provider_connection_status"]
          updated_at?: string
        }
        Update: {
          account_email?: string | null
          connected_by?: string | null
          created_at?: string
          credentials?: Json | null
          display_name?: string | null
          external_account_id?: string | null
          id?: string
          is_default?: boolean
          last_checked_at?: string | null
          last_error?: string | null
          provider?: Database["public"]["Enums"]["storage_provider"]
          root_folder_id?: string | null
          root_folder_path?: string | null
          status?: Database["public"]["Enums"]["provider_connection_status"]
          updated_at?: string
        }
        Relationships: []
      }
      page_approvals: {
        Row: {
          approved_at: string
          approved_by: string
          id: string
          page_id: string
          proof_id: string
          yearbook_id: string
        }
        Insert: {
          approved_at?: string
          approved_by: string
          id?: string
          page_id: string
          proof_id: string
          yearbook_id: string
        }
        Update: {
          approved_at?: string
          approved_by?: string
          id?: string
          page_id?: string
          proof_id?: string
          yearbook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_approvals_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_approvals_proof_id_fkey"
            columns: ["proof_id"]
            isOneToOne: false
            referencedRelation: "proofs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_approvals_yearbook_id_fkey"
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
      page_checklist_responses: {
        Row: {
          checklist_id: string
          id: string
          is_checked: boolean
          page_id: string
          proof_id: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          checklist_id: string
          id?: string
          is_checked?: boolean
          page_id: string
          proof_id: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          checklist_id?: string
          id?: string
          is_checked?: boolean
          page_id?: string
          proof_id?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_checklist_responses_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "proofreader_checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_checklist_responses_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "page_checklist_responses_proof_id_fkey"
            columns: ["proof_id"]
            isOneToOne: false
            referencedRelation: "proofs"
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
      preflight_reports: {
        Row: {
          blocking_issues: string[] | null
          created_at: string | null
          id: string
          results: Json
          run_by: string
          snapshot_id: string | null
          status: string
          warnings: string[] | null
          yearbook_id: string
        }
        Insert: {
          blocking_issues?: string[] | null
          created_at?: string | null
          id?: string
          results: Json
          run_by: string
          snapshot_id?: string | null
          status: string
          warnings?: string[] | null
          yearbook_id: string
        }
        Update: {
          blocking_issues?: string[] | null
          created_at?: string | null
          id?: string
          results?: Json
          run_by?: string
          snapshot_id?: string | null
          status?: string
          warnings?: string[] | null
          yearbook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "preflight_reports_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "production_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preflight_reports_yearbook_id_fkey"
            columns: ["yearbook_id"]
            isOneToOne: false
            referencedRelation: "yearbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      production_audit_log: {
        Row: {
          action: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          metadata: Json | null
          user_id: string
          yearbook_id: string
        }
        Insert: {
          action: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json | null
          user_id: string
          yearbook_id: string
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json | null
          user_id?: string
          yearbook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_audit_log_yearbook_id_fkey"
            columns: ["yearbook_id"]
            isOneToOne: false
            referencedRelation: "yearbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      production_packages: {
        Row: {
          checksum_sha256: string
          created_at: string | null
          generated_by: string
          id: string
          manifest: Json
          snapshot_id: string
          storage_path: string
          yearbook_id: string
        }
        Insert: {
          checksum_sha256: string
          created_at?: string | null
          generated_by: string
          id?: string
          manifest: Json
          snapshot_id: string
          storage_path: string
          yearbook_id: string
        }
        Update: {
          checksum_sha256?: string
          created_at?: string | null
          generated_by?: string
          id?: string
          manifest?: Json
          snapshot_id?: string
          storage_path?: string
          yearbook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_packages_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "production_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_packages_yearbook_id_fkey"
            columns: ["yearbook_id"]
            isOneToOne: false
            referencedRelation: "yearbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      production_snapshots: {
        Row: {
          created_at: string | null
          created_by: string
          id: string
          snapshot_data: Json
          version: number
          yearbook_id: string
        }
        Insert: {
          created_at?: string | null
          created_by: string
          id?: string
          snapshot_data: Json
          version: number
          yearbook_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string
          id?: string
          snapshot_data?: Json
          version?: number
          yearbook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_snapshots_yearbook_id_fkey"
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
      proof_pages: {
        Row: {
          created_at: string
          id: string
          page_id: string
          proof_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          page_id: string
          proof_id: string
        }
        Update: {
          created_at?: string
          id?: string
          page_id?: string
          proof_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proof_pages_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proof_pages_proof_id_fkey"
            columns: ["proof_id"]
            isOneToOne: false
            referencedRelation: "proofs"
            referencedColumns: ["id"]
          },
        ]
      }
      proofreader_checklists: {
        Row: {
          category: string | null
          id: string
          item_text: string
          page_type_id: string | null
          position: number | null
          yearbook_id: string
        }
        Insert: {
          category?: string | null
          id?: string
          item_text: string
          page_type_id?: string | null
          position?: number | null
          yearbook_id: string
        }
        Update: {
          category?: string | null
          id?: string
          item_text?: string
          page_type_id?: string | null
          position?: number | null
          yearbook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proofreader_checklists_page_type_id_fkey"
            columns: ["page_type_id"]
            isOneToOne: false
            referencedRelation: "page_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proofreader_checklists_yearbook_id_fkey"
            columns: ["yearbook_id"]
            isOneToOne: false
            referencedRelation: "yearbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      proofs: {
        Row: {
          canva_export_id: string | null
          created_at: string
          created_by: string
          id: string
          notes: string | null
          status: string
          storage_path: string
          version: number
          yearbook_id: string
        }
        Insert: {
          canva_export_id?: string | null
          created_at?: string
          created_by: string
          id?: string
          notes?: string | null
          status?: string
          storage_path: string
          version: number
          yearbook_id: string
        }
        Update: {
          canva_export_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          status?: string
          storage_path?: string
          version?: number
          yearbook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "proofs_yearbook_id_fkey"
            columns: ["yearbook_id"]
            isOneToOne: false
            referencedRelation: "yearbooks"
            referencedColumns: ["id"]
          },
        ]
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
      service_bureau_submissions: {
        Row: {
          created_at: string | null
          external_reference: string | null
          id: string
          notes: string | null
          package_id: string
          service_bureau_id: string | null
          snapshot_id: string
          status: string
          submitted_at: string | null
          submitted_by: string | null
          updated_at: string | null
          yearbook_id: string
        }
        Insert: {
          created_at?: string | null
          external_reference?: string | null
          id?: string
          notes?: string | null
          package_id: string
          service_bureau_id?: string | null
          snapshot_id: string
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string | null
          yearbook_id: string
        }
        Update: {
          created_at?: string | null
          external_reference?: string | null
          id?: string
          notes?: string | null
          package_id?: string
          service_bureau_id?: string | null
          snapshot_id?: string
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string | null
          yearbook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_bureau_submissions_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "production_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_bureau_submissions_service_bureau_id_fkey"
            columns: ["service_bureau_id"]
            isOneToOne: false
            referencedRelation: "service_bureaus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_bureau_submissions_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "production_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_bureau_submissions_yearbook_id_fkey"
            columns: ["yearbook_id"]
            isOneToOne: false
            referencedRelation: "yearbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      service_bureaus: {
        Row: {
          contact_name: string | null
          created_at: string | null
          email: string | null
          file_requirements: Json | null
          id: string
          name: string
          notes: string | null
          submission_method: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          contact_name?: string | null
          created_at?: string | null
          email?: string | null
          file_requirements?: Json | null
          id?: string
          name: string
          notes?: string | null
          submission_method?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          contact_name?: string | null
          created_at?: string | null
          email?: string | null
          file_requirements?: Json | null
          id?: string
          name?: string
          notes?: string | null
          submission_method?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: []
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
      yearbook_approvals: {
        Row: {
          created_at: string
          created_by: string
          id: string
          notes: string | null
          proof_id: string
          reason: string | null
          status: string
          yearbook_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          notes?: string | null
          proof_id: string
          reason?: string | null
          status?: string
          yearbook_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          proof_id?: string
          reason?: string | null
          status?: string
          yearbook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "yearbook_approvals_proof_id_fkey"
            columns: ["proof_id"]
            isOneToOne: false
            referencedRelation: "proofs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yearbook_approvals_yearbook_id_fkey"
            columns: ["yearbook_id"]
            isOneToOne: false
            referencedRelation: "yearbooks"
            referencedColumns: ["id"]
          },
        ]
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
      yearbook_storage_config: {
        Row: {
          additional_providers: Database["public"]["Enums"]["storage_provider"][]
          allow_member_sources: boolean
          created_at: string
          folder_id: string | null
          folder_path: string | null
          id: string
          mode: Database["public"]["Enums"]["yearbook_storage_mode"]
          provider: Database["public"]["Enums"]["storage_provider"] | null
          updated_at: string
          yearbook_id: string
        }
        Insert: {
          additional_providers?: Database["public"]["Enums"]["storage_provider"][]
          allow_member_sources?: boolean
          created_at?: string
          folder_id?: string | null
          folder_path?: string | null
          id?: string
          mode?: Database["public"]["Enums"]["yearbook_storage_mode"]
          provider?: Database["public"]["Enums"]["storage_provider"] | null
          updated_at?: string
          yearbook_id: string
        }
        Update: {
          additional_providers?: Database["public"]["Enums"]["storage_provider"][]
          allow_member_sources?: boolean
          created_at?: string
          folder_id?: string | null
          folder_path?: string | null
          id?: string
          mode?: Database["public"]["Enums"]["yearbook_storage_mode"]
          provider?: Database["public"]["Enums"]["storage_provider"] | null
          updated_at?: string
          yearbook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "yearbook_storage_config_yearbook_id_fkey"
            columns: ["yearbook_id"]
            isOneToOne: true
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
      annotation_type: "point" | "rectangle" | "highlight" | "comment"
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
      correction_category:
        | "typographical"
        | "name"
        | "date"
        | "caption"
        | "image"
        | "missing_asset"
        | "wrong_asset"
        | "layout"
        | "alignment"
        | "content"
        | "requirement"
        | "other"
      correction_status:
        | "open"
        | "acknowledged"
        | "in_progress"
        | "resolved"
        | "awaiting_verification"
        | "verified"
        | "closed"
        | "rejected"
        | "cancelled"
      provider_connection_status:
        | "connected"
        | "needs_reauthorization"
        | "disconnected"
        | "error"
      storage_provider:
        | "lovable"
        | "google_drive"
        | "onedrive"
        | "dropbox"
        | "external"
        | "box"
      yearbook_role:
        | "coordinator"
        | "staff"
        | "proofreader"
        | "corrector"
        | "student"
      yearbook_storage_mode: "inherit_organization" | "provider" | "milestone"
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
      annotation_type: ["point", "rectangle", "highlight", "comment"],
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
      correction_category: [
        "typographical",
        "name",
        "date",
        "caption",
        "image",
        "missing_asset",
        "wrong_asset",
        "layout",
        "alignment",
        "content",
        "requirement",
        "other",
      ],
      correction_status: [
        "open",
        "acknowledged",
        "in_progress",
        "resolved",
        "awaiting_verification",
        "verified",
        "closed",
        "rejected",
        "cancelled",
      ],
      provider_connection_status: [
        "connected",
        "needs_reauthorization",
        "disconnected",
        "error",
      ],
      storage_provider: [
        "lovable",
        "google_drive",
        "onedrive",
        "dropbox",
        "external",
        "box",
      ],
      yearbook_role: [
        "coordinator",
        "staff",
        "proofreader",
        "corrector",
        "student",
      ],
      yearbook_storage_mode: ["inherit_organization", "provider", "milestone"],
    },
  },
} as const
