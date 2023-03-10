import mitt from "mitt";
import { ClientMessages, ServerMessages } from "./API";
import { QualityEvents } from "./ConnectionMonitor";

type EmitResponses = Partial<Record<keyof ClientMessages, unknown>>;

export function clientFactory() {
  const emitter = mitt();
  const emitResponses: EmitResponses = {
    join: {
      role: "visitParticipant",
      consumerTransportInfo: {},
      producerTransportInfo: {},
      routerRtpCapabilities: {},
    },
  };
  return {
    sendServerEvent: <E extends keyof ServerMessages>(
      name: E,
      data: ServerMessages[E]
    ) => emitter.emit(name, data),

    prepareServerResponse: <E extends keyof ClientMessages>(
      name: E,
      data: ClientMessages[E][1]
    ) => (emitResponses[name] = data),

    // mock methods
    on: emitter.on,
    off: emitter.off,
    emit: jest
      .fn()
      .mockImplementation((name: keyof ClientMessages) => emitResponses[name]),
    close: jest.fn(),

    connectionMonitor: connectionMonitorFactory(),
  };
}

export function connectionMonitorFactory() {
  return {
    // mock methods
    emitter: mitt<QualityEvents>(),
    start: jest.fn(),
    stop: jest.fn(),
  };
}
