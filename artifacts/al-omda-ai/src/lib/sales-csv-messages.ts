const arabicErrors:Record<string,string>={
 'CSV exceeds the 2 MB import limit.':'حجم ملف CSV أكبر من الحد المسموح، 2 ميجابايت.',
 'CSV contains an unclosed quoted field.':'يوجد حقل بعلامة اقتباس غير مغلقة في ملف CSV.',
 'CSV must contain a header and at least one transaction row.':'يجب أن يحتوي ملف CSV على أسماء الأعمدة وصف معاملة واحد على الأقل.',
 'Column count does not match the header.':'عدد القيم لا يطابق عدد الأعمدة في رأس الملف.',
 'date must be a real ISO date':'يجب أن يكون التاريخ صالحًا بصيغة ISO، مثل 2026-11-22.',
 'amount must be a positive number with up to 2 decimals':'يجب أن يكون المبلغ رقمًا موجبًا بحد أقصى منزلتان عشريتان.',
 'currency must be a supported 3-letter ISO code':'يجب أن تكون العملة رمز ISO مدعومًا من 3 أحرف، مثل AED.',
 'status must be paid, refunded, pending, or cancelled':'يجب أن تكون الحالة paid أو refunded أو pending أو cancelled.',
};
export function formatSalesCsvError(message:string,language:'ar'|'en'):string {
 if(language==='en')return message;
 if(message.startsWith('Missing required columns: '))return 'الأعمدة المطلوبة غير موجودة: '+message.slice('Missing required columns: '.length);
 const limit=/^CSV exceeds the (\d+) transaction row limit\.$/.exec(message);
 if(limit)return 'عدد المعاملات أكبر من الحد المسموح: '+limit[1]+' صف.';
 return message.split('; ').map(part=>arabicErrors[part]??'تعذر قراءة هذا الصف. تحقق من القيم وصيغة الملف.').join(' ');
}
