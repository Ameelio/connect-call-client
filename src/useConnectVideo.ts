import { useCallback, useEffect, useMemo, useState } from "react";
import { CallStatus, Participant } from "./API";
import RoomClient, { Peer } from "./RoomClient";

export type AudioStream = {
  stream: MediaStream;
  paused: boolean;
};

export type VideoStream = {
  stream: MediaStream;
  paused: boolean;
  aspectRatio?: number;
};

export type ClientStatus = "initializing" | "errored" | "connected";

type Props = {
  call?: { id: string; url: string; token: string };
  authInfo: Participant & { token: string };
  onPeerConnected?: (user: Participant) => void;
  onPeerDisconnected?: (user: Participant) => void;
  onNewMessage?: (message: Message) => void;
};

export type Message = {
  user: Participant;
  contents: string;
  timestamp: Date;
};

export type ConnectVideo = {
  status: ClientStatus | CallStatus;
  error?: Error;
  localAudio: AudioStream | undefined;
  localVideo: VideoStream | undefined;
  toggleAudio: () => void;
  toggleVideo: () => void;
  peers: Peer[];
  messages: Message[];
  sendMessage: (contents: string) => Promise<void>;
};

/**
 * useConnectVideo integrates with the video room service and provides observable values.
 */
const useConnectVideo = ({
  call,
  authInfo,
  onPeerConnected,
  onPeerDisconnected,
  onNewMessage,
}: Props): ConnectVideo => {
  const [client, setClient] = useState<RoomClient>();
  const [localAudio, setLocalAudio] = useState<AudioStream>();
  const [localVideo, setLocalVideo] = useState<VideoStream>();
  const [peers, setPeers] = useState<
    { user: Participant; stream: MediaStream }[]
  >([]);
  const [messages, setMessages] = useState<Message[]>([]);

  const [error, setError] = useState<Error>();
  const [status, setStatus] = useState<ConnectVideo["status"]>("initializing");

  const handleError = (e: Error) => {
    setStatus("errored");
    setError(e);
  };

  const handlePeerDisconnect = (user: Participant) =>
    setPeers((peers) => peers.filter((p) => p.user.id !== user.id));

  const handlePeerUpdate = ({ user, stream }: Peer) => {
    setPeers((peers) => {
      return [...peers.filter((p) => p.user.id !== user.id), { user, stream }];
    });
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

  // create a client for the call
  useEffect(() => {
    if (!call) return;
    RoomClient.connect(call).then(setClient).catch(handleError);
  }, [call, authInfo]);

  useEffect(() => {
    if (!client) return;
    setStatus("connected");
    return () => {
      client.close();
    };
  }, [client]);

  // hook into the client
  useEffect(() => {
    if (!client) return;
    client.on("onPeerDisconnect", handlePeerDisconnect);
    client.on("onPeerUpdate", handlePeerUpdate);
    client.on("onStatusChange", handleStatusChange);
    client.on("onTextMessage", handleTextMessage);
    return () => {
      client.off("onPeerDisconnect", handlePeerDisconnect);
      client.off("onPeerUpdate", handlePeerUpdate);
      client.off("onStatusChange", handleStatusChange);
      client.off("onTextMessage", handleTextMessage);
    };
  }, [client]);

  // produce media
  useEffect(() => {
    if (!client || client.role === "observer") return;

    client
      .produce("video")
      .then((stream) => {
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
      })
      .catch(handleError);

    client
      .produce("audio")
      .then((stream) => {
        setLocalAudio({
          stream,
          paused: false,
        });
      })
      .catch(handleError);
  }, [client]);

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
          user: { id: authInfo.id, type: authInfo.type },
          timestamp: new Date(),
        },
      ]);
    },
    [client, setMessages, authInfo]
  );

  const toggleAudio = useCallback(async () => {
    if (!client || localAudio?.paused === undefined)
      throw new Error("Not connected");
    localAudio.paused ? await client.resumeAudio() : await client.pauseAudio();
    setLocalAudio((existing) => ({ ...existing!, paused: !localAudio.paused }));
  }, [client, localAudio?.paused, setLocalAudio]);

  const toggleVideo = useCallback(async () => {
    if (!client || localVideo?.paused === undefined)
      throw new Error("Not connected");
    localVideo.paused ? await client.resumeVideo() : await client.pauseVideo();
    setLocalVideo((existing) => ({ ...existing!, paused: !localVideo.paused }));
  }, [client, localVideo?.paused, setLocalVideo]);

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
