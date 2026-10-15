declare module 'phoenix' {
  export class Socket {
    constructor(endPoint: string, opts?: {
      params?: Record<string, string> | (() => Record<string, string>);
      timeout?: number;
      heartbeatIntervalMs?: number;
      reconnectAfterMs?: (tries: number) => number;
      logger?: (kind: string, msg: string, data: any) => void;
      transport?: any;
    });
    connect(): void;
    disconnect(callback?: () => void, code?: number, reason?: string): void;
    channel(topic: string, chanParams?: Record<string, any>): Channel;
    onOpen(callback: () => void): void;
    onClose(callback: (event: any) => void): void;
    onError(callback: (error: any) => void): void;
    isConnected(): boolean;
    connectionState(): string;
  }

  export class Channel {
    join(timeout?: number): Push;
    leave(timeout?: number): Push;
    push(event: string, payload?: Record<string, any>, timeout?: number): Push;
    on(event: string, callback: (payload: any) => void): number;
    off(event: string, ref?: number): void;
    onClose(callback: () => void): void;
    onError(callback: (reason: any) => void): void;
  }

  export class Push {
    receive(status: string, callback: (response: any) => void): Push;
  }

  export class Presence {
    constructor(channel: Channel, opts?: any);
    onSync(callback: () => void): void;
    onJoin(callback: (key: string, currentPresence: any, newPresence: any) => void): void;
    onLeave(callback: (key: string, currentPresence: any, leftPresence: any) => void): void;
    list(chooser?: (key: string, presence: any) => any): any[];
    static syncState(currentState: any, newState: any, onJoin?: Function, onLeave?: Function): any;
    static syncDiff(currentState: any, diff: any, onJoin?: Function, onLeave?: Function): any;
  }
}
