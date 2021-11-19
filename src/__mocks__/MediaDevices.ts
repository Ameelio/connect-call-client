export default {
  getUserMedia: (constraints: { audio: any } | { video: any }) => {
    if ("audio" in constraints) {
      return { id: "audio", getAudioTracks: () => [] };
    }
    return {
      id: "video",
      getVideoTracks: () => [
        {
          getSettings: jest.fn().mockReturnValue({ width: 400, height: 300 }),
        },
      ],
    };
  },
};
