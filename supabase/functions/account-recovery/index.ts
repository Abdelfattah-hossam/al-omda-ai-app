import {createRecoveryHandler} from './handler.ts';
Deno.serve(createRecoveryHandler({url:Deno.env.get('SUPABASE_URL')!,key:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}));
