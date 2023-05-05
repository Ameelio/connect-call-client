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
  CallStatus,
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
  peers: Peer[];
  localProducers: Partial<
    Record<ProducerLabel, { stream: MediaStream; paused: boolean }>
  >;
  status: CallStatus;
  self: Peer;
};

class RoomClient {
  localProducers: Partial<
    Record<
      ProducerLabel,
      {
        stream: MediaStream;
        producer: Producer;
      }
    >
  > = {};
  consumers: Map<string, { consumer: Consumer; stream: MediaStream }> =
    new Map();
  disableFrux: boolean;
  private peers: Record<string, Peer> = {};
  public user: {
    id: string;
    role: Role;
    status: UserStatus[];
  };
  private client: Client;
  private state?: PublishedRoomState;

  private producerTransport: Transport | null;
  private consumerTransport: Transport;

  private emitter: Emitter<Events>;

  protected constructor({
    client,
    producerTransport,
    consumerTransport,
    role,
    userId,
    status,
  }: {
    client: Client;
    producerTransport: Transport | null;
    consumerTransport: Transport;
    role: Role;
    userId: string;
    status: UserStatus[];
  }) {
    this.disableFrux = false;
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

    client.on("state", async (state: PublishedRoomState) => {
      this.state = state;
      await this.checkLocalMute();
      this.emitState();
    });

    // now that our handlers are prepared, we're reading to begin consuming
    void client.emit("finishConnecting", {});
  }

  on<E extends keyof Events>(name: E, handler: (data: Events[E]) => void) {
    this.emitter.on(name, handler);
  }

  off<E extends keyof Events>(name: E, handler: (data: Events[E]) => void) {
    this.emitter.off(name, handler);
  }

  async emitState() {
    // Always emit a coherent state; if state changes
    // mid-emit, don't respond.
    const state = this.state;

    if (!state) return;

    const presentIds = new Set<string>();

    // Everyone but self
    this.emitter.emit(
      "peers",
      Object.fromEntries(
        await Promise.all(
          Object.entries(state.participants)
            .filter(([key, _]) => key !== this.client.socket.id)
            .map(async ([key, val]) => [
              key,
              {
                ...val,
                consumers: Object.fromEntries(
                  await Promise.all(
                    Object.entries(val.consumers).map(async ([label, data]) => {
                      presentIds.add(data.id);
                      return [label, await this.updateOrMakeConsumer(data)];
                    })
                  )
                ),
              },
            ])
        )
      )
    );

    // Self
    const selfReport = state.participants[this.client.socket.id];

    if (selfReport) {
      this.emitter.emit("self", {
        ...selfReport,
        consumers: Object.fromEntries(
          await Promise.all(
            Object.entries(selfReport.consumers).map(async ([label, data]) => {
              presentIds.add(data.id);
              return [label, await this.updateOrMakeConsumer(data)];
            })
          )
        ),
      });

      // Update local latest status
      this.user.status = selfReport.status;
    }

    // Room status
    this.emitter.emit("status", state.status);

    // Clean up missing peers
    Array.from(this.consumers.entries()).forEach(([key, { consumer }]) => {
      if (!presentIds.has(key)) {
        consumer.close();
        this.consumers.delete(key);
      }
    });
  }

  // === Tracking server status ==
  async updateOrMakeConsumer(consumerData: PublishedConsumerInfo) {
    const result = this.consumers.get(consumerData.id);
    if (result) {
      const { consumer, stream } = result;
      // Track paused state
      if (
        (consumerData.paused || consumerData.producerPaused) &&
        !consumer.paused
      ) {
        await consumer.pause();
      } else if (
        !(consumerData.paused || consumerData.producerPaused) &&
        consumer.paused
      ) {
        await consumer.resume();
      }
      return {
        stream,
        paused: consumer.paused,
        id: consumer.id,
      };
    }

    const consumer = await this.consumerTransport.consume(consumerData);
    if (consumerData.paused || consumerData.producerPaused) consumer.pause();

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
      this.localProducers.audio &&
      !this.localProducers.audio.producer.paused
    ) {
      await this.pauseProducer(ProducerLabel.audio);
    }

    // Same with video mute
    if (
      this.user.status.includes(UserStatus.VideoMutedByServer) &&
      this.localProducers.video &&
      !this.localProducers.video.producer.paused
    ) {
      await this.pauseProducer(ProducerLabel.video);
    }
  }

  // === Local media operations ===

  async produce(track: MediaStreamTrack, label: ProducerLabel): Promise<void> {
    if (!this.producerTransport)
      throw new Error(`RoomClient is not able to produce media`);
    if (this.localProducers[label])
      throw new Error(`RoomClient is already producing ${label}`);

    const producer = await this.producerTransport.produce({
      ...config[track.kind as MediaKind],
      track,
      appData: { label },
    });
    const stream = new MediaStream();
    stream.addTrack(track);

    this.localProducers[label] = {
      stream,
      producer,
    };

    track.addEventListener("ended", () => {
      const localProducer = this.localProducers[label];
      if (localProducer && localProducer.producer.track === track) {
        this.closeProducer(label);
      }
    });

    this.emitter.emit(
      "localProducers",
      Object.fromEntries(
        Object.entries(this.localProducers).map(
          ([label, { producer, stream }]) => [
            label,
            { paused: producer.paused, stream },
          ]
        )
      )
    );
  }

  async closeProducer(label: ProducerLabel): Promise<void> {
    const localProducer = this.localProducers[label];

    if (!localProducer) return;

    await localProducer.producer.close();
    await this.client.emit("producerClose", {
      producerId: localProducer.producer.id,
    });
    delete this.localProducers[label];
  }

  async pauseProducer(label: ProducerLabel): Promise<void> {
    const localProducer = this.localProducers[label];
    if (!localProducer) return;
    await this.updateProducer(localProducer.producer, true);
  }

  async resumeProducer(label: ProducerLabel) {
    const localProducer = this.localProducers[label];
    if (!localProducer) return;

    // Do not allow resuming video when remote video muted
    if (
      (label === ProducerLabel.video &&
        this.user.status.includes(UserStatus.VideoMutedByServer)) ||
      (label === ProducerLabel.audio &&
        this.user.status.includes(UserStatus.AudioMutedByServer))
    )
      return;

    await this.updateProducer(localProducer.producer, false);
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
    this.client.close();
    this.consumerTransport.close();
    this.producerTransport?.close();
    Object.values(this.localProducers).forEach(({ producer }) =>
      producer.close()
    );
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
    if (paused) {
      producer.pause();
    } else {
      producer.resume();
    }
    await this.client.emit("producerUpdate", {
      producerId: producer.id,
      paused,
      label: producer.appData.label,
      type: producer.kind as MediaKind,
      ...(reason ? { reason: reason } : {}),
    });
    this.emitter.emit(
      "localProducers",
      Object.fromEntries(
        Object.entries(this.localProducers).map(
          ([label, { producer, stream }]) => [
            label,
            { paused: producer.paused, stream },
          ]
        )
      )
    );
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
