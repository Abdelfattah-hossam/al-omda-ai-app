/* Must evaluate before React, route modules and their dependencies.
   Syntax lowering cannot supply runtime APIs used by markdown and other libraries.
   core-js/stable covers standardized ES APIs, including hasOwn, at, replaceAll,
   fromEntries, findLast, structuredClone.
   Native implementations are retained where they pass the library's checks. */
import 'core-js/stable';

// AbortSignal.timeout is a Web API, not an ECMAScript stable module.
if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout !== 'function') {
  Object.defineProperty(AbortSignal, 'timeout', {configurable:true,writable:true,value:(milliseconds:number):AbortSignal=>{
    if (!Number.isInteger(milliseconds) || milliseconds<0 || milliseconds>Number.MAX_SAFE_INTEGER) throw new RangeError('Timeout must be a nonnegative safe integer.');
    const controller=new AbortController();
    let remaining=milliseconds;
    const tick=()=>{const delay=Math.min(remaining,2147483647);remaining-=delay;setTimeout(()=>{if(remaining>0)tick();else controller.abort(new DOMException('The operation timed out.','TimeoutError'));},delay);};
    tick();return controller.signal;
  }});
}
