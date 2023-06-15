import "@testing-library/jest-dom";
import { act, waitFor } from "@testing-library/react";
import { act as actHook, renderHook } from "@testing-library/react-hooks/pure";
import { advanceTo } from "jest-date-mock";
import {
  CallStatus,
  ConnectionStateQuality,
  ProducerLabel,
  Role,
  UserStatus,
} from "./API";
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

// Dummy connection state
const connectionState = {
  quality: ConnectionStateQuality.excellent,
  ping: 0,
  badConnection: false,
};

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

  it("receives peers and room status", async () => {
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

    act(() => {
      client.sendServerEvent("state", {
        participants: {
          "socket-id": {
            peerId: "socket-id",
            user: {
              id: "test-id",
              role: Role.webinarAttendee,
            },
            connectionState,
            status: [UserStatus.AudioMutedByServer],
            consumers: {},
          },
          "self-socket-id": {
            peerId: "self-socket-id",
            user: {
              id: "self-test-id",
              role: Role.webinarAttendee,
            },
            connectionState,
            status: [UserStatus.AudioMutedByServer],
            consumers: {},
          },
        },
        status: CallStatus.live,
      });
    });

    await waitFor(() =>
      expect(result.current.callStatus).toBe(CallStatus.live)
    );
    await waitFor(() =>
      expect(Object.values(result.current.peers)).toHaveLength(1)
    );
    await waitFor(() =>
      expect(Object.values(result.current.peers)[0].status).toEqual([
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

    await waitFor(() => expect(result.current.clientStatus).toBe("connected"));

    // produce
    const track = (
      await navigator.mediaDevices.getUserMedia({ audio: true })
    ).getAudioTracks()[0];
    await actHook(() =>
      result.current.produceTrack(track, ProducerLabel.audio)
    );

    expect(result.current.localProducers[ProducerLabel.audio]?.paused).toBe(
      false
    );
    await actHook(() => result.current.pauseProducer(ProducerLabel.audio));
    expect(result.current.localProducers[ProducerLabel.audio]?.paused).toBe(
      true
    );
    await actHook(() => result.current.resumeProducer(ProducerLabel.audio));
    expect(result.current.localProducers[ProducerLabel.audio]?.paused).toBe(
      false
    );
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

    await waitFor(() => expect(result.current.clientStatus).toBe("connected"));

    // produce
    const track = (
      await navigator.mediaDevices.getUserMedia({ video: true })
    ).getVideoTracks()[0];
    await actHook(() =>
      result.current.produceTrack(track, ProducerLabel.video)
    );

    expect(result.current.localProducers[ProducerLabel.video]?.paused).toBe(
      false
    );
    await actHook(() => result.current.pauseProducer(ProducerLabel.video));
    expect(result.current.localProducers[ProducerLabel.video]?.paused).toBe(
      true
    );
    await actHook(() => result.current.resumeProducer(ProducerLabel.video));
    expect(result.current.localProducers[ProducerLabel.video]?.paused).toBe(
      false
    );
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
    await waitFor(() => expect(result.current.clientStatus).toBe("connected"));

    expect(result.current.peers).toMatchInlineSnapshot(`Object {}`);

    act(() => {
      client.sendServerEvent("state", {
        participants: {
          "socket-id": {
            peerId: "socket-id",
            user: {
              id: "test-id",
              role: Role.visitParticipant,
            },
            connectionState,
            status: [],
            consumers: {},
          },
          "self-socket-id": {
            peerId: "self-socket-id",
            user: {
              id: "self-test-id",
              role: Role.visitParticipant,
            },
            connectionState,
            status: [],
            consumers: {},
          },
        },
        status: CallStatus.live,
      });
    });

    await waitFor(() =>
      expect(result.current.callStatus).toBe(CallStatus.live)
    );
    await waitFor(() =>
      expect(Object.values(result.current.peers)).toHaveLength(1)
    );
    await waitFor(() => {
      const peer = result.current.peers["socket-id"];
      if (!peer) throw new Error("need peer");

      expect(Object.values(peer.consumers)).toHaveLength(0);
    });

    act(() => {
      client.sendServerEvent("state", {
        participants: {
          "socket-id": {
            peerId: "socket-id",
            user: {
              id: "test-id",
              role: Role.visitParticipant,
            },
            status: [],
            connectionState,
            consumers: {
              [ProducerLabel.audio]: {
                id: "consumer-audio-id",
                producerId: "producer-audio-id",
                kind: "audio",
                producerPaused: false,
                rtpParameters: { codecs: [] },
                paused: false,
              },
            },
          },
          "self-socket-id": {
            peerId: "self-socket-id",
            user: {
              id: "self-test-id",
              role: Role.visitParticipant,
            },
            status: [],
            connectionState,
            consumers: {},
          },
        },
        status: CallStatus.live,
      });
    });

    await waitFor(() =>
      expect(result.current.peers["socket-id"]?.consumers.audio).toBeTruthy()
    );

    expect(result.current.peers).toMatchInlineSnapshot(`
      Object {
        "socket-id": Object {
          "connectionState": Object {
            "badConnection": false,
            "ping": 0,
            "quality": "excellent",
          },
          "consumers": Object {
            "audio": Object {
              "id": "consumer-audio-id",
              "paused": false,
              "stream": MediaStream {
                "tracks": Array [
                  Object {
                    "id": "consumer-audio-id",
                    "kind": "audio",
                    "paused": false,
                    "producerId": "producer-audio-id",
                    "producerPaused": false,
                    "rtpParameters": Object {
                      "codecs": Array [],
                    },
                  },
                ],
              },
            },
          },
          "peerId": "socket-id",
          "status": Array [],
          "user": Object {
            "id": "test-id",
            "role": "visitParticipant",
          },
        },
      }
    `);

    act(() => {
      client.sendServerEvent("state", {
        participants: {
          "socket-id": {
            peerId: "socket-id",
            user: {
              id: "test-id",
              role: Role.visitParticipant,
            },
            status: [],
            connectionState,
            consumers: {
              [ProducerLabel.audio]: {
                id: "consumer-audio-id",
                producerId: "producer-audio-id",
                kind: "audio",
                producerPaused: false,
                rtpParameters: { codecs: [] },
                paused: false,
              },
              [ProducerLabel.video]: {
                id: "consumer-video-id",
                producerId: "producer-video-id",
                kind: "video",
                producerPaused: false,
                rtpParameters: { codecs: [] },
                paused: false,
              },
            },
          },
          "self-socket-id": {
            peerId: "self-socket-id",
            user: {
              id: "self-test-id",
              role: Role.visitParticipant,
            },
            status: [],
            connectionState,
            consumers: {},
          },
        },
        status: CallStatus.live,
      });
    });

    await waitFor(() =>
      expect(result.current.peers["socket-id"]?.consumers.video).toBeTruthy()
    );
    expect(result.current.peers).toMatchInlineSnapshot(`
      Object {
        "socket-id": Object {
          "connectionState": Object {
            "badConnection": false,
            "ping": 0,
            "quality": "excellent",
          },
          "consumers": Object {
            "audio": Object {
              "id": "consumer-audio-id",
              "paused": false,
              "stream": MediaStream {
                "tracks": Array [
                  Object {
                    "id": "consumer-audio-id",
                    "kind": "audio",
                    "paused": false,
                    "producerId": "producer-audio-id",
                    "producerPaused": false,
                    "rtpParameters": Object {
                      "codecs": Array [],
                    },
                  },
                ],
              },
            },
            "video": Object {
              "id": "consumer-video-id",
              "paused": false,
              "stream": MediaStream {
                "tracks": Array [
                  Object {
                    "id": "consumer-video-id",
                    "kind": "video",
                    "paused": false,
                    "producerId": "producer-video-id",
                    "producerPaused": false,
                    "rtpParameters": Object {
                      "codecs": Array [],
                    },
                  },
                ],
              },
            },
          },
          "peerId": "socket-id",
          "status": Array [],
          "user": Object {
            "id": "test-id",
            "role": "visitParticipant",
          },
        },
      }
    `);

    act(() => {
      client.sendServerEvent("state", {
        participants: {
          "socket-id": {
            peerId: "socket-id",
            user: {
              id: "test-id",
              role: Role.visitParticipant,
            },
            status: [],
            connectionState,
            consumers: {
              [ProducerLabel.audio]: {
                id: "consumer-audio-id",
                producerId: "producer-audio-id",
                kind: "audio",
                producerPaused: false,
                rtpParameters: { codecs: [] },
                paused: true,
              },
              [ProducerLabel.video]: {
                id: "consumer-video-id",
                producerId: "producer-video-id",
                kind: "video",
                producerPaused: false,
                rtpParameters: { codecs: [] },
                paused: true,
              },
            },
          },
          "self-socket-id": {
            peerId: "self-socket-id",
            user: {
              id: "self-test-id",
              role: Role.visitParticipant,
            },
            status: [],
            connectionState,
            consumers: {},
          },
        },
        status: CallStatus.live,
      });
    });

    await waitFor(() => {
      expect(
        result.current.peers["socket-id"]?.consumers.video?.paused
      ).toBeTruthy();
      expect(
        result.current.peers["socket-id"]?.consumers.audio?.paused
      ).toBeTruthy();
    });
    expect(result.current.peers).toMatchInlineSnapshot(`
      Object {
        "socket-id": Object {
          "connectionState": Object {
            "badConnection": false,
            "ping": 0,
            "quality": "excellent",
          },
          "consumers": Object {
            "audio": Object {
              "id": "consumer-audio-id",
              "paused": true,
              "stream": MediaStream {
                "tracks": Array [
                  Object {
                    "id": "consumer-audio-id",
                    "kind": "audio",
                    "paused": false,
                    "producerId": "producer-audio-id",
                    "producerPaused": false,
                    "rtpParameters": Object {
                      "codecs": Array [],
                    },
                  },
                ],
              },
            },
            "video": Object {
              "id": "consumer-video-id",
              "paused": true,
              "stream": MediaStream {
                "tracks": Array [
                  Object {
                    "id": "consumer-video-id",
                    "kind": "video",
                    "paused": false,
                    "producerId": "producer-video-id",
                    "producerPaused": false,
                    "rtpParameters": Object {
                      "codecs": Array [],
                    },
                  },
                ],
              },
            },
          },
          "peerId": "socket-id",
          "status": Array [],
          "user": Object {
            "id": "test-id",
            "role": "visitParticipant",
          },
        },
      }
    `);

    act(() => {
      client.sendServerEvent("state", {
        participants: {
          "socket-id": {
            peerId: "socket-id",
            user: {
              id: "test-id",
              role: Role.visitParticipant,
            },
            status: [],
            connectionState,
            consumers: {
              [ProducerLabel.audio]: {
                id: "consumer-audio-id",
                producerId: "producer-audio-id",
                kind: "audio",
                producerPaused: false,
                rtpParameters: { codecs: [] },
                paused: false,
              },
              [ProducerLabel.video]: {
                id: "consumer-video-id",
                producerId: "producer-video-id",
                kind: "video",
                producerPaused: false,
                rtpParameters: { codecs: [] },
                paused: false,
              },
            },
          },
          "self-socket-id": {
            peerId: "self-socket-id",
            user: {
              id: "self-test-id",
              role: Role.visitParticipant,
            },
            status: [],
            connectionState,
            consumers: {},
          },
        },
        status: CallStatus.live,
      });
    });

    await waitFor(() => {
      expect(
        result.current.peers["socket-id"]?.consumers.video?.paused
      ).toBeFalsy();
      expect(
        result.current.peers["socket-id"]?.consumers.audio?.paused
      ).toBeFalsy();
    });

    expect(result.current.peers).toMatchInlineSnapshot(`
      Object {
        "socket-id": Object {
          "connectionState": Object {
            "badConnection": false,
            "ping": 0,
            "quality": "excellent",
          },
          "consumers": Object {
            "audio": Object {
              "id": "consumer-audio-id",
              "paused": false,
              "stream": MediaStream {
                "tracks": Array [
                  Object {
                    "id": "consumer-audio-id",
                    "kind": "audio",
                    "paused": false,
                    "producerId": "producer-audio-id",
                    "producerPaused": false,
                    "rtpParameters": Object {
                      "codecs": Array [],
                    },
                  },
                ],
              },
            },
            "video": Object {
              "id": "consumer-video-id",
              "paused": false,
              "stream": MediaStream {
                "tracks": Array [
                  Object {
                    "id": "consumer-video-id",
                    "kind": "video",
                    "paused": false,
                    "producerId": "producer-video-id",
                    "producerPaused": false,
                    "rtpParameters": Object {
                      "codecs": Array [],
                    },
                  },
                ],
              },
            },
          },
          "peerId": "socket-id",
          "status": Array [],
          "user": Object {
            "id": "test-id",
            "role": "visitParticipant",
          },
        },
      }
    `);
  });

  it("alerts when peers connect and disconnect", async () => {
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
      client.sendServerEvent("state", {
        participants: {
          "socket-id": {
            peerId: "socket-id",
            user: {
              id: "test-id",
              role: Role.webinarAttendee,
            },
            status: [UserStatus.AudioMutedByServer],
            connectionState,
            consumers: {},
          },
          "self-socket-id": {
            peerId: "self-socket-id",
            user: {
              id: "self-test-id",
              role: Role.webinarAttendee,
            },
            status: [UserStatus.AudioMutedByServer],
            connectionState,
            consumers: {},
          },
        },
        status: CallStatus.live,
      });
    });

    await waitFor(() =>
      expect(Object.values(result.current.peers)).toHaveLength(1)
    );

    act(() => {
      client.sendServerEvent("state", {
        participants: {
          "self-socket-id": {
            peerId: "self-socket-id",
            user: {
              id: "self-test-id",
              role: Role.webinarAttendee,
            },
            status: [UserStatus.AudioMutedByServer],
            connectionState,
            consumers: {},
          },
        },
        status: CallStatus.live,
      });
    });

    await waitFor(() =>
      expect(Object.values(result.current.peers)).toHaveLength(0)
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

    await waitFor(() => expect(result.current.clientStatus).toBe("connected"));

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
    await waitFor(() => expect(result.current.clientStatus).toBe("connected"));

    await result.current.disconnect();
    expect(result.current.clientStatus).toBe("disconnected");
  });
});
