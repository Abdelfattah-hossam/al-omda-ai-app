# Agent page controls,real iPhone feedback

Source:user's two annotated iPhone screenshots,November23. Changes are limited to the agent page.

Root cause1:global workspace palette gave inputs/selects a dark background while their wrapping label used a lighter background. Safari's native select arrow also differed from the rest of the control. The specific reset now sits in the same named palette layer because important layered styles outrank important unlayered styles. Search/select text areas are transparent within a unified wrapper;icons cannot shrink;select has one CSS arrow with a non-interactive hit area.

Root cause2:the disclosure summary relied on float:inline-end and a negative top margin. Support varies,and multiline headings plus a separate icon caused a crowded,uneven left column. Both agent accordions now have explicit grid columns for text,icon,and disclosure marker. No negative positioning or floating marker remains. Native details/summary interaction is preserved.

274coretests pass,1skip. Build/typecheck pass.390px browser emulation visual inspection verified both control layouts,Arabic and English accordion toggle checks passed. User's original screenshots are physical iPhone evidence,but the after screenshots are Chromium emulation,not a completed physical-device retest. Chat layout and scrolling were not changed.
