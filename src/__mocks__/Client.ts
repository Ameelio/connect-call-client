import { ClientMessages } from "../API";

export default class Client {
  static async connect() {
    return new this();
  }

  on = jest.fn();
  off = jest.fn();
  emit = jest.fn().mockImplementation((name: keyof ClientMessages) => {
    if (name === "join") {
      return {
        consumerTransportInfo: {},
        producerTransportInfo: {},
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
