import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import useConnectVideo from "./useConnectVideo";
import MediaDevices from "./__mocks__/MediaDevices";

jest.mock("./Client");
jest.mock("mediasoup-client");
Object.defineProperty(navigator, "mediaDevices", {
  writable: true,
  value: MediaDevices,
});

const Debug = ({ name, value }: { name: string; value: unknown }) => (
  <div data-testid={name}>{JSON.stringify(value)}</div>
);

const debugValue = (name: string) => {
  const value = screen.getByTestId(name).textContent;
  return value ? JSON.parse(value) : value;
};

const ConnectVideo = () => {
  const { status, error, localAudio, localVideo } = useConnectVideo({
    call: { id: "2", url: "a", token: "T1" },
    authInfo: { id: "1", type: "inmate", token: "T2" },
  });

  return (
    <div>
      <Debug name="status" value={status} />
      <Debug name="error" value={error?.message} />
      <Debug name="localAudio" value={localAudio} />
      <Debug name="localVideo" value={localVideo} />
    </div>
  );
};

describe("useConnectVideo", () => {
  it("connects", async () => {
    render(<ConnectVideo />);

    expect(debugValue("status")).toBe("initializing");
    expect(debugValue("error")).toBe("");

    await waitFor(() => expect(debugValue("status")).toBe("connected"));

    expect(debugValue("localAudio")).toMatchInlineSnapshot(`
      Object {
        "paused": false,
        "stream": Object {
          "id": "audio",
        },
      }
    `);

    expect(debugValue("localVideo")).toMatchInlineSnapshot(`
      Object {
        "aspectRatio": 0.75,
        "paused": false,
        "stream": Object {
          "id": "video",
        },
      }
    `);
  });
});
