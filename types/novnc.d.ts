declare module '@novnc/novnc' {
  export default class RFB extends EventTarget {
    constructor(target: HTMLElement, url: string, options?: { shared?: boolean });
    resizeSession: boolean;
    scaleViewport: boolean;
    qualityLevel: number;
    compressionLevel: number;
    focusOnClick: boolean;
    disconnect(): void;
    focus(): void;
    sendKey(keysym: number, code?: string, down?: boolean): void;
    clipboardPasteFrom(text: string): void;
  }
}
