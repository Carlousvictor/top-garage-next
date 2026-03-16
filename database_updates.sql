-- Run this in your Supabase SQL Editor to add the payment_method column to the transactions table.

ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS payment_method TEXT;

-- Optional: You can set a default value or leave it as null for older transactions.
-- To set a default for older records (e.g., 'Dinheiro') you can run:
-- UPDATE public.transactions SET payment_method = 'Dinheiro' WHERE payment_method IS NULL;
