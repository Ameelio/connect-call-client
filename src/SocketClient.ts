import {
  DtlsParameters,
  MediaKind,
  RtpCapabilities,
  RtpParameters,
  TransportOptions,
} from "mediasoup-client/lib/types";
import Client, { Socket } from "socket.io-client";

type CallParticipantType = "inmate" | "doc" | "user";

type WebRtcInfo = Pick<
  TransportOptions,
  "id" | "iceParameters" | "iceCandidates" | "dtlsParameters"
>;

export default class SocketClient {
  private socket: Socket;

  /**
   * connect is a SocketClient constructor that will wait until it is connected
   */
  static async connect(url: string): Promise<SocketClient> {
    const client = new this(url);
    await client.waitForEvent("connect");
    return client;
  }

  protected constructor(url: string) {
    this.socket = Client(url);
  }

  close(): void {
    this.socket.close();
  }

  /**
   * authenticate sends user information so the server can know who
   * is on the socket.
   */
  async authenticate(data: {
    id: string;
    type: CallParticipantType;
    token: string;
  }): Promise<{ success: true }> {
    return await this.request("authenticate", data);
  }

  /**
   * join receives connection details for a room
   */
  async join(data: { callId: string; token: string }): Promise<{
    consumerTransportInfo: WebRtcInfo;
    producerTransportInfo?: WebRtcInfo;
    routerRtpCapabilities: RtpCapabilities;
  }> {
    return await this.request("join", data);
  }

  /**
   * declareRtpCapabilities tells the server what we support
   */
  async declareRtpCapabilities(data: {
    rtpCapabilities: RtpCapabilities;
  }): Promise<{ success: true }> {
    return await this.request("declareRtpCapabilities", data);
  }

  /**
   * establishDtls encrypts each transport
   */
  async establishDtls(data: {
    callId: string;
    transportId: string;
    dtlsParameters: DtlsParameters;
  }): Promise<{ success: true }> {
    return await this.request("establishDtls", data);
  }

  /**
   * finishConnecting tells the server that this client is ready to consume
   * current and future producers.
   */
  async finishConnecting(data: { callId: string }): Promise<{ success: true }> {
    return await this.request("finishConnecting", data);
  }

  /**
   * produce tells the server what rtpParameters it plans to use for audio or video
   */
  async produce(data: {
    callId: string;
    kind: MediaKind;
    rtpParameters: RtpParameters;
  }): Promise<{ producerId: string }> {
    return await this.request("produce", data);
  }

  /**
   * producerUpdate tells the server when a producer pauses
   */
  async producerUpdate(data: {
    callId: string;
    paused: boolean;
    producerId: string;
    type: MediaKind;
  }): Promise<{ success: true }> {
    return await this.request("producerUpdate", data);
  }

  /**
   * textMessage sends a message to all participants on the call
   */
  async textMessage(data: {
    callId: string;
    contents: string;
  }): Promise<{ success: true }> {
    return await this.request("textMessage", data);
  }

  /**
   * terminate can be used by monitors to end a call early
   */
  async terminate(): Promise<{ success: true }> {
    return await this.request("terminate", {});
  }

  protected waitForEvent<R>(event: string): Promise<R> {
    return new Promise<R>((resolve) => this.socket.on(event, resolve));
  }

  /**
   * request is a promise wrapper around socket events
   */
  private async request<T, R>(name: string, data: T): Promise<R> {
    return new Promise((resolve, reject) => {
      this.socket.emit(name, data, (response: R | { error: string }) => {
        if ("error" in response) reject(response.error);
        else resolve(response);
      });
    });
  }
}
