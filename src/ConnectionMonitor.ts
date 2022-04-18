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
export type Quality = typeof Qualities[number];

export type QualityEvents = {
  quality: { quality: Quality; ping: number };
};

interface Result {
  checkTime: number;
  ms: number;
}

const RESULTS_TTL_MS = 5000;
const PING_EVENT = "ccc-ping";
const PONG_EVENT = "ccc-pong";

// QualityRange defines the ranges by which we establish the Quality in milliseconds
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
  private results: Result[] = [];
  private _currentQuality: QualityEvents["quality"] = {
    quality: "unknown",
    ping: NaN,
  };
  public emitter: Emitter<QualityEvents>;

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

  /**
   * returns the current quality of the connection
   */
  public get quality(): QualityEvents["quality"] {
    return this._currentQuality;
  }

  private update() {
    this.socket.emit(PING_EVENT, new Date().getTime().toString());
  }

  private handleResponse = (response: string) => {
    const startTime = parseInt(response);
    if (isNaN(startTime)) {
      // TODO: log a warning?
      return;
    }
    this.results.push({
      checkTime: startTime,
      ms: new Date().getTime() - startTime,
    });
    this.analyze();
  };

  private analyze() {
    // remove results that have expired
    const limit = new Date().getTime() - RESULTS_TTL_MS;
    this.results = this.results.filter((r) => r.checkTime > limit);
    if (this.results.length < 1) {
      return;
    }
    // take the average
    const average =
      this.results.map((r) => r.ms).reduce((a, b) => a + b) /
      this.results.length;
    // get the quality value
    let newQuality: Quality = "unknown";
    for (const quality of Qualities) {
      if (average <= QualityRange[quality]) {
        newQuality = quality;
        break;
      }
    }
    if (this._currentQuality.quality !== newQuality) {
      const q = { quality: newQuality, ping: Math.round(average) };
      this.emitter.emit("quality", q);
      this._currentQuality = q;
    }
  }

  /**
   * starts the monitor
   */
  start() {
    if (!this.timer) {
      this.socket.on(PONG_EVENT, this.handleResponse);
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
      this.emitter.all.clear();
      this.socket.off(PONG_EVENT, this.handleResponse);
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
