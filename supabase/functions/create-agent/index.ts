// supabase/functions/create-agent/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    )

    const { email, permissions } = await req.json()
    
    console.log('Creating agent for:', email)

    // 1. Create auth user
    const { data: user, error: authError } = await supabaseClient.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { role: 'agent' }
    })

    if (authError) throw authError

    // 2. Create profile
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .insert({
        id: user.user.id,
        email,
        role: 'agent',
        agent_id: `AGENT-${crypto.randomUUID().slice(0, 8)}`,
        permissions
      })
      .select()
      .single()

    if (profileError) throw profileError

    return new Response(
      JSON.stringify({ success: true, data: profile }),
      { 
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*' 
        } 
      }
    )
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { 
        status: 400,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*' 
        } 
      }
    )
  }
})