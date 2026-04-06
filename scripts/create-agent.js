import 'dotenv/config';
import { supabase } from '../lib/supabase.js';

const [, , email, password] = process.argv;

if (!email || !password) {
  console.error('Usage: node scripts/create-agent.js <email> <password>');
  process.exit(1);
}

const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});

if (error) {
  console.error('Failed to create agent:', error.message);
  process.exit(1);
}

console.log('Created agent:', { id: data.user.id, email: data.user.email });
