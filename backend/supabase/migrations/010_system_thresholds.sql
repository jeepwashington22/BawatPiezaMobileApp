-- Create the table for your app's custom threshold rules
CREATE TABLE system_thresholds (
  hub_id TEXT PRIMARY KEY,
  floor NUMERIC DEFAULT 2.0,
  degradation NUMERIC DEFAULT 0.05,
  watch_window NUMERIC DEFAULT 60,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Enable Row Level Security (RLS) so the mobile app can access it
ALTER TABLE system_thresholds ENABLE ROW LEVEL SECURITY;

-- Create a policy allowing your app to read and update the rules
CREATE POLICY "Allow all access to thresholds" 
ON system_thresholds 
FOR ALL 
USING (true) 
WITH CHECK (true);