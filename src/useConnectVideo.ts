import { useEffect, useState } from "react";
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

type ConnectVideo = {
  status: ClientStatus | CallStatus;
  error?: Error;
  localAudio: AudioStream | undefined;
  localVideo: VideoStream | undefined;
  toggleAudio: () => void;
  toggleVideo: () => void;
  peers: Record<string, Peer>;
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

  const [error, setError] = useState<Error>();
  const [status, setStatus] = useState<ConnectVideo["status"]>("initializing");

  const handleError = (e: Error) => {
    setStatus("errored");
    setError(e);
  };

  // 1. create a RoomClient
  useEffect(() => {
    if (!call || client) return;

    RoomClient.connect({
      ...call,
      user: authInfo,
    })
      .then(setClient)
      .catch(handleError);
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
  }, [client, status]);

  // eventual cleanup
  useEffect(() => {
    return () => {
      client?.close();
    };
  }, [client]);

  return {
    status,
    error,
    peers,
    localAudio,
    localVideo,
    toggleAudio: async () => {
      if (!client || !localAudio) return;
      localAudio.paused
        ? await client.resumeAudio()
        : await client.pauseAudio();
      setLocalAudio({
        ...localAudio,
        paused: !localAudio.paused,
      });
    },
    toggleVideo: () => {
      if (!client || !localVideo) return;
      localVideo.paused ? client.resumeVideo() : client.pauseVideo();
      setLocalVideo({
        ...localVideo,
        paused: !localVideo.paused,
      });
    },
  };
};

export default useConnectVideo;
