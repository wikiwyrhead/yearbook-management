import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  tabName: string;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class TabErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[TabErrorBoundary] Error in tab "${this.props.tabName}":`, error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  public override render() {
    if (this.state.hasError) {
      return (
        <div className="plate p-8 my-6 text-center border-destructive/30 bg-destructive/5 rounded-xl">
          <AlertCircle className="mx-auto size-10 text-destructive/60 mb-3" />
          <h3 className="font-display text-lg text-foreground">
            Unable to display {this.props.tabName}
          </h3>
          <p className="text-xs text-muted-foreground mt-1 mb-4 max-w-md mx-auto">
            {this.state.error?.message || "An unexpected error occurred while rendering this tab."}
          </p>
          <Button variant="outline" size="sm" onClick={this.handleRetry}>
            <RefreshCw className="mr-2 size-3" /> Retry Tab
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
