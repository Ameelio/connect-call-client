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
import useConnectCall from "./useConnectCall";
import MediaDevices from "./__mocks__/MediaDevices";
import MediaStream from "./__mocks__/MediaStream";
import { advanceTo } from "jest-date-mock";

jest.mock("./Client");
jest.mock("mediasoup-client");
Object.defineProperty(navigator, "mediaDevices", {
  writable: true,
  value: MediaDevices,
});

Object.defineProperty(window, "MediaStream", {
  writable: true,
  value: MediaStream,
});

const Debug = ({ name, value }: { name: string; value: unknown }) => (
  <div data-testid={name}>{JSON.stringify(value)}</div>
);

const debugValue = (name: string) => {
  const value = screen.getByTestId(name).textContent;
  return value ? JSON.parse(value) : value;
};

const handlePeerConnect = jest.fn();
const handlePeerDisconnect = jest.fn();
const handleNewMessage = jest.fn();

const call = { id: "2", url: "url", token: "T1" };
const authInfo = { id: "1", type: "inmate" as const, token: "T2" };

const ConnectCall = () => {
  const {
    status,
    error,
    localAudio,
    localVideo,
    toggleAudio,
    toggleVideo,
    peers,
    messages,
    sendMessage,
  } = useConnectCall({
    call,
    authInfo,
    onPeerConnected: handlePeerConnect,
    onPeerDisconnected: handlePeerDisconnect,
    onNewMessage: handleNewMessage,
  });

  return (
    <div>
      <Debug name="status" value={status} />
      <Debug name="error" value={error?.message} />
      <Debug name="localAudio" value={localAudio} />
      <Debug name="localVideo" value={localVideo} />
      <Debug name="peers" value={peers} />
      <Debug name="messages" value={messages} />
      <button onClick={toggleAudio}>Audio</button>
      <button onClick={toggleVideo}>Video</button>
      <button onClick={() => sendMessage("Hello")}>Send Hello</button>
    </div>
  );
};

advanceTo(new Date("2021-11-23T12:34:56.789Z"));

describe("useConnectCall", () => {
  let client: ReturnType<typeof clientFactory>;
  beforeEach(() => {
    client = clientFactory();
    (Client.connect as jest.Mock).mockReturnValue(client);
    handlePeerConnect.mockClear();
    handlePeerDisconnect.mockClear();
    handleNewMessage.mockClear();
  });

  it("connects as a participant", async () => {
    render(<ConnectCall />);

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
    render(<ConnectCall />);

    expect(debugValue("status")).toBe("initializing");

    await waitFor(() => expect(debugValue("status")).toBe("connected"));
    expect(debugValue("localAudio")).toBeFalsy();
    expect(debugValue("localVideo")).toBeFalsy();
  });

  it("toggles audio on and off", async () => {
    render(<ConnectCall />);

    await waitFor(() => expect(debugValue("status")).toBe("connected"));

    expect(debugValue("localAudio").paused).toBeFalsy();
    fireEvent.click(screen.getByText("Audio"));
    await waitFor(() => expect(debugValue("localAudio").paused).toBeTruthy());
    fireEvent.click(screen.getByText("Audio"));
    await waitFor(() => expect(debugValue("localAudio").paused).toBeFalsy());
  });

  it("toggles video on and off", async () => {
    render(<ConnectCall />);

    await waitFor(() => expect(debugValue("status")).toBe("connected"));

    expect(debugValue("localVideo").paused).toBeFalsy();
    fireEvent.click(screen.getByText("Video"));
    await waitFor(() => expect(debugValue("localVideo").paused).toBeTruthy());
    fireEvent.click(screen.getByText("Video"));
    await waitFor(() => expect(debugValue("localVideo").paused).toBeFalsy());
  });

  it("tracks call status changes", async () => {
    render(<ConnectCall />);

    await waitFor(() => expect(debugValue("status")).toBe("connected"));

    act(() => client.sendServerEvent("callStatus", "ended"));

    await waitFor(() => expect(debugValue("status")).toBe("ended"));
  });

  it("tracks peer media", async () => {
    const user = { id: "USER-01", type: "user" as const };

    render(<ConnectCall />);

    await waitFor(() => expect(debugValue("status")).toBe("connected"));

    expect(debugValue("peers")).toMatchInlineSnapshot(`Array []`);

    act(() =>
      client.sendServerEvent("consume", { user, kind: "audio" } as any)
    );
    await waitFor(() => expect(debugValue("peers")).toHaveLength(1));
    expect(debugValue("peers")).toMatchInlineSnapshot(`
      Array [
        Object {
          "stream": Object {
            "tracks": Array [
              Object {
                "kind": "audio",
              },
            ],
          },
          "user": Object {
            "id": "USER-01",
            "type": "user",
          },
        },
      ]
    `);

    act(() =>
      client.sendServerEvent("consume", { user, kind: "video" } as any)
    );
    await waitFor(() =>
      expect(debugValue("peers")[0].stream.tracks).toHaveLength(2)
    );
    expect(debugValue("peers")).toMatchInlineSnapshot(`
      Array [
        Object {
          "stream": Object {
            "tracks": Array [
              Object {
                "kind": "audio",
              },
              Object {
                "kind": "video",
              },
            ],
          },
          "user": Object {
            "id": "USER-01",
            "type": "user",
          },
        },
      ]
    `);

    act(() =>
      client.sendServerEvent("producerUpdate", {
        from: user,
        paused: true,
        type: "video",
      } as any)
    );
    await waitFor(() =>
      expect(debugValue("peers")[0].stream.tracks).toHaveLength(1)
    );
    expect(debugValue("peers")).toMatchInlineSnapshot(`
      Array [
        Object {
          "stream": Object {
            "tracks": Array [
              Object {
                "kind": "audio",
              },
            ],
          },
          "user": Object {
            "id": "USER-01",
            "type": "user",
          },
        },
      ]
    `);

    act(() => client.sendServerEvent("participantDisconnect", user));
    await waitFor(() => expect(debugValue("peers")[0]).toBeUndefined());
    expect(debugValue("peers")).toMatchInlineSnapshot(`Array []`);
  });

  it("alerts when peers connect and disconnect", async () => {
    const user = { id: "USER-01", type: "user" as const };

    render(<ConnectCall />);
    await waitFor(() => expect(debugValue("status")).toBe("connected"));

    await act(async () =>
      client.sendServerEvent("consume", { user, kind: "audio" } as any)
    );
    await act(async () =>
      client.sendServerEvent("consume", { user, kind: "video" } as any)
    );

    expect(handlePeerConnect).toHaveBeenCalledTimes(1);

    await act(async () =>
      client.sendServerEvent("participantDisconnect", user)
    );

    expect(handlePeerDisconnect).toHaveBeenCalledTimes(1);
  });

  it("handles peers disconnecting without producing", async () => {
    const user = { id: "USER-01", type: "user" as const };

    render(<ConnectCall />);
    await waitFor(() => expect(debugValue("status")).toBe("connected"));

    await act(async () =>
      client.sendServerEvent("participantDisconnect", user)
    );

    expect(handlePeerDisconnect).toHaveBeenCalledTimes(1);
  });

  it("delivers messages", async () => {
    render(<ConnectCall />);
    await waitFor(() => expect(debugValue("status")).toBe("connected"));

    act(() => {
      client.sendServerEvent("textMessage", {
        from: { id: "2", type: "user" },
        contents: "first",
      });
    });

    await waitFor(() => expect(debugValue("messages")).toHaveLength(1));
    expect(debugValue("messages")).toMatchInlineSnapshot(`
      Array [
        Object {
          "contents": "first",
          "timestamp": "2021-11-23T12:34:56.789Z",
          "user": Object {
            "id": "2",
            "type": "user",
          },
        },
      ]
    `);
  });

  it("sends messages", async () => {
    render(<ConnectCall />);
    await waitFor(() => expect(debugValue("status")).toBe("connected"));

    fireEvent.click(screen.getByText("Send Hello"));
    await waitFor(() => expect(debugValue("messages")).toHaveLength(1));
    expect(debugValue("messages")).toMatchInlineSnapshot(`
      Array [
        Object {
          "contents": "Hello",
          "timestamp": "2021-11-23T12:34:56.789Z",
          "user": Object {
            "id": "1",
            "type": "inmate",
          },
        },
      ]
    `);
  });

  it("announces new messages", async () => {
    render(<ConnectCall />);
    await waitFor(() => expect(debugValue("status")).toBe("connected"));

    act(() => {
      client.sendServerEvent("textMessage", {
        from: { id: "2", type: "user" },
        contents: "first",
      });
    });
    act(() => {
      client.sendServerEvent("textMessage", {
        from: { id: "2", type: "user" },
        contents: "second",
      });
    });

    expect(handleNewMessage).toHaveBeenCalledTimes(2);
  });
});
