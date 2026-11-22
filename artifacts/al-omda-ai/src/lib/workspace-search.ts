// Load every known project folder without opening an unbounded request burst.
export async function loadSearchFolders<T>(
 folders: readonly {url:string;projectId:string|null}[],
 load:(folder:{url:string;projectId:string|null})=>Promise<T[]>,
 keepGoing:()=>boolean=()=>true,
):Promise<T[]> {
 const results:T[][]=Array.from({length:folders.length},()=>[]);
 let cursor=0;
 await Promise.all(Array.from({length:Math.min(4,folders.length)},async()=>{
  while(keepGoing()){
   const index=cursor++;
   if(index>=folders.length)return;
   try{results[index]=await load(folders[index]);}catch{results[index]=[];}
  }
 }));
 return results.flat();
}
