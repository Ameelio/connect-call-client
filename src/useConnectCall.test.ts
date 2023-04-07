import "@testing-library/jest-dom";
import { act, waitFor } from "@testing-library/react";
import { act as actHook, renderHook } from "@testing-library/react-hooks/pure";
import { advanceTo } from "jest-date-mock";
import { ProducerLabel, Role, UserStatus } from "./API";
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
  detail: undefined,
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

    expect(result.current.status).toBe("initializing");

    await waitFor(() => expect(result.current.status).toBe("connected"));
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

    await waitFor(() => expect(result.current.status).toBe("connected"));
    act(() =>
      client.sendServerEvent("joined", {
        id: "test-id",
        role: Role.webinarAttendee,
        status: [UserStatus.AudioMutedByServer],
        callId: call.id,
      })
    );

    await waitFor(() => expect(result.current.peers).toHaveLength(1));
    await waitFor(() =>
      expect(result.current.peers[0].status).toEqual([
        UserStatus.AudioMutedByServer,
      ])
    );
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

    await waitFor(() =>
      expect((Client.connect as jest.Mock).mock.calls).toHaveLength(1)
    );
    expect(result.current.status).toBe("initializing");
    act(() =>
      client.sendServerEvent("joined", {
        id: "test-id",
        role: Role.webinarAttendee,
        status: [UserStatus.AudioMutedByServer],
        callId: call.id,
      })
    );

    await waitFor(() => expect(result.current.status).toBe("connected"));
    await waitFor(() => expect(result.current.peers).toHaveLength(1));
    await waitFor(() =>
      expect(result.current.peers[0].status).toEqual([
        UserStatus.AudioMutedByServer,
      ])
    );
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

    await waitFor(() => expect(result.current.status).toBe("connected"));

    // produce
    const track = (
      await navigator.mediaDevices.getUserMedia({ audio: true })
    ).getAudioTracks()[0];
    await actHook(() =>
      result.current.produceTrack(track, ProducerLabel.audio)
    );
    expect(result.current.localAudio).toBeTruthy();

    if (!result.current.localAudio) throw new Error("type narrowing");

    expect(result.current.localAudio.paused).toBe(false);
    await actHook(() => result.current.toggleAudio());
    expect(result.current.localAudio.paused).toBe(true);
    await actHook(() => result.current.toggleAudio());
    expect(result.current.localAudio.paused).toBe(false);
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

    await waitFor(() => expect(result.current.status).toBe("connected"));

    // produce
    const track = (
      await navigator.mediaDevices.getUserMedia({ video: true })
    ).getVideoTracks()[0];
    act;
    await actHook(() =>
      result.current.produceTrack(track, ProducerLabel.video)
    );
    expect(result.current.localVideo).toBeTruthy();
    if (!result.current.localVideo) throw new Error("type narrowing");

    // toggle
    expect(result.current.localVideo.paused).toBe(false);
    await actHook(() => result.current.toggleVideo());
    expect(result.current.localVideo.paused).toBe(true);
    await actHook(() => result.current.toggleVideo());
    expect(result.current.localVideo.paused).toBe(false);
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

    await waitFor(() => expect(result.current.status).toBe("connected"));

    act(() => client.sendServerEvent("callStatus", "ended"));

    await waitFor(() => expect(result.current.status).toBe("ended"));
  });

  it("tracks peer media", async () => {
    const user = {
      id: "USER-01",
      type: "user" as const,
      role: Role.visitParticipant,
      detail: undefined,
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

    await waitFor(() => expect(result.current.status).toBe("connected"));

    expect(result.current.peers).toMatchInlineSnapshot(`Array []`);

    act(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client.sendServerEvent("consume", {
        user,
        kind: "audio",
        label: "audio",
        paused: false,
      } as any)
    );
    await waitFor(() => expect(result.current.peers).toHaveLength(1));
    expect(result.current.peers).toMatchInlineSnapshot(`
      Array [
        Object {
          "connectionState": Object {
            "ping": NaN,
            "quality": "unknown",
          },
          "pausedStates": Object {
            "audio": false,
          },
          "screenshareStream": MediaStream {
            "tracks": Array [],
          },
          "status": Array [],
          "stream": MediaStream {
            "tracks": Array [
              Object {
                "kind": "audio",
              },
            ],
          },
          "user": Object {
            "detail": undefined,
            "id": "USER-01",
            "role": "visitParticipant",
            "type": "user",
          },
        },
      ]
    `);

    act(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client.sendServerEvent("consume", {
        user,
        kind: "video",
        label: "video",
        paused: false,
      } as any)
    );
    await waitFor(() =>
      expect(result.current.peers[0].stream.getTracks()).toHaveLength(2)
    );
    expect(result.current.peers).toMatchInlineSnapshot(`
      Array [
        Object {
          "connectionState": Object {
            "ping": NaN,
            "quality": "unknown",
          },
          "pausedStates": Object {
            "audio": false,
            "video": false,
          },
          "screenshareStream": MediaStream {
            "tracks": Array [],
          },
          "status": Array [],
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
            "detail": undefined,
            "id": "USER-01",
            "role": "visitParticipant",
            "type": "user",
          },
        },
      ]
    `);

    act(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client.sendServerEvent("consume", {
        user,
        kind: "video",
        label: "video",
        paused: false,
      } as any)
    );
    await waitFor(() =>
      expect(result.current.peers[0].stream.getTracks()).toHaveLength(2)
    );
    expect(result.current.peers).toMatchInlineSnapshot(`
      Array [
        Object {
          "connectionState": Object {
            "ping": NaN,
            "quality": "unknown",
          },
          "pausedStates": Object {
            "audio": false,
            "video": false,
          },
          "screenshareStream": MediaStream {
            "tracks": Array [],
          },
          "status": Array [],
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
            "detail": undefined,
            "id": "USER-01",
            "role": "visitParticipant",
            "type": "user",
          },
        },
      ]
    `);

    act(() =>
      client.sendServerEvent("producerUpdate", {
        from: user,
        paused: true,
        label: "video",
        type: "video",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
    );
    await waitFor(() =>
      expect(result.current.peers[0].stream.getTracks()).toHaveLength(1)
    );
    expect(result.current.peers).toMatchInlineSnapshot(`
      Array [
        Object {
          "connectionState": Object {
            "ping": NaN,
            "quality": "unknown",
          },
          "pausedStates": Object {
            "audio": false,
            "video": true,
          },
          "screenshareStream": MediaStream {
            "tracks": Array [],
          },
          "status": Array [],
          "stream": MediaStream {
            "tracks": Array [
              Object {
                "kind": "audio",
              },
            ],
          },
          "user": Object {
            "detail": undefined,
            "id": "USER-01",
            "role": "visitParticipant",
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
    const user = {
      id: "USER-01",
      type: "user" as const,
      role: Role.visitParticipant,
      detail: undefined,
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
    await waitFor(() => expect(result.current.status).toBe("connected"));

    await act(async () =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client.sendServerEvent("consume", { user, kind: "audio" } as any)
    );
    await act(async () =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client.sendServerEvent("consume", { user, kind: "video" } as any)
    );

    expect(onPeerConnected).toHaveBeenCalledTimes(1);

    await act(async () =>
      client.sendServerEvent("participantDisconnect", user)
    );

    expect(onPeerDisconnected).toHaveBeenCalledTimes(1);
  });

  it("handles peers disconnecting without producing", async () => {
    const user = {
      id: "USER-01",
      type: "user" as const,
      role: Role.visitParticipant,
      detail: undefined,
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
    await waitFor(() => expect(result.current.status).toBe("connected"));

    await act(async () =>
      client.sendServerEvent("participantDisconnect", user)
    );
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
    await waitFor(() => expect(result.current.status).toBe("connected"));

    act(() => {
      client.sendServerEvent("textMessage", {
        from: { id: "2", role: Role.visitParticipant, detail: undefined },
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
            "detail": undefined,
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
    await waitFor(() => expect(result.current.status).toBe("connected"));

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
    await waitFor(() => expect(result.current.status).toBe("connected"));

    act(() => {
      client.sendServerEvent("textMessage", {
        from: { id: "2", role: Role.visitParticipant, detail: undefined },
        contents: "first",
      });
    });
    act(() => {
      client.sendServerEvent("textMessage", {
        from: { id: "2", role: Role.visitParticipant, detail: undefined },
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

    expect(result.current.status).toBe("initializing");
    await waitFor(() => expect(result.current.status).toBe("connected"));
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
    await waitFor(() => expect(result.current.status).toBe("connected"));

    act(() => {
      client.sendServerEvent("timer", {
        name: "maxDuration",
        msRemaining: 60 * 1000,
        msElapsed: 60 * 1000,
      });
    });
    expect(onTimer).toHaveBeenCalledTimes(1);
  });

  it("disconnects manually", async () => {
    const { result } = renderHook(() =>
      useConnectCall({ call, user, onTimer })
    );
    await waitFor(() => expect(result.current.status).toBe("connected"));

    await result.current.disconnect();
    expect(result.current.status).toBe("disconnected");
  });

  it("broadcasts connection state of a participant to peers", async () => {
    const { result } = renderHook(() =>
      useConnectCall({ call, user, onTimer })
    );
    await waitFor(() => expect(result.current.status).toBe("connected"));

    client.connectionMonitor.emitter.emit("quality", {
      quality: "bad",
      ping: 999,
    });

    await waitFor(() =>
      expect(client.emit).toHaveBeenLastCalledWith("connectionState", {
        quality: "bad",
        ping: 999,
      })
    );
  });
});
