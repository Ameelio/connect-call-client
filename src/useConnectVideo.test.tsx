import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { Participant } from "./API";
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

const ConnectVideo = ({ type }: { type: Participant["type"] }) => {
  const { status, error, localAudio, localVideo, toggleAudio, toggleVideo } =
    useConnectVideo({
      call: { id: "2", url: type, token: "T1" },
      authInfo: { id: "1", type: "inmate", token: "T2" },
    });

  return (
    <div>
      <Debug name="status" value={status} />
      <Debug name="error" value={error?.message} />
      <Debug name="localAudio" value={localAudio} />
      <Debug name="localVideo" value={localVideo} />
      <button onClick={toggleAudio}>Audio</button>
      <button onClick={toggleVideo}>Video</button>
    </div>
  );
};

describe("useConnectVideo", () => {
  it("connects as a participant", async () => {
    render(<ConnectVideo type="inmate" />);

    expect(debugValue("status")).toBe("initializing");

    await waitFor(() => expect(debugValue("status")).toBe("connected"));
    expect(debugValue("localAudio")).toBeTruthy();
    expect(debugValue("localVideo")).toBeTruthy();
  });

  it("connects as an observer", async () => {
    render(<ConnectVideo type="doc" />);

    expect(debugValue("status")).toBe("initializing");

    await waitFor(() => expect(debugValue("status")).toBe("connected"));
    expect(debugValue("localAudio")).toBeFalsy();
    expect(debugValue("localVideo")).toBeFalsy();
  });

  it("toggles audio on and off", async () => {
    render(<ConnectVideo type="user" />);

    await waitFor(() => expect(debugValue("status")).toBe("connected"));

    expect(debugValue("localAudio").paused).toBeFalsy();
    fireEvent.click(screen.getByText("Audio"));
    await waitFor(() => expect(debugValue("localAudio").paused).toBeTruthy());
    fireEvent.click(screen.getByText("Audio"));
    await waitFor(() => expect(debugValue("localAudio").paused).toBeFalsy());
  });

  it("toggles video on and off", async () => {
    render(<ConnectVideo type="user" />);

    await waitFor(() => expect(debugValue("status")).toBe("connected"));

    expect(debugValue("localVideo").paused).toBeFalsy();
    fireEvent.click(screen.getByText("Video"));
    await waitFor(() => expect(debugValue("localVideo").paused).toBeTruthy());
    fireEvent.click(screen.getByText("Video"));
    await waitFor(() => expect(debugValue("localVideo").paused).toBeFalsy());
  });

  it.todo("tracks peers");
});
