# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

## [2.3.2]

## PATCH

- restore the automatic disconnect on unmount

## [2.3.1]

## PATCH

- Monitors should not emit connection status

## [2.3.0]

## MINOR

- Expose `pauseConsumer`, `resumeConsumer`, and `peer.manualConsumerPauses` to allow pausing consumer downloads (for bandwidth purposes)

## [2.2.0]

## MINOR

- Automatically recover socket disconnects due to network issues, by renegotiating mediasoup connection
- Allow manual recovery of disconnections due to other clients joining with `manuallyReconnect`
- Expose disconnect reason with `disconnectReason`

## [2.1.0]

## MINOR

- Disable simulcast for screenshares to get around possible libwebrtc bug

## [2.0.0]

- Consolidates producers and consumers into streams indexed by `ProducerLabels`.
  - `localVideo` and `localAudio` replaced with `localProducers[label]`
  - `toggleVideo` and `toggleAudio` replaced with `pauseProducer(label)` and `resumeProducer(label)`
  - `peer.stream`, `peer.audioStream`, and `peer.screenshareStream` replaced by `peer.consumers[label].stream`
  - `peer.pausedStates[label]` replaced by `peer.consumers[label].paused`
- Uses the new `state` event from CVH. Related API updates:
  - `peers` is now an object with socket ids as keys, to give a way to differentiate between multiple clients from the same user.
  - The returned `user` object is now a `Peer` object just like every other `Peer`.
- Frux-related updates:
  - `setDisableFrux` removed and replaced by `enableFrux` with opposite function
  - Debugging functions `simulatePingLatency` and `stopSimulatingPingLatency` exposed
  - `videoDisabled` property renamed to `badConnection`

## [1.4.0] - 2023-04-26

- Announce monitor join events

## [1.3.0] - 2023-04-21

- Joining monitors are now put into a different array from `peers`.

## [1.2.0] - 2023-04-19

- Automatically send `producerClose` when a track ends.

## [1.1.0] - 2023-04-19

- New exposed function `setPreferredSimulcastLayer` to signal the CVH server to upgrade/downgrade simulcast
- New exposed function `setDisableFrux` to enable or disable FRUX handling

## [1.0.1] - 2023-04-12

- initialize participants according to server mutes

## [1.0.0] - 2023-04-05

- fix race condition affecting registering of peers when joining a call
- support for CVH v7 API including remote muting and screen sharing

## [0.9.4] - 2023-03-14

- fix simulcast configuration in new versions of Chrome

## [0.9.3] - 2022-11-02

- avoid race condition in development with React Strict mode

## [0.9.2] - 2022-08-04

- build CommonJS for Jest compatibility
- remove source maps from build

## [0.9.1] - 2022-06-03

- compatibility with any React version 17.0.1 or greater

## [0.9.0] - 2022-05-20

### Removed

- `authInfo` prop for useConnectCall

### Added

- `user.id` prop for useConnectCall
- rely on CVH for role (was: userType) information
- client-side heartbeat for monitor role

## [0.8.1] - 2022-05-09

- connection quality monitor is less aggressive, needs at least 5 results to emit events

## [0.8.0] - 2022-05-02

### Added

- Turns off video when connection quality is bad, includes event detail with connection state updates
- producerUpdate event optionally includes a reason, e.g. `paused_video_bad_connection`
- Broadcasting connection state changes to allow all participants to know about connectivity problems

## [0.7.1] - 2022-04-13

### Fixed

- Downgraded react/react-dom to 17.0.1 for compatibility

## [0.7.0] - 2022-04-12

### Added

- useConnectCall returns a disconnect() function that may be called to end the connection without unmounting

## [0.6.0] - 2022-04-04

### Added

- set simulcast spatial layer 0 to 50kbps/10fps
- add `ConnectionMonitor` which periodically reports changes in connection state

## [0.5.0] - 2022-03-10

### Added

- added `detail` field to `Participant`, passed in event payloads, `user_disconnected`, `connection_closed`, `connection_error`, or undefined
- added `msElapsed` field to the `onTimer` handler

## [0.4.0] - 2022-02-11

### Added

- useConnectCall accepts an `onTimer` handler for `timer` events containing `maxDuration` data

## [0.3.0] - 2022-02-03

### Added

- useConnectCall returns a `produceTrack` function that may be called when status has reached `connected`.

### Removed

- Producing audio and video tracks automatically during connection

## [0.2.1] - 2022-02-02

### Added

- Support for sending a terminate event

### Removed

- Stop sending deprecated `authenticate` event

## [0.2.0] - 2022-01-12

### Added

- Voice calls do not attempt to produce video

## [0.1.4] - 2022-01-06

### Fixed

- Specified transports for socket.io-client. May fix CORS issue.

## [0.1.3] - 2022-01-06

### Fixed

- Downgraded socket.io-client for backwards compatibility. May fix CORS issue.

## [0.1.2] - 2021-12-16

### Fixed

- Peers may disconnect before producing any media

## [0.1.1] - 2021-11-29

### Fixed

- Publish the latest commits

## [0.1.0] - 2021-11-29

### Added

- React bindings for RoomClient via useConnectCall
- Consuming and producing media through RoomClient
- Type-safe socket client for Connect Call service
