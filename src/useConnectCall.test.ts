import "@testing-library/jest-dom";
import { act, waitFor } from "@testing-library/react";
import { act as actHook, renderHook } from "@testing-library/react-hooks/pure";
import { advanceTo } from "jest-date-mock";
import { Role } from "./API";
import Client from "./Client";
import { clientFactory } from "./testFactories";
import useConnectCall from "./useConnectCall";
import MediaDevices from "./__mocks__/MediaDevices";
import MediaStream from "./__mocks__/MediaStream";

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

const onPeerConnected = jest.fn();
const onPeerDisconnected = jest.fn();
const onNewMessage = jest.fn();
const onTimer = jest.fn();

const call = {
  id: "2",
  url: "url",
  token: "T1",
};
const user = {
  id: "1",
  type: "inmate" as const,
  role: Role.visitParticipant,
  token: "T2",
};

advanceTo(new Date("2021-11-23T12:34:56.789Z"));

describe("useConnectCall", () => {
  let client: ReturnType<typeof clientFactory>;
  beforeEach(() => {
    client = clientFactory();
    (Client.connect as jest.Mock).mockClear();
    (Client.connect as jest.Mock).mockReturnValue(client);
    onPeerConnected.mockClear();
    onPeerDisconnected.mockClear();
    onNewMessage.mockClear();
  });

  it("completes the connection handshake", async () => {
    const { result } = renderHook(() =>
      useConnectCall({
        call,
        user,
        onPeerConnected,
        onPeerDisconnected,
        onNewMessage,
      })
    );

    expect(result.current.clientStatus).toBe("initializing");

    await waitFor(() => expect(result.current.clientStatus).toBe("connected"));
  });

  it("receives joined events", async () => {
    const { result } = renderHook(() =>
      useConnectCall({
        call,
        user,
        onPeerConnected,
        onPeerDisconnected,
        onNewMessage,
      })
    );
    // TODO
  });

  it("receives fast joined events", async () => {
    const { result } = renderHook(() =>
      useConnectCall({
        call,
        user,
        onPeerConnected,
        onPeerDisconnected,
        onNewMessage,
      })
    );
    // TODO
  });

  it("produces and toggles audio", async () => {
    const { result } = renderHook(() =>
      useConnectCall({
        call,
        user,
        onPeerConnected,
        onPeerDisconnected,
        onNewMessage,
      })
    );
    // TODO
  });

  it("produces and toggles video", async () => {
    const { result } = renderHook(() =>
      useConnectCall({
        call,
        user,
        onPeerConnected,
        onPeerDisconnected,
        onNewMessage,
      })
    );
    // TODO
  });

  it("tracks call status changes", async () => {
    const { result } = renderHook(() =>
      useConnectCall({
        call,
        user,
        onPeerConnected,
        onPeerDisconnected,
        onNewMessage,
      })
    );
    // TODO
  });

  it("tracks peer media", async () => {
    const user = {
      id: "USER-01",
      type: "user" as const,
      role: Role.visitParticipant,
    };

    const { result } = renderHook(() =>
      useConnectCall({
        call,
        user,
        onPeerConnected,
        onPeerDisconnected,
        onNewMessage,
      })
    );
    // TODO
  });

  it("alerts when peers connect and disconnect", async () => {
    const user = {
      id: "USER-01",
      type: "user" as const,
      role: Role.visitParticipant,
    };

    const { result } = renderHook(() =>
      useConnectCall({
        call,
        user,
        onPeerConnected,
        onPeerDisconnected,
        onNewMessage,
      })
    );
    // TODO
  });

  it("handles peers disconnecting without producing", async () => {
    const user = {
      id: "USER-01",
      type: "user" as const,
      role: Role.visitParticipant,
    };

    const { result } = renderHook(() =>
      useConnectCall({
        call,
        user,
        onPeerConnected,
        onPeerDisconnected,
        onNewMessage,
      })
    );
    await waitFor(() => expect(result.current.clientStatus).toBe("connected"));

    // TODO
  });

  it("delivers messages", async () => {
    const { result } = renderHook(() =>
      useConnectCall({
        call,
        user,
        onPeerConnected,
        onPeerDisconnected,
        onNewMessage,
      })
    );
    await waitFor(() => expect(result.current.clientStatus).toBe("connected"));

    act(() => {
      client.sendServerEvent("textMessage", {
        from: { id: "2", role: Role.visitParticipant },
        contents: "first",
      });
    });

    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(result.current.messages).toMatchInlineSnapshot(`
      Array [
        Object {
          "contents": "first",
          "timestamp": 2021-11-23T12:34:56.789Z,
          "user": Object {
            "id": "2",
            "role": "visitParticipant",
          },
        },
      ]
    `);
  });

  it("sends messages", async () => {
    const { result } = renderHook(() =>
      useConnectCall({
        call,
        user,
        onPeerConnected,
        onPeerDisconnected,
        onNewMessage,
      })
    );
    await waitFor(() => expect(result.current.clientStatus).toBe("connected"));

    await actHook(() => result.current.sendMessage("Hello"));
    expect(result.current.messages).toMatchInlineSnapshot(`
      Array [
        Object {
          "contents": "Hello",
          "timestamp": 2021-11-23T12:34:56.789Z,
          "user": Object {
            "id": "1",
            "role": "visitParticipant",
          },
        },
      ]
    `);
  });

  it("announces new messages", async () => {
    const { result } = renderHook(() =>
      useConnectCall({
        call,
        user,
        onPeerConnected,
        onPeerDisconnected,
        onNewMessage,
      })
    );
    await waitFor(() => expect(result.current.clientStatus).toBe("connected"));

    act(() => {
      client.sendServerEvent("textMessage", {
        from: { id: "2", role: Role.visitParticipant },
        contents: "first",
      });
    });
    act(() => {
      client.sendServerEvent("textMessage", {
        from: { id: "2", role: Role.visitParticipant },
        contents: "second",
      });
    });

    expect(onNewMessage).toHaveBeenCalledTimes(2);
  });

  it("participant can terminate the call", async () => {
    const { result } = renderHook(() =>
      useConnectCall({
        call,
        user,
        onPeerConnected,
        onPeerDisconnected,
        onNewMessage,
      })
    );

    expect(result.current.clientStatus).toBe("initializing");
    await waitFor(() => expect(result.current.clientStatus).toBe("connected"));
    const res = await actHook(() => result.current.terminateCall());
    expect(res).toBeUndefined();
  });

  it("handles a timer announcement", async () => {
    const { result } = renderHook(() =>
      useConnectCall({
        call,
        user,
        onTimer,
      })
    );
    // TODO
  });

  it("disconnects manually", async () => {
    const { result } = renderHook(() =>
      useConnectCall({ call, user, onTimer })
    );
    await waitFor(() => expect(result.current.clientStatus).toBe("connected"));

    await result.current.disconnect();
    expect(result.current.clientStatus).toBe("disconnected");
  });

  it("broadcasts connection state of a participant to peers", async () => {
    const { result } = renderHook(() =>
      useConnectCall({ call, user, onTimer })
    );
    // TODO
  });
});
