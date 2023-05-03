import * as mediasoupClient from "mediasoup-client";
import {
  Consumer,
  DtlsParameters,
  MediaKind,
  Producer,
  ProducerOptions,
  Transport,
} from "mediasoup-client/lib/types";
import mitt, { Emitter } from "mitt";
import {
  ProducerLabel,
  PRODUCER_UPDATE_REASONS,
  PublishedConsumerInfo,
  PublishedRoomState,
  Role,
  User,
  UserStatus,
} from "./API";
import Client from "./Client";

const config: Record<MediaKind, ProducerOptions> = {
  video: {
    encodings: [
      {
        rid: "r0",
        maxBitrate: 50000,
        maxFramerate: 10,
        scalabilityMode: "L1T3",
      },
      {
        rid: "r1",
        maxBitrate: 300000,
        scalabilityMode: "L1T3",
      },
      {
        rid: "r2",
        maxBitrate: 900000,
        scalabilityMode: "L1T3",
      },
    ],
    codecOptions: {
      videoGoogleStartBitrate: 1000,
    },
  },
  audio: {},
};

export type Peer = {
  user: User;
  consumers: Partial<
    Record<
      ProducerLabel,
      {
        stream: MediaStream;
        paused: boolean;
        id: string;
      }
    >
  >;
  status: UserStatus[];
};

type Events = {
  textMessage: { user: User; contents: string };
  timer: { name: string; msRemaining: number; msElapsed: number };
  peers: Record<string, Peer>;
};

function emptyConsumerRecord(): {
  stream: MediaStream;
  consumer?: Consumer;
  paused: boolean;
} {
  return {
    stream: new MediaStream(),
    paused: false,
  };
}

function emptyConsumersRecord(): Record<
  ProducerLabel,
  { stream: MediaStream; consumer?: Consumer; paused: boolean }
> {
  return {
    [ProducerLabel.video]: emptyConsumerRecord(),
    [ProducerLabel.audio]: emptyConsumerRecord(),
    [ProducerLabel.screenshare]: emptyConsumerRecord(),
  };
}

class RoomClient {
  producers: Partial<Record<ProducerLabel, Producer>> = {};
  consumers: Map<string, { consumer: Consumer; stream: MediaStream }> =
    new Map();
  disableFrux: boolean;
  private peers: Record<string, Peer> = {};
  // We don't actually know anything about a monitor except their id.
  private monitors: Set<string> = new Set();
  public user: {
    id: string;
    role: Role;
    status: UserStatus[];
  };
  private callId: string;
  private client: Client;
  private producerTransport: Transport | null;
  private consumerTransport: Transport;
  private emitter: Emitter<Events>;
  private heartbeat?: NodeJS.Timer;

  protected constructor({
    callId,
    client,
    producerTransport,
    consumerTransport,
    role,
    userId,
    status,
  }: {
    callId: string;
    client: Client;
    producerTransport: Transport | null;
    consumerTransport: Transport;
    role: Role;
    userId: string;
    status: UserStatus[];
  }) {
    this.disableFrux = false;
    this.callId = callId;
    this.client = client;
    this.producerTransport = producerTransport;
    this.consumerTransport = consumerTransport;

    this.user = {
      id: userId,
      status,
      role,
    };

    this.emitter = mitt();

    // integrate produce event with the server
    // https://mediasoup.org/documentation/v3/mediasoup-client/api/#transport-on-produce
    producerTransport?.on(
      "produce",
      async ({ appData, kind, rtpParameters }, callback) => {
        // TODO this event will need to inform the server
        // about whether this is a screenshare stream
        const { producerId } = await client.emit("produce", {
          callId: this.callId,
          kind,
          rtpParameters,
          label: appData.label,
        });

        callback({ id: producerId });
      }
    );

    client.on("textMessage", ({ from, contents }) => {
      this.emitter.emit("textMessage", { user: from, contents });
    });

    client.on("timer", ({ name, msRemaining, msElapsed }) => {
      this.emitter.emit("timer", { name, msRemaining, msElapsed });
    });

    client.on("state", (state: PublishedRoomState) => {
      this.emitter.emit(
        "peers",
        Object.fromEntries(
          Object.entries(state.participants).map(([key, val]) => [
            key,
            {
              ...val,
              consumers: Object.fromEntries(
                Object.entries(val.consumers).map(([label, data]) => [
                  label,
                  this.updateOrMakeConsumer(data),
                ])
              ),
            },
          ])
        )
      );
    });

    if (this.user.role === "monitor") {
      this.heartbeat = setInterval(() => {
        client.emit("heartbeat", {});
      }, 1000);
    }

    // now that our handlers are prepared, we're reading to begin consuming
    void client.emit("finishConnecting", { callId });
  }

  on<E extends keyof Events>(name: E, handler: (data: Events[E]) => void) {
    this.emitter.on(name, handler);
  }

  off<E extends keyof Events>(name: E, handler: (data: Events[E]) => void) {
    this.emitter.off(name, handler);
  }

  // === Tracking server status ==
  async updateOrMakeConsumer(consumerData: PublishedConsumerInfo) {
    const result = this.consumers.get(consumerData.id);
    if (result) {
      const { consumer, stream } = result;
      // Track paused state
      if (consumerData.paused && !consumer.paused) {
        await consumer.pause();
      } else if (!consumerData.paused && consumer.paused) {
        await consumer.resume();
      }
      return {
        stream,
        paused: consumer.paused,
        id: consumer.id,
      };
    }

    const consumer = await this.consumerTransport.consume(consumerData);
    const stream = new MediaStream();

    stream.addTrack(consumer.track);

    this.consumers.set(consumerData.id, {
      consumer,
      stream,
    });

    return {
      stream,
      paused: consumer.paused,
      id: consumer.id,
    };
  }

  async checkLocalMute() {
    // If we are now remote muted but not locally muted,
    // locally mute.
    if (
      this.user.status.includes(UserStatus.AudioMutedByServer) &&
      this.producers.audio &&
      !this.producers.audio.paused
    ) {
      this.pauseAudio();
    }

    // Same with video mute
    if (
      this.user.status.includes(UserStatus.VideoMutedByServer) &&
      this.producers.video &&
      !this.producers.video.paused
    ) {
      this.pauseVideo();
    }
  }

  // === Local media operations ===

  async produce(track: MediaStreamTrack, label: ProducerLabel): Promise<void> {
    if (!this.producerTransport)
      throw new Error(`RoomClient is not able to produce media`);
    if (this.producers[label])
      throw new Error(`RoomClient is already producing ${label}`);

    const producer = await this.producerTransport.produce({
      ...config[track.kind as MediaKind],
      track,
      appData: { label },
    });
    this.producers[label] = producer;

    track.addEventListener("ended", () => {
      const producer = this.producers[label];
      if (producer && producer.track === track) {
        this.closeProducer(label);
      }
    });
  }

  async closeProducer(label: ProducerLabel): Promise<void> {
    const producer = this.producers[label];

    if (!producer) return;

    await producer.close();
    await this.client.emit("producerClose", {
      callId: this.callId,
      producerId: producer.id,
    });
    delete this.producers[label];
  }

  async pauseVideo(reason?: PRODUCER_UPDATE_REASONS) {
    if (!this.producers.video) return;
    await this.updateProducer(this.producers.video, true, reason);
  }

  async resumeVideo() {
    if (!this.producers.video) return;
    // Do not allow resuming video when remote video muted
    if (this.user.status.includes(UserStatus.VideoMutedByServer)) return;
    await this.updateProducer(this.producers.video, false);
  }

  async pauseAudio() {
    if (!this.producers.audio) return;
    await this.updateProducer(this.producers.audio, true);
  }

  async resumeAudio() {
    if (!this.producers.audio) return;
    // Do not allow resuming audio when remote muted
    if (this.user.status.includes(UserStatus.AudioMutedByServer)) {
      return;
    }
    await this.updateProducer(this.producers.audio, false);
  }

  // === Active network operations ===
  async terminate() {
    await this.client.emit("terminate", {});
  }

  async textMessage(contents: string) {
    await this.client.emit("textMessage", {
      contents,
    });
  }

  async remoteAudioMute(targetUserId: string) {
    await this.client.emit("remoteAudioMute", {
      targetUserId,
    });
  }

  async remoteAudioUnmute(targetUserId: string) {
    await this.client.emit("remoteAudioUnmute", {
      targetUserId,
    });
  }

  async remoteVideoMute(targetUserId: string) {
    await this.client.emit("remoteVideoMute", {
      targetUserId,
    });
  }

  async remoteVideoUnmute(targetUserId: string) {
    await this.client.emit("remoteVideoUnmute", {
      targetUserId,
    });
  }

  async remoteLowerHand(targetUserId: string) {
    await this.client.emit("remoteLowerHand", {
      targetUserId,
    });
  }

  async raiseHand() {
    await this.client.emit("raiseHand", {});
  }

  async lowerHand() {
    await this.client.emit("lowerHand", {});
  }

  async sendMessage(contents: string) {
    await this.textMessage(contents);
  }

  async setPreferredSimulcastLayer({
    consumerId,
    spatialLayer,
    temporalLayer,
  }: {
    consumerId: string;
    spatialLayer: number;
    temporalLayer?: number;
  }) {
    await this.client.emit("setPreferredSimulcastLayer", {
      consumerId,
      spatialLayer,
      temporalLayer,
    });
  }

  async close() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.client.close();
    this.consumerTransport.close();
    this.producerTransport?.close();
    this.producers.audio?.close();
    this.producers.video?.close();
    this.producers.screenshare?.close();
    this.emitter.all.clear();
    this.client.connectionMonitor.stop();
    Array.from(this.consumers.values()).forEach(({ consumer }) =>
      consumer.close()
    );
  }

  private async updateProducer(
    producer: Producer,
    paused: boolean,
    reason?: PRODUCER_UPDATE_REASONS
  ) {
    paused ? producer.pause() : producer.resume();
    await this.client.emit("producerUpdate", {
      callId: this.callId,
      producerId: producer.id,
      paused,
      label: producer.appData.label,
      type: producer.kind as MediaKind,
      ...(reason ? { reason: reason } : {}),
    });
  }

  // === Initial handshake ===
  static async connect(call: {
    id: string;
    url: string;
    token: string;
  }): Promise<RoomClient> {
    const client = await Client.connect(call.url);

    // Request to join the room.
    const {
      role,
      userId,
      status,
      producerTransportInfo,
      consumerTransportInfo,
      routerRtpCapabilities,
    } = await client.emit("join", {
      callId: call.id,
      token: call.token,
    });

    // Load up a local media device consistent with server
    const device = new mediasoupClient.Device();
    await device.load({ routerRtpCapabilities });

    // this handler is necessary to finish connecting a transport
    // https://mediasoup.org/documentation/v3/mediasoup-client/api/#transport-on-connect
    const finishTransportConnection =
      (transportId: string) =>
      (
        { dtlsParameters }: { dtlsParameters: DtlsParameters },
        onSuccess: () => void,
        onFailure: (e: unknown) => void
      ) => {
        client
          .emit("establishDtls", {
            dtlsParameters,
            callId: call.id,
            transportId: transportId,
          })
          .then(onSuccess, onFailure);
      };

    let producerTransport: Transport | null = null;
    if (producerTransportInfo) {
      producerTransport = device.createSendTransport(producerTransportInfo);

      producerTransport.on(
        "connect",
        finishTransportConnection(producerTransport.id)
      );
    }

    const consumerTransport = device.createRecvTransport(consumerTransportInfo);
    consumerTransport.on(
      "connect",
      finishTransportConnection(consumerTransport.id)
    );

    await client.emit("declareRtpCapabilities", {
      rtpCapabilities: device.rtpCapabilities,
    });

    return new RoomClient({
      callId: call.id,
      client,
      producerTransport,
      consumerTransport,
      role,
      userId,
      status,
    });
  }
}

export default RoomClient;
