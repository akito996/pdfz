import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * "Rete di sicurezza" di React: se un pezzo dell'interfaccia va in errore mentre si disegna, al posto della
 * schermata bianca (React smonta tutta l'app) mostra il fallback; il resto dell'app continua a funzionare.
 * Usato attorno ai pannelli degli strumenti (ToolPanel) e attorno a tutta l'app (main.tsx).
 */
export class ErrorBoundary extends Component<
  { fallback: (error: Error, reset: () => void) => ReactNode; children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[PDFz] errore nell'interfaccia:", error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    return this.state.error ? this.props.fallback(this.state.error, this.reset) : this.props.children;
  }
}
