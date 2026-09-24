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
      billing_orders: {
        Row: {
          amount: number
          created_at: string
          currency: string
          epayco_ref: string | null
          epayco_status_code: string | null
          epayco_transaction_id: string | null
          error: string | null
          guest_email: string | null
          id: string
          method: string
          order_id: string
          paid_at: string | null
          payer_document: string | null
          payer_email: string | null
          payer_name: string | null
          payer_phone: string | null
          payment_method_type: string | null
          period_months: number
          period_name: string
          plan_id: string
          plan_period_id: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          epayco_ref?: string | null
          epayco_status_code?: string | null
          epayco_transaction_id?: string | null
          error?: string | null
          guest_email?: string | null
          id?: string
          method?: string
          order_id: string
          paid_at?: string | null
          payer_document?: string | null
          payer_email?: string | null
          payer_name?: string | null
          payer_phone?: string | null
          payment_method_type?: string | null
          period_months: number
          period_name: string
          plan_id: string
          plan_period_id: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          epayco_ref?: string | null
          epayco_status_code?: string | null
          epayco_transaction_id?: string | null
          error?: string | null
          guest_email?: string | null
          id?: string
          method?: string
          order_id?: string
          paid_at?: string | null
          payer_document?: string | null
          payer_email?: string | null
          payer_name?: string | null
          payer_phone?: string | null
          payment_method_type?: string | null
          period_months?: number
          period_name?: string
          plan_id?: string
          plan_period_id?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_orders_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_orders_plan_period_id_fkey"
            columns: ["plan_period_id"]
            isOneToOne: false
            referencedRelation: "plan_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      business_hours: {
        Row: {
          closes_at: string
          is_open: boolean
          opens_at: string
          user_id: string
          weekday: number
        }
        Insert: {
          closes_at?: string
          is_open?: boolean
          opens_at?: string
          user_id?: string
          weekday: number
        }
        Update: {
          closes_at?: string
          is_open?: boolean
          opens_at?: string
          user_id?: string
          weekday?: number
        }
        Relationships: []
      }
      business_sites: {
        Row: {
          about: string | null
          address: string | null
          booking_enabled: boolean
          created_at: string
          draft_config: Json
          facebook: string | null
          footer_note: string | null
          headline: string | null
          hero_focus_x: number
          hero_focus_y: number
          hero_image_url: string | null
          hero_overlay: number
          id: string
          instagram: string | null
          linkedin: string | null
          published: boolean
          published_config: Json | null
          site_copy: Json
          slot_interval_minutes: number
          slug: string
          telegram: string | null
          template: string
          theme_colors: Json
          tiktok: string | null
          timezone: string
          twitter: string | null
          updated_at: string
          user_id: string
          website: string | null
          whatsapp: string | null
          youtube: string | null
        }
        Insert: {
          about?: string | null
          address?: string | null
          booking_enabled?: boolean
          created_at?: string
          draft_config?: Json
          facebook?: string | null
          footer_note?: string | null
          headline?: string | null
          hero_focus_x?: number
          hero_focus_y?: number
          hero_image_url?: string | null
          hero_overlay?: number
          id?: string
          instagram?: string | null
          linkedin?: string | null
          published?: boolean
          published_config?: Json | null
          site_copy?: Json
          slot_interval_minutes?: number
          slug: string
          telegram?: string | null
          template?: string
          theme_colors?: Json
          tiktok?: string | null
          timezone?: string
          twitter?: string | null
          updated_at?: string
          user_id?: string
          website?: string | null
          whatsapp?: string | null
          youtube?: string | null
        }
        Update: {
          about?: string | null
          address?: string | null
          booking_enabled?: boolean
          created_at?: string
          draft_config?: Json
          facebook?: string | null
          footer_note?: string | null
          headline?: string | null
          hero_focus_x?: number
          hero_focus_y?: number
          hero_image_url?: string | null
          hero_overlay?: number
          id?: string
          instagram?: string | null
          linkedin?: string | null
          published?: boolean
          published_config?: Json | null
          site_copy?: Json
          slot_interval_minutes?: number
          slug?: string
          telegram?: string | null
          template?: string
          theme_colors?: Json
          tiktok?: string | null
          timezone?: string
          twitter?: string | null
          updated_at?: string
          user_id?: string
          website?: string | null
          whatsapp?: string | null
          youtube?: string | null
        }
        Relationships: []
      }
      cash_movements: {
        Row: {
          amount: number
          created_at: string
          id: string
          kind: string
          membership_id: string
          reason: string
          shift_id: string
          user_id: string
          worker_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          kind?: string
          membership_id: string
          reason: string
          shift_id: string
          user_id?: string
          worker_id?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          kind?: string
          membership_id?: string
          reason?: string
          shift_id?: string
          user_id?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_movements_shift_context_fkey"
            columns: ["shift_id", "user_id", "membership_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id", "user_id", "membership_id"]
          },
          {
            foreignKeyName: "cash_movements_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
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
      co_cities: {
        Row: {
          city: string
          department: string
          id: number
        }
        Insert: {
          city: string
          department: string
          id?: never
        }
        Update: {
          city?: string
          department?: string
          id?: never
        }
        Relationships: []
      }
      commission_settlements: {
        Row: {
          cash_movement_id: string | null
          created_at: string
          created_by: string | null
          expense_id: string | null
          id: string
          items_count: number
          paid_on: string
          payment_method: string
          period_from: string
          period_to: string
          staff_id: string
          status: string
          total_amount: number
          user_id: string
          voided_at: string | null
        }
        Insert: {
          cash_movement_id?: string | null
          created_at?: string
          created_by?: string | null
          expense_id?: string | null
          id?: string
          items_count: number
          paid_on?: string
          payment_method: string
          period_from: string
          period_to: string
          staff_id: string
          status?: string
          total_amount: number
          user_id?: string
          voided_at?: string | null
        }
        Update: {
          cash_movement_id?: string | null
          created_at?: string
          created_by?: string | null
          expense_id?: string | null
          id?: string
          items_count?: number
          paid_on?: string
          payment_method?: string
          period_from?: string
          period_to?: string
          staff_id?: string
          status?: string
          total_amount?: number
          user_id?: string
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_settlements_cash_movement_id_fkey"
            columns: ["cash_movement_id"]
            isOneToOne: false
            referencedRelation: "cash_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_settlements_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_settlements_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
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
      customer_payments: {
        Row: {
          amount: number
          created_at: string
          customer_id: string
          id: string
          notes: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          customer_id: string
          id?: string
          notes?: string | null
          user_id?: string
        }
        Update: {
          amount?: number
          created_at?: string
          customer_id?: string
          id?: string
          notes?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string | null
          credit_alert: boolean
          credit_alert_note: string | null
          credit_balance: number
          credit_limit: number | null
          doc_type: string | null
          email: string | null
          full_name: string
          haircut_count: number
          haircuts_since_reward: number
          id: string
          identification: string | null
          phone: string | null
          tax_exempt: boolean | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          credit_alert?: boolean
          credit_alert_note?: string | null
          credit_balance?: number
          credit_limit?: number | null
          doc_type?: string | null
          email?: string | null
          full_name: string
          haircut_count?: number
          haircuts_since_reward?: number
          id?: string
          identification?: string | null
          phone?: string | null
          tax_exempt?: boolean | null
          user_id?: string
        }
        Update: {
          created_at?: string | null
          credit_alert?: boolean
          credit_alert_note?: string | null
          credit_balance?: number
          credit_limit?: number | null
          doc_type?: string | null
          email?: string | null
          full_name?: string
          haircut_count?: number
          haircuts_since_reward?: number
          id?: string
          identification?: string | null
          phone?: string | null
          tax_exempt?: boolean | null
          user_id?: string
        }
        Relationships: []
      }
      deliveries: {
        Row: {
          address: string
          created_at: string
          delivery_person_id: string
          fee: number
          id: string
          notes: string | null
          sale_id: string
          status: string
          user_id: string
        }
        Insert: {
          address?: string
          created_at?: string
          delivery_person_id: string
          fee?: number
          id?: string
          notes?: string | null
          sale_id: string
          status?: string
          user_id?: string
        }
        Update: {
          address?: string
          created_at?: string
          delivery_person_id?: string
          fee?: number
          id?: string
          notes?: string | null
          sale_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_delivery_person_id_fkey"
            columns: ["delivery_person_id"]
            isOneToOne: false
            referencedRelation: "delivery_persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_persons: {
        Row: {
          created_at: string
          id: string
          name: string
          phone: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          phone: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          phone?: string
          user_id?: string
        }
        Relationships: []
      }
      distributors: {
        Row: {
          address: string | null
          business_name: string
          city: string | null
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
          city?: string | null
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
          city?: string | null
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
      expense_categories: {
        Row: {
          color: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          cash_movement_id: string | null
          category: string | null
          category_id: string | null
          commission_settlement_id: string | null
          created_at: string
          description: string
          expense_date: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          cash_movement_id?: string | null
          category?: string | null
          category_id?: string | null
          commission_settlement_id?: string | null
          created_at?: string
          description: string
          expense_date?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          amount?: number
          cash_movement_id?: string | null
          category?: string | null
          category_id?: string | null
          commission_settlement_id?: string | null
          created_at?: string
          description?: string
          expense_date?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_cash_movement_id_fkey"
            columns: ["cash_movement_id"]
            isOneToOne: false
            referencedRelation: "cash_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_commission_settlement_id_fkey"
            columns: ["commission_settlement_id"]
            isOneToOne: false
            referencedRelation: "commission_settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          created_at: string
          created_by: string | null
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
          created_by?: string | null
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
          created_by?: string | null
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
            foreignKeyName: "inventory_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
          package_price: number
          package_quantity: number
          product_id: string | null
          quantity: number
          service_id: string | null
          unit_price: number
          units_per_package: number
          user_id: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          line_total?: number
          package_price?: number
          package_quantity?: number
          product_id?: string | null
          quantity?: number
          service_id?: string | null
          unit_price?: number
          units_per_package?: number
          user_id?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          line_total?: number
          package_price?: number
          package_quantity?: number
          product_id?: string | null
          quantity?: number
          service_id?: string | null
          unit_price?: number
          units_per_package?: number
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
          created_by: string | null
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
          created_by?: string | null
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
          created_by?: string | null
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
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
      notifications: {
        Row: {
          body: string | null
          created_at: string
          data: Json
          id: string
          read_at: string | null
          severity: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          data?: Json
          id?: string
          read_at?: string | null
          severity?: string
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          data?: Json
          id?: string
          read_at?: string | null
          severity?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
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
          allows_fractions: boolean | null
          barcode: string | null
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
          open_price: boolean
          package_price: number | null
          price: number
          purchase_price: number
          sku: string
          status: string | null
          stock_level: number
          tracks_stock: boolean
          unit: string
          units_per_package: number
          updated_at: string
          user_id: string
        }
        Insert: {
          allows_fractions?: boolean | null
          barcode?: string | null
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
          open_price?: boolean
          package_price?: number | null
          price?: number
          purchase_price?: number
          sku: string
          status?: string | null
          stock_level?: number
          tracks_stock?: boolean
          unit?: string
          units_per_package?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          allows_fractions?: boolean | null
          barcode?: string | null
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
          open_price?: boolean
          package_price?: number | null
          price?: number
          purchase_price?: number
          sku?: string
          status?: string | null
          stock_level?: number
          tracks_stock?: boolean
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
        ]
      }
      profiles: {
        Row: {
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
          phone: string | null
          reseller_id: string | null
          staff_id: string | null
          updated_at: string
          worker_access_status: string | null
          worker_activated_at: string | null
          worker_invited_at: string | null
          worker_permissions: Json | null
          worker_role: string | null
          worker_suspended_at: string | null
          worker_username: string | null
          workspace_id: string | null
        }
        Insert: {
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
          phone?: string | null
          reseller_id?: string | null
          staff_id?: string | null
          updated_at?: string
          worker_access_status?: string | null
          worker_activated_at?: string | null
          worker_invited_at?: string | null
          worker_permissions?: Json | null
          worker_role?: string | null
          worker_suspended_at?: string | null
          worker_username?: string | null
          workspace_id?: string | null
        }
        Update: {
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
          phone?: string | null
          reseller_id?: string | null
          staff_id?: string | null
          updated_at?: string
          worker_access_status?: string | null
          worker_activated_at?: string | null
          worker_invited_at?: string | null
          worker_permissions?: Json | null
          worker_role?: string | null
          worker_suspended_at?: string | null
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
      promo_milestones: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          reward: string
          reward_kind: string
          reward_value: number | null
          threshold: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          reward: string
          reward_kind?: string
          reward_value?: number | null
          threshold: number
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          reward?: string
          reward_kind?: string
          reward_value?: number | null
          threshold?: number
          user_id?: string
        }
        Relationships: []
      }
      promo_redemptions: {
        Row: {
          customer_id: string
          discount_applied: number | null
          id: string
          milestone_id: string | null
          progress_before: number | null
          redeemed_at: string
          redeemed_by: string | null
          reward: string
          reward_kind: string | null
          reward_value: number | null
          rewarded_haircuts: number
          sale_id: string | null
          threshold: number
          user_id: string
        }
        Insert: {
          customer_id: string
          discount_applied?: number | null
          id?: string
          milestone_id?: string | null
          progress_before?: number | null
          redeemed_at?: string
          redeemed_by?: string | null
          reward: string
          reward_kind?: string | null
          reward_value?: number | null
          rewarded_haircuts?: number
          sale_id?: string | null
          threshold: number
          user_id?: string
        }
        Update: {
          customer_id?: string
          discount_applied?: number | null
          id?: string
          milestone_id?: string | null
          progress_before?: number | null
          redeemed_at?: string
          redeemed_by?: string | null
          reward?: string
          reward_kind?: string | null
          reward_value?: number | null
          rewarded_haircuts?: number
          sale_id?: string | null
          threshold?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_redemptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_redemptions_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "promo_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_redemptions_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          created_at: string
          id: string
          product_id: string | null
          product_name: string
          purchase_order_id: string
          quantity: number
          sku: string | null
          unit_price: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id?: string | null
          product_name: string
          purchase_order_id: string
          quantity: number
          sku?: string | null
          unit_price?: number
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string | null
          product_name?: string
          purchase_order_id?: string
          quantity?: number
          sku?: string | null
          unit_price?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          completed_at: string | null
          created_at: string
          distributor_id: string | null
          id: string
          invoice_id: string | null
          issued_at: string | null
          notes: string | null
          order_number: number
          received_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          distributor_id?: string | null
          id?: string
          invoice_id?: string | null
          issued_at?: string | null
          notes?: string | null
          order_number?: number
          received_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          distributor_id?: string | null
          id?: string
          invoice_id?: string | null
          issued_at?: string | null
          notes?: string | null
          order_number?: number
          received_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
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
          commission_amount: number
          commission_settlement_id: string | null
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
          unit_kind: string
          unit_price: number
          units_per_item: number
          user_id: string
        }
        Insert: {
          commission_amount?: number
          commission_settlement_id?: string | null
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
          unit_kind?: string
          unit_price: number
          units_per_item?: number
          user_id?: string
        }
        Update: {
          commission_amount?: number
          commission_settlement_id?: string | null
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
          unit_kind?: string
          unit_price?: number
          units_per_item?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_commission_settlement_id_fkey"
            columns: ["commission_settlement_id"]
            isOneToOne: false
            referencedRelation: "commission_settlements"
            referencedColumns: ["id"]
          },
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
      sale_payments: {
        Row: {
          amount: number
          card_method: string | null
          created_at: string
          id: string
          payment_method: string
          sale_id: string
          transfer_method: string | null
          user_id: string
        }
        Insert: {
          amount: number
          card_method?: string | null
          created_at?: string
          id?: string
          payment_method: string
          sale_id: string
          transfer_method?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          card_method?: string | null
          created_at?: string
          id?: string
          payment_method?: string
          sale_id?: string
          transfer_method?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_payments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          card_method: string | null
          client_sale_id: string | null
          created_at: string
          customer_id: string | null
          discount_amount: number
          id: string
          membership_id: string
          payment_method: string
          sale_number: number
          shift_id: string | null
          staff_id: string | null
          status: string
          subtotal: number
          tax_amount: number
          tax_rate: number
          total: number
          transfer_method: string | null
          user_id: string
        }
        Insert: {
          card_method?: string | null
          client_sale_id?: string | null
          created_at?: string
          customer_id?: string | null
          discount_amount?: number
          id?: string
          membership_id: string
          payment_method?: string
          sale_number?: number
          shift_id?: string | null
          staff_id?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
          transfer_method?: string | null
          user_id?: string
        }
        Update: {
          card_method?: string | null
          client_sale_id?: string | null
          created_at?: string
          customer_id?: string | null
          discount_amount?: number
          id?: string
          membership_id?: string
          payment_method?: string
          sale_number?: number
          shift_id?: string | null
          staff_id?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
          transfer_method?: string | null
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
            foreignKeyName: "sales_membership_fkey"
            columns: ["membership_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workspace_memberships"
            referencedColumns: ["id", "workspace_id"]
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
      school_access_links: {
        Row: {
          created_at: string
          expires_at: string
          guardian_customer_id: string | null
          id: string
          lesson_id: string | null
          purpose: string
          revoked_at: string | null
          student_id: string | null
          token_hash: string
          used_at: string | null
          user_id: string
          version: number
        }
        Insert: {
          created_at?: string
          expires_at: string
          guardian_customer_id?: string | null
          id?: string
          lesson_id?: string | null
          purpose: string
          revoked_at?: string | null
          student_id?: string | null
          token_hash: string
          used_at?: string | null
          user_id?: string
          version?: number
        }
        Update: {
          created_at?: string
          expires_at?: string
          guardian_customer_id?: string | null
          id?: string
          lesson_id?: string | null
          purpose?: string
          revoked_at?: string | null
          student_id?: string | null
          token_hash?: string
          used_at?: string | null
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "school_access_links_guardian_customer_id_fkey"
            columns: ["guardian_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_access_links_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "school_lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_access_links_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "school_students"
            referencedColumns: ["id"]
          },
        ]
      }
      school_class_credit_movements: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          enrollment_id: string
          id: string
          kind: string
          lesson_id: string | null
          reason: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          enrollment_id: string
          id?: string
          kind: string
          lesson_id?: string | null
          reason: string
          user_id?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          enrollment_id?: string
          id?: string
          kind?: string
          lesson_id?: string | null
          reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_class_credit_movements_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "school_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_class_credit_movements_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "school_lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      school_communication_log: {
        Row: {
          channel: string
          created_at: string
          created_by: string | null
          guardian_customer_id: string | null
          id: string
          message: string | null
          purpose: string
          recipient_name: string | null
          recipient_phone: string | null
          state: string
          student_id: string | null
          user_id: string
        }
        Insert: {
          channel?: string
          created_at?: string
          created_by?: string | null
          guardian_customer_id?: string | null
          id?: string
          message?: string | null
          purpose: string
          recipient_name?: string | null
          recipient_phone?: string | null
          state: string
          student_id?: string | null
          user_id?: string
        }
        Update: {
          channel?: string
          created_at?: string
          created_by?: string | null
          guardian_customer_id?: string | null
          id?: string
          message?: string | null
          purpose?: string
          recipient_name?: string | null
          recipient_phone?: string | null
          state?: string
          student_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_communication_log_guardian_customer_id_fkey"
            columns: ["guardian_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_communication_log_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "school_students"
            referencedColumns: ["id"]
          },
        ]
      }
      school_enrollments: {
        Row: {
          contracted_lessons: number
          created_at: string
          default_teacher_profile_id: string | null
          expiry_date: string | null
          id: string
          instrument: string
          lesson_plan_id: string
          payer_customer_id: string | null
          plan_name: string
          plan_price: number
          plan_validity_days: number
          policy_consume_on_unjustified_absence: boolean
          policy_expiry_extension_days: number
          policy_max_reschedules: number
          policy_min_advance_hours: number
          reschedule_count: number
          sale_id: string | null
          start_date: string
          status: string
          student_id: string
          user_id: string
        }
        Insert: {
          contracted_lessons: number
          created_at?: string
          default_teacher_profile_id?: string | null
          expiry_date?: string | null
          id?: string
          instrument: string
          lesson_plan_id: string
          payer_customer_id?: string | null
          plan_name: string
          plan_price?: number
          plan_validity_days?: number
          policy_consume_on_unjustified_absence?: boolean
          policy_expiry_extension_days?: number
          policy_max_reschedules?: number
          policy_min_advance_hours?: number
          reschedule_count?: number
          sale_id?: string | null
          start_date?: string
          status?: string
          student_id: string
          user_id?: string
        }
        Update: {
          contracted_lessons?: number
          created_at?: string
          default_teacher_profile_id?: string | null
          expiry_date?: string | null
          id?: string
          instrument?: string
          lesson_plan_id?: string
          payer_customer_id?: string | null
          plan_name?: string
          plan_price?: number
          plan_validity_days?: number
          policy_consume_on_unjustified_absence?: boolean
          policy_expiry_extension_days?: number
          policy_max_reschedules?: number
          policy_min_advance_hours?: number
          reschedule_count?: number
          sale_id?: string | null
          start_date?: string
          status?: string
          student_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_enrollments_default_teacher_profile_id_fkey"
            columns: ["default_teacher_profile_id"]
            isOneToOne: false
            referencedRelation: "school_teacher_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_enrollments_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "school_lesson_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_enrollments_payer_customer_id_fkey"
            columns: ["payer_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_enrollments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "school_students"
            referencedColumns: ["id"]
          },
        ]
      }
      school_lesson_participants: {
        Row: {
          attendance_status: string
          created_at: string
          enrollment_id: string
          id: string
          lesson_id: string
          linked_participant_id: string | null
          observation: string | null
          recorded_at: string | null
          recorded_by: string | null
          user_id: string
        }
        Insert: {
          attendance_status?: string
          created_at?: string
          enrollment_id: string
          id?: string
          lesson_id: string
          linked_participant_id?: string | null
          observation?: string | null
          recorded_at?: string | null
          recorded_by?: string | null
          user_id?: string
        }
        Update: {
          attendance_status?: string
          created_at?: string
          enrollment_id?: string
          id?: string
          lesson_id?: string
          linked_participant_id?: string | null
          observation?: string | null
          recorded_at?: string | null
          recorded_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_lesson_participants_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "school_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_lesson_participants_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "school_lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_lesson_participants_linked_participant_id_fkey"
            columns: ["linked_participant_id"]
            isOneToOne: false
            referencedRelation: "school_lesson_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      school_lesson_plans: {
        Row: {
          created_at: string
          duration_minutes: number
          id: string
          is_active: boolean
          lesson_count: number
          max_group_size: number
          name: string
          service_id: string
          user_id: string
          validity_days: number
        }
        Insert: {
          created_at?: string
          duration_minutes: number
          id?: string
          is_active?: boolean
          lesson_count: number
          max_group_size?: number
          name: string
          service_id: string
          user_id?: string
          validity_days?: number
        }
        Update: {
          created_at?: string
          duration_minutes?: number
          id?: string
          is_active?: boolean
          lesson_count?: number
          max_group_size?: number
          name?: string
          service_id?: string
          user_id?: string
          validity_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "school_lesson_plans_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      school_lessons: {
        Row: {
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          capacity: number
          closed_at: string | null
          closed_by: string | null
          closed_via: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          confirmed_version: number | null
          confirmed_via: string | null
          created_at: string
          end_at: string
          id: string
          instrument: string
          rescheduled_to_id: string | null
          room: string | null
          start_at: string
          status: string
          teacher_profile_id: string
          user_id: string
          version: number
        }
        Insert: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          capacity: number
          closed_at?: string | null
          closed_by?: string | null
          closed_via?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          confirmed_version?: number | null
          confirmed_via?: string | null
          created_at?: string
          end_at: string
          id?: string
          instrument: string
          rescheduled_to_id?: string | null
          room?: string | null
          start_at: string
          status?: string
          teacher_profile_id: string
          user_id?: string
          version?: number
        }
        Update: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          capacity?: number
          closed_at?: string | null
          closed_by?: string | null
          closed_via?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          confirmed_version?: number | null
          confirmed_via?: string | null
          created_at?: string
          end_at?: string
          id?: string
          instrument?: string
          rescheduled_to_id?: string | null
          room?: string | null
          start_at?: string
          status?: string
          teacher_profile_id?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "school_lessons_rescheduled_to_id_fkey"
            columns: ["rescheduled_to_id"]
            isOneToOne: false
            referencedRelation: "school_lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_lessons_teacher_profile_id_fkey"
            columns: ["teacher_profile_id"]
            isOneToOne: false
            referencedRelation: "school_teacher_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      school_material_recipients: {
        Row: {
          created_at: string
          id: string
          material_id: string
          student_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          material_id: string
          student_id: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          material_id?: string
          student_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_material_recipients_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "school_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_material_recipients_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "school_students"
            referencedColumns: ["id"]
          },
        ]
      }
      school_materials: {
        Row: {
          author_staff_id: string | null
          created_at: string
          external_url: string | null
          file_name: string | null
          file_path: string | null
          file_size: number | null
          id: string
          instructions: string | null
          kind: string
          lesson_id: string | null
          mime_type: string | null
          title: string
          uploaded_by: string | null
          user_id: string
        }
        Insert: {
          author_staff_id?: string | null
          created_at?: string
          external_url?: string | null
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          instructions?: string | null
          kind: string
          lesson_id?: string | null
          mime_type?: string | null
          title: string
          uploaded_by?: string | null
          user_id?: string
        }
        Update: {
          author_staff_id?: string | null
          created_at?: string
          external_url?: string | null
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          instructions?: string | null
          kind?: string
          lesson_id?: string | null
          mime_type?: string | null
          title?: string
          uploaded_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_materials_author_staff_id_fkey"
            columns: ["author_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_materials_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "school_lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      school_reschedule_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          enrollment_id: string
          id: string
          lesson_id: string | null
          new_end_at: string | null
          new_start_at: string | null
          participant_id: string | null
          reason: string
          requested_by: string | null
          requester_kind: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          enrollment_id: string
          id?: string
          lesson_id?: string | null
          new_end_at?: string | null
          new_start_at?: string | null
          participant_id?: string | null
          reason: string
          requested_by?: string | null
          requester_kind: string
          status?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          enrollment_id?: string
          id?: string
          lesson_id?: string | null
          new_end_at?: string | null
          new_start_at?: string | null
          participant_id?: string | null
          reason?: string
          requested_by?: string | null
          requester_kind?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_reschedule_requests_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "school_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_reschedule_requests_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "school_lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_reschedule_requests_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "school_lesson_participants"
            referencedColumns: ["id"]
          },
        ]
      }
      school_settings: {
        Row: {
          created_at: string
          id: string
          instruments: string[]
          message_templates: Json
          policy: Json
          rooms: string[]
          storage_quota_bytes: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          instruments?: string[]
          message_templates?: Json
          policy?: Json
          rooms?: string[]
          storage_quota_bytes?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          instruments?: string[]
          message_templates?: Json
          policy?: Json
          rooms?: string[]
          storage_quota_bytes?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      school_student_guardians: {
        Row: {
          created_at: string
          customer_id: string
          email: string | null
          id: string
          is_notice_receiver: boolean
          notices_enabled: boolean
          phone: string | null
          relationship: string | null
          student_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          email?: string | null
          id?: string
          is_notice_receiver?: boolean
          notices_enabled?: boolean
          phone?: string | null
          relationship?: string | null
          student_id: string
          user_id?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          email?: string | null
          id?: string
          is_notice_receiver?: boolean
          notices_enabled?: boolean
          phone?: string | null
          relationship?: string | null
          student_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_student_guardians_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_student_guardians_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "school_students"
            referencedColumns: ["id"]
          },
        ]
      }
      school_students: {
        Row: {
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          customer_id: string
          id: string
          instrument: string
          is_minor: boolean
          level: string | null
          notes: string | null
          status: string
          user_id: string
        }
        Insert: {
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          customer_id: string
          id?: string
          instrument: string
          is_minor?: boolean
          level?: string | null
          notes?: string | null
          status?: string
          user_id?: string
        }
        Update: {
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          instrument?: string
          is_minor?: boolean
          level?: string | null
          notes?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_students_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      school_teacher_availability: {
        Row: {
          created_at: string
          end_time: string
          id: string
          start_time: string
          teacher_profile_id: string
          user_id: string
          weekday: number
        }
        Insert: {
          created_at?: string
          end_time: string
          id?: string
          start_time: string
          teacher_profile_id: string
          user_id?: string
          weekday: number
        }
        Update: {
          created_at?: string
          end_time?: string
          id?: string
          start_time?: string
          teacher_profile_id?: string
          user_id?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "school_teacher_availability_teacher_profile_id_fkey"
            columns: ["teacher_profile_id"]
            isOneToOne: false
            referencedRelation: "school_teacher_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      school_teacher_blocked_dates: {
        Row: {
          blocked_date: string
          created_at: string
          id: string
          reason: string | null
          teacher_profile_id: string
          user_id: string
        }
        Insert: {
          blocked_date: string
          created_at?: string
          id?: string
          reason?: string | null
          teacher_profile_id: string
          user_id?: string
        }
        Update: {
          blocked_date?: string
          created_at?: string
          id?: string
          reason?: string | null
          teacher_profile_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_teacher_blocked_dates_teacher_profile_id_fkey"
            columns: ["teacher_profile_id"]
            isOneToOne: false
            referencedRelation: "school_teacher_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      school_teacher_profiles: {
        Row: {
          bio: string | null
          created_at: string
          id: string
          instruments: string[]
          staff_id: string
          user_id: string
        }
        Insert: {
          bio?: string | null
          created_at?: string
          id?: string
          instruments?: string[]
          staff_id: string
          user_id?: string
        }
        Update: {
          bio?: string | null
          created_at?: string
          id?: string
          instruments?: string[]
          staff_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_teacher_profiles_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: true
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          category_id: string | null
          commission_type: string | null
          commission_value: number | null
          created_at: string
          description: string | null
          duration_minutes: number
          has_commission: boolean
          icon: string | null
          id: string
          image_url: string | null
          name: string
          price: number
          status: string
          user_id: string
        }
        Insert: {
          category_id?: string | null
          commission_type?: string | null
          commission_value?: number | null
          created_at?: string
          description?: string | null
          duration_minutes?: number
          has_commission?: boolean
          icon?: string | null
          id?: string
          image_url?: string | null
          name: string
          price?: number
          status?: string
          user_id?: string
        }
        Update: {
          category_id?: string | null
          commission_type?: string | null
          commission_value?: number | null
          created_at?: string
          description?: string | null
          duration_minutes?: number
          has_commission?: boolean
          icon?: string | null
          id?: string
          image_url?: string | null
          name?: string
          price?: number
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          accepts_card: boolean
          accepts_transfer: boolean
          allow_oversell: boolean
          business_profile: Json | null
          card_methods_enabled: Json
          created_at: string
          currency: string
          id: string
          include_tax: boolean
          promo_enabled: boolean
          promo_message: string | null
          promo_service_ids: string[]
          tax_rate: number
          transfer_methods_enabled: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          accepts_card?: boolean
          accepts_transfer?: boolean
          allow_oversell?: boolean
          business_profile?: Json | null
          card_methods_enabled?: Json
          created_at?: string
          currency?: string
          id?: string
          include_tax?: boolean
          promo_enabled?: boolean
          promo_message?: string | null
          promo_service_ids?: string[]
          tax_rate?: number
          transfer_methods_enabled?: Json
          updated_at?: string
          user_id?: string
        }
        Update: {
          accepts_card?: boolean
          accepts_transfer?: boolean
          allow_oversell?: boolean
          business_profile?: Json | null
          card_methods_enabled?: Json
          created_at?: string
          currency?: string
          id?: string
          include_tax?: boolean
          promo_enabled?: boolean
          promo_message?: string | null
          promo_service_ids?: string[]
          tax_rate?: number
          transfer_methods_enabled?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      shifts: {
        Row: {
          closed_at: string | null
          closing_cash: number | null
          difference: number | null
          expected_cash: number | null
          id: string
          membership_id: string
          notes: string | null
          opened_at: string
          opening_cash: number
          sales_count: number | null
          sales_total: number | null
          status: string
          totals_by_method: Json | null
          user_id: string
          withdrawals_total: number | null
          worker_id: string
        }
        Insert: {
          closed_at?: string | null
          closing_cash?: number | null
          difference?: number | null
          expected_cash?: number | null
          id?: string
          membership_id: string
          notes?: string | null
          opened_at?: string
          opening_cash?: number
          sales_count?: number | null
          sales_total?: number | null
          status?: string
          totals_by_method?: Json | null
          user_id?: string
          withdrawals_total?: number | null
          worker_id?: string
        }
        Update: {
          closed_at?: string | null
          closing_cash?: number | null
          difference?: number | null
          expected_cash?: number | null
          id?: string
          membership_id?: string
          notes?: string | null
          opened_at?: string
          opening_cash?: number
          sales_count?: number | null
          sales_total?: number | null
          status?: string
          totals_by_method?: Json | null
          user_id?: string
          withdrawals_total?: number | null
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_membership_fkey"
            columns: ["membership_id", "user_id", "worker_id"]
            isOneToOne: false
            referencedRelation: "workspace_memberships"
            referencedColumns: ["id", "workspace_id", "auth_user_id"]
          },
        ]
      }
      staff: {
        Row: {
          allowed_branches: string[]
          auth_user_id: string | null
          can_login: boolean
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          is_admin: boolean
          is_login_blocked: boolean
          permission_preset: string
          permissions: Json
          phone: string | null
          photo_url: string | null
          pos_pin_hash: string | null
          primary_branch_id: string | null
          role: string | null
          status: string
          user_id: string
          username: string | null
        }
        Insert: {
          allowed_branches?: string[]
          auth_user_id?: string | null
          can_login?: boolean
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          is_admin?: boolean
          is_login_blocked?: boolean
          permission_preset?: string
          permissions?: Json
          phone?: string | null
          photo_url?: string | null
          pos_pin_hash?: string | null
          primary_branch_id?: string | null
          role?: string | null
          status?: string
          user_id?: string
          username?: string | null
        }
        Update: {
          allowed_branches?: string[]
          auth_user_id?: string | null
          can_login?: boolean
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          is_admin?: boolean
          is_login_blocked?: boolean
          permission_preset?: string
          permissions?: Json
          phone?: string | null
          photo_url?: string | null
          pos_pin_hash?: string | null
          primary_branch_id?: string | null
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
          billing_card_brand: string | null
          billing_card_last4: string | null
          billing_error: string | null
          billing_failed_attempts: number
          billing_last_charge_at: string | null
          billing_network_reference: string | null
          billing_next_charge_at: string | null
          billing_payer_document: string | null
          billing_payer_email: string | null
          billing_payer_name: string | null
          billing_payer_phone: string | null
          billing_provider: string | null
          billing_provider_ref: string | null
          billing_recurring: boolean
          billing_transaction_link_id: string | null
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
          billing_card_brand?: string | null
          billing_card_last4?: string | null
          billing_error?: string | null
          billing_failed_attempts?: number
          billing_last_charge_at?: string | null
          billing_network_reference?: string | null
          billing_next_charge_at?: string | null
          billing_payer_document?: string | null
          billing_payer_email?: string | null
          billing_payer_name?: string | null
          billing_payer_phone?: string | null
          billing_provider?: string | null
          billing_provider_ref?: string | null
          billing_recurring?: boolean
          billing_transaction_link_id?: string | null
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
          billing_card_brand?: string | null
          billing_card_last4?: string | null
          billing_error?: string | null
          billing_failed_attempts?: number
          billing_last_charge_at?: string | null
          billing_network_reference?: string | null
          billing_next_charge_at?: string | null
          billing_payer_document?: string | null
          billing_payer_email?: string | null
          billing_payer_name?: string | null
          billing_payer_phone?: string | null
          billing_provider?: string | null
          billing_provider_ref?: string | null
          billing_recurring?: boolean
          billing_transaction_link_id?: string | null
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
      workspace_memberships: {
        Row: {
          accepted_at: string | null
          activated_at: string | null
          auth_user_id: string | null
          created_at: string
          id: string
          invited_at: string
          invited_email: string
          member_kind: string
          permissions: Json
          provisional_auth_user: boolean
          revoked_at: string | null
          role: string | null
          staff_id: string | null
          status: string
          suspended_at: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          activated_at?: string | null
          auth_user_id?: string | null
          created_at?: string
          id?: string
          invited_at?: string
          invited_email: string
          member_kind?: string
          permissions?: Json
          provisional_auth_user?: boolean
          revoked_at?: string | null
          role?: string | null
          staff_id?: string | null
          status?: string
          suspended_at?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          activated_at?: string | null
          auth_user_id?: string | null
          created_at?: string
          id?: string
          invited_at?: string
          invited_email?: string
          member_kind?: string
          permissions?: Json
          provisional_auth_user?: boolean
          revoked_at?: string | null
          role?: string | null
          staff_id?: string | null
          status?: string
          suspended_at?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_memberships_staff_workspace_fkey"
            columns: ["staff_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "workspace_memberships_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_session_selections: {
        Row: {
          auth_user_id: string
          membership_id: string
          selected_at: string
          session_id: string
          workspace_id: string
        }
        Insert: {
          auth_user_id: string
          membership_id: string
          selected_at?: string
          session_id: string
          workspace_id: string
        }
        Update: {
          auth_user_id?: string
          membership_id?: string
          selected_at?: string
          session_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_session_selections_membership_fkey"
            columns: ["membership_id", "workspace_id", "auth_user_id"]
            isOneToOne: false
            referencedRelation: "workspace_memberships"
            referencedColumns: ["id", "workspace_id", "auth_user_id"]
          },
          {
            foreignKeyName: "workspace_session_selections_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          owner_user_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          owner_user_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_user_id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_workspace_invitation: {
        Args: { p_membership_id: string }
        Returns: Json
      }
      admin_apply_credit_pack: {
        Args: { p_pack_id: string; p_reseller_id: string }
        Returns: undefined
      }
      admin_billing_sales: {
        Args: { p_limit?: number }
        Returns: {
          amount: number
          company_id: string
          company_name: string
          contact_email: string
          created_at: string
          currency: string
          error: string
          id: string
          is_guest: boolean
          order_id: string
          paid_at: string
          payer_name: string
          payment_method_type: string
          period_months: number
          period_name: string
          plan_id: string
          status: string
        }[]
      }
      admin_billing_stats: { Args: never; Returns: Json }
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
      admin_company_activity: {
        Args: never
        Returns: {
          activation_stage: string
          business_type: string
          customers_count: number
          last_operational_activity_at: string
          last_sign_in_at: string
          monthly_gmv: number
          monthly_sales_count: number
          products_count: number
          registered_at: string
          services_count: number
          staff_count: number
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
      apply_billing_charge: { Args: { p_order_id: string }; Returns: Json }
      assert_monthly_sales_limit: {
        Args: { p_add: number; p_uid: string }
        Returns: undefined
      }
      can_write_settings: { Args: never; Returns: boolean }
      cancel_purchase_invoice: {
        Args: { p_invoice_id: string }
        Returns: undefined
      }
      claim_guest_orders: { Args: { p_email: string }; Returns: Json }
      close_shift: {
        Args: { p_closing_cash: number; p_notes?: string; p_shift_id?: string }
        Returns: Json
      }
      create_sale: {
        Args: {
          p_card_method?: string
          p_client_sale_id?: string
          p_customer_id: string
          p_discount_amount: number
          p_expected_membership_id?: string
          p_expected_shift_id?: string
          p_expected_workspace_id?: string
          p_items: Json
          p_payment_method: string
          p_payments?: Json
          p_staff_id?: string
          p_transfer_method?: string
        }
        Returns: string
      }
      current_session_id: { Args: never; Returns: string }
      current_shift: { Args: never; Returns: Json }
      current_tenant: { Args: never; Returns: string }
      current_user_profile: { Args: never; Returns: Json }
      deactivate_worker: { Args: { p_worker_id: string }; Returns: undefined }
      ensure_license_current: { Args: never; Returns: Json }
      find_auth_user_by_email: { Args: { p_email: string }; Returns: string }
      get_active_membership_id: { Args: never; Returns: string }
      get_effective_user_id: { Args: never; Returns: string }
      get_product_costs: {
        Args: { p_ids: string[] }
        Returns: {
          product_id: string
          purchase_price: number
        }[]
      }
      is_reseller: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      is_tenant_owner: { Args: never; Returns: boolean }
      my_subscription: { Args: never; Returns: Json }
      open_shift: { Args: { p_opening_cash: number }; Returns: Json }
      open_shift_for_commission: {
        Args: { p_staff_id: string }
        Returns: string
      }
      own_site_preview: { Args: never; Returns: Json }
      public_site_availability: {
        Args: {
          p_days?: number
          p_from: string
          p_service_id: string
          p_slug: string
          p_staff_id?: string
        }
        Returns: {
          day: string
          free_slots: number
          is_open: boolean
        }[]
      }
      public_site_book: {
        Args: {
          p_customer_name: string
          p_customer_phone: string
          p_date: string
          p_notes?: string
          p_service_id: string
          p_slug: string
          p_staff_id?: string
          p_time: string
        }
        Returns: Json
      }
      public_site_by_slug: { Args: { p_slug: string }; Returns: Json }
      public_site_day_slots: {
        Args: {
          p_date: string
          p_service_id: string
          p_slug: string
          p_staff_id?: string
        }
        Returns: {
          slot_state: string
          slot_time: string
        }[]
      }
      public_site_slots: {
        Args: {
          p_date: string
          p_service_id: string
          p_slug: string
          p_staff_id?: string
        }
        Returns: {
          slot_time: string
        }[]
      }
      public_site_slug_taken: { Args: { p_slug: string }; Returns: boolean }
      recalc_haircut_counts: { Args: never; Returns: number }
      redeem_promo: {
        Args: {
          p_customer_id: string
          p_discount_applied?: number
          p_sale_id?: string
        }
        Returns: Json
      }
      register_cash_withdrawal: {
        Args: {
          p_amount: number
          p_category?: string
          p_kind?: string
          p_reason: string
        }
        Returns: string
      }
      register_customer_payment: {
        Args: { p_amount: number; p_customer_id: string; p_notes?: string }
        Returns: number
      }
      register_manual_movement: {
        Args: {
          p_notes?: string
          p_product_id: string
          p_quantity: number
          p_type: string
          p_unit_mode?: string
        }
        Returns: undefined
      }
      replace_purchase_invoice_items: {
        Args: { p_invoice_id: string; p_items: Json }
        Returns: undefined
      }
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
      sale_item_is_haircut: {
        Args: { p_service_id: string; p_user_id: string }
        Returns: boolean
      }
      sales_page: {
        Args: {
          p_category_id?: string
          p_customer?: string
          p_from?: string
          p_limit?: number
          p_offset?: number
          p_payment_method?: string
          p_product_id?: string
          p_service_id?: string
          p_to?: string
          p_transfer_method?: string
        }
        Returns: Json
      }
      sales_summary: {
        Args: {
          p_category_id?: string
          p_customer?: string
          p_from?: string
          p_payment_method?: string
          p_product_id?: string
          p_service_id?: string
          p_to?: string
          p_transfer_method?: string
        }
        Returns: Json
      }
      school_add_participant: {
        Args: { p_enrollment_id: string; p_lesson_id: string }
        Returns: Json
      }
      school_adjust_credit: {
        Args: { p_amount: number; p_enrollment_id: string; p_reason: string }
        Returns: Json
      }
      school_approve_reschedule: {
        Args: {
          p_new_end_at?: string
          p_new_start_at?: string
          p_request_id: string
        }
        Returns: Json
      }
      school_cancel_lesson: {
        Args: { p_lesson_id: string; p_reason: string }
        Returns: Json
      }
      school_close_lesson: {
        Args: { p_attendance: Json; p_lesson_id: string }
        Returns: Json
      }
      school_confirm_lesson: { Args: { p_lesson_id: string }; Returns: Json }
      school_confirm_lesson_by_token: {
        Args: { p_token: string }
        Returns: Json
      }
      school_create_confirm_link: {
        Args: { p_lesson_id: string }
        Returns: Json
      }
      school_create_family_link: {
        Args: {
          p_guardian_customer_id: string
          p_hours?: number
          p_student_id: string
        }
        Returns: Json
      }
      school_enroll: {
        Args: {
          p_default_teacher_profile_id?: string
          p_instrument: string
          p_lesson_plan_id: string
          p_payer_customer_id?: string
          p_sale_id?: string
          p_student_id: string
        }
        Returns: Json
      }
      school_family_payload: { Args: { p_token: string }; Returns: Json }
      school_log_communication: {
        Args: {
          p_guardian_customer_id: string
          p_message?: string
          p_purpose: string
          p_state: string
          p_student_id: string
        }
        Returns: Json
      }
      school_module_enabled: { Args: never; Returns: boolean }
      school_reject_reschedule: {
        Args: { p_reason: string; p_request_id: string }
        Returns: Json
      }
      school_request_reschedule: {
        Args: {
          p_lesson_id: string
          p_participant_id: string
          p_reason: string
          p_requester_kind?: string
        }
        Returns: Json
      }
      school_revoke_link: { Args: { p_link_id: string }; Returns: Json }
      school_schedule_lesson: {
        Args: {
          p_end_at: string
          p_enrollment_id: string
          p_instrument: string
          p_room?: string
          p_start_at: string
          p_teacher_profile_id: string
        }
        Returns: Json
      }
      school_schedule_series: {
        Args: {
          p_count?: number
          p_end_time: string
          p_enrollment_id: string
          p_first_at: string
          p_instrument: string
          p_room?: string
          p_teacher_profile_id: string
          p_until_date?: string
          p_weekday: number
        }
        Returns: Json
      }
      select_active_workspace: {
        Args: { p_workspace_id: string }
        Returns: Json
      }
      set_business_site_published: {
        Args: { p_published: boolean }
        Returns: Json
      }
      set_credit_alert: {
        Args: { p_alert: boolean; p_customer: string; p_note?: string }
        Returns: {
          credit_alert: boolean
          credit_alert_note: string
        }[]
      }
      settle_commissions: {
        Args: {
          p_exclude_item_ids?: string[]
          p_from: string
          p_from_ts: string
          p_paid_on?: string
          p_payment_method: string
          p_staff_id: string
          p_to: string
          p_to_ts: string
        }
        Returns: string
      }
      site_public_projection: { Args: { p_user_id: string }; Returns: Json }
      staff_can: { Args: { section: string }; Returns: boolean }
      staff_can_action: {
        Args: { action?: string; section: string }
        Returns: boolean
      }
      sync_billing_schedule: {
        Args: { p_months: number; p_user_id: string }
        Returns: string
      }
      void_commission_settlement: {
        Args: { p_settlement_id: string }
        Returns: Json
      }
      void_sale: { Args: { p_sale_id: string }; Returns: undefined }
      worker_can: { Args: { perm: string }; Returns: boolean }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
