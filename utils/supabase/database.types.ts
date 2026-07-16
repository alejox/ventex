export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      appointments: {
        Row: {
          appointment_date: string
          created_at: string | null
          customer_id: string | null
          description: string | null
          end_time: string
          id: string
          notes: string | null
          service_id: string | null
          service_type: string | null
          staff_id: string | null
          start_time: string
          status: string | null
          title: string
          user_id: string
          vehicle_id: string | null
          vehicle_model: string | null
          vehicle_plate: string | null
        }
        Insert: {
          appointment_date: string
          created_at?: string | null
          customer_id?: string | null
          description?: string | null
          end_time: string
          id?: string
          notes?: string | null
          service_id?: string | null
          service_type?: string | null
          staff_id?: string | null
          start_time: string
          status?: string | null
          title: string
          user_id?: string
          vehicle_id?: string | null
          vehicle_model?: string | null
          vehicle_plate?: string | null
        }
        Update: {
          appointment_date?: string
          created_at?: string | null
          customer_id?: string | null
          description?: string | null
          end_time?: string
          id?: string
          notes?: string | null
          service_id?: string | null
          service_type?: string | null
          staff_id?: string | null
          start_time?: string
          status?: string | null
          title?: string
          user_id?: string
          vehicle_id?: string | null
          vehicle_model?: string | null
          vehicle_plate?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          user_id?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      client_licenses: {
        Row: {
          activated_at: string | null
          created_at: string
          period_end: string | null
          period_start: string | null
          reseller_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          activated_at?: string | null
          created_at?: string
          period_end?: string | null
          period_start?: string | null
          reseller_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          activated_at?: string | null
          created_at?: string
          period_end?: string | null
          period_start?: string | null
          reseller_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_licenses_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_licenses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_packs: {
        Row: {
          bonus_credits: number
          created_at: string
          credits: number
          id: string
          is_active: boolean
          name: string
          plan_id: string
          price: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          bonus_credits?: number
          created_at?: string
          credits: number
          id?: string
          is_active?: boolean
          name: string
          plan_id: string
          price?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          bonus_credits?: number
          created_at?: string
          credits?: number
          id?: string
          is_active?: boolean
          name?: string
          plan_id?: string
          price?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_packs_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string | null
          doc_type: string | null
          email: string | null
          full_name: string
          id: string
          identification: string | null
          phone: string | null
          tax_exempt: boolean | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          doc_type?: string | null
          email?: string | null
          full_name: string
          id?: string
          identification?: string | null
          phone?: string | null
          tax_exempt?: boolean | null
          user_id?: string
        }
        Update: {
          created_at?: string | null
          doc_type?: string | null
          email?: string | null
          full_name?: string
          id?: string
          identification?: string | null
          phone?: string | null
          tax_exempt?: boolean | null
          user_id?: string
        }
        Relationships: []
      }
      distributors: {
        Row: {
          address: string | null
          business_name: string
          contact_name: string | null
          created_at: string | null
          doc_type: string | null
          dv: string | null
          email: string | null
          id: string
          phone: string | null
          rfc_rut: string | null
          status: string | null
          user_id: string
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          business_name: string
          contact_name?: string | null
          created_at?: string | null
          doc_type?: string | null
          dv?: string | null
          email?: string | null
          id?: string
          phone?: string | null
          rfc_rut?: string | null
          status?: string | null
          user_id?: string
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          business_name?: string
          contact_name?: string | null
          created_at?: string | null
          doc_type?: string | null
          dv?: string | null
          email?: string | null
          id?: string
          phone?: string | null
          rfc_rut?: string | null
          status?: string | null
          user_id?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          description: string
          expense_date: string
          id: string
          user_id: string
        }
        Insert: {
          amount: number
          category?: string | null
          created_at?: string
          description: string
          expense_date?: string
          id?: string
          user_id?: string
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          description?: string
          expense_date?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      inventory_movements: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          product_id: string
          quantity: number
          reference_id: string | null
          reference_type: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          product_id: string
          quantity: number
          reference_id?: string | null
          reference_type?: string | null
          type: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          product_id?: string
          quantity?: number
          reference_id?: string | null
          reference_type?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          created_at: string
          description: string
          id: string
          invoice_id: string
          line_total: number
          product_id: string | null
          quantity: number
          service_id: string | null
          unit_price: number
          user_id: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          line_total?: number
          product_id?: string | null
          quantity?: number
          service_id?: string | null
          unit_price?: number
          user_id?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          line_total?: number
          product_id?: string | null
          quantity?: number
          service_id?: string | null
          unit_price?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          customer_id: string | null
          discount_amount: number
          distributor_id: string | null
          due_date: string | null
          id: string
          invoice_number: number
          issue_date: string
          notes: string | null
          status: string
          subtotal: number
          supplier_invoice_number: string | null
          tax_amount: number
          tax_rate: number
          total: number
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          discount_amount?: number
          distributor_id?: string | null
          due_date?: string | null
          id?: string
          invoice_number?: number
          issue_date?: string
          notes?: string | null
          status?: string
          subtotal?: number
          supplier_invoice_number?: string | null
          tax_amount?: number
          tax_rate?: number
          total?: number
          type?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          discount_amount?: number
          distributor_id?: string | null
          due_date?: string | null
          id?: string
          invoice_number?: number
          issue_date?: string
          notes?: string | null
          status?: string
          subtotal?: number
          supplier_invoice_number?: string | null
          tax_amount?: number
          tax_rate?: number
          total?: number
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_periods: {
        Row: {
          created_at: string
          credits: number
          id: string
          is_active: boolean
          months: number
          name: string
          plan_id: string
          price: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          credits: number
          id?: string
          is_active?: boolean
          months: number
          name: string
          plan_id: string
          price?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          credits?: number
          id?: string
          is_active?: boolean
          months?: number
          name?: string
          plan_id?: string
          price?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_periods_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          annual_charged_months: number
          created_at: string
          discount_percent: number
          id: string
          is_active: boolean
          max_collaborators: number
          max_monthly_sales: number | null
          name: string
          price: number
          price_yearly: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          annual_charged_months?: number
          created_at?: string
          discount_percent?: number
          id: string
          is_active?: boolean
          max_collaborators?: number
          max_monthly_sales?: number | null
          name: string
          price?: number
          price_yearly?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          annual_charged_months?: number
          created_at?: string
          discount_percent?: number
          id?: string
          is_active?: boolean
          max_collaborators?: number
          max_monthly_sales?: number | null
          name?: string
          price?: number
          price_yearly?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          category_id: string | null
          commission_type: string | null
          commission_value: number | null
          created_at: string
          distributor_id: string | null
          has_commission: boolean
          icon: string | null
          id: string
          image_url: string | null
          minimum_stock: number
          name: string
          parent_product_id: string | null
          price: number
          purchase_price: number
          sku: string
          status: string | null
          stock_level: number
          unit: string
          units_per_package: number
          updated_at: string
          user_id: string
        }
        Insert: {
          category_id?: string | null
          commission_type?: string | null
          commission_value?: number | null
          created_at?: string
          distributor_id?: string | null
          has_commission?: boolean
          icon?: string | null
          id?: string
          image_url?: string | null
          minimum_stock?: number
          name: string
          parent_product_id?: string | null
          price?: number
          purchase_price?: number
          sku: string
          status?: string | null
          stock_level?: number
          unit?: string
          units_per_package?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          category_id?: string | null
          commission_type?: string | null
          commission_value?: number | null
          created_at?: string
          distributor_id?: string | null
          has_commission?: boolean
          icon?: string | null
          id?: string
          image_url?: string | null
          minimum_stock?: number
          name?: string
          parent_product_id?: string | null
          price?: number
          purchase_price?: number
          sku?: string
          status?: string | null
          stock_level?: number
          unit?: string
          units_per_package?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_parent_product_id_fkey"
            columns: ["parent_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          business_key: string | null
          business_name: string | null
          business_type: string | null
          created_at: string
          full_name: string | null
          id: string
          is_reseller: boolean
          is_super_admin: boolean
          is_worker: boolean | null
          modules: Json
          owner_id: string | null
          reseller_id: string | null
          staff_id: string | null
          updated_at: string
          worker_permissions: Json | null
          worker_role: string | null
          worker_username: string | null
          workspace_id: string | null
        }
        Insert: {
          business_key?: string | null
          business_name?: string | null
          business_type?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          is_reseller?: boolean
          is_super_admin?: boolean
          is_worker?: boolean | null
          modules?: Json
          owner_id?: string | null
          reseller_id?: string | null
          staff_id?: string | null
          updated_at?: string
          worker_permissions?: Json | null
          worker_role?: string | null
          worker_username?: string | null
          workspace_id?: string | null
        }
        Update: {
          business_key?: string | null
          business_name?: string | null
          business_type?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_reseller?: boolean
          is_super_admin?: boolean
          is_worker?: boolean | null
          modules?: Json
          owner_id?: string | null
          reseller_id?: string | null
          staff_id?: string | null
          updated_at?: string
          worker_permissions?: Json | null
          worker_role?: string | null
          worker_username?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reseller_credits: {
        Row: {
          client_id: string | null
          created_at: string
          created_by: string | null
          delta: number
          id: string
          note: string | null
          plan_id: string
          reason: string
          reseller_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          delta: number
          id?: string
          note?: string | null
          plan_id: string
          reason: string
          reseller_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          delta?: number
          id?: string
          note?: string | null
          plan_id?: string
          reason?: string
          reseller_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reseller_credits_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reseller_credits_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reseller_credits_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          created_at: string
          id: string
          line_total: number
          product_id: string | null
          product_name: string
          quantity: number
          sale_id: string
          service_id: string | null
          sku: string | null
          staff_id: string | null
          unit_price: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          line_total: number
          product_id?: string | null
          product_name: string
          quantity: number
          sale_id: string
          service_id?: string | null
          sku?: string | null
          staff_id?: string | null
          unit_price: number
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          line_total?: number
          product_id?: string | null
          product_name?: string
          quantity?: number
          sale_id?: string
          service_id?: string | null
          sku?: string | null
          staff_id?: string | null
          unit_price?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          created_at: string
          customer_id: string | null
          discount_amount: number
          id: string
          payment_method: string
          sale_number: number
          shift_id: string | null
          staff_id: string | null
          status: string
          subtotal: number
          tax_amount: number
          tax_rate: number
          total: number
          user_id: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          discount_amount?: number
          id?: string
          payment_method?: string
          sale_number?: number
          shift_id?: string | null
          staff_id?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
          user_id?: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          discount_amount?: number
          id?: string
          payment_method?: string
          sale_number?: number
          shift_id?: string | null
          staff_id?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          closed_at: string | null
          closing_cash: number | null
          difference: number | null
          expected_cash: number | null
          id: string
          notes: string | null
          opened_at: string
          opening_cash: number
          sales_count: number | null
          sales_total: number | null
          status: string
          totals_by_method: Json | null
          user_id: string
          worker_id: string
        }
        Insert: {
          closed_at?: string | null
          closing_cash?: number | null
          difference?: number | null
          expected_cash?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opening_cash?: number
          sales_count?: number | null
          sales_total?: number | null
          status?: string
          totals_by_method?: Json | null
          user_id?: string
          worker_id?: string
        }
        Update: {
          closed_at?: string | null
          closing_cash?: number | null
          difference?: number | null
          expected_cash?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opening_cash?: number
          sales_count?: number | null
          sales_total?: number | null
          status?: string
          totals_by_method?: Json | null
          user_id?: string
          worker_id?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          commission_type: string | null
          commission_value: number | null
          created_at: string
          description: string | null
          duration_minutes: number
          has_commission: boolean
          icon: string | null
          id: string
          name: string
          price: number
          status: string
          user_id: string
        }
        Insert: {
          commission_type?: string | null
          commission_value?: number | null
          created_at?: string
          description?: string | null
          duration_minutes?: number
          has_commission?: boolean
          icon?: string | null
          id?: string
          name: string
          price?: number
          status?: string
          user_id?: string
        }
        Update: {
          commission_type?: string | null
          commission_value?: number | null
          created_at?: string
          description?: string | null
          duration_minutes?: number
          has_commission?: boolean
          icon?: string | null
          id?: string
          name?: string
          price?: number
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          business_profile: Json | null
          created_at: string
          currency: string
          id: string
          tax_rate: number
          updated_at: string
          user_id: string
        }
        Insert: {
          business_profile?: Json | null
          created_at?: string
          currency?: string
          id?: string
          tax_rate?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          business_profile?: Json | null
          created_at?: string
          currency?: string
          id?: string
          tax_rate?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      staff: {
        Row: {
          allowed_branches: string[]
          auth_user_id: string | null
          can_login: boolean
          commission_mode: string
          commission_rate: number
          commission_type: string
          created_at: string
          email: string | null
          fixed_amount_commission: number | null
          full_name: string
          id: string
          is_active: boolean
          is_admin: boolean
          is_login_blocked: boolean
          permission_preset: string
          permissions: Json
          phone: string | null
          pos_pin_hash: string | null
          primary_branch_id: string | null
          product_rate_pct: number | null
          role: string | null
          status: string
          user_id: string
          username: string | null
        }
        Insert: {
          allowed_branches?: string[]
          auth_user_id?: string | null
          can_login?: boolean
          commission_mode?: string
          commission_rate?: number
          commission_type?: string
          created_at?: string
          email?: string | null
          fixed_amount_commission?: number | null
          full_name: string
          id?: string
          is_active?: boolean
          is_admin?: boolean
          is_login_blocked?: boolean
          permission_preset?: string
          permissions?: Json
          phone?: string | null
          pos_pin_hash?: string | null
          primary_branch_id?: string | null
          product_rate_pct?: number | null
          role?: string | null
          status?: string
          user_id?: string
          username?: string | null
        }
        Update: {
          allowed_branches?: string[]
          auth_user_id?: string | null
          can_login?: boolean
          commission_mode?: string
          commission_rate?: number
          commission_type?: string
          created_at?: string
          email?: string | null
          fixed_amount_commission?: number | null
          full_name?: string
          id?: string
          is_active?: boolean
          is_admin?: boolean
          is_login_blocked?: boolean
          permission_preset?: string
          permissions?: Json
          phone?: string | null
          pos_pin_hash?: string | null
          primary_branch_id?: string | null
          product_rate_pct?: number | null
          role?: string | null
          status?: string
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      staff_audit_log: {
        Row: {
          action: string
          changed_by: string
          created_at: string
          id: string
          new_values: Json | null
          old_values: Json | null
          staff_id: string | null
          tenant_id: string
        }
        Insert: {
          action: string
          changed_by: string
          created_at?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          staff_id?: string | null
          tenant_id: string
        }
        Update: {
          action?: string
          changed_by?: string
          created_at?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          staff_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_audit_log_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          id: string
          plan_id: string
          started_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan_id?: string
          started_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan_id?: string
          started_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          color: string | null
          created_at: string
          customer_id: string | null
          id: string
          make_model: string | null
          notes: string | null
          plate: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          make_model?: string | null
          notes?: string | null
          plate: string
          user_id?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          make_model?: string | null
          notes?: string | null
          plate?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_apply_credit_pack: {
        Args: { p_pack_id: string; p_reseller_id: string }
        Returns: undefined
      }
      admin_companies: {
        Args: never
        Returns: {
          business_name: string
          created_at: string
          email: string
          full_name: string
          is_reseller: boolean
          is_super_admin: boolean
          license_status: string
          monthly_sales: number
          period_end: string
          plan_id: string
          plan_name: string
          reseller_name: string
          staff_count: number
          status: string
          total_sales: number
          user_id: string
        }[]
      }
      admin_credit_movements: {
        Args: { p_limit?: number }
        Returns: {
          client_name: string
          created_at: string
          delta: number
          id: string
          note: string
          plan_id: string
          reason: string
          reseller_email: string
          reseller_id: string
          reseller_name: string
        }[]
      }
      admin_delete_credit_pack: { Args: { p_id: string }; Returns: undefined }
      admin_delete_plan_period: { Args: { p_id: string }; Returns: undefined }
      admin_grant_credits: {
        Args: {
          p_amount: number
          p_note: string
          p_plan_id: string
          p_reseller_id: string
        }
        Returns: undefined
      }
      admin_recharge_company: {
        Args: { p_months: number; p_user_id: string }
        Returns: Json
      }
      admin_resellers: {
        Args: never
        Returns: {
          balances: Json
          business_name: string
          clients_active: number
          clients_total: number
          created_at: string
          email: string
          full_name: string
          user_id: string
        }[]
      }
      admin_save_credit_pack: {
        Args: {
          p_bonus_credits: number
          p_credits: number
          p_id: string
          p_is_active: boolean
          p_name: string
          p_plan_id: string
          p_price: number
        }
        Returns: string
      }
      admin_save_plan: {
        Args: {
          p_annual_charged_months: number
          p_id: string
          p_is_active: boolean
          p_max_collaborators: number
          p_max_monthly_sales: number
          p_name: string
          p_price: number
          p_sort_order: number
        }
        Returns: string
      }
      admin_save_plan_period: {
        Args: {
          p_credits: number
          p_id: string
          p_is_active: boolean
          p_months: number
          p_name: string
          p_plan_id: string
          p_price: number
          p_sort_order: number
        }
        Returns: string
      }
      admin_set_plan: {
        Args: { p_plan_id: string; p_status: string; p_user_id: string }
        Returns: undefined
      }
      admin_set_reseller_by_email: {
        Args: { p_email: string; p_value: boolean }
        Returns: string
      }
      admin_stats: { Args: never; Returns: Json }
      admin_update_plan: {
        Args: {
          p_discount_percent: number
          p_id: string
          p_max_collaborators: number
          p_max_monthly_sales: number
          p_name: string
          p_price: number
          p_price_yearly: number
        }
        Returns: undefined
      }
      assert_monthly_sales_limit: {
        Args: { p_add: number; p_uid: string }
        Returns: undefined
      }
      close_shift: {
        Args: { p_closing_cash: number; p_notes?: string; p_shift_id?: string }
        Returns: Json
      }
      current_shift: { Args: never; Returns: Json }
      open_shift: { Args: { p_opening_cash: number }; Returns: Json }
      create_sale: {
        Args: {
          p_customer_id: string
          p_discount_amount: number
          p_items: Json
          p_payment_method: string
          p_staff_id?: string
        }
        Returns: string
      }
      current_tenant: { Args: never; Returns: string }
      deactivate_worker: { Args: { p_worker_id: string }; Returns: undefined }
      ensure_license_current: { Args: never; Returns: Json }
      generate_business_key: { Args: never; Returns: string }
      get_effective_user_id: { Args: never; Returns: string }
      increment_stock: {
        Args: { p_product_id: string; p_quantity: number }
        Returns: undefined
      }
      is_reseller: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      is_tenant_owner: { Args: never; Returns: boolean }
      my_subscription: { Args: never; Returns: Json }
      reseller_clients: {
        Args: never
        Returns: {
          activated_at: string
          business_name: string
          created_at: string
          email: string
          full_name: string
          license_status: string
          period_end: string
          plan_id: string
          plan_name: string
          user_id: string
        }[]
      }
      reseller_credit_balance: {
        Args: { p_plan: string; p_reseller: string }
        Returns: number
      }
      reseller_credit_balances: { Args: { p_reseller: string }; Returns: Json }
      reseller_recharge_client: {
        Args: { p_period_id: string; p_user_id: string }
        Returns: Json
      }
      reseller_set_client_status: {
        Args: { p_action: string; p_user_id: string }
        Returns: undefined
      }
      reseller_stats: { Args: never; Returns: Json }
      staff_can: { Args: { section: string }; Returns: boolean }
      staff_can_action: {
        Args: { action?: string; section: string }
        Returns: boolean
      }
      staff_login: {
        Args: { p_business_key: string; p_username: string }
        Returns: string
      }
      staff_login_email: {
        Args: { p_business_email: string; p_username: string }
        Returns: string
      }
      worker_login: {
        Args: { p_business_key: string; p_username: string }
        Returns: string
      }
      workspace_context: { Args: never; Returns: Json }
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
