export function isPowerPointRequestText(request: string): boolean {
  const text = request.trim();
  if (!text || /^(?:how to|how do i|how can i|how should i|show me how to|teach me how to|explain how to|what is|what are|why does|why is|explain|ما هو|ما هي|ازاي|إزاي|كيف|طريقة استخدام)/i.test(text) || /\b(?:show|teach|explain)\s+(?:me\s+)?how\s+to\b/i.test(text)) return false;
  const negatedCreation = /(?:\b(?:do not|don't|dont|never|without)\s+(?:create|make|build|prepare|generate|design|produce|export|download)\b)|(?:\b(?:can't|cannot|won't|unable to|failed to)\s+(?:create|make|build|prepare|generate|design|produce|export|download)\b)|(?:^(?:why|fix|repair|edit|update|change|resize|reformat)\b)|(?:لا\s*(?:تعمل|تنشئ|تجهز|تجهّز|تصمم|تنفذ)|مش\s*(?:عايز|عاوز|محتاج)\s*(?:تعمل|تنشئ|تجهز)|بدون\s*(?:إنشاء|عمل)\s*(?:عرض|بوربوينت))/i;
  if (negatedCreation.test(text)) return false;
  const namesPowerPoint = /power\s*point|powerpoint|pptx|presentations?|slide\s*decks?|slides?|بوربوينت|عرض\s*(?:تقديمي|بوربوينت)|شرائح\s*(?:عرض|تقديمية)/i.test(text);
  const asksToCreate = /(?:عايز|عاوز|محتاج|اريد|أريد|أنشئ|انشئ|اعمل|أعمل|اعملي|جهز|جهّز|حضّر|حضر|صمم|صمّم|ابني|نفذ|نفّذ|create|make|build|prepare|generate|design|produce|export|download)/i.test(text);
  const editsExisting = /^(?:please\s+)?(?:edit|update|change|resize|reformat|repair|fix)\b/i.test(text) ||
    /\b(?:please|can you|could you|would you)\s+(?:edit|update|change|resize|reformat|repair|fix)\b/i.test(text) ||
    /\b(?:my|this|the)\s+(?:existing\s+)?(?:power\s*point|powerpoint|presentation|slide\s*deck)\b.{0,60}\b(?:font|size|layout|theme|spacing|alignment|color|colour)\b/i.test(text) ||
    /^(?:عدّل|عدل|غيّر|غير|كبّر|كبر|صغّر|صغر|أصلح|اصلح|صلّح|صلح)/i.test(text);
  return namesPowerPoint && asksToCreate && !editsExisting;
}
