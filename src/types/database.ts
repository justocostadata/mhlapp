export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      Equipos: {
        Row: {
          comprado: number | null
          diferencias: string | null
          equipo_id: string
          faltante: number | null
          fichados: number | null
          maximo_compra: number | null
          nombre_equipo: string | null
          ofertas_disponibles: number | null
          ofertas_realizadas: number | null
          plazas_compradas: number | null
          plazas_disponibles: number | null
          plazas_vendidas: number | null
          presupuesto: number | null
          restante: number | null
        }
        Insert: {
          comprado?: number | null
          diferencias?: string | null
          equipo_id: string
          faltante?: number | null
          fichados?: number | null
          maximo_compra?: number | null
          nombre_equipo?: string | null
          ofertas_disponibles?: number | null
          ofertas_realizadas?: number | null
          plazas_compradas?: number | null
          plazas_disponibles?: number | null
          plazas_vendidas?: number | null
          presupuesto?: number | null
          restante?: number | null
        }
        Update: {
          comprado?: number | null
          diferencias?: string | null
          equipo_id?: string
          faltante?: number | null
          fichados?: number | null
          maximo_compra?: number | null
          nombre_equipo?: string | null
          ofertas_disponibles?: number | null
          ofertas_realizadas?: number | null
          plazas_compradas?: number | null
          plazas_disponibles?: number | null
          plazas_vendidas?: number | null
          presupuesto?: number | null
          restante?: number | null
        }
        Relationships: []
      }
      Estadisticas: {
        Row: {
          equipo: string | null
          fecha_hora: string | null
          id_partido: string | null
          id_suceso: string
          jugador_id: string | null
          minuto: number | null
          tipo: string | null
        }
        Insert: {
          equipo?: string | null
          fecha_hora?: string | null
          id_partido?: string | null
          id_suceso: string
          jugador_id?: string | null
          minuto?: number | null
          tipo?: string | null
        }
        Update: {
          equipo?: string | null
          fecha_hora?: string | null
          id_partido?: string | null
          id_suceso?: string
          jugador_id?: string | null
          minuto?: number | null
          tipo?: string | null
        }
        Relationships: []
      }
      Jugadores: {
        Row: {
          dorsal: number | null
          estado: string | null
          jugador_id: string
          nombre: string | null
          nombre_equipo: string | null
          posicion: string | null
          valor: number | null
        }
        Insert: {
          dorsal?: number | null
          estado?: string | null
          jugador_id: string
          nombre?: string | null
          nombre_equipo?: string | null
          posicion?: string | null
          valor?: number | null
        }
        Update: {
          dorsal?: number | null
          estado?: string | null
          jugador_id?: string
          nombre?: string | null
          nombre_equipo?: string | null
          posicion?: string | null
          valor?: number | null
        }
        Relationships: []
      }
      Partidos: {
        Row: {
          arbitro: string | null
          cancha: string | null
          categoria: string | null
          dia_fin: string | null
          dia_inicio: string | null
          equipo_1: string | null
          equipo_2: string | null
          estado: string | null
          fase: string | null
          fecha: string | null
          hora_fin: string | null
          hora_inicio: string | null
          id_partido: number
          mvp: string | null
          nombre: string | null
          numero_partido: string | null
          resultado: string | null
          zona: string | null
        }
        Insert: {
          arbitro?: string | null
          cancha?: string | null
          categoria?: string | null
          dia_fin?: string | null
          dia_inicio?: string | null
          equipo_1?: string | null
          equipo_2?: string | null
          estado?: string | null
          fase?: string | null
          fecha?: string | null
          hora_fin?: string | null
          hora_inicio?: string | null
          id_partido: number
          mvp?: string | null
          nombre?: string | null
          numero_partido?: string | null
          resultado?: string | null
          zona?: string | null
        }
        Update: {
          arbitro?: string | null
          cancha?: string | null
          categoria?: string | null
          dia_fin?: string | null
          dia_inicio?: string | null
          equipo_1?: string | null
          equipo_2?: string | null
          estado?: string | null
          fase?: string | null
          fecha?: string | null
          hora_fin?: string | null
          hora_inicio?: string | null
          id_partido?: number
          mvp?: string | null
          nombre?: string | null
          numero_partido?: string | null
          resultado?: string | null
          zona?: string | null
        }
        Relationships: []
      }
      competition_teams: {
        Row: {
          competition_id: string
          created_at: string
          team_id: string
        }
        Insert: {
          competition_id: string
          created_at?: string
          team_id: string
        }
        Update: {
          competition_id?: string
          created_at?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "competition_teams_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_teams_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      competition_types: {
        Row: {
          code: string
          created_at: string
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          name?: string
        }
        Relationships: []
      }
      competitions: {
        Row: {
          created_at: string
          ends_on: string | null
          id: string
          legacy_data: Json | null
          legacy_key: string | null
          name: string
          season_id: string | null
          starts_on: string | null
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_on?: string | null
          id?: string
          legacy_data?: Json | null
          legacy_key?: string | null
          name: string
          season_id?: string | null
          starts_on?: string | null
          status?: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_on?: string | null
          id?: string
          legacy_data?: Json | null
          legacy_key?: string | null
          name?: string
          season_id?: string | null
          starts_on?: string | null
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitions_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitions_type_fkey"
            columns: ["type"]
            isOneToOne: false
            referencedRelation: "competition_types"
            referencedColumns: ["code"]
          },
        ]
      }
      legacy_unmatched_match_events: {
        Row: {
          created_at: string
          id: string
          legacy_data: Json
          legacy_event_type: string | null
          legacy_id: string
          legacy_match_id: string | null
          legacy_player_id: string | null
          legacy_team_name: string | null
          reason: string
        }
        Insert: {
          created_at?: string
          id?: string
          legacy_data: Json
          legacy_event_type?: string | null
          legacy_id: string
          legacy_match_id?: string | null
          legacy_player_id?: string | null
          legacy_team_name?: string | null
          reason: string
        }
        Update: {
          created_at?: string
          id?: string
          legacy_data?: Json
          legacy_event_type?: string | null
          legacy_id?: string
          legacy_match_id?: string | null
          legacy_player_id?: string | null
          legacy_team_name?: string | null
          reason?: string
        }
        Relationships: []
      }
      match_event_types: {
        Row: {
          active: boolean
          affects_player_statistics: boolean
          code: string
          created_at: string
          name: string
        }
        Insert: {
          active?: boolean
          affects_player_statistics?: boolean
          code: string
          created_at?: string
          name: string
        }
        Update: {
          active?: boolean
          affects_player_statistics?: boolean
          code?: string
          created_at?: string
          name?: string
        }
        Relationships: []
      }
      match_events: {
        Row: {
          created_at: string
          created_by: string | null
          event_type: string
          id: string
          legacy_data: Json | null
          legacy_event_type: string | null
          legacy_id: string | null
          legacy_team_name: string | null
          match_id: string
          minute: number | null
          notes: string | null
          player_id: string | null
          team_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_type: string
          id?: string
          legacy_data?: Json | null
          legacy_event_type?: string | null
          legacy_id?: string | null
          legacy_team_name?: string | null
          match_id: string
          minute?: number | null
          notes?: string | null
          player_id?: string | null
          team_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_type?: string
          id?: string
          legacy_data?: Json | null
          legacy_event_type?: string | null
          legacy_id?: string | null
          legacy_team_name?: string | null
          match_id?: string
          minute?: number | null
          notes?: string | null
          player_id?: string | null
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_events_event_type_fkey"
            columns: ["event_type"]
            isOneToOne: false
            referencedRelation: "match_event_types"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "match_events_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_events_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      match_players: {
        Row: {
          created_at: string
          id: string
          match_id: string
          minutes_played: number | null
          participation_status: string
          player_id: string
          position: string | null
          side: string | null
          starter: boolean
          team_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          match_id: string
          minutes_played?: number | null
          participation_status?: string
          player_id: string
          position?: string | null
          side?: string | null
          starter?: boolean
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          match_id?: string
          minutes_played?: number | null
          participation_status?: string
          player_id?: string
          position?: string | null
          side?: string | null
          starter?: boolean
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_players_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_players_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      match_types: {
        Row: {
          active: boolean
          code: string
          created_at: string
          default_credit_cost: number
          is_competition: boolean
          name: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          default_credit_cost?: number
          is_competition?: boolean
          name: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          default_credit_cost?: number
          is_competition?: boolean
          name?: string
        }
        Relationships: []
      }
      matches: {
        Row: {
          away_score: number | null
          away_team_id: string | null
          away_team_placeholder: string | null
          competition_id: string | null
          created_at: string
          created_by: string | null
          home_score: number | null
          home_team_id: string | null
          home_team_placeholder: string | null
          id: string
          legacy_data: Json | null
          legacy_day_end: string | null
          legacy_day_start: string | null
          legacy_end_time: string | null
          legacy_id: string | null
          legacy_match_name: string | null
          legacy_mvp: string | null
          legacy_result: string | null
          legacy_start_time: string | null
          legacy_status: string | null
          match_number: string | null
          match_type: string
          matchday: number | null
          phase: string | null
          pitch: string | null
          referee_name: string | null
          scheduled_at: string | null
          season_id: string | null
          status: string
          updated_at: string
          venue_name: string | null
          zone: string | null
        }
        Insert: {
          away_score?: number | null
          away_team_id?: string | null
          away_team_placeholder?: string | null
          competition_id?: string | null
          created_at?: string
          created_by?: string | null
          home_score?: number | null
          home_team_id?: string | null
          home_team_placeholder?: string | null
          id?: string
          legacy_data?: Json | null
          legacy_day_end?: string | null
          legacy_day_start?: string | null
          legacy_end_time?: string | null
          legacy_id?: string | null
          legacy_match_name?: string | null
          legacy_mvp?: string | null
          legacy_result?: string | null
          legacy_start_time?: string | null
          legacy_status?: string | null
          match_number?: string | null
          match_type: string
          matchday?: number | null
          phase?: string | null
          pitch?: string | null
          referee_name?: string | null
          scheduled_at?: string | null
          season_id?: string | null
          status?: string
          updated_at?: string
          venue_name?: string | null
          zone?: string | null
        }
        Update: {
          away_score?: number | null
          away_team_id?: string | null
          away_team_placeholder?: string | null
          competition_id?: string | null
          created_at?: string
          created_by?: string | null
          home_score?: number | null
          home_team_id?: string | null
          home_team_placeholder?: string | null
          id?: string
          legacy_data?: Json | null
          legacy_day_end?: string | null
          legacy_day_start?: string | null
          legacy_end_time?: string | null
          legacy_id?: string | null
          legacy_match_name?: string | null
          legacy_mvp?: string | null
          legacy_result?: string | null
          legacy_start_time?: string | null
          legacy_status?: string | null
          match_number?: string | null
          match_type?: string
          matchday?: number | null
          phase?: string | null
          pitch?: string | null
          referee_name?: string | null
          scheduled_at?: string | null
          season_id?: string | null
          status?: string
          updated_at?: string
          venue_name?: string | null
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_match_type_fkey"
            columns: ["match_type"]
            isOneToOne: false
            referencedRelation: "match_types"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "matches_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      player_claims: {
        Row: {
          admin_notes: string | null
          id: string
          player_id: string
          requested_at: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          id?: string
          player_id: string
          requested_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          id?: string
          player_id?: string
          requested_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_claims_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          category: string | null
          created_at: string
          display_name: string
          id: string
          jersey_number: number | null
          legacy_data: Json | null
          legacy_id: string | null
          photo_url: string | null
          position: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          display_name: string
          id?: string
          jersey_number?: number | null
          legacy_data?: Json | null
          legacy_id?: string | null
          photo_url?: string | null
          position?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          display_name?: string
          id?: string
          jersey_number?: number | null
          legacy_data?: Json | null
          legacy_id?: string | null
          photo_url?: string | null
          position?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "players_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          status?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      roles: {
        Row: {
          code: string
          created_at: string
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          name?: string
        }
        Relationships: []
      }
      seasons: {
        Row: {
          created_at: string
          ends_on: string | null
          id: string
          is_active: boolean
          name: string
          starts_on: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_on?: string | null
          id?: string
          is_active?: boolean
          name: string
          starts_on?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_on?: string | null
          id?: string
          is_active?: boolean
          name?: string
          starts_on?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      team_coaches: {
        Row: {
          created_at: string
          id: string
          joined_at: string
          left_at: string | null
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          joined_at?: string
          left_at?: string | null
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          joined_at?: string
          left_at?: string | null
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_coaches_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string
          id: string
          joined_at: string
          left_at: string | null
          player_id: string
          team_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          joined_at?: string
          left_at?: string | null
          player_id: string
          team_id: string
        }
        Update: {
          created_at?: string
          id?: string
          joined_at?: string
          left_at?: string | null
          player_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          active: boolean
          created_at: string
          id: string
          legacy_data: Json | null
          legacy_id: string | null
          logo_url: string | null
          name: string
          short_name: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          legacy_data?: Json | null
          legacy_id?: string | null
          logo_url?: string | null
          name: string
          short_name?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          legacy_data?: Json | null
          legacy_id?: string | null
          logo_url?: string | null
          name?: string
          short_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_role_fkey"
            columns: ["role"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["code"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cancel_player_claim: {
        Args: { requested_claim_id: string }
        Returns: undefined
      }
      has_role: {
        Args: { requested_role: string; requested_user_id: string }
        Returns: boolean
      }
      request_player_claim: {
        Args: { requested_player_id: string }
        Returns: string
      }
      review_player_claim: {
        Args: {
          decision: string
          notes?: string | null
          requested_claim_id: string
        }
        Returns: undefined
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
    Enums: {},
  },
} as const
