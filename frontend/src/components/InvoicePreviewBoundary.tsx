import { Component, type ReactNode } from 'react';
import { InvoicePreviewFailure } from './InvoicePreviewFailure';

interface InvoicePreviewBoundaryProps {
  children: ReactNode;
  onClose: () => void;
  onDownload: () => void;
}

export class InvoicePreviewBoundary extends Component<InvoicePreviewBoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed
      ? <InvoicePreviewFailure onClose={this.props.onClose} onDownload={this.props.onDownload} />
      : this.props.children;
  }
}
