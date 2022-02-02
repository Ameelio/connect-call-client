import { useCallback, useEffect, useState } from "react";
import { CallStatus, Participant } from "./API";
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

export type ClientStatus = "initializing" | "errored" | "connected";

type Props = {
  call?: {
    id: string;
    url: string;
    token: string;
  };
  authInfo: Participant & { token: string };
  onPeerConnected?: (user: Participant) => void;
  onPeerDisconnected?: (user: Participant) => void;
  onTimer?: (name: "maxDuration", msRemaining: number) => void;
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
  localAudio: AudioTrack | undefined;
  localVideo: VideoTrack | undefined;
  toggleAudio: () => void;
  toggleVideo: () => void;
  produceTrack: (track: MediaStreamTrack) => Promise<void>;
  peers: Peer[];
  messages: Message[];
  sendMessage: (contents: string) => Promise<void>;
  terminateCall: () => Promise<void>;
};

/**
 * useConnectCall integrates with RoomClient and provides observable values.
 */
const useConnectCall = ({
  call,
  authInfo,
  onPeerConnected,
  onPeerDisconnected,
  onTimer,
  onNewMessage,
}: Props): ConnectCall => {
  const [client, setClient] = useState<RoomClient>();
  const [localAudio, setLocalAudio] = useState<AudioTrack>();
  const [localVideo, setLocalVideo] = useState<VideoTrack>();
  const [peers, setPeers] = useState<
    { user: Participant; stream: MediaStream }[]
  >([]);
  const [messages, setMessages] = useState<Message[]>([]);

  const [error, setError] = useState<Error>();
  const [status, setStatus] = useState<ConnectCall["status"]>("initializing");

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

  const handleTimer = ({
    name,
    msRemaining,
  }: {
    name: "maxDuration";
    msRemaining: number;
  }) => {
    onTimer && onTimer(name, msRemaining);
  };

  // create a client for the call
  useEffect(() => {
    if (call?.id === undefined) return;
    RoomClient.connect({ id: call.id, url: call.url, token: call.token })
      .then(setClient)
      .catch(handleError);
  }, [call?.id, call?.url, call?.token]);

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
    client.on("onTimer", handleTimer);
    return () => {
      client.off("onPeerDisconnect", handlePeerDisconnect);
      client.off("onPeerUpdate", handlePeerUpdate);
      client.off("onStatusChange", handleStatusChange);
      client.off("onTextMessage", handleTextMessage);
      client.off("onTimer", handleTimer);
    };
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
    if (!client) throw new Error("Not connected");
    if (localAudio === undefined) throw new Error("Not producing audio");
    localAudio.paused ? await client.resumeAudio() : await client.pauseAudio();
    setLocalAudio((existing) => ({ ...existing!, paused: !localAudio.paused }));
  }, [client, localAudio?.paused, setLocalAudio]);

  const toggleVideo = useCallback(async () => {
    if (!client) throw new Error("Not connected");
    if (localVideo === undefined) throw new Error("Not producing video");
    localVideo.paused ? await client.resumeVideo() : await client.pauseVideo();
    setLocalVideo((existing) => ({ ...existing!, paused: !localVideo.paused }));
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
    localAudio,
    localVideo,
    toggleAudio,
    toggleVideo,
    produceTrack,
    messages,
    sendMessage,
    terminateCall,
  };
};

export default useConnectCall;
