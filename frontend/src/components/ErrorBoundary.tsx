import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in React component:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '60px 20px', color: '#fff', textAlign: 'center', fontFamily: 'monospace', maxWidth: '600px', margin: '40px auto', background: 'rgba(18, 12, 38, 0.9)', borderRadius: '12px', border: '1px solid #ff1744' }}>
          <h2 style={{ color: '#ffab00', marginBottom: '16px' }}>⚠️ Something went wrong rendering this view.</h2>
          <p style={{ color: '#ff1744', background: 'rgba(255, 23, 68, 0.1)', padding: '12px', borderRadius: '6px', fontSize: '0.85rem' }}>
            {this.state.error?.toString()}
          </p>
          <button 
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
            style={{ padding: '10px 20px', background: '#00e5ff', color: '#090314', border: 'none', borderRadius: '6px', fontWeight: 900, cursor: 'pointer', marginTop: '20px' }}
          >
            🔄 RELOAD PAGE
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
