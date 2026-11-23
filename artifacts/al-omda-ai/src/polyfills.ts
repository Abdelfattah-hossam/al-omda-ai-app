/* First entry dependency. Focused standardized APIs needed by Chrome79+/Safari13+.
   Do not import all of core-js/stable: it includes hundreds of unrelated legacy
   and newly standardized shims. Keep audited dependency coverage explicit. */
import 'core-js/stable/object/has-own';
import 'core-js/stable/object/from-entries';
import 'core-js/stable/object/group-by';
import 'core-js/stable/array/at';
import 'core-js/stable/array/find-last';
import 'core-js/stable/array/find-last-index';
import 'core-js/stable/array/to-reversed';
import 'core-js/stable/array/to-sorted';
import 'core-js/stable/array/to-spliced';
import 'core-js/stable/array/with';
import 'core-js/stable/array/flat';
import 'core-js/stable/array/flat-map';
import 'core-js/stable/string/at';
import 'core-js/stable/string/match-all';
import 'core-js/stable/string/replace-all';
import 'core-js/stable/string/is-well-formed';
import 'core-js/stable/string/to-well-formed';
import 'core-js/stable/promise/all-settled';
import 'core-js/stable/promise/any';
import 'core-js/stable/promise/with-resolvers';
import 'core-js/stable/aggregate-error';
import 'core-js/modules/es.error.cause';
import 'core-js/stable/map/group-by';
import 'core-js/stable/global-this';
import 'core-js/stable/structured-clone';

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
