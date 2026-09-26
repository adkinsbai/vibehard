export type PartKind = 'resistor' | 'capacitor' | 'led' | 'connector2' | 'connector4' | 'mcu' | 'sensor' | 'r0603' | 'c0603' | 'led0603' | 'header2' | 'header4' | 'esp32wroom32' | 'tmp102';
export type ViewMode = 'schematic' | 'pcb';
export type Position = { x: number; y: number; rotation: number };
export type PinRef = { componentId: string; pinId: string };
export type EdaComponent = { id: string; ref: string; kind: PartKind; value: string; schematic: Position; pcb: Position & { side: 'top' | 'bottom' }; locked: boolean };
export type EdaNet = { id: string; name: string; nodes: PinRef[] };
export type EdaTrack = { id: string; netId: string; layer: 'top' | 'bottom'; width: number; points: { x: number; y: number }[] };
export type EdaDocument = { schemaVersion: 1; id: string; name: string; revision: number; components: EdaComponent[]; nets: EdaNet[]; tracks: EdaTrack[]; board: { width: number; height: number }; appliedBatchIds: string[] };
export type EditCommand =
  | { type: 'addComponent'; component: EdaComponent }
  | { type: 'removeComponent'; id: string }
  | { type: 'moveComponent'; id: string; view: ViewMode; x: number; y: number; rotation?: number }
  | { type: 'setComponent'; id: string; changes: Partial<Pick<EdaComponent, 'ref' | 'value' | 'locked'>> }
  | { type: 'connectPins'; a: PinRef; b: PinRef; netName?: string }
  | { type: 'disconnectPin'; pin: PinRef }
  | { type: 'renameNet'; id: string; name: string }
  | { type: 'addTrack'; track: EdaTrack }
  | { type: 'removeTrack'; id: string }
  | { type: 'setBoard'; width: number; height: number }
  | { type: 'renameDocument'; name: string };
export type EditBatch = { id: string; baseRevision: number; label: string; actor: 'user' | 'agent'; commands: EditCommand[] };
export type EdaIssue = { id: string; severity: 'error' | 'warning' | 'info'; message: string; componentId?: string; netId?: string; trackId?: string };
