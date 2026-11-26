export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      ai_access: {
        Row: {
          book_id: string;
          created_at: string;
          daily_book_limit: number;
          daily_user_limit: number;
        };
        Insert: {
          book_id: string;
          created_at?: string;
          daily_book_limit?: number;
          daily_user_limit?: number;
        };
        Update: {
          book_id?: string;
          created_at?: string;
          daily_book_limit?: number;
          daily_user_limit?: number;
        };
        Relationships: [
          {
            foreignKeyName: "ai_access_book_id_fkey";
            columns: ["book_id"];
            isOneToOne: true;
            referencedRelation: "books";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_usage: {
        Row: {
          book_id: string;
          calls: number;
          day: string;
          user_id: string;
        };
        Insert: {
          book_id: string;
          calls?: number;
          day?: string;
          user_id: string;
        };
        Update: {
          book_id?: string;
          calls?: number;
          day?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_usage_book_id_fkey";
            columns: ["book_id"];
            isOneToOne: false;
            referencedRelation: "books";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_usage_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      app_admins: {
        Row: {
          created_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "app_admins_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      book_members: {
        Row: {
          book_id: string;
          can_publish: boolean;
          created_at: string;
          invited_by: string | null;
          revoked_at: string | null;
          role: Database["public"]["Enums"]["member_role"];
          user_id: string;
        };
        Insert: {
          book_id: string;
          can_publish?: boolean;
          created_at?: string;
          invited_by?: string | null;
          revoked_at?: string | null;
          role: Database["public"]["Enums"]["member_role"];
          user_id: string;
        };
        Update: {
          book_id?: string;
          can_publish?: boolean;
          created_at?: string;
          invited_by?: string | null;
          revoked_at?: string | null;
          role?: Database["public"]["Enums"]["member_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "book_members_book_id_fkey";
            columns: ["book_id"];
            isOneToOne: false;
            referencedRelation: "books";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "book_members_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "book_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      books: {
        Row: {
          created_at: string;
          id: string;
          name: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          book_id: string;
          created_at: string;
          id: string;
          name: string;
          position: number;
        };
        Insert: {
          book_id: string;
          created_at?: string;
          id?: string;
          name: string;
          position?: number;
        };
        Update: {
          book_id?: string;
          created_at?: string;
          id?: string;
          name?: string;
          position?: number;
        };
        Relationships: [
          {
            foreignKeyName: "categories_book_id_fkey";
            columns: ["book_id"];
            isOneToOne: false;
            referencedRelation: "books";
            referencedColumns: ["id"];
          },
        ];
      };
      import_items: {
        Row: {
          attempts: number;
          book_id: string;
          entry: Json;
          error: string | null;
          id: string;
          input: string;
          job_id: string;
          position: number;
          result: Json | null;
          retry_at: string | null;
          status: Database["public"]["Enums"]["import_item_status"];
          task: string;
          updated_at: string;
        };
        Insert: {
          attempts?: number;
          book_id: string;
          entry: Json;
          error?: string | null;
          id?: string;
          input?: string;
          job_id: string;
          position: number;
          result?: Json | null;
          retry_at?: string | null;
          status?: Database["public"]["Enums"]["import_item_status"];
          task: string;
          updated_at?: string;
        };
        Update: {
          attempts?: number;
          book_id?: string;
          entry?: Json;
          error?: string | null;
          id?: string;
          input?: string;
          job_id?: string;
          position?: number;
          result?: Json | null;
          retry_at?: string | null;
          status?: Database["public"]["Enums"]["import_item_status"];
          task?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "import_items_job_id_book_id_fkey";
            columns: ["job_id", "book_id"];
            isOneToOne: false;
            referencedRelation: "import_jobs";
            referencedColumns: ["id", "book_id"];
          },
        ];
      };
      import_jobs: {
        Row: {
          book_id: string;
          created_at: string;
          created_by: string | null;
          done: number;
          failed: number;
          file_name: string;
          format: string;
          id: string;
          status: Database["public"]["Enums"]["import_job_status"];
          total: number;
          updated_at: string;
        };
        Insert: {
          book_id: string;
          created_at?: string;
          created_by?: string | null;
          done?: number;
          failed?: number;
          file_name: string;
          format: string;
          id?: string;
          status?: Database["public"]["Enums"]["import_job_status"];
          total?: number;
          updated_at?: string;
        };
        Update: {
          book_id?: string;
          created_at?: string;
          created_by?: string | null;
          done?: number;
          failed?: number;
          file_name?: string;
          format?: string;
          id?: string;
          status?: Database["public"]["Enums"]["import_job_status"];
          total?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "import_jobs_book_id_fkey";
            columns: ["book_id"];
            isOneToOne: false;
            referencedRelation: "books";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "import_jobs_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      ingredients: {
        Row: {
          book_id: string;
          canonical_name: string | null;
          created_at: string;
          display_text: string;
          id: string;
          optional: boolean;
          position: number;
          quantity: number | null;
          recipe_id: string;
          section: Database["public"]["Enums"]["ingredient_section"];
          unit: Database["public"]["Enums"]["ingredient_unit"] | null;
        };
        Insert: {
          book_id: string;
          canonical_name?: string | null;
          created_at?: string;
          display_text: string;
          id?: string;
          optional?: boolean;
          position?: number;
          quantity?: number | null;
          recipe_id: string;
          section?: Database["public"]["Enums"]["ingredient_section"];
          unit?: Database["public"]["Enums"]["ingredient_unit"] | null;
        };
        Update: {
          book_id?: string;
          canonical_name?: string | null;
          created_at?: string;
          display_text?: string;
          id?: string;
          optional?: boolean;
          position?: number;
          quantity?: number | null;
          recipe_id?: string;
          section?: Database["public"]["Enums"]["ingredient_section"];
          unit?: Database["public"]["Enums"]["ingredient_unit"] | null;
        };
        Relationships: [
          {
            foreignKeyName: "ingredients_recipe_id_book_id_fkey";
            columns: ["recipe_id", "book_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id", "book_id"];
          },
        ];
      };
      invites: {
        Row: {
          book_id: string;
          consumed_at: string | null;
          consumed_by: string | null;
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          invited_by: string | null;
          role: Database["public"]["Enums"]["member_role"];
          token_hash: string;
        };
        Insert: {
          book_id: string;
          consumed_at?: string | null;
          consumed_by?: string | null;
          created_at?: string;
          email: string;
          expires_at?: string;
          id?: string;
          invited_by?: string | null;
          role?: Database["public"]["Enums"]["member_role"];
          token_hash: string;
        };
        Update: {
          book_id?: string;
          consumed_at?: string | null;
          consumed_by?: string | null;
          created_at?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          invited_by?: string | null;
          role?: Database["public"]["Enums"]["member_role"];
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invites_book_id_fkey";
            columns: ["book_id"];
            isOneToOne: false;
            referencedRelation: "books";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invites_consumed_by_fkey";
            columns: ["consumed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invites_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      meal_items: {
        Row: {
          added_by: string | null;
          book_id: string;
          created_at: string;
          id: string;
          meal_id: string;
          position: number;
          recipe_id: string;
          servings: number | null;
          version_id: string | null;
        };
        Insert: {
          added_by?: string | null;
          book_id: string;
          created_at?: string;
          id?: string;
          meal_id: string;
          position?: number;
          recipe_id: string;
          servings?: number | null;
          version_id?: string | null;
        };
        Update: {
          added_by?: string | null;
          book_id?: string;
          created_at?: string;
          id?: string;
          meal_id?: string;
          position?: number;
          recipe_id?: string;
          servings?: number | null;
          version_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "meal_items_meal_id_book_id_fkey";
            columns: ["meal_id", "book_id"];
            isOneToOne: false;
            referencedRelation: "meals";
            referencedColumns: ["id", "book_id"];
          },
          {
            foreignKeyName: "meal_items_recipe_id_book_id_fkey";
            columns: ["recipe_id", "book_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id", "book_id"];
          },
        ];
      };
      meals: {
        Row: {
          book_id: string;
          created_at: string;
          created_by: string | null;
          date: string | null;
          id: string;
          status: Database["public"]["Enums"]["meal_status"];
          title: string;
          updated_at: string;
        };
        Insert: {
          book_id: string;
          created_at?: string;
          created_by?: string | null;
          date?: string | null;
          id?: string;
          status?: Database["public"]["Enums"]["meal_status"];
          title?: string;
          updated_at?: string;
        };
        Update: {
          book_id?: string;
          created_at?: string;
          created_by?: string | null;
          date?: string | null;
          id?: string;
          status?: Database["public"]["Enums"]["meal_status"];
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      preferences: {
        Row: {
          book_id: string;
          category_id: string | null;
          created_at: string;
          excluded_ingredients: string[];
          id: string;
          recipe_id: string | null;
          scope: Database["public"]["Enums"]["preference_scope"];
        };
        Insert: {
          book_id: string;
          category_id?: string | null;
          created_at?: string;
          excluded_ingredients?: string[];
          id?: string;
          recipe_id?: string | null;
          scope: Database["public"]["Enums"]["preference_scope"];
        };
        Update: {
          book_id?: string;
          category_id?: string | null;
          created_at?: string;
          excluded_ingredients?: string[];
          id?: string;
          recipe_id?: string | null;
          scope?: Database["public"]["Enums"]["preference_scope"];
        };
        Relationships: [
          {
            foreignKeyName: "preferences_book_id_fkey";
            columns: ["book_id"];
            isOneToOne: false;
            referencedRelation: "books";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "preferences_category_id_book_id_fkey";
            columns: ["category_id", "book_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id", "book_id"];
          },
          {
            foreignKeyName: "preferences_recipe_id_book_id_fkey";
            columns: ["recipe_id", "book_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id", "book_id"];
          },
        ];
      };
      profiles: {
        Row: {
          approved_at: string | null;
          approved_by: string | null;
          created_at: string;
          display_name: string | null;
          email: string | null;
          id: string;
          rejected_at: string | null;
        };
        Insert: {
          approved_at?: string | null;
          approved_by?: string | null;
          created_at?: string;
          display_name?: string | null;
          email?: string | null;
          id: string;
          rejected_at?: string | null;
        };
        Update: {
          approved_at?: string | null;
          approved_by?: string | null;
          created_at?: string;
          display_name?: string | null;
          email?: string | null;
          id?: string;
          rejected_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_approved_by_fkey";
            columns: ["approved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      recipe_images: {
        Row: {
          book_id: string;
          created_at: string;
          credit_name: string | null;
          credit_url: string | null;
          id: string;
          position: number;
          recipe_id: string;
          storage_path: string;
        };
        Insert: {
          book_id: string;
          created_at?: string;
          credit_name?: string | null;
          credit_url?: string | null;
          id?: string;
          position?: number;
          recipe_id: string;
          storage_path: string;
        };
        Update: {
          book_id?: string;
          created_at?: string;
          credit_name?: string | null;
          credit_url?: string | null;
          id?: string;
          position?: number;
          recipe_id?: string;
          storage_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recipe_images_recipe_id_book_id_fkey";
            columns: ["recipe_id", "book_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id", "book_id"];
          },
        ];
      };
      recipes: {
        Row: {
          active_minutes: number | null;
          book_id: string;
          category_id: string | null;
          cook_time: number | null;
          created_at: string;
          created_by: string | null;
          cuisine: string | null;
          dish_role: Database["public"]["Enums"]["dish_role"] | null;
          id: string;
          make_ahead: boolean;
          oven_temp: number | null;
          prep_time: number | null;
          search_text: string;
          servings: number | null;
          source_name: string | null;
          source_url: string | null;
          status: Database["public"]["Enums"]["recipe_status"];
          tags: string[];
          title: string;
          updated_at: string;
          uses_oven: boolean;
          uses_stovetop: boolean;
        };
        Insert: {
          active_minutes?: number | null;
          book_id: string;
          category_id?: string | null;
          cook_time?: number | null;
          created_at?: string;
          created_by?: string | null;
          cuisine?: string | null;
          dish_role?: Database["public"]["Enums"]["dish_role"] | null;
          id?: string;
          make_ahead?: boolean;
          oven_temp?: number | null;
          prep_time?: number | null;
          search_text?: string;
          servings?: number | null;
          source_name?: string | null;
          source_url?: string | null;
          status?: Database["public"]["Enums"]["recipe_status"];
          tags?: string[];
          title: string;
          updated_at?: string;
          uses_oven?: boolean;
          uses_stovetop?: boolean;
        };
        Update: {
          active_minutes?: number | null;
          book_id?: string;
          category_id?: string | null;
          cook_time?: number | null;
          created_at?: string;
          created_by?: string | null;
          cuisine?: string | null;
          dish_role?: Database["public"]["Enums"]["dish_role"] | null;
          id?: string;
          make_ahead?: boolean;
          oven_temp?: number | null;
          prep_time?: number | null;
          search_text?: string;
          servings?: number | null;
          source_name?: string | null;
          source_url?: string | null;
          status?: Database["public"]["Enums"]["recipe_status"];
          tags?: string[];
          title?: string;
          updated_at?: string;
          uses_oven?: boolean;
          uses_stovetop?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "recipes_book_id_fkey";
            columns: ["book_id"];
            isOneToOne: false;
            referencedRelation: "books";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recipes_category_id_book_id_fkey";
            columns: ["category_id", "book_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id", "book_id"];
          },
          {
            foreignKeyName: "recipes_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      share_copies: {
        Row: {
          from_recipe_id: string;
          images_copied: boolean;
          share_id: string;
          to_recipe_id: string | null;
        };
        Insert: {
          from_recipe_id: string;
          images_copied?: boolean;
          share_id: string;
          to_recipe_id?: string | null;
        };
        Update: {
          from_recipe_id?: string;
          images_copied?: boolean;
          share_id?: string;
          to_recipe_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "share_copies_share_id_fkey";
            columns: ["share_id"];
            isOneToOne: false;
            referencedRelation: "shares";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "share_copies_to_recipe_id_fkey";
            columns: ["to_recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
        ];
      };
      shares: {
        Row: {
          added_count: number;
          can_add: boolean;
          created_at: string;
          follow: boolean;
          from_book_id: string;
          from_user: string;
          id: string;
          recipe_ids: string[] | null;
          responded_at: string | null;
          sender_name: string;
          status: Database["public"]["Enums"]["share_status"];
          to_book_id: string | null;
          to_email: string;
        };
        Insert: {
          added_count?: number;
          can_add?: boolean;
          created_at?: string;
          follow?: boolean;
          from_book_id: string;
          from_user?: string;
          id?: string;
          recipe_ids?: string[] | null;
          responded_at?: string | null;
          sender_name: string;
          status?: Database["public"]["Enums"]["share_status"];
          to_book_id?: string | null;
          to_email: string;
        };
        Update: {
          added_count?: number;
          can_add?: boolean;
          created_at?: string;
          follow?: boolean;
          from_book_id?: string;
          from_user?: string;
          id?: string;
          recipe_ids?: string[] | null;
          responded_at?: string | null;
          sender_name?: string;
          status?: Database["public"]["Enums"]["share_status"];
          to_book_id?: string | null;
          to_email?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shares_from_book_id_fkey";
            columns: ["from_book_id"];
            isOneToOne: false;
            referencedRelation: "books";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shares_from_user_fkey";
            columns: ["from_user"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shares_to_book_id_fkey";
            columns: ["to_book_id"];
            isOneToOne: false;
            referencedRelation: "books";
            referencedColumns: ["id"];
          },
        ];
      };
      steps: {
        Row: {
          book_id: string;
          created_at: string;
          id: string;
          position: number;
          recipe_id: string;
          text: string;
        };
        Insert: {
          book_id: string;
          created_at?: string;
          id?: string;
          position?: number;
          recipe_id: string;
          text: string;
        };
        Update: {
          book_id?: string;
          created_at?: string;
          id?: string;
          position?: number;
          recipe_id?: string;
          text?: string;
        };
        Relationships: [
          {
            foreignKeyName: "steps_recipe_id_book_id_fkey";
            columns: ["recipe_id", "book_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id", "book_id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_share: {
        Args: { p_book?: string; p_recipe_ids?: string[]; p_share: string };
        Returns: number;
      };
      add_to_tray: { Args: { p_recipe: string }; Returns: string };
      open_meal: {
        Args: { p_book: string; p_date: string; p_title: string };
        Returns: string;
      };
      book_people: {
        Args: { p_book: string };
        Returns: { name: string; user_id: string }[];
      };
      access_requests: {
        Args: never;
        Returns: {
          display_name: string;
          email: string;
          requested_at: string;
          status: string;
          user_id: string;
        }[];
      };
      ai_take_quota: {
        Args: { p_book: string; p_user: string };
        Returns: string;
      };
      claim_import_items: {
        Args: { p_limit: number };
        Returns: {
          attempts: number;
          book_id: string;
          entry: Json;
          error: string | null;
          id: string;
          input: string;
          job_id: string;
          position: number;
          result: Json | null;
          retry_at: string | null;
          status: Database["public"]["Enums"]["import_item_status"];
          task: string;
          updated_at: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "import_items";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      create_book: { Args: { p_name: string }; Returns: string };
      decide_access: {
        Args: { p_approve: boolean; p_user: string };
        Returns: undefined;
      };
      finish_import_item: {
        Args: {
          p_error: string;
          p_id: string;
          p_result: Json;
          p_status: Database["public"]["Enums"]["import_item_status"];
        };
        Returns: undefined;
      };
      keepalive: { Args: never; Returns: string };
      my_access: {
        Args: never;
        Returns: {
          is_admin: boolean;
          status: string;
        }[];
      };
      normalize_hebrew: { Args: { input: string }; Returns: string };
      retry_import: { Args: { p_job: string }; Returns: number };
      share_photos: {
        Args: { p_share: string };
        Returns: {
          credit_name: string;
          credit_url: string;
          from_recipe_id: string;
          position: number;
          storage_path: string;
          to_book_id: string;
          to_recipe_id: string;
        }[];
      };
      share_photos_done: {
        Args: { p_from_recipe_ids: string[]; p_share: string };
        Returns: undefined;
      };
      share_preview: {
        Args: { p_share: string };
        Returns: {
          category: string;
          recipe_id: string;
          title: string;
        }[];
      };
      stop_share_updates: { Args: { p_share: string }; Returns: undefined };
      sync_shared_books: {
        Args: never;
        Returns: {
          added: number;
          sender_name: string;
          share_id: string;
        }[];
      };
    };
    Enums: {
      dish_role: "main" | "side" | "salad" | "soup" | "dessert" | "pastry" | "spread" | "drink";
      import_item_status: "queued" | "processing" | "done" | "failed" | "skipped" | "saved";
      import_job_status: "draft" | "queued" | "running" | "ready" | "imported" | "cancelled";
      ingredient_section:
        | "produce"
        | "bakery"
        | "dairy_eggs"
        | "meat_fish"
        | "frozen"
        | "canned_sauces"
        | "dry_goods"
        | "baking"
        | "spices_oils"
        | "nuts_dried_fruit"
        | "drinks"
        | "other";
      ingredient_unit: "g" | "ml" | "unit";
      meal_status: "draft" | "done" | "closed";
      member_role: "owner" | "contributor" | "viewer";
      preference_scope: "global" | "category" | "recipe";
      recipe_status: "draft" | "pending" | "approved" | "rejected";
      share_status: "pending" | "accepted" | "declined";
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      dish_role: ["main", "side", "salad", "soup", "dessert", "pastry", "spread", "drink"],
      import_item_status: ["queued", "processing", "done", "failed", "skipped", "saved"],
      import_job_status: ["draft", "queued", "running", "ready", "imported", "cancelled"],
      ingredient_section: [
        "produce",
        "bakery",
        "dairy_eggs",
        "meat_fish",
        "frozen",
        "canned_sauces",
        "dry_goods",
        "baking",
        "spices_oils",
        "nuts_dried_fruit",
        "drinks",
        "other",
      ],
      ingredient_unit: ["g", "ml", "unit"],
      meal_status: ["draft", "done", "closed"],
      member_role: ["owner", "contributor", "viewer"],
      preference_scope: ["global", "category", "recipe"],
      recipe_status: ["draft", "pending", "approved", "rejected"],
      share_status: ["pending", "accepted", "declined"],
    },
  },
} as const;
