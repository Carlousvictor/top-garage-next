-- Execute via Supabase SQL Editor to add fields to the companies table
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS email TEXT;
-- You can add more like address, etc. if needed later!
