import {
  DtlsParameters,
  MediaKind,
  RtpCapabilities,
  RtpParameters,
  TransportOptions,
} from "mediasoup-client/lib/types";

export enum DisconnectReason {
  error = "error",
  connectedElsewhere = "connectedElsewhere",
}

export enum ConnectionStateQuality {
  excellent = "excellent",
  good = "good",
  average = "average",
  poor = "poor",
  bad = "bad",
  unknown = "unknown",
}

export type InputConnectionState = {
  quality: ConnectionStateQuality;
  ping: number;
};

export type OutputConnectionState = InputConnectionState & {
  badConnection: boolean;
};

export enum CallStatus {
  live = "live",
  missing_monitor = "missing_monitor",
  ended = "ended",
  terminated = "terminated",
  no_show = "no_show",
}

export enum ProducerLabel {
  video = "video",
  audio = "audio",
  screenshare = "screenshare",
}

export enum ParticipantEventDetail {
  UserDisconnected = "user_disconnected",
  ConnectionClosed = "connection_closed",
  ConnectionError = "connection_error",
}

export enum Role {
  visitParticipant = "visitParticipant",
  webinarAttendee = "webinarAttendee",
  webinarIsolatedAttendee = "webinarIsolatedAttendee",
  webinarHost = "webinarHost",
  monitor = "monitor",
}

export enum UserStatus {
  AudioMutedByServer = "AudioMutedByServer",
  VideoMutedByServer = "VideoMutedByServer",
  HandRaised = "HandRaised",
}

export type User = {
  id: string;
  role: Role;
};

export type PublishedConsumerInfo = {
  id: string;
  producerId: string;
  kind: MediaKind;
  rtpParameters: RtpParameters;
  producerPaused: boolean;
  paused: boolean;
};

export type PublishedParticipant = {
  user: User;
  consumers: Partial<Record<ProducerLabel, PublishedConsumerInfo>>;
  status: UserStatus[];
  connectionState: OutputConnectionState;
};

export type PublishedRoomState = {
  participants: Record<string, PublishedParticipant>;
  status: CallStatus;
  // TODO max duration
};

export type WebRtcInfo = Pick<
  TransportOptions,
  "id" | "iceParameters" | "iceCandidates" | "dtlsParameters"
>;

const producerUpdateReasons = ["paused_video_bad_connection"] as const;
export type PRODUCER_UPDATE_REASONS = typeof producerUpdateReasons[number];

export type ServerMessages = {
  textMessage: {
    from: User;
    contents: string;
  };
  timer: { name: "maxDuration"; msRemaining: number; msElapsed: number };
  state: PublishedRoomState;
  manualDisconnect: DisconnectReason;
  disconnect: string; // This is not actually a server message but is still a socket.on() handler
};

export type ClientMessages = {
  connectionState: [InputConnectionState, { success: true }];
  join: [
    { token: string },
    {
      role: Role;
      userId: string;
      status: UserStatus[];
      consumerTransportInfo: WebRtcInfo;
      producerTransportInfo?: WebRtcInfo;
      routerRtpCapabilities: RtpCapabilities;
    }
  ];
  textMessage: [{ contents: string }, { success: true }];
  terminate: [Record<string, never>, { success: true }];
  remoteAudioMute: [{ targetUserId: string }, { success: true }];
  remoteAudioUnmute: [{ targetUserId: string }, { success: true }];
  remoteVideoMute: [{ targetUserId: string }, { success: true }];
  remoteVideoUnmute: [{ targetUserId: string }, { success: true }];
  raiseHand: [Record<string, never>, { success: true }];
  lowerHand: [Record<string, never>, { success: true }];
  remoteLowerHand: [{ targetUserId: string }, { success: true }];
  setPreferredSimulcastLayer: [
    { consumerId: string; spatialLayer: number; temporalLayer?: number },
    { success: true }
  ];
  declareRtpCapabilities: [
    { rtpCapabilities: RtpCapabilities },
    { success: true }
  ];
  establishDtls: [
    {
      transportId: string;
      dtlsParameters: DtlsParameters;
    },
    { success: true }
  ];
  finishConnecting: [Record<string, never>, { success: true }];
  heartbeat: [Record<string, never>, Record<string, never>];
  produce: [
    {
      kind: MediaKind;
      rtpParameters: RtpParameters;
      label: ProducerLabel;
      paused?: boolean;
    },
    { producerId: string }
  ];
  producerClose: [
    {
      producerId: string;
    },
    { success: true }
  ];
  producerUpdate: [
    {
      paused: boolean;
      producerId: string;
      type: MediaKind;
      label: ProducerLabel;
      reason?: PRODUCER_UPDATE_REASONS;
    },
    { success: true }
  ];
};
