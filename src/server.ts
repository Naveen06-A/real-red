import express, { Request, Response } from 'express';
import cors from 'cors';
import { supabaseServer } from './supabase-server';
import 'dotenv/config';

const app = express();
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

interface CreateAgentRequest {
  email: string;
  permissions: {
    canRegisterProperties: boolean;
    canEditProperties: boolean;
    canDeleteProperties: boolean;
  };
}

interface UpdateAgentPermissionsRequest {
  agentId: string;
  permissions: {
    canRegisterProperties: boolean;
    canEditProperties: boolean;
    canDeleteProperties: boolean;
  };
}

interface DeletePropertyRequest {
  id: string;
}

// Create agent endpoint
app.post('/api/create-agent', async (req: Request<{}, {}, CreateAgentRequest>, res: Response): Promise<void> => {
  try {
    const { email, permissions } = req.body;
    if (!email || !permissions) {
      res.status(400).json({ error: 'Email and permissions are required' });
      return;
    }

    const tempPassword = Math.random().toString(36).slice(-8);
    const uniqueAgentId = `AGENT-${crypto.randomUUID().slice(0, 8)}`;

    // Create user in Supabase auth
    const { data: authData, error: authError } = await supabaseServer.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    });

    if (authError) {
      throw new Error(`Auth error: ${authError.message}`);
    }

    // Insert agent profile
    const { error: profileError } = await supabaseServer.from('profiles').insert({
      id: authData.user?.id,
      agent_id: uniqueAgentId,
      email,
      role: 'agent',
      permissions,
    });

    if (profileError) {
      throw new Error(`Profile error: ${profileError.message}`);
    }

    res.status(201).json({ agent_id: uniqueAgentId, email, message: 'Agent created successfully' });
  } catch (error: any) {
    console.error('Error creating agent:', error);
    res.status(500).json({ error: error.message || 'Failed to create agent' });
  }
});

// Fetch agents endpoint
app.get('/api/agents', async (req: Request, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabaseServer
      .from('profiles')
      .select('id, agent_id, email, role, permissions')
      .eq('role', 'agent');
    if (error) throw new Error(`Failed to fetch agents: ${error.message}`);
    res.status(200).json(data || []);
  } catch (error: any) {
    console.error('Error fetching agents:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch agents' });
  }
});

// Update agent permissions endpoint
app.post('/api/update-agent-permissions', async (req: Request<{}, {}, UpdateAgentPermissionsRequest>, res: Response): Promise<void> => {
  try {
    const { agentId, permissions } = req.body;
    if (!agentId || !permissions) {
      res.status(400).json({ error: 'Agent ID and permissions are required' });
      return;
    }

    const { error } = await supabaseServer
      .from('profiles')
      .update({ permissions })
      .eq('id', agentId);

    if (error) throw new Error(`Failed to update permissions: ${error.message}`);

    res.status(200).json({ message: 'Agent permissions updated successfully' });
  } catch (error: any) {
    console.error('Error updating agent permissions:', error);
    res.status(500).json({ error: error.message || 'Failed to update agent permissions' });
  }
});

// Fetch properties endpoint
app.get('/api/properties', async (req: Request, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabaseServer
      .from('properties')
      .select('*, profiles!properties_user_id_fkey(agent_id, email)')
      .order('created_at', { ascending: false });
    if (error) throw new Error(`Failed to fetch properties: ${error.message}`);
    res.status(200).json(data || []);
  } catch (error: any) {
    console.error('Error fetching properties:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch properties' });
  }
});

// Delete property endpoint
app.post('/api/delete-property', async (req: Request<{}, {}, DeletePropertyRequest>, res: Response): Promise<void> => {
  try {
    const { id } = req.body;
    if (!id) {
      res.status(400).json({ error: 'Property ID is required' });
      return;
    }

    const { error } = await supabaseServer
      .from('properties')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to delete property: ${error.message}`);

    res.status(200).json({ message: 'Property deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting property:', error);
    res.status(500).json({ error: error.message || 'Failed to delete property' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));