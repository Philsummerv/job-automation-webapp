// Minimal typed surface for Supabase. We hand-write the Database type instead of
// generating it, so the schema stays legible and reviewable. Keep in sync with
// migrations/*.sql. Row shapes are re-exported from @autoapply/shared.

import type { Profile, ActivityLogEntry } from "@autoapply/shared";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { user_id: string };
        Update: Partial<Profile>;
      };
      activity_log: {
        Row: ActivityLogEntry;
        Insert: Omit<ActivityLogEntry, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<ActivityLogEntry>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};

export type { Profile, ActivityLogEntry } from "@autoapply/shared";
