# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
