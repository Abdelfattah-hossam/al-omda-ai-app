import type {Workspace} from '@workspace/api-client-react';
export type WorkspacePage=Workspace&{nextOffset?:number|null};
export async function loadWorkspacePages(load:(offset:number)=>Promise<WorkspacePage>):Promise<Workspace> {
 const tasks=new Map<string,Workspace['tasks'][number]>();let offset=0;let profile:Workspace['profile']|undefined;
 while(true){
  const page=await load(offset);profile=page.profile;
  for(const task of page.tasks)tasks.set(task.id,task);
  if(page.nextOffset==null)break;
  if(!Number.isSafeInteger(page.nextOffset)||page.nextOffset<=offset)throw new Error('Invalid workspace page.');
  offset=page.nextOffset;
 }
 if(!profile)throw new Error('Workspace profile unavailable.');
 return{profile,tasks:[...tasks.values()]};
}
export function createSingleFlight(){let busy=false;return async(run:()=>Promise<void>)=>{if(busy)return;busy=true;try{await run();}finally{busy=false;}};}
