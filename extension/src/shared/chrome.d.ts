// Only the extension APIs used here. Split View APIs require Chrome 155+.
interface Screen {
  readonly availLeft: number;
  readonly availTop: number;
}
interface ChromeTab {
  id?: number;
  windowId: number;
  url?: string;
  splitViewId?: number;
  status?: string;
}
interface ChromeWindow {
  id?: number;
  tabs?: ChromeTab[];
  left?: number;
  top?: number;
  width?: number;
  height?: number;
}
interface ChromeSender {
  tab?: ChromeTab;
  url?: string;
  documentId?: string;
  frameId?: number;
}
interface ChromeEvent<T extends (...args: any[]) => any> {
  addListener(listener: T): void;
}
declare const chrome: {
  runtime: {
    id: string;
    getURL(path: string): string;
    sendMessage<T = unknown>(message: unknown): Promise<T>;
    onMessage: ChromeEvent<
      (
        message: unknown,
        sender: ChromeSender,
        sendResponse: (reply: unknown) => void,
      ) => boolean | void
    >;
    onStartup: ChromeEvent<() => void>;
  };
  action: { onClicked: ChromeEvent<() => void> };
  storage: {
    local: {
      get(key: string): Promise<Record<string, any>>;
      set(value: Record<string, unknown>): Promise<void>;
    };
    onChanged: ChromeEvent<(changes: Record<string, { newValue?: unknown }>, area: string) => void>;
  };
  alarms: {
    create(name: string, info: { periodInMinutes?: number; when?: number }): Promise<void>;
    clear(name: string): Promise<boolean>;
    onAlarm: ChromeEvent<(alarm: { name: string }) => void>;
  };
  webRequest: {
    onHeadersReceived: {
      addListener(
        listener: (details: {
          tabId: number;
          url: string;
          statusCode: number;
          timeStamp: number;
          documentId?: string;
          responseHeaders?: { name: string; value?: string }[];
        }) => void,
        filter: { urls: string[] },
        extraInfoSpec: string[],
      ): void;
    };
  };
  tabs: {
    create(properties: {
      url?: string;
      windowId?: number;
      active?: boolean;
      index?: number;
    }): Promise<ChromeTab>;
    get(id: number): Promise<ChromeTab>;
    query(properties: Record<string, unknown>): Promise<ChromeTab[]>;
    update(
      id: number,
      properties: { url?: string; active?: boolean; muted?: boolean; autoDiscardable?: boolean },
    ): Promise<ChromeTab>;
    remove(ids: number | number[]): Promise<void>;
    createSplit?(ids: [number, number]): Promise<number>;
    sendMessage<T = unknown>(id: number, message: unknown): Promise<T>;
    onRemoved: ChromeEvent<(id: number) => void>;
    onUpdated: ChromeEvent<
      (id: number, change: { status?: string; url?: string }, tab: ChromeTab) => void
    >;
  };
  windows: {
    create(properties: {
      url: string;
      type: 'normal';
      focused: boolean;
      left: number;
      top: number;
      width: number;
      height: number;
    }): Promise<ChromeWindow>;
    update(
      id: number,
      properties: {
        focused?: boolean;
        left?: number;
        top?: number;
        width?: number;
        height?: number;
      },
    ): Promise<ChromeWindow>;
    remove(id: number): Promise<void>;
  };
};
