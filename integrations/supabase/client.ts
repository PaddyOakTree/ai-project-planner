// This file is automatically generated. Do not edit it directly.
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Get the Supabase URL and key from environment variables with validation
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || '';

// Enhanced validation and error handling
const validateSupabaseConfig = () => {
  if (!SUPABASE_URL || SUPABASE_URL === '') {
    const error = 'NEXT_PUBLIC_SUPABASE_URL is missing or invalid';
    console.error(error);
    if (typeof window !== 'undefined') {
      console.warn('⚠️ Supabase client running in fallback mode. Database features will not work.');
    }
    return false;
  }
  
  if (!SUPABASE_PUBLISHABLE_KEY || SUPABASE_PUBLISHABLE_KEY === '') {
    const error = 'NEXT_PUBLIC_SUPABASE_ANON_KEY is missing or invalid';
    console.error(error);
    if (typeof window !== 'undefined') {
      console.warn('⚠️ Supabase client running in fallback mode. Database features will not work.');
    }
    return false;
  }

  // Validate URL format
  try {
    new URL(SUPABASE_URL);
  } catch {
    console.error('Invalid Supabase URL format');
    return false;
  }

  return true;
};

// Create Supabase client with proper error handling
let supabaseClient: SupabaseClient<Database>;

try {
  const isValid = validateSupabaseConfig();
  
  if (isValid) {
    // Log success for debugging (hide sensitive data)
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.log('✅ Supabase client initialized with URL:', SUPABASE_URL.split('.')[0] + '.supabase.co');
    }
    
    supabaseClient = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        storageKey: 'ai-research-platform-auth',
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      },
      global: {
        headers: {
          'X-Client-Info': 'ai-research-platform@1.0.0',
        },
      },
    });
  } else {
    // Create fallback client for development/demo mode
    supabaseClient = createClient<Database>(
      'https://placeholder.supabase.co', 
      'placeholder-key',
      {
        auth: { persistSession: false }
      }
    );
  }
} catch (error) {
  console.error('Failed to initialize Supabase client:', error instanceof Error ? error.message : String(error));
  
  // Fallback client
  supabaseClient = createClient<Database>(
    'https://placeholder.supabase.co', 
    'placeholder-key',
    {
      auth: { persistSession: false }
    }
  );
}

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export { createClient }

export const supabase = supabaseClient;

// Utility functions for better error handling
export const supabaseUtils = {
  // Check if client is properly configured
  isConfigured(): boolean {
    return validateSupabaseConfig();
  },

  // Test database connection
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await supabase.from('user_profiles').select('count').limit(1);
      
      if (error) {
        return { success: false, error: error.message };
      }
      
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown connection error' 
      };
    }
  },

  // Enhanced error logging
  logError(context: string, error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Supabase error in ${context}:`, errorMessage);
  }
};
