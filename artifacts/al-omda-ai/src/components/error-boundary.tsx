import {
  Component,
  type ComponentType,
  type ErrorInfo,
  type ReactNode,
} from 'react';

export interface ErrorFallbackProps {
  error: Error;
  resetError: () => void;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  FallbackComponent?: ComponentType<ErrorFallbackProps>;
  /** Changing this clears a caught error. Pass the route to recover on navigation. */
  resetKey?: unknown;
}

interface ErrorBoundaryState {
  error: Error | null;
}

function toError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }
  if (typeof value === 'string') {
    return new Error(value);
  }
  try {
    return new Error(JSON.stringify(value));
  } catch {
    return new Error(String(value));
  }
}

function DefaultFallback({ error, resetError }: ErrorFallbackProps) {
  const ar = document.documentElement.lang !== 'en';
  const updatedBundle = /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk [\w-]+ failed|ChunkLoadError/i.test(error.message);
  return <div dir={ar?'rtl':'ltr'} style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:24,background:'#111015',color:'#e2d8ef'}}>
    <div style={{width:'min(520px,100%)',textAlign:'center'}}>
      <h1 style={{fontSize:22,color:'#9669d4'}}>{updatedBundle?(ar?'يوجد إصدار أحدث من التطبيق':'An app update is ready'):(ar?'تعذر عرض هذه الصفحة':'Something went wrong')}</h1>
      <p style={{fontSize:15,lineHeight:1.9,color:'#afa5be'}}>{updatedBundle?(ar?'حدّث الصفحة لتحميل الملفات الجديدة. مشاريعك ومحادثاتك المحفوظة ستبقى كما هي.':'Reload to load the updated app files. Your saved projects and conversations will remain unchanged.'):(ar?'حدث خطأ في هذا الجزء من التطبيق. يمكنك المحاولة مرة أخرى.':'This part of the app hit an error. You can try again.')}</p>
      <details style={{margin:'16px 0',textAlign:'start',overflowWrap:'anywhere'}}><summary style={{cursor:'pointer',minHeight:44}}>{ar?'تفاصيل الخطأ للمساعدة':'Error details for support'}</summary><pre dir="ltr" style={{whiteSpace:'pre-wrap',fontSize:12,overflowWrap:'anywhere'}}>{JSON.stringify({name:error.name,message:error.message.slice(0,700),build:import.meta.env.VITE_APP_BUILD_ID,path:window.location.pathname,browser:navigator.userAgent},null,2)}</pre><p style={{fontSize:12}}>{ar?'التفاصيل محفوظة على هذا الجهاز فقط، ولا تُرسل تلقائيًا.':'Details stay on this device and are not sent automatically.'}</p></details>
      <button type="button" onClick={updatedBundle?()=>window.location.reload():resetError} style={{minHeight:44,padding:'10px 22px',borderRadius:10,border:'1px solid #8b5eca',background:'#9669d4',color:'#110d17',fontWeight:700,cursor:'pointer'}}>{updatedBundle?(ar?'تحديث التطبيق':'Reload app'):(ar?'حاول مرة أخرى':'Try again')}</button>
    </div>
  </div>;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: toError(error) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    const actual=toError(error);
    const diagnostic={name:actual.name,message:actual.message.slice(0,700),build:import.meta.env.VITE_APP_BUILD_ID,path:window.location.pathname,browser:navigator.userAgent,time:new Date().toISOString()};
    try { window.localStorage.setItem('omda-last-render-error',JSON.stringify(diagnostic)); } catch { /* Error UI must work when storage is blocked. */ }
    console.error(
      'ErrorBoundary caught an error:',
      toError(error),
      info.componentStack,
    );
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (
      this.state.error !== null &&
      prevProps.resetKey !== this.props.resetKey
    ) {
      this.resetError();
    }
  }

  resetError = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error === null) {
      return this.props.children;
    }
    const Fallback = this.props.FallbackComponent ?? DefaultFallback;
    return <Fallback error={error} resetError={this.resetError} />;
  }
}
