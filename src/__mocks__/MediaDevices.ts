export default {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getUserMedia: (constraints: { audio: any } | { video: any }) => {
    if ("audio" in constraints) {
      return {
        id: "audio",
        getAudioTracks: () => [
          {
            kind: "audio",
            addEventListener: jest.fn(),
          },
        ],
      };
    }
    return {
      id: "video",
      getVideoTracks: () => [
        {
          kind: "video",
          getSettings: jest.fn().mockReturnValue({ width: 400, height: 300 }),
          addEventListener: jest.fn(),
        },
      ],
    };
  },
};
