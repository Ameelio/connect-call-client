import { useCallback, useEffect, useState } from "react";
import { CallStatus, Operation, Participant, Role, UserStatus } from "./API";
import RoomClient, { ConnectionState, Peer } from "./RoomClient";

export type AudioTrack = {
  stream: MediaStream;
  paused: boolean;
};

export type VideoTrack = {
  stream: MediaStream;
  paused: boolean;
  aspectRatio?: number;
};

export type ClientStatus =
  | "initializing"
  | "errored"
  | "connected"
  | "disconnected";

type Props = {
  call?: {
    id: string;
    url: string;
    token: string;
  };
  user: Pick<Participant, "id">;
  onPeerConnected?: (user: Participant) => void;
  onPeerDisconnected?: (user: Participant) => void;
  onTimer?: (
    name: "maxDuration",
    msRemaining: number,
    msElapsed: number
  ) => void;
  onNewMessage?: (message: Message) => void;
};

export type Message = {
  user: Participant;
  contents: string;
  timestamp: Date;
};

export type ConnectCall = {
  status: ClientStatus | CallStatus;
  error?: Error;
  user?: {
    id: string;
    role: Role;
    status: UserStatus[];
  };
  submitOperation: (o: Operation) => Promise<void>;
  localAudio: AudioTrack | undefined;
  localVideo: VideoTrack | undefined;
  connectionState: ConnectionState;
  toggleAudio: () => void;
  toggleVideo: () => void;
  produceTrack: (track: MediaStreamTrack) => Promise<void>;
  peers: Peer[];
  messages: Message[];
  sendMessage: (contents: string) => Promise<void>;
  terminateCall: () => Promise<void>;
  disconnect: () => Promise<void>;
};

/**
 * useConnectCall integrates with RoomClient and provides observable values.
 */
const useConnectCall = ({
  call,
  user,
  onPeerConnected,
  onPeerDisconnected,
  onTimer,
  onNewMessage,
}: Props): ConnectCall => {
  const [client, setClient] = useState<RoomClient>();
  const [localAudio, setLocalAudio] = useState<AudioTrack>();
  const [localVideo, setLocalVideo] = useState<VideoTrack>();
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    quality: "unknown",
    ping: NaN,
  });
  const [peers, setPeers] = useState<
    {
      user: Participant;
      stream: MediaStream;
      connectionState: ConnectionState;
      status: UserStatus[];
    }[]
  >([]);

  const [trackedUser, setTrackedUser] = useState<{
    id: string;
    role: Role;
    status: UserStatus[];
  }>();

  const [messages, setMessages] = useState<Message[]>([]);

  const [error, setError] = useState<Error>();
  const [status, setStatus] = useState<ConnectCall["status"]>("initializing");

  const handleError = (e: Error) => {
    setStatus("errored");
    setError(e);
  };

  const handlePeerDisconnect = (user: Participant) =>
    setPeers((peers) => peers.filter((p) => p.user.id !== user.id));

  const handlePeerUpdate = ({
    user,
    stream,
    connectionState,
    status,
  }: Peer) => {
    setPeers((peers) => {
      return [
        ...peers.filter((p) => p.user.id !== user.id),
        {
          user,
          stream,
          connectionState,
          status,
        },
      ];
    });
  };

  const handleUserStatusChange = (
    changes: { userId: string; status: UserStatus[] }[]
  ) => {
    if (peers) {
      const modifiedPeers = peers.map((peer) => {
        const change = changes.find(({ userId }) => userId === peer.user.id);
        if (change) {
          return {
            ...peer,
            status: change.status,
          };
        }
        return peer;
      });

      setPeers(modifiedPeers);
    }

    if (trackedUser) {
      const selfChange = changes.find(({ userId }) => userId === user.id);

      if (selfChange) {
        setTrackedUser({
          ...trackedUser,
          status: selfChange.status,
        });
      }
    }
  };

  const handleStatusChange = (status: CallStatus) => setStatus(status);

  const handleTextMessage = (message: {
    user: Participant;
    contents: string;
  }) =>
    setMessages((existing) => [
      ...existing,
      {
        ...message,
        timestamp: new Date(),
      },
    ]);

  const handleTimer = useCallback(
    ({
      name,
      msRemaining,
      msElapsed,
    }: {
      name: "maxDuration";
      msRemaining: number;
      msElapsed: number;
    }) => {
      onTimer && onTimer(name, msRemaining, msElapsed);
    },
    [onTimer]
  );

  const handleConnectionState = useCallback(
    (connectionState: ConnectionState) => {
      setConnectionState(connectionState);
      if (localVideo && connectionState.videoDisabled && !localVideo.paused) {
        setLocalVideo({
          ...localVideo,
          paused: true,
        });
      }
    },
    [setConnectionState, localVideo]
  );

  // create a client for the call
  useEffect(() => {
    if (call?.id === undefined) return;
    RoomClient.connect({
      id: call.id,
      url: call.url,
      token: call.token,
    })
      .then((client) => {
        setClient(client);
        setTrackedUser(client.user);
      })
      .catch(handleError);
  }, [call?.id, call?.url, call?.token]);

  const disconnect = useCallback(async () => {
    if (!client) return;
    setStatus("disconnected");
    client.close();
  }, [client]);

  useEffect(() => {
    if (!client) return;
    setStatus("connected");
    return () => void disconnect();
  }, [client, disconnect]);

  // hook into the client
  useEffect(() => {
    if (!client) return;
    client.on("onPeerDisconnect", handlePeerDisconnect);
    client.on("onPeerUpdate", handlePeerUpdate);
    client.on("onStatusChange", handleStatusChange);
    client.on("onUserStatus", handleUserStatusChange);
    client.on("onTextMessage", handleTextMessage);
    client.on("onTimer", handleTimer);
    client.on("onConnectionState", handleConnectionState);
    return () => {
      client.off("onPeerDisconnect", handlePeerDisconnect);
      client.off("onPeerUpdate", handlePeerUpdate);
      client.off("onStatusChange", handleStatusChange);
      client.off("onTextMessage", handleTextMessage);
      client.off("onTimer", handleTimer);
      client.off("onConnectionState", handleConnectionState);
    };
  }, [client, handleTimer, handleConnectionState]);

  // announce peer connects
  useEffect(() => {
    if (!client || !onPeerConnected) return;
    client.on("onPeerConnect", onPeerConnected);
    return () => client.off("onPeerConnect", onPeerConnected);
  }, [client, onPeerConnected]);

  // announce peer disconnects
  useEffect(() => {
    if (!client || !onPeerDisconnected) return;
    client.on("onPeerDisconnect", onPeerDisconnected);
    return () => client.off("onPeerDisconnect", onPeerDisconnected);
  }, [client, onPeerDisconnected]);

  // announce text messages
  useEffect(() => {
    if (!client || !onNewMessage) return;
    const handler = (msg: { user: Participant; contents: string }) => {
      onNewMessage({ ...msg, timestamp: new Date() });
    };
    client.on("onTextMessage", handler);
    return () => client.off("onTextMessage", handler);
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

  const toggleAudio = useCallback(async () => {
    if (!client) throw new Error("Not connected");
    if (localAudio?.paused === undefined)
      throw new Error("Not producing audio");
    localAudio.paused ? await client.resumeAudio() : await client.pauseAudio();
    setLocalAudio((existing) =>
      existing ? { ...existing, paused: !localAudio.paused } : undefined
    );
  }, [client, localAudio?.paused, setLocalAudio]);

  const submitOperation = useCallback(
    async (operation: Operation) => {
      if (!client) throw new Error("Not connected");

      client.submitOperation(operation);
    },
    [client]
  );

  const toggleVideo = useCallback(async () => {
    if (!client) throw new Error("Not connected");
    if (localVideo?.paused === undefined)
      throw new Error("Not producing video");
    localVideo.paused ? await client.resumeVideo() : await client.pauseVideo();
    setLocalVideo((existing) =>
      existing ? { ...existing, paused: !localVideo.paused } : undefined
    );
  }, [client, localVideo?.paused, setLocalVideo]);

  const terminateCall = useCallback(async () => {
    if (!client) throw new Error("Not connected");
    await client.terminate();
  }, [client]);

  const produceTrack = useCallback(
    async (track: MediaStreamTrack) => {
      if (!client) throw new Error("Not connected");
      await client.produce(track);
      const stream = new MediaStream();
      stream.addTrack(track);
      if (track.kind === "audio") {
        setLocalAudio({
          stream,
          paused: false,
        });
      }
      if (track.kind === "video") {
        const trackSettings = track.getSettings();
        const videoWidth = trackSettings.width;
        const videoHeight = trackSettings.height;
        const aspectRatio =
          videoWidth && videoHeight ? videoHeight / videoWidth : undefined;
        setLocalVideo({
          stream,
          paused: false,
          aspectRatio,
        });
      }
    },
    [client]
  );

  return {
    status,
    error,
    peers,
    user: trackedUser,
    localAudio,
    localVideo,
    connectionState,
    toggleAudio,
    toggleVideo,
    submitOperation,
    produceTrack,
    messages,
    sendMessage,
    terminateCall,
    disconnect,
  };
};

export default useConnectCall;
