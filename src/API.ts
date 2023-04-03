import {
  ConsumerOptions,
  DtlsParameters,
  MediaKind,
  RtpCapabilities,
  RtpParameters,
  TransportOptions,
} from "mediasoup-client/lib/types";
import { ConnectionState } from "./RoomClient";

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
  webinarHost = "webinarHost",
  monitor = "monitor",
}

export enum UserStatus {
  AudioMutedByServer = "AudioMutedByServer",
  VideoMutedByServer = "VideoMutedByServer",
  HandRaised = "HandRaised",
}

export interface Participant {
  role: Role;
  id: string;
  detail?: ParticipantEventDetail;
}

export type CallStatus =
  | "live"
  | "missing_monitor"
  | "ended"
  | "terminated"
  | "no_show";

export type WebRtcInfo = Pick<
  TransportOptions,
  "id" | "iceParameters" | "iceCandidates" | "dtlsParameters"
>;

const producerUpdateReasons = ["paused_video_bad_connection"] as const;
export type PRODUCER_UPDATE_REASONS = typeof producerUpdateReasons[number];

export type ServerMessages = {
  callStatus: CallStatus;
  consume: Required<Omit<ConsumerOptions, "appData">> & {
    label: ProducerLabel;
    user: Participant;
  };
  participantDisconnect: Participant;
  joined: Participant & { callId: string; status: UserStatus[] };
  producerUpdate: {
    producerId: string;
    from: Participant;
    paused: boolean;
    type: MediaKind;
    label: ProducerLabel;
    timestamp: string;
    reason?: PRODUCER_UPDATE_REASONS;
  };
  producerClose: {
    producerId: string;
    from: Participant;
    kind: MediaKind;
    label: ProducerLabel;
  };
  textMessage: {
    from: Participant;
    contents: string;
  };
  userStatus: {
    user: Participant;

    // NOTE: we accept arbitrary strings instead of
    // statuses, for forward-compatibility.
    // `connect-call-handler` needs some amount of
    // forward-compatibility because it is used in connect-mobile.
    // We will ignore statuses that we don't know about.
    status: (UserStatus | string)[];
  };
  timer: { name: "maxDuration"; msRemaining: number; msElapsed: number };
  peerConnectionState: { from: Participant } & ConnectionState;
};

export type ClientMessages = {
  join: [
    { callId: string; token: string },
    {
      role: Participant["role"];
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
  declareRtpCapabilities: [
    { rtpCapabilities: RtpCapabilities },
    { success: true }
  ];
  establishDtls: [
    {
      callId: string;
      transportId: string;
      dtlsParameters: DtlsParameters;
    },
    { success: true }
  ];
  finishConnecting: [{ callId: string }, { success: true }];
  heartbeat: [Record<string, never>, Record<string, never>];
  produce: [
    {
      callId: string;
      kind: MediaKind;
      rtpParameters: RtpParameters;
      label: ProducerLabel;
    },
    { producerId: string }
  ];
  producerClose: [
    {
      callId: string;
      producerId: string;
    },
    { success: true }
  ];
  producerUpdate: [
    {
      callId: string;
      paused: boolean;
      producerId: string;
      type: MediaKind;
      label: ProducerLabel;
      reason?: PRODUCER_UPDATE_REASONS;
    },
    { success: true }
  ];
  connectionState: [ConnectionState, { success: true }];
};
