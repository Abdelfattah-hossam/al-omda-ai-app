export function mediaImageError(error: unknown, ar: boolean): { status: number; message: string } {
 const text = error instanceof Error ? error.message : String(error);
 if (/3036|429|quota|daily.*limit|allocation|rate.?limit/i.test(text)) return {status:429,message:ar?'وصلنا للحد المجاني للصور حاليًا. جرّب بعد تجدد الحصة؛ لن نستخدم خدمة مدفوعة.':'The free image allowance is currently exhausted. Try after it resets; no paid service is used.'};
 return {status:503,message:ar?'إنشاء الصور غير متاح مؤقتًا. لم يتم إنشاء ملف أو خصم وحدات.':'Image generation is temporarily unavailable. No file was created or units deducted.'};
}
export function parseGeneratedJpeg(result: unknown): string | null {
 if (!result || typeof result !== 'object') return null;
 const image = (result as {image?:unknown}).image;
 if(typeof image !== 'string' || image.length > 12_000_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image)) return null;
 const bytes=Buffer.from(image,'base64');
 return bytes.length > 100 && bytes[0]===255 && bytes[1]===216 && bytes[2]===255 ? image : null;
}
