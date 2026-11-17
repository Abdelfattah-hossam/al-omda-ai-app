export function isStandaloneHtmlRequest(request: string): boolean {
  const text = request.normalize("NFKC").toLocaleLowerCase();
  return /\b(?:single|one[- ]file|standalone|self[- ]contained)\s+(?:html\s+)?(?:file|page|document|app)\b|\bhtml\s+only\b|\bonly\s+one\s+html\s+file\b|ملف\s+html\s+واحد|صفحة\s+html\s+واحدة|html\s+فقط|ملف\s+واحد\s+html/u.test(text);
}

export function isMultiFileProjectRequest(request: string): boolean {
  const text = request.normalize("NFKC").toLocaleLowerCase();
  if (isStandaloneHtmlRequest(text)) return false;
  if (/\b(?:clock|timer|stopwatch|countdown|calculator|unit converter|simple calculator)\b|ساعة|مؤقت|ساعة إيقاف|آلة حاسبة|حاسبة وحدات/u.test(text)) return false;
  return /\b(?:website|web site|web app|web application|landing page|e-commerce|ecommerce|marketplace|online store|shopping cart|checkout|admin dashboard|dashboard|crm|erp|saas|full[- ]stack|backend|database|multi[- ]page|portal|inventory|order management|user accounts|authentication|store|app|application|software|system|project)\b|موقع|متجر|سوق إلكتروني|سوق الكتروني|سلة مشتريات|الدفع الإلكتروني|الدفع الالكتروني|لوحة تحكم|نظام إدارة|نظام ادارة|إدارة مخزون|ادارة مخزون|حسابات مستخدمين|تسجيل دخول|قاعدة بيانات|متعدد الصفحات|تطبيق متكامل/u.test(text);
}
