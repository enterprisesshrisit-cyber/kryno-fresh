# Kryno Fresh Architecture

## Non-negotiable rules

1. Server is a blind courier.
2. Private keys never leave the device.
3. Realtime listeners live at app level, never inside page-only flows.
4. Encrypted messages are not sent optimistically.
5. Calls use explicit invite, accept, reject, connect states.
6. Kryno is mobile-first. Native Android and iOS are the product. Any web UI here is only a local development and QA harness, not the primary client.

## Rebuild boundaries

### Phase 1

- auth
- local device bootstrap
- key upload
- global realtime bootstrap

### Phase 2

- direct Signal sessions
- deterministic relay receive path
- local encrypted message vault

### Phase 3

- encrypted voice notes
- encrypted attachments
- media cache

### Phase 4

- group sender keys
- key rotation
- late join handling

### Phase 5

- direct audio calls
- presence and busy state
- reconnect and teardown handling

### Phase 6

- group audio calls
- mesh limits
- participant and speaking state
