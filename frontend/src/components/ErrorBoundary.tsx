import { Component, type ReactNode } from 'react';
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="error-screen">
        <h2>The ocean viewer could not start</h2>
        <p>Check that hardware acceleration and WebGL are enabled in your browser.</p>
        <button onClick={() => window.location.reload()}>Restart viewer</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
