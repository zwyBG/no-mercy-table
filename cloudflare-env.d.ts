declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    ROOMS?: DurableObjectNamespace;
    BUCKET?: R2Bucket;
    DEVELOPER_PASSWORD_HASH?: string;
  }
}
