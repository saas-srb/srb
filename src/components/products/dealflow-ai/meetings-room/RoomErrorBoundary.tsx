"use client";

import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/** Last line of defence: a rendering bug in the room shows a calm recovery screen instead of a blank page. The call itself is cleaned up on unmount. */
export class RoomErrorBoundary extends Component<{ children: ReactNode; leaveHref: string }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[meeting room] render error:", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="fixed inset-0 z-50 flex items-center justify-center bg-background p-6">
        <div className="max-w-sm space-y-4 text-center">
          <h1 className="text-lg font-semibold">The meeting view hit a problem</h1>
          <p className="text-sm text-muted-foreground">Your connection was closed safely. Reload to rejoin the meeting, or go back.</p>
          <div className="flex justify-center gap-2">
            <Button onClick={() => window.location.reload()}>Rejoin</Button>
            <Button variant="outline" onClick={() => window.location.assign(this.props.leaveHref)}>
              Leave
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
