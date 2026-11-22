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
  return <div dir={ar?'rtl':'ltr'} style={{minHeight:'100dvh',display:'grid',placeItems:'center',padding:24,background:'#111015',color:'#efe7d8'}}>
    <div style={{width:'min(520px,100%)',textAlign:'center'}}>
      <h1 style={{fontSize:22,color:'#d4ae69'}}>{updatedBundle?(ar?'يوجد إصدار أحدث من التطبيق':'An app update is ready'):(ar?'تعذر عرض هذه الصفحة':'Something went wrong')}</h1>
      <p style={{fontSize:15,lineHeight:1.9,color:'#beb5a5'}}>{updatedBundle?(ar?'حدّث الصفحة لتحميل الملفات الجديدة. مشاريعك ومحادثاتك المحفوظة ستبقى كما هي.':'Reload to load the updated app files. Your saved projects and conversations will remain unchanged.'):(ar?'حدث خطأ في هذا الجزء من التطبيق. يمكنك المحاولة مرة أخرى.':'This part of the app hit an error. You can try again.')}</p>
      {import.meta.env.DEV&&<pre style={{overflow:'auto',textAlign:'start'}}>{error.message}</pre>}
      <button type="button" onClick={updatedBundle?()=>window.location.reload():resetError} style={{minHeight:44,padding:'10px 22px',borderRadius:10,border:'1px solid #caa65e',background:'#d4ae69',color:'#17130d',fontWeight:700,cursor:'pointer'}}>{updatedBundle?(ar?'تحديث التطبيق':'Reload app'):(ar?'حاول مرة أخرى':'Try again')}</button>
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
