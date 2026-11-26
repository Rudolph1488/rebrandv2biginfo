export type OrgRole = 'owner' | 'admin' | 'manager' | 'producer' | 'viewer';

export interface OrgPermissions {
  orders: boolean;
  calendar?: boolean;
  production?: boolean;
  clients: boolean;
  products: boolean;
  warehouses?: boolean;
  view_cost_price: boolean;
  cashflow: boolean;
  settings: boolean;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  is_super_admin: boolean;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string;
  currency: string;
  onboarding_completed: boolean;
  dtf_settings?: {
    roll_width_cm?: number;
    price_per_meter?: number;
    gap_cm?: number;
    press_cost_per_print?: number;
    markup_multiplier?: number;
  } | null;
  created_at: string;
}

export interface OrganizationMember {
  id: string;
  org_id: string;
  user_id: string;
  role: OrgRole;
  permissions: OrgPermissions;
  organization?: Organization;
}

export interface OrderStatus {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  color: string;
  position: number;
  is_final: boolean;
}

export interface ClientRecord {
  id: string;
  org_id: string;
  contact_person: string;
  company_name: string | null;
  phone: string | null;
  email: string | null;
  telegram_username: string | null;
  np_city_name: string | null;
  np_warehouse_name: string | null;
  notes: string | null;
  created_at: string;
}

export interface ProductRecord {
  id: string;
  org_id: string;
  name: string;
  sku: string | null;
  category: string | null;
  sale_price: number;
  cost_price?: number;
  unit: string;
  is_active: boolean;
  created_at: string;
}

export interface PrintOptionRecord {
  id: string;
  org_id: string;
  name: string;
  price: number;
  cost_price?: number;
  is_active: boolean;
  position: number;
  created_at: string;
}

export interface OrderRecord {
  id: string;
  org_id: string;
  order_number: number;
  status_id: string | null;
  client_id: string | null;
  warehouse_id?: string | null;
  stock_deducted?: boolean;
  source_name: string;
  total_amount: number;
  total_cost?: number;
  ttn: string | null;
  delivery_city: string | null;
  delivery_warehouse: string | null;
  notes: string | null;
  deadline?: string | null;
  production_status?: 'pending' | 'in_progress' | 'done';
  production_accepted_by?: string | null;
  production_accepted_at?: string | null;
  production_completed_at?: string | null;
  production_elapsed_seconds?: number;
  production_timer_started_at?: string | null;
  created_at: string;
  client?: { id: string; contact_person: string; phone: string | null } | null;
  status?: OrderStatus | null;
  order_items?: Array<{
    id: string;
    name: string;
    qty: number;
    attributes?: Record<string, string> | null;
  }>;
}

export interface CashflowRecord {
  id: string;
  org_id: string;
  type: 'income' | 'expense';
  amount: number;
  category: string;
  order_id: string | null;
  comment: string | null;
  occurred_at: string;
  created_at: string;
}

export interface WarehouseRecord {
  id: string;
  org_id: string;
  name: string;
  code: string | null;
  type: 'main' | 'production' | 'retail' | 'defect';
  address: string | null;
  is_default: boolean;
  allow_negative_stock: boolean;
  auto_deduct_status_id: string | null;
  min_stock_alert: boolean;
  is_active: boolean;
  created_at: string;
}

export interface WarehouseStockRecord {
  id: string;
  org_id: string;
  warehouse_id: string;
  product_id: string;
  quantity: number;
  reserved_qty: number;
  min_quantity: number;
  updated_at: string;
  product?: { id: string; name: string; sku: string | null; unit: string } | null;
  warehouse?: { id: string; name: string } | null;
}

export interface StockMovementRecord {
  id: string;
  org_id: string;
  doc_number: number;
  type: 'receipt' | 'write_off' | 'transfer' | 'order_deduction' | 'adjustment';
  warehouse_id: string;
  target_warehouse_id: string | null;
  product_id: string;
  quantity: number;
  unit_cost: number;
  comment: string | null;
  created_at: string;
  product?: { name: string; unit: string } | null;
  warehouse?: { name: string } | null;
  target_warehouse?: { name: string } | null;
}
