## Connect Call Client

Connect Call is a service by [Ameelio](https://ameelio.org).

This client provides `RoomClient` bindings for WebRTC-capable environments, and additionally offers React bindings via the `useConnectCall` hook.

## Getting Started

```
npm install connect-call-client
```

```
import { useConnectCall } from 'connect-call-client';
```

## Integration Testing

Due to issues with `npm link` and nested node_modules/, it's recommendeded to build a release package and try it locally in a useful host application:

1. Add a `-rcN` suffix to the package.json version
2. Create a NPM package: `npm run build && npm pack`
3. From the host application: `npm install path/to/connect-call-client-a.b.c-rcN.tgz`

## Releasing

1. Review `CHANGELOG.md` and determine the next semantic version
2. Commit a change to `CHANGELOG.md` with the next version.
3. Run `npm version X.Y.Z` to update `package.json` and create a new tag.
4. Push the commit. Push tags.
5. Run `npm publish` to synchronize with NPM
6. Reflect on how NPM doesn't have any mechanism to verify your package contents
7. Marvel at how software works as often as it does

## Contributing

Bug reports and pull requests are welcome! This project is intended to be a safe, welcoming space for collaboration.
