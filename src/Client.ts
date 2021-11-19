import SocketClient, { Socket } from "socket.io-client";
import { ClientMessages, ServerMessages } from "./API";

/**
 * Client is a typed wrapper for raw socket events sent to and from the server.
 */
export default class Client {
  private socket: Socket;

  /**
   * connect is a Client constructor that will wait until it is connected
   */
  static async connect(url: string): Promise<Client> {
    const client = new this(url);
    await client.waitFor("connect");
    return client;
  }

  protected constructor(url: string) {
    this.socket = SocketClient(url);
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
