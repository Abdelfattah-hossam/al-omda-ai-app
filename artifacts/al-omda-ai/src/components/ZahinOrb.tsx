import { useEffect, useId, useRef } from "react";

export type ZahinOrbState = "idle" | "thinking" | "speaking";

// Elliptical orbit of the brand mark, traced exactly: start point is the
// rotated (-24 deg) ellipse at parameter angle 0, two arcs complete it.
const ORBIT_PATH = "M 674.1 318 a 300 118 -24 1 0 -548.2 244 a 300 118 -24 1 0 548.2 -244";
const ORBIT_DUR: Record<ZahinOrbState, string> = { idle: "14s", thinking: "3.4s", speaking: "6.5s" };

export function ZahinOrb({ state = "idle", interactive = false, className = "" }: { state?: ZahinOrbState; interactive?: boolean; className?: string }) {
  const ref = useRef<SVGSVGElement | null>(null);
  const uid = "zahinOrb" + useId().replace(/[^a-zA-Z0-9]/g, "");

  // SMIL motion (the orbiting dot) is not covered by CSS reduced-motion
  // rules, so pause it directly when the user prefers reduced motion.
  useEffect(() => {
    const svg = ref.current;
    if (!svg || typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      try {
        if (mq.matches) svg.pauseAnimations(); else svg.unpauseAnimations();
      } catch { /* older engines without SMIL control */ }
    };
    apply();
    const add = mq.addEventListener ? mq.addEventListener.bind(mq, "change", apply) : mq.addListener ? mq.addListener.bind(mq, apply) : null;
    const remove = mq.removeEventListener ? mq.removeEventListener.bind(mq, "change", apply) : mq.removeListener ? mq.removeListener.bind(mq, apply) : null;
    if (add) add();
    return () => { if (remove) remove(); };
  }, []);

  return (
    <svg ref={ref} className={"zahin-orb" + (interactive ? " zahin-orb-interactive" : "") + (className ? " " + className : "")} data-state={state} viewBox="0 0 800 800" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={uid + "Grad"} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c9acff" />
          <stop offset="1" stopColor="#83cfff" />
        </linearGradient>
        <path id={uid + "Path"} d={ORBIT_PATH} fill="none" />
      </defs>
      <circle className="zahin-orb-ring" cx="400" cy="440" r="185" fill="none" stroke={"url(#" + uid + "Grad)"} strokeWidth="40" />
      <ellipse cx="400" cy="440" rx="300" ry="118" fill="none" stroke={"url(#" + uid + "Grad)"} strokeWidth="22" opacity="0.55" transform="rotate(-24 400 440)" />
      <polygon className="zahin-orb-spark" points="400,330 424,416 510,440 424,464 400,550 376,464 290,440 376,416" fill={"url(#" + uid + "Grad)"} />
      <circle className="zahin-orb-dot" r="26" fill={"url(#" + uid + "Grad)"}>
        <animateMotion key={state} dur={ORBIT_DUR[state] || ORBIT_DUR.idle} repeatCount="indefinite">
          <mpath href={"#" + uid + "Path"} xlinkHref={"#" + uid + "Path"} />
        </animateMotion>
      </circle>
    </svg>
  );
}

export default ZahinOrb;
