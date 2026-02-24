import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Remplacez par vos clés Supabase
const supabaseUrl = 'https://buqsbkloueboxhrnxvkv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1cXNia2xvdWVib3hocm54dmt2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1MDQ4NzgsImV4cCI6MjA4NzA4MDg3OH0.b5gkFFHRy_fXZXc6gECx7R7bDQQoclaPhXhgeN01Iec';

// Créez l'instance Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

// Exportez l'instance
export { supabase };