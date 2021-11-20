import "@testing-library/jest-dom";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import React from "react";
import Client from "./Client";
import { clientFactory } from "./testFactories";
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
  const { status, error, localAudio, localVideo, toggleAudio, toggleVideo } =
    useConnectVideo({
      call: { id: "2", url: "url", token: "T1" },
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
  let client: ReturnType<typeof clientFactory>;
  beforeEach(() => {
    client = clientFactory();
    (Client.connect as jest.Mock).mockReturnValue(client);
  });

  it("connects as a participant", async () => {
    render(<ConnectVideo />);

    expect(debugValue("status")).toBe("initializing");

    await waitFor(() => expect(debugValue("status")).toBe("connected"));
    expect(debugValue("localAudio")).toBeTruthy();
    expect(debugValue("localVideo")).toBeTruthy();
  });

  it("connects as an observer", async () => {
    client.prepareServerResponse("join", {
      consumerTransportInfo: {},
      routerRtpCapabilities: {},
    });
    render(<ConnectVideo />);

    expect(debugValue("status")).toBe("initializing");

    await waitFor(() => expect(debugValue("status")).toBe("connected"));
    expect(debugValue("localAudio")).toBeFalsy();
    expect(debugValue("localVideo")).toBeFalsy();
  });

  it("toggles audio on and off", async () => {
    render(<ConnectVideo />);

    await waitFor(() => expect(debugValue("status")).toBe("connected"));

    expect(debugValue("localAudio").paused).toBeFalsy();
    fireEvent.click(screen.getByText("Audio"));
    await waitFor(() => expect(debugValue("localAudio").paused).toBeTruthy());
    fireEvent.click(screen.getByText("Audio"));
    await waitFor(() => expect(debugValue("localAudio").paused).toBeFalsy());
  });

  it("toggles video on and off", async () => {
    render(<ConnectVideo />);

    await waitFor(() => expect(debugValue("status")).toBe("connected"));

    expect(debugValue("localVideo").paused).toBeFalsy();
    fireEvent.click(screen.getByText("Video"));
    await waitFor(() => expect(debugValue("localVideo").paused).toBeTruthy());
    fireEvent.click(screen.getByText("Video"));
    await waitFor(() => expect(debugValue("localVideo").paused).toBeFalsy());
  });

  it.todo("tracks peers");

  it("tracks call status changes", async () => {
    render(<ConnectVideo />);

    await waitFor(() => expect(debugValue("status")).toBe("connected"));

    act(() => client.sendServerEvent("callStatus", "ended"));

    await waitFor(() => expect(debugValue("status")).toBe("ended"));
  });
});
