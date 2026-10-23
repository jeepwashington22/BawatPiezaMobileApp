-- Migration 009: Create kinetic_logs table with timestamps and tile tracking

CREATE TABLE IF NOT EXISTS kinetic_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  hub_id TEXT NOT NULL,
  tile_label TEXT NOT NULL DEFAULT 'Tile 1', -- Tracks which specific tile was stepped on
  duration_ms INTEGER DEFAULT 0,
  avg_v NUMERIC(6,2) DEFAULT 0.00,
  avg_a NUMERIC(6,3) DEFAULT 0.000,
  power_w NUMERIC(6,3) DEFAULT 0.000,
  energy_j NUMERIC(7,4) DEFAULT 0.0000,
  created_at TIMESTAMPTZ DEFAULT NOW()       -- Automatic exact timestamp
);

-- Enable Row Level Security (RLS)
ALTER TABLE kinetic_logs ENABLE ROW LEVEL SECURITY;

-- Allow mobile clients to read, insert, and archive logs
CREATE POLICY "Allow public select on kinetic_logs" ON kinetic_logs FOR SELECT USING (true);
CREATE POLICY "Allow public insert on kinetic_logs" ON kinetic_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public delete on kinetic_logs" ON kinetic_logs FOR DELETE USING (true);