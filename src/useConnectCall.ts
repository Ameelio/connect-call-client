import { MediaKind } from "mediasoup-client/lib/types";
import { useCallback, useEffect, useState } from "react";
import { CallStatus, ProducerLabel, Role, User, UserStatus } from "./API";
import RoomClient, { Peer } from "./RoomClient";

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
  user: Pick<User, "id">;
  onMonitorJoined?: (user: string) => void;
  onPeerConnected?: (user: User) => void;
  onPeerDisconnected?: (user: User) => void;
  onTimer?: (
    name: "maxDuration",
    msRemaining: number,
    msElapsed: number
  ) => void;
  onNewMessage?: (message: Message) => void;
};

export type Message = {
  user: Omit<User, "type">;
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
  toggleAudio: () => void;
  toggleVideo: () => void;
  closeProducer: (label: ProducerLabel) => Promise<void>;
  produceTrack: (
    track: MediaStreamTrack,
    label: ProducerLabel
  ) => Promise<void>;
  peers: Record<string, Peer>;
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
  const [peers, setPeers] = useState<Record<string, Peer>>({});
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

  const handleStatusChange = (status: CallStatus) => setStatus(status);

  const handleTextMessage = (message: { user: User; contents: string }) =>
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

  // announce text messages
  useEffect(() => {
    if (!client || !onNewMessage) return;
    const handler = (msg: { user: User; contents: string }) => {
      onNewMessage({ ...msg, timestamp: new Date() });
    };
    client.on("textMessage", handler);
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
      const peer = peers[peerId];
      if (!peer) throw new Error("no such peer");
      const consumerId = peer.consumers[label]?.id;
      if (!consumerId) throw new Error("no such consumer");
      await client.setPreferredSimulcastLayer({
        consumerId,
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
      console.log("awaiting produce");
      await client.produce(track, label);
      console.log("finishing produce");
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
