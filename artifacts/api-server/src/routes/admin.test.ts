import test from 'node:test';import assert from 'node:assert/strict';import {validAdminWrite} from './admin';import {readFileSync}from 'node:fs';
test('admin mutation schema rejects privilege escalation secrets and chat access',()=>{
 for(const data of [{role:'admin'},{password:'secret'},{chatId:'x'},{serviceRole:'x'},{suspended:'false'}])assert.equal(validAdminWrite('update_user',data),false);
 assert.equal(validAdminWrite('update_user',{displayName:'اختبار',suspended:false}),true);
 assert.equal(validAdminWrite('update_project',{title:'عنوان',expectedUpdatedAt:'2026-11-23'}),true);
 assert.equal(validAdminWrite('delete_user',{}),false);
});
test('admin database action surface excludes conversation and memory tables',()=>{
 const sql=readFileSync(new URL('../../../../supabase/migrations/20261123093600_app_admin.sql',import.meta.url),'utf8');
 assert.ok(sql.includes("Admin access denied"));assert.ok(sql.includes('auth.uid()'));assert.ok(sql.includes('app_admin_audit'));assert.ok(sql.includes("Project changed. Reload"));
 assert.ok(!/\b(?:ai_chat_history|ai_conversations|ai_messages|ai_user_memory|ai_memory_nodes)\b/.test(sql));
 assert.ok(sql.includes('revoke all on public.app_admins'));
});
