import { useCallback, useEffect, useRef, useState } from "react";
import { CallStatus, DisconnectReason, ProducerLabel, Role, User } from "./API";
import RoomClient, { Peer } from "./RoomClient";

export enum ClientStatus {
  initializing = "initializing",
  errored = "errored",
  connected = "connected",
  disconnected = "disconnected",
}

type Props = {
  call?: {
    id: string;
    url: string;
    token: string;
  };
  user: Pick<User, "id">;
  onMonitorJoined?: (user: string) => void;
  onPeerConnected?: (user: User) => void;
  onPeerDisconnected?: (user: User) => void;
  onTimer?: (name: string, msRemaining: number, msElapsed: number) => void;
  onNewMessage?: (message: Message) => void;
};

export type Message = {
  user: User;
  contents: string;
  timestamp: Date;
};

export type ConnectCall = {
  clientStatus: ClientStatus;
  callStatus?: CallStatus;
  error?: Error;
  user?: Peer;
  localProducers: Partial<
    Record<ProducerLabel, { stream: MediaStream; paused: boolean }>
  >;
  closeProducer: (label: ProducerLabel) => Promise<void>;
  pauseProducer: (label: ProducerLabel) => void;
  resumeProducer: (label: ProducerLabel) => void;
  disconnectReason?: DisconnectReason;
  manuallyReconnect: () => void;
  produceTrack: (
    track: MediaStreamTrack,
    label: ProducerLabel
  ) => Promise<void>;
  peers: Record<string, Peer>;
  monitors: Record<string, Peer>;
  messages: Message[];
  sendMessage: (contents: string) => Promise<void>;
  setPreferredSimulcastLayer: (x: {
    consumerId: string;
    spatialLayer: number;
    temporalLayer?: number;
  }) => Promise<void>;
  terminateCall: () => Promise<void>;
  textMessage: (contents: string) => Promise<void>;
  terminate: () => Promise<void>;
  remoteAudioMute: (targetUserId: string) => Promise<void>;
  remoteAudioUnmute: (targetUserId: string) => Promise<void>;
  remoteVideoMute: (targetUserId: string) => Promise<void>;
  remoteVideoUnmute: (targetUserId: string) => Promise<void>;
  pauseConsumer: (peerId: string, label: ProducerLabel) => Promise<void>;
  resumeConsumer: (peerId: string, label: ProducerLabel) => Promise<void>;
  raiseHand: () => Promise<void>;
  lowerHand: () => Promise<void>;
  enableFrux: () => void;
  remoteLowerHand: (targetUserId: string) => Promise<void>;
  disconnect: () => Promise<void>;

  // Debugging only
  simulatePingLatency: (ping: number) => void;
  stopSimulatingPingLatency: () => void;
};

function useChangeTracker<T>({
  onAdd,
  onRemove,
  object,
}: {
  onAdd?: (t: T) => void;
  onRemove?: (t: T) => void;
  object: Record<string, T>;
}) {
  const last = useRef<Record<string, T>>(object);

  // useChangeTracker tracks changes in an object and emits
  // onAdd and onRemove events on rerender whenever a key
  // is added or removed.
  // We do this by keeping a reference of the last copy of
  // of the object and comparing.
  // Note: we assume the object reference changes whenever
  // the object changes, i.e. that the object is treated
  // like an immutable type.
  useEffect(() => {
    Object.entries(object).forEach(([key, val]) => {
      if (!(key in last.current) && onAdd) onAdd(val);
    });
    Object.entries(last.current).forEach(([key, val]) => {
      if (!(key in object) && onRemove) onRemove(val);
    });
    last.current = object;
  }, [object, onAdd, onRemove]);
}

/**
 * useConnectCall integrates with RoomClient and provides observable values.
 */
const useConnectCall = ({
  call,
  user,
  onMonitorJoined,
  onPeerConnected,
  onPeerDisconnected,
  onTimer,
  onNewMessage,
}: Props): ConnectCall => {
  const [client, setClient] = useState<RoomClient>();
  const [localProducers, setLocalProducers] = useState<
    Partial<Record<ProducerLabel, { stream: MediaStream; paused: boolean }>>
  >({});

  const [peers, setPeers] = useState<Record<string, Peer>>({});
  const [monitors, setMonitors] = useState<Record<string, Peer>>({});

  useChangeTracker({
    onAdd: (peer) => onPeerConnected?.(peer.user),
    onRemove: (peer) => onPeerDisconnected?.(peer.user),
    object: peers,
  });

  useChangeTracker({
    onAdd: (peer) => onMonitorJoined?.(peer.user.id),
    object: monitors,
  });

  const [trackedUser, setTrackedUser] = useState<Peer>();

  const [messages, setMessages] = useState<Message[]>([]);

  const [error, setError] = useState<Error>();
  const [clientStatus, setClientStatus] = useState<ClientStatus>(
    ClientStatus.initializing
  );
  const [callStatus, setCallStatus] = useState<CallStatus>();

  const [disconnectReason, setDisconnectReason] = useState<DisconnectReason>();
  const [automaticallyInit, setAutomaticallyInit] = useState(true);

  // To avoid problems with react strict mode,
  // don't initialize until 10 ms have passed without unmounting.
  const [debounceReady, setDebounceReady] = useState(false);
  useEffect(() => {
    const debounceTimeout = setTimeout(() => {
      setDebounceReady(true);
    }, 10);
    return () => clearTimeout(debounceTimeout);
  }, []);

  const bindClient = useCallback((client: RoomClient) => {
    client.on("peers", (p) => {
      setPeers(
        Object.fromEntries(
          Object.entries(p).filter(
            ([_, { user }]) => user.role !== Role.monitor
          )
        )
      );
      setMonitors(
        Object.fromEntries(
          Object.entries(p).filter(
            ([_, { user }]) => user.role === Role.monitor
          )
        )
      );
    });
    client.on("self", (u) => setTrackedUser(u));
    client.on("status", (s) => setCallStatus(s));
    client.on("localProducers", (p) => {
      setLocalProducers(p);
    });

    // Request most recent state
    client.emitState();

    // When we disconnect, reinitialize
    client.on("disconnect", (reason: DisconnectReason) => {
      if (client) client.close();

      setClient(undefined);
      setDisconnectReason(reason);
      if (reason === DisconnectReason.error) {
        setAutomaticallyInit(true);
      }
    });
  }, []);

  const [fruxEnabled, setFruxEnabled] = useState(false);

  const enableFrux = useCallback(() => {
    setFruxEnabled(true);
  }, []);

  const simulatePingLatency = useCallback(
    (ping: number) => {
      if (client) client.simulatePingLatency(ping);
    },
    [client]
  );

  const stopSimulatingPingLatency = useCallback(() => {
    if (client) client.stopSimulatingPingLatency();
  }, [client]);

  // Respond to fruxEnabled.
  // This way, if fruxEnabled is set before the client is initialized,
  // we will still respond.
  useEffect(() => {
    if (fruxEnabled && client) {
      client.enableFrux();
    }
  }, [fruxEnabled, client]);

  const reinitializeClient = useCallback(
    async (
      producers: Partial<
        Record<ProducerLabel, { stream: MediaStream; paused: boolean }>
      >
    ) => {
      if (call?.id === undefined) return;

      try {
        const client = await RoomClient.connect({
          id: call.id,
          url: call.url,
          token: call.token,
        });

        setClient(client);
        bindClient(client);

        // Produce inherited streams
        Object.values(ProducerLabel).forEach((label) => {
          const producer = producers[label];
          if (producer) {
            const track =
              label === ProducerLabel.audio
                ? producer.stream.getAudioTracks()[0]
                : producer.stream.getVideoTracks()[0];

            client.produce(track, label);
          }
        });
      } catch (error) {
        setClientStatus(ClientStatus.errored);
        if (error instanceof Error) {
          setError(error);
        }
      }
    },
    [call]
  );

  const manuallyReconnect = useCallback(() => {
    setAutomaticallyInit(true);
  }, []);

  // create a client for the call, subject to debounce
  useEffect(() => {
    if (!debounceReady) return;

    if (!client && automaticallyInit) {
      setAutomaticallyInit(false);
      setDisconnectReason(undefined);
      reinitializeClient(localProducers);
    }
  }, [
    debounceReady,
    reinitializeClient,
    client,
    localProducers,
    automaticallyInit,
  ]);

  // "message" and "timer" handlers may change over time,
  // and we can afford to miss quick ones at the very start.
  // useEffect to bind/unbind these when they change.
  useEffect(() => {
    if (!client) return;

    const messageHandler = (msg: { user: User; contents: string }) => {
      const stamped = {
        ...msg,
        timestamp: new Date(),
      };
      setMessages((existing) => [...existing, stamped]);
      if (onNewMessage) onNewMessage(stamped);
    };

    client.on("textMessage", messageHandler);

    const timerHandler = ({
      name,
      msRemaining,
      msElapsed,
    }: {
      name: string;
      msRemaining: number;
      msElapsed: number;
    }) => {
      onTimer && onTimer(name, msRemaining, msElapsed);
    };

    client.on("timer", timerHandler);

    return () => {
      client.off("textMessage", messageHandler);
      client.off("timer", timerHandler);
    };
  }, [client, onNewMessage, onTimer]);

  const disconnect = useCallback(async () => {
    if (!client) return;
    setClientStatus(ClientStatus.disconnected);
    client.close(true); // Also stop user media grab
  }, [client]);

  const closeProducer = useCallback(
    async (label: ProducerLabel) => {
      if (!client) return;

      await client.closeProducer(label);
    },
    [client]
  );

  // Report disconnection when disconnected
  useEffect(() => {
    if (!client) return;
    setClientStatus(ClientStatus.connected);
    return () => {
      setClientStatus(ClientStatus.disconnected);
    };
  }, [client]);

  const sendMessage = useCallback(
    async (contents: string) => {
      if (!client) throw new Error("Not connected");
      await client.sendMessage(contents);
      setMessages((existing) => [
        ...existing,
        {
          contents,
          user: {
            id: user.id,
            role: client.user.role,
          },
          timestamp: new Date(),
        },
      ]);
    },
    [client, setMessages, user]
  );

  const setPreferredSimulcastLayer = useCallback(
    async ({
      consumerId,
      spatialLayer,
      temporalLayer,
    }: {
      consumerId: string;
      spatialLayer: number;
      temporalLayer?: number;
    }) => {
      if (!client) throw new Error("missing client");
      await client.setPreferredSimulcastLayer({
        consumerId,
        spatialLayer,
        temporalLayer,
      });
    },
    [client]
  );

  const pauseProducer = useCallback(
    async (label: ProducerLabel) => {
      if (client) {
        await client.pauseProducer(label);
      } else {
        const stream = localProducers[label]?.stream;

        if (!stream) throw new Error("No such producer");

        const track =
          label === ProducerLabel.audio
            ? stream.getAudioTracks()[0]
            : stream.getVideoTracks()[0];

        track.enabled = false;
      }
    },
    [client]
  );

  const resumeProducer = useCallback(
    async (label: ProducerLabel) => {
      if (client) {
        await client.resumeProducer(label);
      } else {
        const stream = localProducers[label]?.stream;

        if (!stream) throw new Error("No such producer");

        const track =
          label === ProducerLabel.audio
            ? stream.getAudioTracks()[0]
            : stream.getVideoTracks()[0];

        track.enabled = true;
      }
    },
    [client]
  );

  // Operations
  const terminateCall = useCallback(async () => {
    if (!client) throw new Error("Not connected");
    await client.terminate();
  }, [client]);

  const terminate = terminateCall;

  const textMessage = useCallback(
    async (contents: string) => {
      if (!client) throw new Error("Not connected");
      await client.textMessage(contents);
    },
    [client]
  );

  const remoteAudioMute = useCallback(
    async (targetUserId: string) => {
      if (!client) throw new Error("Not connected");
      await client.remoteAudioMute(targetUserId);
    },
    [client]
  );
  const remoteAudioUnmute = useCallback(
    async (targetUserId: string) => {
      if (!client) throw new Error("Not connected");
      await client.remoteAudioUnmute(targetUserId);
    },
    [client]
  );
  const remoteVideoMute = useCallback(
    async (targetUserId: string) => {
      if (!client) throw new Error("Not connected");
      await client.remoteVideoMute(targetUserId);
    },
    [client]
  );
  const remoteVideoUnmute = useCallback(
    async (targetUserId: string) => {
      if (!client) throw new Error("Not connected");
      await client.remoteVideoUnmute(targetUserId);
    },
    [client]
  );

  const raiseHand = useCallback(async () => {
    if (!client) throw new Error("Not connected");
    await client.raiseHand();
  }, [client]);
  const lowerHand = useCallback(async () => {
    if (!client) throw new Error("Not connected");
    await client.lowerHand();
  }, [client]);
  const remoteLowerHand = useCallback(
    async (targetUserId: string) => {
      if (!client) throw new Error("Not connected");
      await client.remoteLowerHand(targetUserId);
    },
    [client]
  );

  const produceTrack = useCallback(
    async (track: MediaStreamTrack, label: ProducerLabel) => {
      if (!client) throw new Error("Not connected");
      await client.produce(track, label);
      const stream = new MediaStream();
      stream.addTrack(track);
    },
    [client]
  );

  const pauseConsumer = useCallback(
    async (peerId: string, label: ProducerLabel) => {
      if (client) await client.pauseConsumer(peerId, label);
    },
    [client]
  );

  const resumeConsumer = useCallback(
    async (peerId: string, label: ProducerLabel) => {
      if (client) await client.resumeConsumer(peerId, label);
    },
    [client]
  );

  return {
    // Connection and room status
    clientStatus,
    callStatus,
    error,

    // Frux
    enableFrux,

    // Peers, including their streams
    peers,
    monitors,

    // Self
    user: trackedUser,

    // Produce local streams
    produceTrack,

    // Get local streams
    localProducers,

    // Manipulate local streams
    closeProducer,
    pauseProducer,
    resumeProducer,

    // Send and receive messages
    messages,
    sendMessage,

    // Disconnect
    disconnect,

    // Reconnect
    disconnectReason,
    manuallyReconnect,

    // Server operations
    textMessage,
    terminate,
    remoteAudioMute,
    remoteAudioUnmute,
    remoteVideoMute,
    remoteVideoUnmute,
    raiseHand,
    lowerHand,
    remoteLowerHand,
    setPreferredSimulcastLayer,

    pauseConsumer,
    resumeConsumer,

    // Debugging
    simulatePingLatency,
    stopSimulatingPingLatency,

    terminateCall,
  };
};

export default useConnectCall;
