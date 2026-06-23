export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      invoice_items: {
        Row: {
          created_at: string
          description: string
          id: string
          invoice_id: string
          line_total: number
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
          due_date: string | null
          id: string
          invoice_number: number
          issue_date: string
          notes: string | null
          status: string
          subtotal: number
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
          due_date?: string | null
          id?: string
          invoice_number?: number
          issue_date?: string
          notes?: string | null
          status?: string
          subtotal?: number
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
          due_date?: string | null
          id?: string
          invoice_number?: number
          issue_date?: string
          notes?: string | null
          status?: string
          subtotal?: number
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
        ]
      }
      products: {
        Row: {
          category_id: string | null
          created_at: string
          distributor_id: string | null
          id: string
          image_url: string | null
          minimum_stock: number
          name: string
          price: number
          purchase_price: number
          sku: string
          status: string | null
          stock_level: number
          unit: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          distributor_id?: string | null
          id?: string
          image_url?: string | null
          minimum_stock?: number
          name: string
          price?: number
          purchase_price?: number
          sku: string
          status?: string | null
          stock_level?: number
          unit?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          distributor_id?: string | null
          id?: string
          image_url?: string | null
          minimum_stock?: number
          name?: string
          price?: number
          purchase_price?: number
          sku?: string
          status?: string | null
          stock_level?: number
          unit?: string
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
          business_type: string | null
          created_at: string
          full_name: string | null
          id: string
          modules: Json
          updated_at: string
        }
        Insert: {
          business_type?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          modules?: Json
          updated_at?: string
        }
        Update: {
          business_type?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          modules?: Json
          updated_at?: string
        }
        Relationships: []
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
            foreignKeyName: "sales_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          created_at: string
          description: string | null
          duration_minutes: number
          id: string
          name: string
          price: number
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          name: string
          price?: number
          status?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          duration_minutes?: number
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
          commission_rate: number
          commission_type: string
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          role: string | null
          status: string
          user_id: string
        }
        Insert: {
          commission_rate?: number
          commission_type?: string
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          phone?: string | null
          role?: string | null
          status?: string
          user_id?: string
        }
        Update: {
          commission_rate?: number
          commission_type?: string
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          role?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
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
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
