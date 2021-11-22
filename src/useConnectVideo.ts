import { useCallback, useEffect, useState } from "react";
import { CallStatus, Participant } from "./API";
import RoomClient, { Peer } from "./RoomClient";

type AudioStream = {
  stream: MediaStream;
  paused: boolean;
};

type VideoStream = {
  stream: MediaStream;
  paused: boolean;
  aspectRatio?: number;
};

type ClientStatus = "initializing" | "errored" | "connected";

type Props = {
  call?: { id: string; url: string; token: string };
  authInfo: Participant & { token: string };
};

type Message = { user: Participant; contents: string };

type ConnectVideo = {
  status: ClientStatus | CallStatus;
  error?: Error;
  localAudio: AudioStream | undefined;
  localVideo: VideoStream | undefined;
  toggleAudio: () => void;
  toggleVideo: () => void;
  peers: Record<string, Peer>;
  messages: Message[];
  sendMessage: (contents: string) => Promise<void>;
};

/**
 * useConnectVideo integrates with the video room service and provides observable values.
 */
const useConnectVideo = ({ call, authInfo }: Props): ConnectVideo => {
  const [client, setClient] = useState<RoomClient>();
  const [localAudio, setLocalAudio] = useState<AudioStream>();
  const [localVideo, setLocalVideo] = useState<VideoStream>();
  const [peers, setPeers] = useState<
    Record<string, { user: Participant; stream: MediaStream }>
  >({});
  const [messages, setMessages] = useState<Message[]>([]);

  const [error, setError] = useState<Error>();
  const [status, setStatus] = useState<ConnectVideo["status"]>("initializing");

  const handleError = (e: Error) => {
    setStatus("errored");
    setError(e);
  };

  // 1. create a RoomClient
  useEffect(() => {
    if (!call || client) return;

    RoomClient.connect(call).then(setClient).catch(handleError);
  }, [call, client, authInfo]);

  // 2. use RoomClient to begin producing and to export observable state
  useEffect(() => {
    // run once after acquiring a room client
    if (!client || status !== "initializing") return;
    setStatus("connected");

    client.on("onPeerConnect", (peer) => {
      // TODO: announce
    });
    client.on("onPeerDisconnect", (peer) => {
      // TODO: announce
      setPeers((existing) => {
        const newPeers = { ...existing };
        delete newPeers[peer.id];
        return newPeers;
      });
    });
    client.on("onPeerUpdate", ({ user, stream }) => {
      setPeers((existing) => ({
        ...existing,
        [user.id]: { user, stream },
      }));
    });

    client.on("onStatusChange", (status) => {
      setStatus(status);
    });

    if (client.role === "participant") {
      client.produce("video").then((stream) => {
        if (!stream)
          return handleError(new Error("Could not produce video stream"));
        const trackSettings = stream.getVideoTracks()[0].getSettings();
        const videoWidth = trackSettings.width;
        const videoHeight = trackSettings.height;
        const aspectRatio =
          videoWidth && videoHeight ? videoHeight / videoWidth : undefined;
        setLocalVideo({
          stream,
          paused: false,
          aspectRatio,
        });
      });

      client.produce("audio").then((stream) => {
        if (!stream)
          return handleError(new Error("Could not produce audio stream"));
        setLocalAudio({
          stream,
          paused: false,
        });
      });
    }

    client.on("onTextMessage", (message) => {
      setMessages((existing) => [...existing, message]);
    });
  }, [client, status]);

  // eventual cleanup
  useEffect(() => {
    return () => {
      client?.close();
    };
  }, [client]);

  const sendMessage = useCallback(
    async (contents: string) => {
      if (!client) throw new Error("Not connected");
      await client.sendMessage(contents);
      console.log(authInfo);
      setMessages((existing) => [
        ...existing,
        { contents, user: { id: authInfo.id, type: authInfo.type } },
      ]);
    },
    [client, setMessages, authInfo]
  );

  const audioPaused = localAudio?.paused;
  const toggleAudio = useCallback(async () => {
    if (!client || audioPaused === undefined) throw new Error("Not connected");
    audioPaused ? await client.resumeAudio() : await client.pauseAudio();
    setLocalAudio((existing) => ({ ...existing!, paused: !audioPaused }));
  }, [client, audioPaused, setLocalAudio]);

  const videoPaused = localVideo?.paused;
  const toggleVideo = useCallback(async () => {
    if (!client || videoPaused === undefined) throw new Error("Not connected");
    videoPaused ? await client.resumeVideo() : await client.pauseVideo();
    setLocalVideo((existing) => ({ ...existing!, paused: !videoPaused }));
  }, [client, videoPaused, setLocalVideo]);

  return {
    status,
    error,
    peers,
    localAudio,
    localVideo,
    toggleAudio,
    toggleVideo,
    messages,
    sendMessage,
  };
};

export default useConnectVideo;
