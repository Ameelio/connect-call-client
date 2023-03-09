import {
  ConsumerOptions,
  DtlsParameters,
  MediaKind,
  RtpCapabilities,
  RtpParameters,
  TransportOptions,
} from "mediasoup-client/lib/types";
import { ConnectionState } from "./RoomClient";

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

export type Operation =
  | {
      type: "terminate";
    }
  | {
      type: "textMessage";
      contents: string;
    }
  | {
      type: "remoteAudioMute";
      targetUserId: string;
    }
  | {
      type: "remoteAudioUnmute";
      targetUserId: string;
    }
  | {
      type: "remoteVideoMute";
      targetUserId: string;
    }
  | {
      type: "remoteVideoUnmute";
      targetUserId: string;
    }
  | {
      type: "raiseHand";
    }
  | {
      type: "lowerHand";
    }
  | {
      type: "remoteLowerHand";
      targetUserId: string;
    };

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
    user: Participant;
  };
  participantDisconnect: Participant;
  joined: Participant & { callId: string };
  producerUpdate: {
    producerId: string;
    from: Participant;
    paused: boolean;
    type: MediaKind;
    timestamp: string;
    reason?: PRODUCER_UPDATE_REASONS;
  };
  textMessage: {
    from: Participant;
    contents: string;
  };
  userStatus: {
    userId: string;

    // NOTE: we accept arbitrary strings instead of
    // statuses, for forward-compatibility.
    // `connect-call-handler` needs some amount of
    // forward-compatibility because it is used in connect-mobile.
    // We will ignore statuses that we don't know about.
    status: (UserStatus | string)[];
  }[];
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
  operation: [{ callId: string; operation: Operation }, { success: true }];
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
    { callId: string; kind: MediaKind; rtpParameters: RtpParameters },
    { producerId: string }
  ];
  producerUpdate: [
    {
      callId: string;
      paused: boolean;
      producerId: string;
      type: MediaKind;
      reason?: PRODUCER_UPDATE_REASONS;
    },
    { success: true }
  ];
  textMessage: [
    {
      callId: string;
      contents: string;
    },
    { success: true }
  ];
  terminate: [Record<string, never>, { success: true }];
  connectionState: [ConnectionState, { success: true }];
};
