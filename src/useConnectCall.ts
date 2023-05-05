import { useCallback, useEffect, useState } from "react";
import { CallStatus, ProducerLabel, Role, User } from "./API";
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
  user: Omit<User, "type">;
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
  produceTrack: (
    track: MediaStreamTrack,
    label: ProducerLabel
  ) => Promise<void>;
  peers: Record<string, Peer>;
  monitors: Record<string, Peer>;
  messages: Message[];
  sendMessage: (contents: string) => Promise<void>;
  setPreferredSimulcastLayer: (x: {
    peerId: string;
    label: ProducerLabel;
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
  raiseHand: () => Promise<void>;
  lowerHand: () => Promise<void>;
  remoteLowerHand: (targetUserId: string) => Promise<void>;
  disconnect: () => Promise<void>;
  setDisableFrux: (setting: boolean) => void;
};

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
  const [disableFrux, setDisableFrux] = useState<boolean>(false);
  const [client, setClient] = useState<RoomClient>();
  const [localProducers, setLocalProducers] = useState<
    Partial<Record<ProducerLabel, { stream: MediaStream; paused: boolean }>>
  >({});
  const [peers, setPeers] = useState<Record<string, Peer>>({});
  const [monitors, setMonitors] = useState<Record<string, Peer>>({});

  useEffect(() => {
    if (client) client.disableFrux = disableFrux;
  }, [disableFrux, client]);

  const [trackedUser, setTrackedUser] = useState<Peer>();

  const [messages, setMessages] = useState<Message[]>([]);

  const [error, setError] = useState<Error>();
  const [clientStatus, setClientStatus] = useState<ClientStatus>(
    ClientStatus.initializing
  );
  const [callStatus, setCallStatus] = useState<CallStatus>();

  const handleError = (e: Error) => {
    setClientStatus(ClientStatus.errored);
    setError(e);
  };

  const [debounceReady, setDebounceReady] = useState(false);

  useEffect(() => {
    const debounceTimeout = setTimeout(() => {
      setDebounceReady(true);
    }, 10);
    return () => clearTimeout(debounceTimeout);
  }, []);

  function bindClient(client: RoomClient) {
    client.on("peers", (p) => {
      setPeers(
        Object.fromEntries(
          Object.entries(p).filter(
            ([key, { user }]) => user.role !== Role.monitor
          )
        )
      );
      setMonitors(
        Object.fromEntries(
          Object.entries(p).filter(
            ([key, { user }]) => user.role === Role.monitor
          )
        )
      );
    });
    client.on("self", (u) => setTrackedUser(u));
    client.on("status", (s) => setCallStatus(s));
    client.on("textMessage", (msg) => {
      const stamped = {
        ...msg,
        timestamp: new Date(),
      };
      setMessages((existing) => [...existing, stamped]);
      if (onNewMessage) onNewMessage(stamped);
    });
    client.on("localProducers", (p) => {
      setLocalProducers(p);
    });

    client.on(
      "timer",
      ({
        name,
        msRemaining,
        msElapsed,
      }: {
        name: string;
        msRemaining: number;
        msElapsed: number;
      }) => {
        onTimer && onTimer(name, msRemaining, msElapsed);
      }
    );

    // Request most recent state
    client.emitState();
  }

  // create a client for the call
  useEffect(() => {
    if (call?.id === undefined) return;
    if (!debounceReady) return;
    RoomClient.connect({
      id: call.id,
      url: call.url,
      token: call.token,
    })
      .then((client) => {
        setClient(client);
        bindClient(client);
      })
      .catch(handleError);
  }, [call?.id, call?.url, call?.token, debounceReady]);

  const disconnect = useCallback(async () => {
    if (!client) return;
    setClientStatus(ClientStatus.disconnected);
    client.close();
  }, [client]);

  const closeProducer = useCallback(
    async (label: ProducerLabel) => {
      if (!client) return;

      await client.closeProducer(label);
    },
    [client]
  );

  useEffect(() => {
    if (!client) return;
    setClientStatus(ClientStatus.connected);
    return () => void disconnect();
  }, [client, disconnect]);

  // announce text messages
  useEffect(() => {
    if (!client || !onNewMessage) return;
    const handler = (msg: { user: User; contents: string }) => {};
    return () => client.off("textMessage", handler);
  });

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
      if (!client) throw new Error("Not connected");
      await client.pauseProducer(label);
    },
    [client]
  );

  const resumeProducer = useCallback(
    async (label: ProducerLabel) => {
      if (!client) throw new Error("Not connected");
      await client.resumeProducer(label);
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

  return {
    // Connection and room status
    clientStatus,
    callStatus,
    error,

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
    setDisableFrux: (setting: boolean) => setDisableFrux(setting),

    terminateCall,
  };
};

export default useConnectCall;
