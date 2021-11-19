import React from "react";
import useConnectVideo from "./useConnectVideo";
import { render, waitFor, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ClientMessages } from "./API";

const ConnectVideo = () => {
  const { status, error, localAudio, localVideo } = useConnectVideo({
    call: { id: "2", url: "a", token: "T1" },
    authInfo: { id: "1", type: "inmate", token: "T2" },
  });

  return (
    <div>
      <div data-testid="status">{status}</div>
      <div data-testid="error">{error?.message}</div>
      <div data-testid="localAudio">
        {localAudio ? JSON.stringify(localAudio) : null}
      </div>
      <div data-testid="localVideo">
        {localVideo ? JSON.stringify(localVideo) : null}
      </div>
    </div>
  );
};

jest.mock("./Client", () => {
  return class Client {
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
  };
});

jest.mock("mediasoup-client", () => {
  return {
    Device: () => ({
      load: jest.fn(),
      createSendTransport: jest.fn().mockImplementation(() => {
        return {
          on: jest.fn(),
          close: jest.fn(),
          produce: jest.fn(),
        };
      }),
      createRecvTransport: jest.fn().mockImplementation(() => {
        return {
          on: jest.fn(),
          close: jest.fn(),
          produce: jest.fn(),
        };
      }),
      rtpCapabilities: {},
    }),
  };
});

Object.defineProperty(navigator, "mediaDevices", {
  writable: true,
  value: {
    getUserMedia: (constraints: { audio: any } | { video: any }) => {
      if ("audio" in constraints) {
        return { id: "audio", getAudioTracks: () => [] };
      }
      return {
        id: "video",
        getVideoTracks: () => [
          {
            getSettings: jest.fn().mockReturnValue({ width: 400, height: 300 }),
          },
        ],
      };
    },
  },
});

describe("useConnectVideo", () => {
  it("connects", async () => {
    render(<ConnectVideo />);

    expect(screen.getByTestId("status")).toHaveTextContent("initializing");
    expect(screen.getByTestId("error")).toHaveTextContent("");

    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("connected")
    );

    screen.debug();
  });
});
