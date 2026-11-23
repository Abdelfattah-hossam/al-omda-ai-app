export const AVATAR_EDGE=384;
export function avatarDimensions(width:number,height:number):{width:number;height:number}{
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new Error('Invalid image dimensions.');
 const scale=Math.min(1,AVATAR_EDGE/Math.max(width,height));return{width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
}
/** Only the avatar's display copy is resized. Never upscale or crop the source. */
export async function prepareAvatarImage(file:File):Promise<Blob>{
 const url=URL.createObjectURL(file);
 try{
  const image=await new Promise<HTMLImageElement>((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Could not decode the image.'));img.src=url;});
  const size=avatarDimensions(image.naturalWidth,image.naturalHeight);
  const canvas=document.createElement('canvas');canvas.width=size.width;canvas.height=size.height;
  const ctx=canvas.getContext('2d');if(!ctx)return file;
  ctx.drawImage(image,0,0,size.width,size.height);
  // WebP retains alpha. Older browsers that do not encode WebP return PNG.
  const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/webp',.82));
  if(!blob||!['image/png','image/webp','image/jpeg'].includes(blob.type)||blob.size>=file.size)return file;
  return blob;
 }finally{URL.revokeObjectURL(url);}
}
