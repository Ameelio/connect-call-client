type MediaStreamTrack = {
  kind: "audio" | "video";
  addEventListener: (event: string, handler: any) => void;
};

export default class MediaStream {
  private tracks: MediaStreamTrack[] = [];

  addTrack(track: MediaStreamTrack) {
    this.tracks.push(track);
  }

  removeTrack(track: MediaStreamTrack) {
    const index = this.tracks.indexOf(track);
    if (index !== -1) this.tracks.splice(index, 1);
  }

  getTracks() {
    return this.tracks;
  }
}
