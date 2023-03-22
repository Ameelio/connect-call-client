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
  Operation,
  Participant,
  ProducerLabel,
  PRODUCER_UPDATE_REASONS,
  Role,
  UserStatus,
} from "./API";
import Client from "./Client";
import { Quality } from "./ConnectionMonitor";

const config: Record<MediaKind, ProducerOptions> = {
  video: {
    encodings: [
      {
        rid: "r0",
        maxBitrate: 50000,
        maxFramerate: 10,
        scalabilityMode: "S1T3",
      },
      {
        rid: "r1",
        maxBitrate: 300000,
        scalabilityMode: "S1T3",
      },
      {
        rid: "r2",
        maxBitrate: 900000,
        scalabilityMode: "S1T3",
      },
    ],
    codecOptions: {
      videoGoogleStartBitrate: 1000,
    },
  },
  audio: {},
};

export type Peer = {
  user: Participant;
  stream: MediaStream;
  screenshareStream: MediaStream;
  connectionState: ConnectionState;
  status: UserStatus[];
};

export interface VideoState {
  enabled: boolean;
}

export interface ConnectionStateEvent {
  code: PRODUCER_UPDATE_REASONS;
  timestamp: string; // new Date().toJSON()
}

export interface ConnectionState {
  quality: Quality;
  ping: number;
  videoDisabled?: boolean;
  // TODO: possibly expand this to include more details like bandwidth, overall health, reconnect history
}

type Events = {
  onStatusChange: CallStatus;
  onUserUpdate: {
    id: string;
    role: Role;
    status: UserStatus[];
  };
  onPeerConnect: Participant;
  onPeerDisconnect: Participant;
  onPeerUpdate: Peer;
  onProducerUpdate: {
    producerId: string;
    paused: boolean;
    type: MediaKind;
    label: ProducerLabel;
  };
  onTextMessage: { user: Participant; contents: string };
  onTimer: { name: "maxDuration"; msRemaining: number; msElapsed: number };
  onConnectionState: ConnectionState;
  onPeerConnectionState: ConnectionState & { user: Participant };
};

class RoomClient {
  private producers: Partial<Record<ProducerLabel, Producer>> = {};
  private peers: Record<
    string,
    Peer & {
      consumers: Partial<Record<ProducerLabel, Consumer>>;
    }
  > = {};
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
  private connectionState: ConnectionState = {
    quality: "unknown",
    ping: NaN,
    videoDisabled: false,
  };
  private heartbeat?: NodeJS.Timer;

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
    role: Participant["role"];
    userId: string;
    status: UserStatus[];
  }) {
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
    client.connectionMonitor.start();
    client.connectionMonitor.emitter.on("quality", async (currentQuality) => {
      let videoDisabled = !!this.connectionState.videoDisabled;
      if (
        currentQuality.quality === "bad" &&
        this.connectionState.quality !== "bad"
      ) {
        // TODO: pauseVideo should return some indication of success
        const reason: PRODUCER_UPDATE_REASONS = "paused_video_bad_connection";
        await this.pauseVideo(reason);
        videoDisabled = true;
      } else if (
        (["excellent", "good", "average"] as Quality[]).includes(
          currentQuality.quality
        )
      ) {
        videoDisabled = false;
      }
      this.connectionState = {
        ...currentQuality,
        videoDisabled,
      };
      this.emitter.emit("onConnectionState", this.connectionState);
      if (this.user.role !== "monitor")
        // we don't emit videoDisabled, but let producerUpdate pass the reason,
        // and allow peers' CCC to set videoDisabled
        client.emit("connectionState", {
          quality: this.connectionState.quality,
          ping: this.connectionState.ping,
        });
    });

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

    // Listen for new joiners
    client.on("joined", async ({ id, role, status }) => {
      if (!this.peers[id]) {
        this.peers[id] = {
          user: { id, role },
          consumers: {},
          stream: new MediaStream(),
          screenshareStream: new MediaStream(),
          status,
          connectionState: { quality: "unknown", ping: NaN },
        };
        this.emitter.emit("onPeerConnect", { id, role });
      }

      this.peers[id].status = status;
      this.emitter.emit("onPeerUpdate", this.peers[id]);
    });

    // listen for new peer tracks from the server
    // TODO this event will need to distinguish between types of video stream
    // (screenshare vs camera)
    client.on("consume", async ({ user, ...options }) => {
      const consumer = await consumerTransport.consume(options);

      if (!this.peers[user.id]) {
        this.peers[user.id] = {
          user,
          consumers: {},
          stream: new MediaStream(),
          screenshareStream: new MediaStream(),
          status: [],
          connectionState: { quality: "unknown", ping: NaN },
        };
        this.emitter.emit("onPeerConnect", user);
      }

      this.peers[user.id].consumers[options.label] = consumer;
      // Screenshare goes in a different stream
      if (options.label === ProducerLabel.screenshare) {
        this.peers[user.id].screenshareStream.addTrack(consumer.track);
      } else {
        this.peers[user.id].stream.addTrack(consumer.track);
      }
      this.emitter.emit("onPeerUpdate", this.peers[user.id]);
    });

    // listen for tracks pausing and resuming
    client.on(
      "producerUpdate",
      async ({ from, paused, type, label, reason }) => {
        const peer = this.peers[from.id];
        if (!peer) throw new Error(`Unknown peer update ${from.id}`);
        const track = peer.consumers[label]?.track;
        if (track) {
          paused ? peer.stream.removeTrack(track) : peer.stream.addTrack(track);
        }
        if (!paused) {
          peer.connectionState.videoDisabled = false;
        } else if (reason === "paused_video_bad_connection") {
          peer.connectionState.videoDisabled = true;
        }
        this.emitter.emit("onPeerUpdate", peer);
      }
    );

    // listen for peers disconnecting
    client.on("participantDisconnect", async (user) => {
      const peer = this.peers[user.id];
      if (peer) {
        peer.consumers.audio?.close();
        peer.consumers.video?.close();
        delete this.peers[user.id];
        this.emitter.emit("onPeerDisconnect", user);
      }
    });

    // listen for call status changes
    client.on("callStatus", (status) => {
      this.emitter.emit("onStatusChange", status);
    });

    client.on("textMessage", ({ from, contents }) => {
      this.emitter.emit("onTextMessage", { user: from, contents });
    });

    client.on("userStatus", (statusUpdates) => {
      const knownStatusUpdates = statusUpdates.map(({ user, status }) => ({
        user,
        status: status.filter((x) =>
          (Object.values(UserStatus) as string[]).includes(x)
        ) as UserStatus[],
      }));

      knownStatusUpdates.forEach(({ user, status }) => {
        if (user.id === this.user.id) {
          this.user.status = status;
          this.emitter.emit("onUserUpdate", this.user);
          this.checkLocalMute();
        } else {
          if (user.id in this.peers) {
            this.peers[user.id].status = status;
          } else {
            this.peers[user.id] = {
              user,
              consumers: {},
              stream: new MediaStream(),
              screenshareStream: new MediaStream(),
              status: status,
              connectionState: { quality: "unknown", ping: NaN },
            };
          }
          this.emitter.emit("onPeerUpdate", this.peers[user.id]);
        }
      });
    });

    client.on("timer", ({ name, msRemaining, msElapsed }) => {
      this.emitter.emit("onTimer", { name, msRemaining, msElapsed });
    });

    client.on("peerConnectionState", ({ from, quality, ping }) => {
      const peer = this.peers[from.id];
      if (peer) {
        peer.connectionState.quality = quality;
        peer.connectionState.ping = ping;
        this.emitter.emit("onPeerUpdate", peer);
      }
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
  }

  async terminate() {
    await this.submitOperation({ type: "terminate" });
  }

  async checkLocalMute() {
    if (this.user.role === "webinarAttendee") {
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
  }

  async submitOperation(operation: Operation) {
    await this.client.emit("operation", {
      callId: this.callId,
      operation,
    });
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
    if (this.user.status.includes(UserStatus.AudioMutedByServer)) return;
    await this.updateProducer(this.producers.audio, false);
  }

  async sendMessage(contents: string) {
    await this.submitOperation({ type: "textMessage", contents });
  }

  async close() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.client.close();
    this.consumerTransport.close();
    this.producerTransport?.close();
    this.producers.audio?.close();
    this.producers.video?.close();
    this.emitter.all.clear();
    this.client.connectionMonitor.stop();
    Object.values(this.peers).forEach((peer) => {
      peer.consumers.audio?.close();
      peer.consumers.video?.close();
    });
  }

  private async updateProducer(
    producer: Producer,
    paused: boolean,
    reason?: PRODUCER_UPDATE_REASONS
  ) {
    paused ? producer.pause() : producer.resume();
    this.emitter.emit("onProducerUpdate", {
      producerId: producer.id,
      paused,
      label: producer.appData.label,
      type: producer.kind as MediaKind,
    });
    await this.client.emit("producerUpdate", {
      callId: this.callId,
      producerId: producer.id,
      paused,
      label: producer.appData.label,
      type: producer.kind as MediaKind,
      ...(reason ? { reason: reason } : {}),
    });
  }
}

export default RoomClient;
