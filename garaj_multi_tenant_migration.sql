-- 1. Create companies table
CREATE TABLE public.companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    document TEXT,
    logo_url TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Insert Top Garage RJ (First Tenant)
INSERT INTO public.companies (id, name, logo_url) 
VALUES ('00000000-0000-0000-0000-000000000001', 'Top Garage RJ', '/logo.png');

-- 3. Add Super Admin role constraint (if needed) or just rely on profile role='super_admin'
-- If there is any enum, we could alter it. Otherwise, text is fine.

-- 4. Create the Helper Function to get user's tenant_id securely
CREATE OR REPLACE FUNCTION public.user_tenant_id() RETURNS UUID AS $$
  SELECT tenant_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- 5. Add tenant_id to all tables and set default to public.user_tenant_id()
-- Note: Setting a DEFAULT avoids having to change all INSERT queries in the frontend.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.companies(id) DEFAULT public.user_tenant_id();
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.companies(id) DEFAULT public.user_tenant_id();
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.companies(id) DEFAULT public.user_tenant_id();
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.companies(id) DEFAULT public.user_tenant_id();
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.companies(id) DEFAULT public.user_tenant_id();
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.companies(id) DEFAULT public.user_tenant_id();
ALTER TABLE public.stock_entries ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.companies(id) DEFAULT public.user_tenant_id();
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.companies(id) DEFAULT public.user_tenant_id();
ALTER TABLE public.service_order_items ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.companies(id) DEFAULT public.user_tenant_id();
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.companies(id) DEFAULT public.user_tenant_id();

-- 6. Migrate existing data to Top Garage RJ
UPDATE public.profiles SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL AND role != 'super_admin';
UPDATE public.clients SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.vehicles SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.services SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.products SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.suppliers SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.stock_entries SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.service_orders SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.service_order_items SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE public.transactions SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- 7. Ensure NOT NULL constraint (optional but recommended for data integrity)
-- If there are orphaned rows, this will fail. Ensure step 6 covers all rows.
ALTER TABLE public.clients ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.vehicles ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.services ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.products ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.suppliers ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.stock_entries ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.service_orders ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.service_order_items ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.transactions ALTER COLUMN tenant_id SET NOT NULL;

-- 8. Enable Row Level Security
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- 9. Create RLS Policies
-- For Clients
CREATE POLICY "Tenant Isolation - Clients" ON public.clients FOR ALL USING (tenant_id = public.user_tenant_id());
-- For Vehicles
CREATE POLICY "Tenant Isolation - Vehicles" ON public.vehicles FOR ALL USING (tenant_id = public.user_tenant_id());
-- For Services
CREATE POLICY "Tenant Isolation - Services" ON public.services FOR ALL USING (tenant_id = public.user_tenant_id());
-- For Products
CREATE POLICY "Tenant Isolation - Products" ON public.products FOR ALL USING (tenant_id = public.user_tenant_id());
-- For Suppliers
CREATE POLICY "Tenant Isolation - Suppliers" ON public.suppliers FOR ALL USING (tenant_id = public.user_tenant_id());
-- For Stock Entries
CREATE POLICY "Tenant Isolation - Stock Entries" ON public.stock_entries FOR ALL USING (tenant_id = public.user_tenant_id());
-- For Service Orders
CREATE POLICY "Tenant Isolation - Service Orders" ON public.service_orders FOR ALL USING (tenant_id = public.user_tenant_id());
-- For Service Order Items
CREATE POLICY "Tenant Isolation - Service Order Items" ON public.service_order_items FOR ALL USING (tenant_id = public.user_tenant_id());
-- For Transactions
CREATE POLICY "Tenant Isolation - Transactions" ON public.transactions FOR ALL USING (tenant_id = public.user_tenant_id());
-- For Profiles (Users can see profiles of their own tenant, or if they are super admin)
CREATE POLICY "Tenant Isolation - Profiles" ON public.profiles FOR ALL USING (
  tenant_id = public.user_tenant_id() OR role = 'super_admin'
);
