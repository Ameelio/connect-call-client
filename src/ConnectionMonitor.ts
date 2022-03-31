import mitt, { Emitter } from "mitt";
import { Socket } from "socket.io-client";

const Qualities = [
  "excellent",
  "good",
  "average",
  "poor",
  "bad",
  "unknown",
] as const;
type Quality = typeof Qualities[number];

export type QualityEvents = {
  quality: { quality: Quality; ping: number };
};

interface Result {
  checkTime: Date;
  ms: number;
}

const RESULTS_TTL_MS = 5000;

const QualityRange: Record<Quality, number> = {
  [Qualities[0]]: 50,
  [Qualities[1]]: 150,
  [Qualities[2]]: 500,
  [Qualities[3]]: 1000,
  [Qualities[4]]: Infinity,
  [Qualities[5]]: NaN,
};

/**
 * ConnectionMonitor reports on the quality of the current connection to a remote host
 */
export default class ConnectionMonitor {
  private socket: Socket;
  private timer: NodeJS.Timeout | undefined;
  private interval: number;
  public emitter: Emitter<QualityEvents>;
  private results: Result[] = [];
  private quality: Quality = "unknown";

  /**
   *
   * @param socket the socket to emit 'ping' upon
   * @param interval time in ms
   */
  constructor(socket: Socket, interval: number) {
    this.socket = socket;
    this.interval = interval;
    this.emitter = mitt();
    this.socket.on("disconnect", () => {
      this.stop();
    });
  }

  private update() {
    const t1 = new Date();
    this.socket.emit("ping", (response: string | { error: string }) => {
      if (response !== "pong") {
        // do something!
      }
      console.log(response);
      const ms = new Date().getTime() - t1.getTime();
      console.log(ms);
      this.results.push({ checkTime: t1, ms: ms });
      this.analyze();
    });
  }

  private analyze() {
    // remove results that have expired
    const limit = new Date().getTime() - RESULTS_TTL_MS;
    this.results = this.results.filter((r) => r.checkTime.getTime() > limit);
    // take the average
    const average =
      this.results.map((r) => r.ms).reduce((a, b) => a + b) /
      this.results.length;
    // get the quality value
    let newQuality: Quality = "unknown";
    for (const quality of Qualities) {
      if (average <= QualityRange[quality]) {
        newQuality = quality;
      }
    }
    if (this.quality !== newQuality) {
      this.emitter.emit("quality", { quality: newQuality, ping: average });
      this.quality = newQuality;
    }
  }

  /**
   * starts the monitor
   */
  start() {
    if (!this.timer) {
      this.timer = setInterval(() => {
        this.update();
      }, this.interval);
    }
  }

  /**
   * stops the monitor
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
