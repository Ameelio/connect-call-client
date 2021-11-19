import { ClientMessages, Participant } from "../API";

export default class Client {
  static async connect(type: Participant["type"]) {
    return new this(type);
  }

  constructor(private type: Participant["type"]) {}

  on = jest.fn();
  off = jest.fn();
  emit = jest.fn().mockImplementation((name: keyof ClientMessages) => {
    if (name === "join") {
      return {
        consumerTransportInfo: {},
        producerTransportInfo: this.type === "doc" ? undefined : {},
        routerRtpCapabilities: {},
      };
    }
  });
  close() {
    null;
  }
  async waitFor() {
    return Promise.resolve();
  }
}
