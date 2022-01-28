import "@testing-library/jest-dom";
import { act, waitFor } from "@testing-library/react";
import { act as actHook, renderHook } from "@testing-library/react-hooks";
import { advanceTo } from "jest-date-mock";
import Client from "./Client";
import { clientFactory } from "./testFactories";
import useConnectCall, { CallType } from "./useConnectCall";
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

const call = {
  id: "2",
  url: "url",
  token: "T1",
  type: CallType.VIDEO_CALL,
};
const authInfo = { id: "1", type: "inmate" as const, token: "T2" };

advanceTo(new Date("2021-11-23T12:34:56.789Z"));

describe("useConnectCall", () => {
  let client: ReturnType<typeof clientFactory>;
  beforeEach(() => {
    client = clientFactory();
    (Client.connect as jest.Mock).mockReturnValue(client);
    onPeerConnected.mockClear();
    onPeerDisconnected.mockClear();
    onNewMessage.mockClear();
  });

  it("connects as a participant", async () => {
    const { result } = renderHook(() =>
      useConnectCall({
        call,
        authInfo,
        onPeerConnected,
        onPeerDisconnected,
        onNewMessage,
      })
    );

    expect(result.current.status).toBe("initializing");

    await waitFor(() => expect(result.current.status).toBe("connected"));
    expect(result.current.localAudio).toBeTruthy();
    expect(result.current.localVideo).toBeTruthy();
  });

  it("connects as an observer", async () => {
    client.prepareServerResponse("join", {
      consumerTransportInfo: {},
      routerRtpCapabilities: {},
    });
    const { result } = renderHook(() =>
      useConnectCall({
        call,
        authInfo,
        onPeerConnected,
        onPeerDisconnected,
        onNewMessage,
      })
    );

    expect(result.current.status).toBe("initializing");

    await waitFor(() => expect(result.current.status).toBe("connected"));
    expect(result.current.localAudio).toBeUndefined();
    expect(result.current.localVideo).toBeUndefined();
  });

  it("voice calls do not produce video", async () => {
    const { result } = renderHook(() =>
      useConnectCall({
        call: { ...call, type: CallType.VOICE_CALL },
        authInfo,
        onPeerConnected,
        onPeerDisconnected,
        onNewMessage,
      })
    );

    await waitFor(() => expect(result.current.status).toBe("connected"));
    expect(result.current.localAudio).toBeTruthy();
    expect(result.current.localVideo).toBeUndefined();
  });

  it("toggles audio on and off", async () => {
    const { result } = renderHook(() =>
      useConnectCall({
        call,
        authInfo,
        onPeerConnected,
        onPeerDisconnected,
        onNewMessage,
      })
    );

    await waitFor(() => expect(result.current.status).toBe("connected"));

    expect(result.current.localAudio?.paused).toBe(false);
    await actHook(() => result.current.toggleAudio());
    expect(result.current.localAudio?.paused).toBe(true);
    await actHook(() => result.current.toggleAudio());
    expect(result.current.localAudio?.paused).toBe(false);
  });

  it("toggles video on and off", async () => {
    const { result } = renderHook(() =>
      useConnectCall({
        call,
        authInfo,
        onPeerConnected,
        onPeerDisconnected,
        onNewMessage,
      })
    );

    await waitFor(() => expect(result.current.status).toBe("connected"));

    expect(result.current.localVideo?.paused).toBe(false);
    await actHook(() => result.current.toggleVideo());
    expect(result.current.localVideo?.paused).toBe(true);
    await actHook(() => result.current.toggleVideo());
    expect(result.current.localVideo?.paused).toBe(false);
  });

  it("tracks call status changes", async () => {
    const { result } = renderHook(() =>
      useConnectCall({
        call,
        authInfo,
        onPeerConnected,
        onPeerDisconnected,
        onNewMessage,
      })
    );

    await waitFor(() => expect(result.current.status).toBe("connected"));

    act(() => client.sendServerEvent("callStatus", "ended"));

    await waitFor(() => expect(result.current.status).toBe("ended"));
  });

  it("tracks peer media", async () => {
    const user = { id: "USER-01", type: "user" as const };

    const { result } = renderHook(() =>
      useConnectCall({
        call,
        authInfo,
        onPeerConnected,
        onPeerDisconnected,
        onNewMessage,
      })
    );

    await waitFor(() => expect(result.current.status).toBe("connected"));

    expect(result.current.peers).toMatchInlineSnapshot(`Array []`);

    act(() =>
      client.sendServerEvent("consume", { user, kind: "audio" } as any)
    );
    await waitFor(() => expect(result.current.peers).toHaveLength(1));
    expect(result.current.peers).toMatchInlineSnapshot(`
      Array [
        Object {
          "stream": MediaStream {
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
      expect(result.current.peers[0].stream.getTracks()).toHaveLength(2)
    );
    expect(result.current.peers).toMatchInlineSnapshot(`
      Array [
        Object {
          "stream": MediaStream {
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
      expect(result.current.peers[0].stream.getTracks()).toHaveLength(1)
    );
    expect(result.current.peers).toMatchInlineSnapshot(`
      Array [
        Object {
          "stream": MediaStream {
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
    await waitFor(() => expect(result.current.peers[0]).toBeUndefined());
    expect(result.current.peers).toMatchInlineSnapshot(`Array []`);
  });

  it("alerts when peers connect and disconnect", async () => {
    const user = { id: "USER-01", type: "user" as const };

    const { result } = renderHook(() =>
      useConnectCall({
        call,
        authInfo,
        onPeerConnected,
        onPeerDisconnected,
        onNewMessage,
      })
    );
    await waitFor(() => expect(result.current.status).toBe("connected"));

    await act(async () =>
      client.sendServerEvent("consume", { user, kind: "audio" } as any)
    );
    await act(async () =>
      client.sendServerEvent("consume", { user, kind: "video" } as any)
    );

    expect(onPeerConnected).toHaveBeenCalledTimes(1);

    await act(async () =>
      client.sendServerEvent("participantDisconnect", user)
    );

    expect(onPeerDisconnected).toHaveBeenCalledTimes(1);
  });

  it("handles peers disconnecting without producing", async () => {
    const user = { id: "USER-01", type: "user" as const };

    const { result } = renderHook(() =>
      useConnectCall({
        call,
        authInfo,
        onPeerConnected,
        onPeerDisconnected,
        onNewMessage,
      })
    );
    await waitFor(() => expect(result.current.status).toBe("connected"));

    await act(async () =>
      client.sendServerEvent("participantDisconnect", user)
    );
  });

  it("delivers messages", async () => {
    const { result } = renderHook(() =>
      useConnectCall({
        call,
        authInfo,
        onPeerConnected,
        onPeerDisconnected,
        onNewMessage,
      })
    );
    await waitFor(() => expect(result.current.status).toBe("connected"));

    act(() => {
      client.sendServerEvent("textMessage", {
        from: { id: "2", type: "user" },
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
            "type": "user",
          },
        },
      ]
    `);
  });

  it("sends messages", async () => {
    const { result } = renderHook(() =>
      useConnectCall({
        call,
        authInfo,
        onPeerConnected,
        onPeerDisconnected,
        onNewMessage,
      })
    );
    await waitFor(() => expect(result.current.status).toBe("connected"));

    await actHook(() => result.current.sendMessage("Hello"));
    expect(result.current.messages).toMatchInlineSnapshot(`
      Array [
        Object {
          "contents": "Hello",
          "timestamp": 2021-11-23T12:34:56.789Z,
          "user": Object {
            "id": "1",
            "type": "inmate",
          },
        },
      ]
    `);
  });

  it("announces new messages", async () => {
    const { result } = renderHook(() =>
      useConnectCall({
        call,
        authInfo,
        onPeerConnected,
        onPeerDisconnected,
        onNewMessage,
      })
    );
    await waitFor(() => expect(result.current.status).toBe("connected"));

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

    expect(onNewMessage).toHaveBeenCalledTimes(2);
  });

  it("participant can terminate the call", async () => {
    const { result } = renderHook(() =>
      useConnectCall({
        call,
        authInfo,
        onPeerConnected,
        onPeerDisconnected,
        onNewMessage,
      })
    );

    expect(result.current.status).toBe("initializing");
    await waitFor(() => expect(result.current.status).toBe("connected"));
    const res = await actHook(() => result.current.terminateCall());
    expect(res).toBeUndefined();
  });
});
