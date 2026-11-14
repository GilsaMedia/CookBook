export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
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
      book_members: {
        Row: {
          book_id: string;
          created_at: string;
          invited_by: string | null;
          revoked_at: string | null;
          role: Database["public"]["Enums"]["member_role"];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          book_id: string;
          created_at?: string;
          invited_by?: string | null;
          revoked_at?: string | null;
          role: Database["public"]["Enums"]["member_role"];
          user_id: string;
        };
        Update: {
          book_id?: string;
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
        ComputedFields: never;
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
        ComputedFields: never;
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
        ComputedFields: never;
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
        ComputedFields: never;
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
        ComputedFields: never;
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
          created_at: string;
          display_name: string | null;
          email: string | null;
          id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          display_name?: string | null;
          email?: string | null;
          id: string;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          email?: string | null;
          id?: string;
        };
        Relationships: [];
      };
      recipe_images: {
        Row: {
          book_id: string;
          created_at: string;
          id: string;
          position: number;
          recipe_id: string;
          storage_path: string;
        };
        ComputedFields: never;
        Insert: {
          book_id: string;
          created_at?: string;
          id?: string;
          position?: number;
          recipe_id: string;
          storage_path: string;
        };
        Update: {
          book_id?: string;
          created_at?: string;
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
          title: string;
          updated_at: string;
          uses_oven: boolean;
          uses_stovetop: boolean;
        };
        ComputedFields: never;
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
      steps: {
        Row: {
          book_id: string;
          created_at: string;
          id: string;
          position: number;
          recipe_id: string;
          text: string;
        };
        ComputedFields: never;
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
      normalize_hebrew: { Args: { input: string }; Returns: string };
    };
    Enums: {
      dish_role: "main" | "side" | "salad" | "soup" | "dessert" | "pastry" | "spread" | "drink";
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
      member_role: "owner" | "contributor" | "viewer";
      preference_scope: "global" | "category" | "recipe";
      recipe_status: "draft" | "pending" | "approved" | "rejected";
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
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
      member_role: ["owner", "contributor", "viewer"],
      preference_scope: ["global", "category", "recipe"],
      recipe_status: ["draft", "pending", "approved", "rejected"],
    },
  },
} as const;
