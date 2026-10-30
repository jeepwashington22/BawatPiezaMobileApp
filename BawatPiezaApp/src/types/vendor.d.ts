declare module "paho-mqtt" {
  namespace Paho {
    class Client {
      constructor(host: string, port: number, clientId: string);
      constructor(host: string, port: number, path: string, clientId: string);
      onConnectionLost?: (response: { errorCode?: number }) => void;
      onMessageArrived?: (message: Message) => void;
      connect(options: {
        [key: string]: unknown;
        useSSL?: boolean;
        onSuccess?: () => void;
        onFailure?: (error: unknown) => void;
      }): void;
      subscribe(topic: string): void;
      send(message: Message): void;
      isConnected(): boolean;
      disconnect(): void;
    }

    class Message {
      constructor(payload: string);
      payloadString: string;
      destinationName: string;
    }
  }

  export = Paho;
}

declare module "text-encoding";
