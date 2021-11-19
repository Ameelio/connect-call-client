import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import useConnectVideo from "./useConnectVideo";
import MediaDevices from "./__mocks__/MediaDevices";
import Client from "./Client";
import { Participant } from "./API";

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

const ConnectVideo = ({ type }: { type: Participant["type"] }) => {
  const { status, error, localAudio, localVideo } = useConnectVideo({
    call: { id: "2", url: type, token: "T1" },
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
  it("connects as a participant", async () => {
    render(<ConnectVideo type="inmate" />);

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

  it("connects as an observer", async () => {
    render(<ConnectVideo type="doc" />);

    expect(debugValue("status")).toBe("initializing");
    expect(debugValue("error")).toBe("");

    await waitFor(() => expect(debugValue("status")).toBe("connected"));

    expect(debugValue("localAudio")).toMatchInlineSnapshot(`""`);
    expect(debugValue("localVideo")).toMatchInlineSnapshot(`""`);
  });

  it.todo("toggles audio on and off");
  it.todo("toggles video on and off");
  it.todo("tracks peers");
});
