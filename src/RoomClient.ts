import * as mediasoupClient from "mediasoup-client";
import {
  Consumer,
  DtlsParameters,
  MediaKind,
  Producer,
  ProducerOptions,
  Transport,
} from "mediasoup-client/lib/types";
import Client, { Participant } from "./Client";

async function getMedia(type: MediaKind, deviceId?: number) {
  return await navigator.mediaDevices.getUserMedia(
    type === "audio" ? { audio: true } : { video: true }
  );
}

const config: Record<MediaKind, ProducerOptions> = {
  video: {
    encodings: [
      {
        rid: "r0",
        maxBitrate: 100000,
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

class RoomClient {
  private consumers: Record<string, Consumer> = {};
  private producers: Partial<Record<MediaKind, Producer>> = {};

  static async connect(call: {
    id: string;
    url: string;
    token: string;
    user: Participant;
  }): Promise<RoomClient> {
    const client = await Client.connect(call.url);
    // Request to join the room.
    const {
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

    return new RoomClient(
      call.id,
      client,
      producerTransport,
      consumerTransport
    );
  }

  protected constructor(
    private callId: string,
    private client: Client,
    private producerTransport: Transport | null,
    private consumerTransport: Transport
  ) {
    // integrate produce event with the server
    // https://mediasoup.org/documentation/v3/mediasoup-client/api/#transport-on-produce
    producerTransport?.on(
      "produce",
      async ({ kind, rtpParameters }, callback) => {
        const { producerId } = await client.emit("produce", {
          callId: this.callId,
          kind,
          rtpParameters,
        });

        callback({ id: producerId });
      }
    );

    // listen for new peer tracks from the server
    client.on("consume", async (info) => {
      const consumer = await consumerTransport.consume(info);
      // const stream = new MediaStream([consumer.track]);
      this.consumers[consumer.id] = consumer;
    });

    // let the server know we're ready to begin consuming
    void client.emit("finishConnecting", { callId });
  }

  async produce(
    type: MediaKind,
    deviceId?: number
  ): Promise<MediaStream | null> {
    if (!this.producerTransport)
      throw new Error(`RoomClient is not able to produce media`);
    if (this.producers[type])
      throw new Error(`RoomClient is already producing ${type}`);

    const stream = await getMedia(type, deviceId);

    const track = (
      type === "audio" ? stream.getAudioTracks() : stream.getVideoTracks()
    )[0];

    const producer = await this.producerTransport.produce({
      ...config[type],
      track,
    });
    this.producers[type] = producer;

    return stream;
  }

  async terminate() {
    await this.client.emit("terminate", {});
  }

  async pauseVideo() {
    if (!this.producers.video) return;
    await this.updateProducer(this.producers.video, true);
  }

  async resumeVideo() {
    if (!this.producers.video) return;
    await this.updateProducer(this.producers.video, false);
  }

  async pauseAudio() {
    if (!this.producers.audio) return;
    await this.updateProducer(this.producers.audio, true);
  }

  async resumeAudio() {
    if (!this.producers.audio) return;
    await this.updateProducer(this.producers.audio, false);
  }

  async sendMessage(contents: string) {
    await this.client.emit("textMessage", { callId: this.callId, contents });
  }

  async close() {
    this.client.close();
    this.consumerTransport.close();
    this.producerTransport?.close();
    this.producers.audio?.close();
    this.producers.video?.close();
    Object.values(this.consumers).forEach((consumer) => consumer.close());
  }

  private async updateProducer(producer: Producer, paused: boolean) {
    paused ? producer.pause() : producer.resume();
    await this.client.emit("producerUpdate", {
      callId: this.callId,
      producerId: producer.id,
      paused,
      type: producer.kind as MediaKind,
    });
  }
}

export default RoomClient;
