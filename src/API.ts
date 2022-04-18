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
  type: "inmate" | "doc" | "user";
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
  };
  textMessage: {
    from: Participant;
    contents: string;
  };
  timer: { name: "maxDuration"; msRemaining: number; msElapsed: number };
};

export type ClientMessages = {
  join: [
    { callId: string; token: string },
    {
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
