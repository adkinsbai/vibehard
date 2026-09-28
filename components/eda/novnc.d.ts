declare module '@novnc/novnc' {
  /** Browser-facing subset of noVNC 1.7 RFB used by the KiCad workbench. */
  export default class RFB extends EventTarget {
    constructor(target: HTMLElement, url: string, options?: { shared?: boolean });
    resizeSession: boolean;
    scaleViewport: boolean;
    qualityLevel: number;
    compressionLevel: number;
    focusOnClick: boolean;
    disconnect(): void;
    focus(options?: FocusOptions): void;
    sendKey(keysym: number, code?: string, down?: boolean): void;
  }
}
