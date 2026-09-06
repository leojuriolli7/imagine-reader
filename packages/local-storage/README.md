# Local S3 service

This workspace owns a standalone SeaweedFS S3 service. It exports no JavaScript and has no dependency on the API. The application communicates with it over HTTP using its regular S3 client.

```sh
pnpm --filter @imagine/local-storage start    # background, waits for health
pnpm --filter @imagine/local-storage dev      # foreground logs
pnpm --filter @imagine/local-storage status
pnpm --filter @imagine/local-storage stop
```

Endpoint: `http://localhost:58333`. Buckets: `imagine-reader` and `imagine-reader-test`. Local access key: `imagine-local`; local secret: `imagine-local-secret`; region: `us-east-1`. Use path-style requests.

A named Docker volume preserves objects across stops and container recreation. `stop` never removes the volume. Only the S3 port is exposed, bound to loopback. These development credentials belong only to this local service.

SeaweedFS is pinned to `4.45`. Its [official quick start](https://github.com/seaweedfs/seaweedfs#quick-start) describes the all-in-one `mini` service, credentials and initial bucket creation. Upgrade the image intentionally and rerun the storage integration tests.
