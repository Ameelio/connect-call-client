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

export interface Participant {
  role: "participant" | "monitor";
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
  timer: { name: "maxDuration"; msRemaining: number; msElapsed: number };
  peerConnectionState: { from: Participant } & ConnectionState;
};

export type ClientMessages = {
  join: [
    { callId: string; token: string },
    {
      role: Participant["role"];
      consumerTransportInfo: WebRtcInfo;
      producerTransportInfo?: WebRtcInfo;
      routerRtpCapabilities: RtpCapabilities;
    }
  ];
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
