import { io as SocketClient, Socket } from "socket.io-client";
import { ClientMessages, ServerMessages } from "./API";
import ConnectionMonitor from "./ConnectionMonitor";
import { ConnectionState } from "./RoomClient";

/**
 * Client is a typed wrapper for raw socket events sent to and from the server.
 */
export default class Client {
  private socket: Socket;
  public connectionMonitor: ConnectionMonitor;

  /**
   * connect is a Client constructor that will wait until it is connected
   */
  static async connect(url: string): Promise<Client> {
    const client = new this(url);
    await client.waitFor("connect");
    return client;
  }

  protected constructor(
    url: string,
    private broadcastConnectionState?: boolean
  ) {
    this.socket = SocketClient(url, { transports: ["websocket"] });
    this.connectionMonitor = new ConnectionMonitor(this.socket, 500);
    if (this.broadcastConnectionState) {
      this.connectionMonitor.emitter.on("quality", this.emitConnectionState);
    }
  }

  private emitConnectionState(currentQuality: ConnectionState) {
    this.emit("connectionState", currentQuality);
  }

  on<E extends keyof ServerMessages>(
    name: E,
    handler: (data: ServerMessages[E]) => void
  ) {
    this.socket.on(name, handler as any);
  }

  off<E extends keyof ServerMessages>(
    name: E,
    handler?: (data: ServerMessages[E]) => void
  ) {
    this.socket.off(name, handler as any);
  }

  close(): void {
    if (this.broadcastConnectionState) {
      this.connectionMonitor.emitter.off("quality", this.emitConnectionState);
    }
    this.socket.close();
  }

  async waitFor<R>(event: string): Promise<R> {
    return new Promise<R>((resolve) => this.socket.once(event, resolve));
  }

  async emit<E extends keyof ClientMessages>(
    name: E,
    data: ClientMessages[E][0]
  ): Promise<ClientMessages[E][1]> {
    return new Promise((resolve, reject) => {
      this.socket.emit(
        name,
        data,
        (response: ClientMessages[E][1] | { error: string }) => {
          if ("error" in response) reject(response.error);
          else resolve(response);
        }
      );
    });
  }
}
