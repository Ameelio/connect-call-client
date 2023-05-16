class Transport {
  on = jest.fn();
  close = jest.fn();
  produce = jest.fn().mockImplementation((options) => {
    const result = {
      track: options,
      close: jest.fn(),
      paused: options.paused || false,
      kind: options.track.kind,
      appData: options.appData,
      pause: () => {
        return;
      },
      resume: () => {
        return;
      },
    };
    result.pause = () => {
      result.paused = true;
    };
    result.resume = () => {
      result.paused = false;
    };

    return result;
  });
  consume = jest.fn().mockImplementation((options) => {
    const result = {
      id: options.id,
      track: options,
      close: jest.fn(),
      paused: options.paused || false,
      appData: options.appData,
      pause: () => {
        return;
      },
      resume: () => {
        return;
      },
    };
    result.pause = () => {
      result.paused = true;
    };
    result.resume = () => {
      result.paused = false;
    };

    return result;
  });
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
