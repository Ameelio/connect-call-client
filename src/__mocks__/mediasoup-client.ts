class Transport {
  on = jest.fn();
  close = jest.fn();
  produce = jest.fn();
  consume = jest.fn().mockImplementation((options) => ({
    track: options,
    close: jest.fn(),
  }));
}

export class Device {
  load = jest.fn();

  createSendTransport = jest.fn().mockImplementation(() => {
    return new Transport();
  });

  createRecvTransport = jest.fn().mockImplementation(() => {
    return new Transport();
  });

  rtpCapabilities = {};
}
