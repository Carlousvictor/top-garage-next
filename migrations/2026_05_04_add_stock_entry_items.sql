-- Create stock_entry_items table to store the contents of each stock entry
-- This allows reverting stock when an entry is deleted.

CREATE TABLE IF NOT EXISTS public.stock_entry_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) DEFAULT public.user_tenant_id(),
    stock_entry_id BIGINT NOT NULL REFERENCES public.stock_entries(id) ON DELETE CASCADE,
    product_id BIGINT REFERENCES public.products(id) ON DELETE SET NULL,
    sku TEXT,
    ean TEXT,
    name TEXT NOT NULL,
    quantity NUMERIC(12,3) NOT NULL,
    cost_price NUMERIC(12,2) NOT NULL,
    selling_price NUMERIC(12,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.stock_entry_items ENABLE ROW LEVEL SECURITY;

-- RLS Policy
CREATE POLICY "Tenant Isolation - Stock Entry Items" 
    ON public.stock_entry_items 
    FOR ALL 
    USING (tenant_id = public.user_tenant_id());

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_stock_entry_items_entry_id ON public.stock_entry_items(stock_entry_id);
CREATE INDEX IF NOT EXISTS idx_stock_entry_items_tenant_id ON public.stock_entry_items(tenant_id);

-- Ensure profit_margin_percent exists on products if not already there
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS profit_margin_percent NUMERIC(5,2) DEFAULT 0;
