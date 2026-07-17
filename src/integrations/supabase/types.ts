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
      accounts: {
        Row: {
          code: string
          created_at: string
          currency_code: string
          description: string | null
          id: string
          is_active: boolean
          is_group: boolean
          name: string
          name_en: string | null
          parent_id: string | null
          type: Database["public"]["Enums"]["account_type"]
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          currency_code?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_group?: boolean
          name: string
          name_en?: string | null
          parent_id?: string | null
          type: Database["public"]["Enums"]["account_type"]
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          currency_code?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_group?: boolean
          name?: string
          name_en?: string | null
          parent_id?: string | null
          type?: Database["public"]["Enums"]["account_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          at: string
          data: Json | null
          id: string
          row_id: string | null
          table_name: string
          user_id: string | null
        }
        Insert: {
          action: string
          at?: string
          data?: Json | null
          id?: string
          row_id?: string | null
          table_name: string
          user_id?: string | null
        }
        Update: {
          action?: string
          at?: string
          data?: Json | null
          id?: string
          row_id?: string | null
          table_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      branches: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          name_en: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          name_en?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          name_en?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      currencies: {
        Row: {
          code: string
          created_at: string
          is_base: boolean
          name: string
          name_en: string | null
          symbol: string | null
        }
        Insert: {
          code: string
          created_at?: string
          is_base?: boolean
          name: string
          name_en?: string | null
          symbol?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          is_base?: boolean
          name?: string
          name_en?: string | null
          symbol?: string | null
        }
        Relationships: []
      }
      document_sequences: {
        Row: {
          branch_id: string | null
          doc_type: string
          id: string
          next_number: number
          prefix: string
        }
        Insert: {
          branch_id?: string | null
          doc_type: string
          id?: string
          next_number?: number
          prefix?: string
        }
        Update: {
          branch_id?: string | null
          doc_type?: string
          id?: string
          next_number?: number
          prefix?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_sequences_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_rates: {
        Row: {
          created_at: string
          effective_date: string
          from_code: string
          id: string
          rate: number
          to_code: string
        }
        Insert: {
          created_at?: string
          effective_date?: string
          from_code: string
          id?: string
          rate: number
          to_code: string
        }
        Update: {
          created_at?: string
          effective_date?: string
          from_code?: string
          id?: string
          rate?: number
          to_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "exchange_rates_from_code_fkey"
            columns: ["from_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "exchange_rates_to_code_fkey"
            columns: ["to_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      items: {
        Row: {
          average_cost: number
          cogs_account_id: string | null
          created_at: string
          expense_account_id: string | null
          id: string
          inventory_account_id: string | null
          is_active: boolean
          is_service: boolean
          name: string
          name_en: string | null
          notes: string | null
          quantity_on_hand: number
          revenue_account_id: string | null
          sale_price: number
          sku: string
          unit: string
          updated_at: string
        }
        Insert: {
          average_cost?: number
          cogs_account_id?: string | null
          created_at?: string
          expense_account_id?: string | null
          id?: string
          inventory_account_id?: string | null
          is_active?: boolean
          is_service?: boolean
          name: string
          name_en?: string | null
          notes?: string | null
          quantity_on_hand?: number
          revenue_account_id?: string | null
          sale_price?: number
          sku: string
          unit?: string
          updated_at?: string
        }
        Update: {
          average_cost?: number
          cogs_account_id?: string | null
          created_at?: string
          expense_account_id?: string | null
          id?: string
          inventory_account_id?: string | null
          is_active?: boolean
          is_service?: boolean
          name?: string
          name_en?: string | null
          notes?: string | null
          quantity_on_hand?: number
          revenue_account_id?: string | null
          sale_price?: number
          sku?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_cogs_account_id_fkey"
            columns: ["cogs_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_expense_account_id_fkey"
            columns: ["expense_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_inventory_account_id_fkey"
            columns: ["inventory_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_revenue_account_id_fkey"
            columns: ["revenue_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          branch_id: string
          created_at: string
          created_by: string | null
          currency_code: string
          description: string | null
          entry_date: string
          entry_no: string | null
          id: string
          posted_at: string | null
          posted_by: string | null
          source_id: string | null
          source_type: string | null
          status: Database["public"]["Enums"]["doc_status"]
          updated_at: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          created_by?: string | null
          currency_code?: string
          description?: string | null
          entry_date?: string
          entry_no?: string | null
          id?: string
          posted_at?: string | null
          posted_by?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: Database["public"]["Enums"]["doc_status"]
          updated_at?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          created_by?: string | null
          currency_code?: string
          description?: string | null
          entry_date?: string
          entry_no?: string | null
          id?: string
          posted_at?: string | null
          posted_by?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: Database["public"]["Enums"]["doc_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      journal_lines: {
        Row: {
          account_id: string
          created_at: string
          credit: number
          debit: number
          description: string | null
          entry_id: string
          id: string
          line_no: number
        }
        Insert: {
          account_id: string
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          entry_id: string
          id?: string
          line_no?: number
        }
        Update: {
          account_id?: string
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          entry_id?: string
          id?: string
          line_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      parties: {
        Row: {
          address: string | null
          code: string | null
          created_at: string
          currency_code: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          opening_balance: number
          phone: string | null
          tax_id: string | null
          type: Database["public"]["Enums"]["party_type"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          code?: string | null
          created_at?: string
          currency_code?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          opening_balance?: number
          phone?: string | null
          tax_id?: string | null
          type?: Database["public"]["Enums"]["party_type"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          code?: string | null
          created_at?: string
          currency_code?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          opening_balance?: number
          phone?: string | null
          tax_id?: string | null
          type?: Database["public"]["Enums"]["party_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parties_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          branch_id: string
          cash_account_id: string
          created_at: string
          created_by: string | null
          currency_code: string
          direction: Database["public"]["Enums"]["payment_direction"]
          fx_rate: number
          id: string
          journal_entry_id: string | null
          method: string | null
          notes: string | null
          party_id: string
          payment_date: string
          payment_no: string | null
          reference: string | null
          status: Database["public"]["Enums"]["doc_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          branch_id: string
          cash_account_id: string
          created_at?: string
          created_by?: string | null
          currency_code?: string
          direction: Database["public"]["Enums"]["payment_direction"]
          fx_rate?: number
          id?: string
          journal_entry_id?: string | null
          method?: string | null
          notes?: string | null
          party_id: string
          payment_date?: string
          payment_no?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["doc_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          branch_id?: string
          cash_account_id?: string
          created_at?: string
          created_by?: string | null
          currency_code?: string
          direction?: Database["public"]["Enums"]["payment_direction"]
          fx_rate?: number
          id?: string
          journal_entry_id?: string | null
          method?: string | null
          notes?: string | null
          party_id?: string
          payment_date?: string
          payment_no?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["doc_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_cash_account_id_fkey"
            columns: ["cash_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "payments_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          default_branch_id: string | null
          email: string | null
          full_name: string | null
          id: string
          locale: string
          theme: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_branch_id?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          locale?: string
          theme?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_branch_id?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          locale?: string
          theme?: string
          updated_at?: string
        }
        Relationships: []
      }
      purchase_invoice_lines: {
        Row: {
          description: string
          expense_account_id: string | null
          id: string
          invoice_id: string
          item_id: string | null
          line_no: number
          line_total: number
          qty: number
          tax_rate: number
          unit_price: number
        }
        Insert: {
          description: string
          expense_account_id?: string | null
          id?: string
          invoice_id: string
          item_id?: string | null
          line_no?: number
          line_total?: number
          qty?: number
          tax_rate?: number
          unit_price?: number
        }
        Update: {
          description?: string
          expense_account_id?: string | null
          id?: string
          invoice_id?: string
          item_id?: string | null
          line_no?: number
          line_total?: number
          qty?: number
          tax_rate?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_invoice_lines_expense_account_id_fkey"
            columns: ["expense_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "purchase_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoice_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_invoices: {
        Row: {
          branch_id: string
          created_at: string
          created_by: string | null
          currency_code: string
          due_date: string | null
          fx_rate: number
          id: string
          invoice_date: string
          invoice_no: string | null
          journal_entry_id: string | null
          notes: string | null
          paid_amount: number
          status: Database["public"]["Enums"]["doc_status"]
          subtotal: number
          supplier_id: string
          supplier_reference: string | null
          tax: number
          total: number
          updated_at: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          created_by?: string | null
          currency_code?: string
          due_date?: string | null
          fx_rate?: number
          id?: string
          invoice_date?: string
          invoice_no?: string | null
          journal_entry_id?: string | null
          notes?: string | null
          paid_amount?: number
          status?: Database["public"]["Enums"]["doc_status"]
          subtotal?: number
          supplier_id: string
          supplier_reference?: string | null
          tax?: number
          total?: number
          updated_at?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          created_by?: string | null
          currency_code?: string
          due_date?: string | null
          fx_rate?: number
          id?: string
          invoice_date?: string
          invoice_no?: string | null
          journal_entry_id?: string | null
          notes?: string | null
          paid_amount?: number
          status?: Database["public"]["Enums"]["doc_status"]
          subtotal?: number
          supplier_id?: string
          supplier_reference?: string | null
          tax?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_invoices_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoices_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "purchase_invoices_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_invoice_lines: {
        Row: {
          description: string
          id: string
          income_account_id: string | null
          invoice_id: string
          item_id: string | null
          line_no: number
          line_total: number
          qty: number
          tax_rate: number
          unit_price: number
        }
        Insert: {
          description: string
          id?: string
          income_account_id?: string | null
          invoice_id: string
          item_id?: string | null
          line_no?: number
          line_total?: number
          qty?: number
          tax_rate?: number
          unit_price?: number
        }
        Update: {
          description?: string
          id?: string
          income_account_id?: string | null
          invoice_id?: string
          item_id?: string | null
          line_no?: number
          line_total?: number
          qty?: number
          tax_rate?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_invoice_lines_income_account_id_fkey"
            columns: ["income_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "sales_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_invoice_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_invoices: {
        Row: {
          branch_id: string
          created_at: string
          created_by: string | null
          currency_code: string
          customer_id: string
          due_date: string | null
          fx_rate: number
          id: string
          invoice_date: string
          invoice_no: string | null
          journal_entry_id: string | null
          notes: string | null
          paid_amount: number
          status: Database["public"]["Enums"]["doc_status"]
          subtotal: number
          tax: number
          total: number
          updated_at: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          created_by?: string | null
          currency_code?: string
          customer_id: string
          due_date?: string | null
          fx_rate?: number
          id?: string
          invoice_date?: string
          invoice_no?: string | null
          journal_entry_id?: string | null
          notes?: string | null
          paid_amount?: number
          status?: Database["public"]["Enums"]["doc_status"]
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          created_by?: string | null
          currency_code?: string
          customer_id?: string
          due_date?: string | null
          fx_rate?: number
          id?: string
          invoice_date?: string
          invoice_no?: string | null
          journal_entry_id?: string | null
          notes?: string | null
          paid_amount?: number
          status?: Database["public"]["Enums"]["doc_status"]
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_invoices_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_invoices_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "sales_invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_invoices_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          branch_id: string | null
          created_at: string
          created_by: string | null
          direction: Database["public"]["Enums"]["stock_direction"]
          id: string
          item_id: string
          journal_entry_id: string | null
          movement_date: string
          notes: string | null
          qty: number
          source_id: string | null
          source_type: string | null
          total_cost: number
          unit_cost: number
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          direction: Database["public"]["Enums"]["stock_direction"]
          id?: string
          item_id: string
          journal_entry_id?: string | null
          movement_date?: string
          notes?: string | null
          qty: number
          source_id?: string | null
          source_type?: string | null
          total_cost?: number
          unit_cost?: number
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          direction?: Database["public"]["Enums"]["stock_direction"]
          id?: string
          item_id?: string
          journal_entry_id?: string | null
          movement_date?: string
          notes?: string | null
          qty?: number
          source_id?: string | null
          source_type?: string | null
          total_cost?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      next_doc_number: {
        Args: { _branch_id: string; _doc_type: string; _prefix?: string }
        Returns: string
      }
      post_journal_entry: {
        Args: { _entry_id: string }
        Returns: {
          branch_id: string
          created_at: string
          created_by: string | null
          currency_code: string
          description: string | null
          entry_date: string
          entry_no: string | null
          id: string
          posted_at: string | null
          posted_by: string | null
          source_id: string | null
          source_type: string | null
          status: Database["public"]["Enums"]["doc_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "journal_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      post_payment: {
        Args: { _payment_id: string }
        Returns: {
          amount: number
          branch_id: string
          cash_account_id: string
          created_at: string
          created_by: string | null
          currency_code: string
          direction: Database["public"]["Enums"]["payment_direction"]
          fx_rate: number
          id: string
          journal_entry_id: string | null
          method: string | null
          notes: string | null
          party_id: string
          payment_date: string
          payment_no: string | null
          reference: string | null
          status: Database["public"]["Enums"]["doc_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      post_purchase_invoice: {
        Args: { _invoice_id: string }
        Returns: {
          branch_id: string
          created_at: string
          created_by: string | null
          currency_code: string
          due_date: string | null
          fx_rate: number
          id: string
          invoice_date: string
          invoice_no: string | null
          journal_entry_id: string | null
          notes: string | null
          paid_amount: number
          status: Database["public"]["Enums"]["doc_status"]
          subtotal: number
          supplier_id: string
          supplier_reference: string | null
          tax: number
          total: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "purchase_invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      post_sales_invoice: {
        Args: { _invoice_id: string }
        Returns: {
          branch_id: string
          created_at: string
          created_by: string | null
          currency_code: string
          customer_id: string
          due_date: string | null
          fx_rate: number
          id: string
          invoice_date: string
          invoice_no: string | null
          journal_entry_id: string | null
          notes: string | null
          paid_amount: number
          status: Database["public"]["Enums"]["doc_status"]
          subtotal: number
          tax: number
          total: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "sales_invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_stock_adjustment: {
        Args: {
          _branch_id: string
          _direction: Database["public"]["Enums"]["stock_direction"]
          _item_id: string
          _notes: string
          _qty: number
          _unit_cost: number
        }
        Returns: {
          branch_id: string | null
          created_at: string
          created_by: string | null
          direction: Database["public"]["Enums"]["stock_direction"]
          id: string
          item_id: string
          journal_entry_id: string | null
          movement_date: string
          notes: string | null
          qty: number
          source_id: string | null
          source_type: string | null
          total_cost: number
          unit_cost: number
        }
        SetofOptions: {
          from: "*"
          to: "stock_movements"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      account_type: "asset" | "liability" | "equity" | "income" | "expense"
      app_role: "admin" | "accountant" | "manager" | "viewer"
      doc_status: "draft" | "posted" | "cancelled"
      party_type: "customer" | "supplier" | "both"
      payment_direction: "receipt" | "payment"
      stock_direction: "in" | "out" | "adjust"
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
    Enums: {
      account_type: ["asset", "liability", "equity", "income", "expense"],
      app_role: ["admin", "accountant", "manager", "viewer"],
      doc_status: ["draft", "posted", "cancelled"],
      party_type: ["customer", "supplier", "both"],
      payment_direction: ["receipt", "payment"],
      stock_direction: ["in", "out", "adjust"],
    },
  },
} as const
