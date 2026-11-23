export const WORKSPACE_PAGE_SIZE=100;
export function workspaceOffset(value:unknown):number|null {
 if(value===undefined)return 0;
 if(typeof value!=='string'||!/^\d+$/.test(value))return null;
 const n=Number(value);return Number.isSafeInteger(n)&&n>=0?n:null;
}
