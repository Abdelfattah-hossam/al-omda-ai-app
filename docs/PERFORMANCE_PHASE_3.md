# Performance phase3: avatars

New avatar uploads are decoded locally and fit inside384x384without cropping or upscaling. WebP encoding keeps transparency;older encoders fall back toPNG. If the new blob is bigger than the source or unsupported,the original is uploaded. Temporary object URLs are released on every path. Decode failures produce an error instead of an empty upload. Existing5MB/type validation and server signature validation remain in place. Avatar delivery stays private,no-store,so a browser shared by two accounts cannot reuse the prior account's avatar URL from its HTTP cache.

Existing stored avatars are not modified or deleted. Existing large photos shrink only when uploaded again. This is deliberate data preservation,not a claim that all historical avatars are already optimized.

273coretests passed,1skipped;typecheck/build passed. A real browser canvas test with a synthetic transparent2400x1200PNG produced384x192WebP,kept transparent corners,and reduced the byte count. No production user's avatar was replaced for testing. No physical iPhone test has been performed.
