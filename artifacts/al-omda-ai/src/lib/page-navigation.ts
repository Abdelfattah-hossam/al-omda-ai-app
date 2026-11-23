// Legacy section links contain focus= even when the user only chose a page.
// Do not interpret these default section targets as an intentional deep jump.
export function isDefaultPageFocus(path:string,target:string|null):boolean{
 if(!target||path==='/ai')return false;
 const defaults:Record<string,string>={'/':'dashboard-overview','/profile':'profile-account-card','/history':'history-list','/projects':'history-list','/pipeline':'pipeline-board','/assets':'assets-list','/agents':'agent-marketplace-grid','/workbench':'request-input'};
 return target==='dashboard-overview'||defaults[path]===target;
}
