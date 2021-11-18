import {
  ConsumerOptions,
  DtlsParameters,
  MediaKind,
  RtpCapabilities,
  RtpParameters,
  TransportOptions,
} from "mediasoup-client/lib/types";
import SocketClient, { Socket } from "socket.io-client";

export type Participant = {
  type: "inmate" | "doc" | "user";
  id: string;
};

export type CallStatus =
  | "live"
  | "missing_monitor"
  | "ended"
  | "terminated"
  | "no_show";

type WebRtcInfo = Pick<
  TransportOptions,
  "id" | "iceParameters" | "iceCandidates" | "dtlsParameters"
>;

type ServerMessages = {
  callStatus: CallStatus;
  consume: Required<Omit<ConsumerOptions, "appData">> & {
    user: Participant;
  };
  participantDisconnect: Participant;
  joined: Participant & { callId: string };
  producerUpdate: {
    producerId: string;
    from: Participant;
    paused: boolean;
    type: MediaKind;
  };
  textMessage: {
    from: Participant;
    contents: string;
  };
};

type ClientMessages = {
  authenticate: [Participant & { token: string }, { success: true }];
  join: [
    { callId: string; token: string },
    {
      consumerTransportInfo: WebRtcInfo;
      producerTransportInfo?: WebRtcInfo;
      routerRtpCapabilities: RtpCapabilities;
    }
  ];
  declareRtpCapabilities: [
    { rtpCapabilities: RtpCapabilities },
    { success: true }
  ];
  establishDtls: [
    {
      callId: string;
      transportId: string;
      dtlsParameters: DtlsParameters;
    },
    { success: true }
  ];
  finishConnecting: [{ callId: string }, { success: true }];
  produce: [
    { callId: string; kind: MediaKind; rtpParameters: RtpParameters },
    { producerId: string }
  ];
  producerUpdate: [
    {
      callId: string;
      paused: boolean;
      producerId: string;
      type: MediaKind;
    },
    { success: true }
  ];
  textMessage: [
    {
      callId: string;
      contents: string;
    },
    { success: true }
  ];
  terminate: [Record<string, never>, { success: true }];
};

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

  waitFor<R>(event: string): Promise<R> {
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
