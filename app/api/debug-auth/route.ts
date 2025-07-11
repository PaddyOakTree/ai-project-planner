import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth-utils'
import { supabase } from '@/integrations/supabase/client'
import { createSupabaseAdmin } from '@/lib/auth-utils'

// Database migration endpoint to fix RLS policies
export async function POST(request: NextRequest) {
  try {
    console.log("Running database fix script...")
    const supabaseAdmin = createSupabaseAdmin()
    
    if (!supabaseAdmin) {
      return NextResponse.json({ error: "Admin client not available" }, { status: 500 })
    }

    // Fix RLS policies for team_members to prevent infinite recursion
    const queries = [
      // Drop existing problematic policies
      `DROP POLICY IF EXISTS "team_members_select_policy" ON team_members;`,
      `DROP POLICY IF EXISTS "team_members_insert_policy" ON team_members;`,
      `DROP POLICY IF EXISTS "team_members_update_policy" ON team_members;`,
      `DROP POLICY IF EXISTS "team_members_delete_policy" ON team_members;`,
      `DROP POLICY IF EXISTS "Users can view team members of their teams" ON team_members;`,
      `DROP POLICY IF EXISTS "Team owners can insert team members" ON team_members;`,
      `DROP POLICY IF EXISTS "Team owners can update team members" ON team_members;`,
      `DROP POLICY IF EXISTS "Team owners and users can delete their own membership" ON team_members;`,
      `DROP POLICY IF EXISTS "Team owners can view all team members" ON team_members;`,
      `DROP POLICY IF EXISTS "Users can view their own team memberships" ON team_members;`,
      `DROP POLICY IF EXISTS "Team owners and users can delete memberships" ON team_members;`,
      
      // Create helper function to avoid recursion
      `CREATE OR REPLACE FUNCTION is_team_member(team_uuid UUID, user_uuid UUID)
      RETURNS BOOLEAN AS $$
      BEGIN
          RETURN EXISTS (
              SELECT 1 FROM team_members 
              WHERE team_id = team_uuid AND user_id = user_uuid
          );
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;`,
      
      // Grant execute permission
      `GRANT EXECUTE ON FUNCTION is_team_member(UUID, UUID) TO authenticated;`,
      
      // Create non-recursive policies for team_members
      `CREATE POLICY "team_members_select_policy" ON team_members
          FOR SELECT USING (
              EXISTS (
                  SELECT 1 FROM teams 
                  WHERE teams.id = team_id 
                  AND teams.owner_id = auth.uid()
              )
              OR user_id = auth.uid()
          );`,
      
      `CREATE POLICY "team_members_insert_policy" ON team_members
          FOR INSERT WITH CHECK (
              -- Allow team owners to add members
              EXISTS (
                  SELECT 1 FROM teams 
                  WHERE teams.id = team_id 
                  AND teams.owner_id = auth.uid()
              )
              OR
              -- Allow users to add themselves to public teams
              (user_id = auth.uid() AND EXISTS (
                  SELECT 1 FROM teams 
                  WHERE teams.id = team_id 
                  AND teams.is_public = true
              ))
          );`,
      
      `CREATE POLICY "team_members_update_policy" ON team_members
          FOR UPDATE USING (
              -- Allow team owners to update member roles
              EXISTS (
                  SELECT 1 FROM teams 
                  WHERE teams.id = team_id 
                  AND teams.owner_id = auth.uid()
              )
              OR
              -- Allow users to update their own membership
              user_id = auth.uid()
          );`,
      
      `CREATE POLICY "team_members_delete_policy" ON team_members
          FOR DELETE USING (
              -- Allow team owners to remove members
              EXISTS (
                  SELECT 1 FROM teams 
                  WHERE teams.id = team_id 
                  AND teams.owner_id = auth.uid()
              )
              OR
              -- Allow users to remove themselves
              user_id = auth.uid()
          );`,
      
      // Ensure RLS is enabled
      `ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;`,
      
      // Fix teams table policies too
      `DROP POLICY IF EXISTS "teams_select_policy" ON teams;`,
      `DROP POLICY IF EXISTS "teams_insert_policy" ON teams;`,
      `DROP POLICY IF EXISTS "teams_update_policy" ON teams;`,
      `DROP POLICY IF EXISTS "teams_delete_policy" ON teams;`,
      `DROP POLICY IF EXISTS "Users can view public teams or their own teams" ON teams;`,
      `DROP POLICY IF EXISTS "Users can view teams they own" ON teams;`,
      `DROP POLICY IF EXISTS "Users can view teams they are members of" ON teams;`,
      
      `CREATE POLICY "teams_select_policy" ON teams
          FOR SELECT USING (
              (is_public = true AND auth.uid() IS NOT NULL)
              OR owner_id = auth.uid()
              OR is_team_member(id, auth.uid())
          );`,
      
      `CREATE POLICY "teams_insert_policy" ON teams
          FOR INSERT WITH CHECK (
              auth.uid() IS NOT NULL
              AND owner_id = auth.uid()
          );`,
      
      `CREATE POLICY "teams_update_policy" ON teams
          FOR UPDATE USING (
              owner_id = auth.uid()
          );`,
      
      `CREATE POLICY "teams_delete_policy" ON teams
          FOR DELETE USING (
              owner_id = auth.uid()
          );`,
      
      // Ensure RLS is enabled on teams
      `ALTER TABLE teams ENABLE ROW LEVEL SECURITY;`,
      
      // Create an index for better performance
      `CREATE INDEX IF NOT EXISTS idx_team_members_lookup ON team_members(team_id, user_id);`,
      
      // Fix chat_messages policies
      `DROP POLICY IF EXISTS "Users can view team chat messages" ON chat_messages;`,
      `DROP POLICY IF EXISTS "Users can insert team chat messages" ON chat_messages;`,
      
      `CREATE POLICY "chat_messages_select_policy" ON chat_messages
          FOR SELECT USING (
              EXISTS (
                  SELECT 1 FROM teams 
                  WHERE teams.id = team_id 
                  AND teams.owner_id = auth.uid()
              )
              OR is_team_member(team_id, auth.uid())
          );`,
      
      `CREATE POLICY "chat_messages_insert_policy" ON chat_messages
          FOR INSERT WITH CHECK (
              sender_id = auth.uid() AND
              (
                  EXISTS (
                      SELECT 1 FROM teams 
                      WHERE teams.id = team_id 
                      AND teams.owner_id = auth.uid()
                  )
                  OR is_team_member(team_id, auth.uid())
              )
          );`,
      
      // Enable RLS on chat_messages
      `ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;`
    ]
    
    // Execute each query
    const results = []
    for (const query of queries) {
      try {
        const { error } = await supabaseAdmin.rpc('exec_sql', { sql: query })
        if (error) {
          console.error(`Error executing query: ${query}`, error)
          results.push({ query, success: false, error: error.message })
        } else {
          results.push({ query, success: true })
        }
      } catch (error) {
        console.error(`Exception executing query: ${query}`, error)
        results.push({ query, success: false, error: String(error) })
      }
    }
    
    return NextResponse.json({ 
      success: true, 
      message: "Database fix script executed",
      results
    })
    
  } catch (error) {
    console.error("Error fixing database:", error)
    return NextResponse.json({ 
      error: "Failed to fix database", 
      details: String(error) 
    }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    console.log("DEBUG AUTH: Starting authentication check...")
    
    // Log all headers
    const headers = Object.fromEntries(request.headers.entries())
    console.log("DEBUG AUTH: Request headers:", {
      authorization: headers.authorization ? "Present" : "Missing",
      cookie: headers.cookie ? "Present" : "Missing",
      userAgent: headers['user-agent'],
    })
    
    // Log cookies in detail
    const cookieHeader = request.headers.get('cookie')
    let cookies: Record<string, string> = {}
    
    if (cookieHeader) {
      cookies = cookieHeader.split(';').reduce((acc, cookie) => {
        const [key, value] = cookie.trim().split('=')
        if (key && value) {
          acc[key] = value.length > 50 ? `${value.substring(0, 50)}...` : value
        }
        return acc
      }, {} as Record<string, string>)
      
      console.log("DEBUG AUTH: Parsed cookies:", Object.keys(cookies))
      
      // Look for Supabase auth cookies
      const authCookies = Object.keys(cookies).filter(key => 
        key.includes('auth') || key.includes('supabase') || key.includes('ai-research-platform')
      )
      console.log("DEBUG AUTH: Auth-related cookies:", authCookies)
    }
    
    // Try to get authenticated user
    let user = null
    let authError = null
    
    try {
      user = await getAuthUser(request, "debug-auth")
    } catch (error) {
      authError = error instanceof Error ? error.message : String(error)
      console.error("DEBUG AUTH: Authentication failed:", authError)
    }
    
    // Test database connection
    let dbConnectionTest = null
    try {
      const { data, error } = await supabase.from('user_profiles').select('count').limit(1)
      dbConnectionTest = {
        success: !error,
        error: error?.message,
        configured: !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      }
    } catch (err) {
      dbConnectionTest = {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        configured: false
      }
    }

    const result = {
      timestamp: new Date().toISOString(),
      authenticated: !!user,
      user: user ? {
        id: user.id,
        email: user.email,
        created_at: user.created_at,
        email_confirmed_at: user.email_confirmed_at,
        last_sign_in_at: user.last_sign_in_at,
      } : null,
      authError,
      headers: {
        hasAuthorization: !!headers.authorization,
        hasCookie: !!headers.cookie,
        cookieKeys: cookieHeader ? Object.keys(cookies) : [],
        authCookieKeys: cookieHeader ? Object.keys(cookies).filter(key => 
          key.includes('auth') || key.includes('supabase') || key.includes('ai-research-platform')
        ) : [],
      },
      environment: {
        hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      },
      database: dbConnectionTest
    }
    
    console.log("DEBUG AUTH: Final result:", result)
    
    return NextResponse.json(result)
  } catch (error) {
    console.error("DEBUG AUTH: Unexpected error:", error)
    return NextResponse.json({
      error: "Debug authentication check failed",
      details: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    }, { status: 500 })
  }
}
