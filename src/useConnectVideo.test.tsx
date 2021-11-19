import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import useConnectVideo from "./useConnectVideo";
import MediaDevices from "./__mocks__/MediaDevices";

jest.mock("./Client");
jest.mock("mediasoup-client");
Object.defineProperty(navigator, "mediaDevices", {
  writable: true,
  value: MediaDevices,
});

const ConnectVideo = () => {
  const { status, error, localAudio, localVideo } = useConnectVideo({
    call: { id: "2", url: "a", token: "T1" },
    authInfo: { id: "1", type: "inmate", token: "T2" },
  });

  return (
    <div>
      <div data-testid="status">{status}</div>
      <div data-testid="error">{error?.message}</div>
      <div data-testid="localAudio">
        {localAudio ? JSON.stringify(localAudio) : null}
      </div>
      <div data-testid="localVideo">
        {localVideo ? JSON.stringify(localVideo) : null}
      </div>
    </div>
  );
};

describe("useConnectVideo", () => {
  it("connects", async () => {
    render(<ConnectVideo />);

    expect(screen.getByTestId("status")).toHaveTextContent("initializing");
    expect(screen.getByTestId("error")).toHaveTextContent("");

    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("connected")
    );

    screen.debug();
  });
});
