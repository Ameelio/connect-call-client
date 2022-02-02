export default {
  getUserMedia: (constraints: { audio: any } | { video: any }) => {
    if ("audio" in constraints) {
      return { id: "audio", getAudioTracks: () => [{ kind: "audio" }] };
    }
    return {
      id: "video",
      getVideoTracks: () => [
        {
          kind: "video",
          getSettings: jest.fn().mockReturnValue({ width: 400, height: 300 }),
        },
      ],
    };
  },
};
