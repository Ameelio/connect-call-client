import { MediaKind } from "mediasoup-client/lib/types";
import { useCallback, useEffect, useState } from "react";
import {
  CallStatus,
  Participant,
  ProducerLabel,
  Role,
  UserStatus,
} from "./API";
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
  onMonitorJoined?: (user: string) => void;
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
  localAudio: AudioTrack | undefined;
  localVideo: VideoTrack | undefined;
  localScreenshare: VideoTrack | undefined;
  connectionState: ConnectionState;
  toggleAudio: () => void;
  toggleVideo: () => void;
  closeProducer: (label: ProducerLabel) => Promise<void>;
  produceTrack: (
    track: MediaStreamTrack,
    label: ProducerLabel
  ) => Promise<void>;
  peers: Peer[];
  monitors: string[];
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
  const [localAudio, setLocalAudio] = useState<AudioTrack>();
  const [localVideo, setLocalVideo] = useState<VideoTrack>();
  const [localScreenshare, setLocalScreenshare] = useState<VideoTrack>();
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    quality: "unknown",
    ping: NaN,
  });
  const [peers, setPeers] = useState<
    {
      user: Participant;
      streams: Record<ProducerLabel, MediaStream>;
      pausedStates: Partial<Record<ProducerLabel, boolean>>;
      connectionState: ConnectionState;
      status: UserStatus[];
    }[]
  >([]);
  const [monitors, setMonitors] = useState<string[]>([]);

  useEffect(() => {
    if (client) client.disableFrux = disableFrux;
  }, [disableFrux, client]);

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

  const handleProducerUpdate = ({
    paused,
    label,
  }: {
    paused: boolean;
    type: MediaKind;
    label: ProducerLabel;
  }) => {
    if (label === ProducerLabel.video) {
      setLocalVideo((existing) =>
        existing ? { ...existing, paused } : undefined
      );
    } else if (label === ProducerLabel.screenshare) {
      setLocalScreenshare((existing) =>
        existing ? { ...existing, paused } : undefined
      );
    } else if (label === ProducerLabel.audio) {
      setLocalAudio((existing) =>
        existing ? { ...existing, paused } : undefined
      );
    }
  };

  const handlePeerDisconnect = (user: Participant) =>
    setPeers((peers) => peers.filter((p) => p.user.id !== user.id));

  const handlePeerUpdate = ({
    user,
    streams,
    connectionState,
    pausedStates,
    status,
  }: Peer) => {
    setPeers((peers) => {
      return [
        ...peers.filter((p) => p.user.id !== user.id),
        {
          user,
          streams,
          connectionState,
          pausedStates,
          status,
        },
      ];
    });
  };

  const handleMonitorJoin = (id: string) => {
    setMonitors([...monitors.filter((x) => x !== id), id]);
  };

  const handleMonitorDisconnect = (id: string) => {
    setMonitors(monitors.filter((x) => x !== id));
  };

  const handleUserUpdate = (user: {
    id: string;
    role: Role;
    status: UserStatus[];
  }) => {
    // Unpack and repack properties so as to force reference change
    setTrackedUser({ ...user });
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
      if (disableFrux) return;

      setConnectionState(connectionState);
      if (localVideo && connectionState.videoDisabled && !localVideo.paused) {
        setLocalVideo({
          ...localVideo,
          paused: true,
        });
      }
      // TODO screenshare FRUX things
    },
    [setConnectionState, localVideo, disableFrux]
  );

  const [debounceReady, setDebounceReady] = useState(false);

  useEffect(() => {
    const debounceTimeout = setTimeout(() => {
      setDebounceReady(true);
    }, 10);
    return () => clearTimeout(debounceTimeout);
  }, []);

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
        setPeers(client.getPeers());
        setTrackedUser(client.user);
      })
      .catch(handleError);
  }, [call?.id, call?.url, call?.token, debounceReady]);

  const disconnect = useCallback(async () => {
    if (!client) return;
    setStatus("disconnected");
    client.close();
  }, [client]);

  const closeProducer = useCallback(
    async (label: ProducerLabel) => {
      if (!client) return;

      const producer = client.producers[label];

      if (!producer) return;

      if (label === ProducerLabel.video) {
        setLocalScreenshare(undefined);
      } else if (label === ProducerLabel.audio) {
        setLocalAudio(undefined);
      } else if (label === ProducerLabel.screenshare) {
        setLocalScreenshare(undefined);
      }

      await client.closeProducer(label);
    },
    [client]
  );

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
    client.on("onMonitorJoin", handleMonitorJoin);
    client.on("onMonitorDisconnect", handleMonitorDisconnect);
    client.on("onUserUpdate", handleUserUpdate);
    client.on("onStatusChange", handleStatusChange);
    client.on("onTextMessage", handleTextMessage);
    client.on("onTimer", handleTimer);
    client.on("onProducerUpdate", handleProducerUpdate);
    client.on("onConnectionState", handleConnectionState);
    return () => {
      client.off("onPeerDisconnect", handlePeerDisconnect);
      client.off("onPeerUpdate", handlePeerUpdate);
      client.off("onUserUpdate", handleUserUpdate);
      client.off("onStatusChange", handleStatusChange);
      client.off("onTextMessage", handleTextMessage);
      client.off("onTimer", handleTimer);
      client.off("onProducerUpdate", handleProducerUpdate);
      client.off("onConnectionState", handleConnectionState);
    };
  }, [client, handleTimer, handleConnectionState]);

  // announce monitor joins
  useEffect(() => {
    if (!client || !onMonitorJoined) return;
    client.on("onMonitorJoin", onMonitorJoined);
    return () => client.off("onMonitorJoin", onMonitorJoined);
  }, [client, onMonitorJoined]);

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

  const setPreferredSimulcastLayer = useCallback(
    async ({
      peerId,
      label,
      spatialLayer,
      temporalLayer,
    }: {
      peerId: string;
      label: ProducerLabel;
      spatialLayer: number;
      temporalLayer?: number;
    }) => {
      if (!client) throw new Error("Not connected");
      await client.setPreferredSimulcastLayer({
        peerId,
        label,
        spatialLayer,
        temporalLayer,
      });
    },
    [client]
  );

  const toggleAudio = useCallback(async () => {
    if (!client) throw new Error("Not connected");
    if (localAudio?.paused === undefined)
      throw new Error("Not producing audio");
    localAudio.paused ? await client.resumeAudio() : await client.pauseAudio();
  }, [client, localAudio?.paused]);

  const toggleVideo = useCallback(async () => {
    if (!client) throw new Error("Not connected");
    if (localVideo?.paused === undefined)
      throw new Error("Not producing video");
    localVideo.paused ? await client.resumeVideo() : await client.pauseVideo();
  }, [client, localVideo?.paused]);

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
      if (label === ProducerLabel.audio) {
        setLocalAudio({
          stream,
          paused: client.user.status.includes(UserStatus.AudioMutedByServer),
        });
      }
      if (label === ProducerLabel.video) {
        const trackSettings = track.getSettings();
        const videoWidth = trackSettings.width;
        const videoHeight = trackSettings.height;
        const aspectRatio =
          videoWidth && videoHeight ? videoHeight / videoWidth : undefined;
        setLocalVideo({
          stream,
          paused: client.user.status.includes(UserStatus.VideoMutedByServer),
          aspectRatio,
        });
      }
      if (label === ProducerLabel.screenshare) {
        const trackSettings = track.getSettings();
        const videoWidth = trackSettings.width;
        const videoHeight = trackSettings.height;
        const aspectRatio =
          videoWidth && videoHeight ? videoHeight / videoWidth : undefined;
        setLocalScreenshare({
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
    localScreenshare,
    closeProducer,
    connectionState,
    toggleAudio,
    toggleVideo,
    produceTrack,
    messages,
    sendMessage,
    disconnect,
    monitors,

    // Operations
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
