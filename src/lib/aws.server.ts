// Server-only AWS helpers. Flux never stores AWS credentials from users.
// Flux's own platform AWS identity (allowed ONLY sts:AssumeRole) assumes each customer's
// role with that connection's unique External ID, scoped down by an inline session policy
// per operation. Temporary credentials live only for the duration of one request.
import { AwsClient } from "aws4fetch";

export type TempCreds = { accessKeyId: string; secretAccessKey: string; sessionToken: string };

export class SetupRequiredError extends Error {
  code = "SETUP_REQUIRED" as const;
}

function platformClient(region: string) {
  const accessKeyId = process.env["PLATFORM_AWS_ACCESS_KEY_ID"];
  const secretAccessKey = process.env["PLATFORM_AWS_SECRET_ACCESS_KEY"];
  if (!accessKeyId || !secretAccessKey) {
    throw new SetupRequiredError(
      "AWS integration is not configured on this site yet.",
    );
  }
  return new AwsClient({ accessKeyId, secretAccessKey, service: "sts", region });
}

export function isPlatformConfigured() {
  return Boolean(process.env["PLATFORM_AWS_ACCESS_KEY_ID"] && process.env["PLATFORM_AWS_SECRET_ACCESS_KEY"]);
}

export function xmlTag(xml: string, tag: string): string | undefined {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m?.[1] !== undefined ? decodeXml(m[1]) : undefined;
}
export function xmlAll(xml: string, tag: string): string[] {
  return [...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g"))].map((m) => m[1] ?? "");
}
function decodeXml(s: string) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export class AwsApiError extends Error {
  constructor(message: string, public awsCode: string, public status: number) {
    super(message);
  }
}

async function awsError(res: Response, what: string) {
  const body = await res.text();
  const code = xmlTag(body, "Code") ?? `HTTP ${res.status}`;
  const msg = (xmlTag(body, "Message") ?? body.slice(0, 300)).slice(0, 300);
  return new AwsApiError(`${what} failed: ${code} — ${msg}`, code, res.status);
}

const INVALID_CRED_CODES = ["InvalidClientTokenId", "SignatureDoesNotMatch", "UnrecognizedClientException", "ExpiredToken", "InvalidAccessKeyId"];

/** Distinguishes platform-credential problems from customer-role problems. Messages never include secrets. */
export function classifyAwsError(e: unknown):
  | { kind: "platform_missing" | "platform_invalid" | "role_assume_failed" | "permission_denied" | "other"; message: string } {
  if (e instanceof SetupRequiredError) return { kind: "platform_missing", message: e.message };
  if (e instanceof AwsApiError) {
    if (INVALID_CRED_CODES.includes(e.awsCode))
      return { kind: "platform_invalid", message: `The site's platform AWS keys were rejected by AWS (${e.awsCode}). The site owner must replace them.` };
    if (e.message.startsWith("AssumeRole") && (e.awsCode === "AccessDenied" || e.status === 403))
      return {
        kind: "role_assume_failed",
        message: "AWS refused to let Flux Links use your role. Check that the stack was created from the template downloaded for THIS connection (External ID must match), that the Role ARN is correct, and that the stack finished successfully.",
      };
    if (e.awsCode === "AccessDenied" || e.status === 403)
      return { kind: "permission_denied", message: `${e.message.split(":")[0]} was denied. Your role (or its BucketPattern) doesn't allow this bucket or action.` };
  }
  return { kind: "other", message: e instanceof Error ? e.message : String(e) };
}

export async function getPlatformIdentity(): Promise<{ arn: string; account: string }> {
  const client = platformClient("us-east-1");
  const res = await client.fetch("https://sts.amazonaws.com/", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "Action=GetCallerIdentity&Version=2011-06-15",
  });
  if (!res.ok) throw await awsError(res, "Platform identity check");
  const xml = await res.text();
  return { arn: xmlTag(xml, "Arn") ?? "", account: xmlTag(xml, "Account") ?? "" };
}

export type ConnectionRow = { id: string; user_id: string; role_arn: string; external_id: string; region: string };

/** Assume the user's role with External ID + a scoped-down session policy. 15-minute creds. */
export async function assumeRole(
  conn: ConnectionRow,
  statements: { actions: string[]; resources: string[] }[],
): Promise<{ creds: TempCreds; assumedArn: string }> {
  const client = platformClient(conn.region);
  const policy = JSON.stringify({
    Version: "2012-10-17",
    Statement: statements.map((s) => ({ Effect: "Allow", Action: s.actions, Resource: s.resources })),
  });
  const params = new URLSearchParams({
    Action: "AssumeRole",
    Version: "2011-06-15",
    RoleArn: conn.role_arn,
    RoleSessionName: `flux-${conn.user_id.slice(0, 8)}-${conn.id.slice(0, 8)}`,
    ExternalId: conn.external_id,
    DurationSeconds: "900",
    Policy: policy,
  });
  const res = await client.fetch(`https://sts.${conn.region}.amazonaws.com/`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) throw await awsError(res, "AssumeRole");
  const xml = await res.text();
  const creds = {
    accessKeyId: xmlTag(xml, "AccessKeyId")!,
    secretAccessKey: xmlTag(xml, "SecretAccessKey")!,
    sessionToken: xmlTag(xml, "SessionToken")!,
  };
  return { creds, assumedArn: xmlTag(xml, "Arn") ?? "" };
}

export function s3(creds: TempCreds, region: string) {
  return new AwsClient({ ...creds, service: "s3", region });
}

const encKey = (key: string) => key.split("/").map(encodeURIComponent).join("/");
// Dotted bucket names break virtual-host TLS certificates, so use path-style for them.
export const bucketHost = (bucket: string, region: string) =>
  bucket.includes(".") ? `https://s3.${region}.amazonaws.com/${bucket}` : `https://${bucket}.s3.${region}.amazonaws.com`;

/** Object keys must not contain IAM wildcard characters (they'd widen session policies) or path tricks. */
export function assertSafeKey(key: string) {
  if (!key || key.length > 900 || /[*?\u0000-\u001f\u007f\\]/.test(key) || key.split("/").some((p) => p === ".." || p === "."))
    throw new Error("Invalid file name or path.");
}
export const MAX_UPLOAD_BYTES = 5 * 1024 ** 3; // S3 single PUT limit
export const SIGN_MIN = 60;
export const SIGN_MAX = 7 * 24 * 3600; // SigV4 maximum; also capped by the 15-min role session in practice


export async function listBuckets(creds: TempCreds) {
  const res = await s3(creds, "us-east-1").fetch("https://s3.us-east-1.amazonaws.com/?max-buckets=1000");
  if (!res.ok) throw await awsError(res, "ListBuckets");
  const xml = await res.text();
  return xmlAll(xml, "Bucket").map((b) => ({
    name: xmlTag(b, "Name")!,
    region: xmlTag(b, "BucketRegion") ?? "us-east-1",
    created: xmlTag(b, "CreationDate") ?? null,
  }));
}

export async function listObjects(creds: TempCreds, bucket: string, region: string, prefix: string) {
  const q = new URLSearchParams({ "list-type": "2", "max-keys": "200", prefix });
  const res = await s3(creds, region).fetch(`${bucketHost(bucket, region)}/?${q}`);
  if (!res.ok) throw await awsError(res, "ListObjects");
  const xml = await res.text();
  return xmlAll(xml, "Contents").map((c) => ({
    key: xmlTag(c, "Key")!,
    size: Number(xmlTag(c, "Size") ?? 0),
    lastModified: xmlTag(c, "LastModified") ?? null,
  }));
}

async function sha256b64(body: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  return btoa(String.fromCharCode(...new Uint8Array(d)));
}

async function putSubresource(creds: TempCreds, bucket: string, region: string, sub: string, xml: string, what: string) {
  const res = await s3(creds, region).fetch(`${bucketHost(bucket, region)}/?${sub}`, {
    method: "PUT",
    headers: {
      "content-type": "application/xml",
      "x-amz-checksum-sha256": await sha256b64(xml),
      "x-amz-sdk-checksum-algorithm": "SHA256",
    },
    body: xml,
  });
  if (!res.ok) throw await awsError(res, what);
}

export async function createPrivateBucket(creds: TempCreds, bucket: string, region: string) {
  const body =
    region === "us-east-1"
      ? undefined
      : `<CreateBucketConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><LocationConstraint>${region}</LocationConstraint></CreateBucketConfiguration>`;
  const init: RequestInit = { method: "PUT", headers: { "x-amz-object-ownership": "BucketOwnerEnforced" } };
  if (body) init.body = body;
  const res = await s3(creds, region).fetch(`${bucketHost(bucket, region)}/`, init);
  if (!res.ok) throw await awsError(res, "CreateBucket");
  await putSubresource(
    creds,
    bucket,
    region,
    "publicAccessBlock",
    `<PublicAccessBlockConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><BlockPublicAcls>true</BlockPublicAcls><IgnorePublicAcls>true</IgnorePublicAcls><BlockPublicPolicy>true</BlockPublicPolicy><RestrictPublicBuckets>true</RestrictPublicBuckets></PublicAccessBlockConfiguration>`,
    "Block public access",
  );
  await putSubresource(
    creds,
    bucket,
    region,
    "encryption",
    `<ServerSideEncryptionConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Rule><ApplyServerSideEncryptionByDefault><SSEAlgorithm>AES256</SSEAlgorithm></ApplyServerSideEncryptionByDefault></Rule></ServerSideEncryptionConfiguration>`,
    "Default encryption",
  );
}

export async function putUploadCors(creds: TempCreds, bucket: string, region: string, origins: string[]) {
  const o = origins.map((x) => `<AllowedOrigin>${x}</AllowedOrigin>`).join("");
  await putSubresource(
    creds,
    bucket,
    region,
    "cors",
    `<CORSConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><CORSRule>${o}<AllowedMethod>PUT</AllowedMethod><AllowedHeader>*</AllowedHeader><ExposeHeader>ETag</ExposeHeader><MaxAgeSeconds>3000</MaxAgeSeconds></CORSRule></CORSConfiguration>`,
    "Set browser-upload CORS",
  );
}

export async function presign(
  creds: TempCreds,
  bucket: string,
  region: string,
  key: string,
  method: "GET" | "PUT",
  seconds: number,
  put?: { contentType: string; size: number },
) {
  assertSafeKey(key);
  const secs = Math.min(SIGN_MAX, Math.max(SIGN_MIN, Math.floor(seconds) || 300));
  const url = `${bucketHost(bucket, region)}/${encKey(key)}?X-Amz-Expires=${secs}`;
  if (put) {
    // Sign Content-Type and Content-Length so the browser can only upload exactly the declared file.
    const signed = await s3(creds, region).sign(url, {
      method,
      headers: { "content-type": put.contentType, "content-length": String(put.size) },
      aws: { signQuery: true, allHeaders: true },
    });
    return signed.url;
  }
  const signed = await s3(creds, region).sign(url, { method, aws: { signQuery: true } });
  return signed.url;
}

export const RECOMMENDED_PERMISSIONS = (bucketPattern = "*") => ({
  Version: "2012-10-17",
  Statement: [
    { Sid: "Discover", Effect: "Allow", Action: ["s3:ListAllMyBuckets", "s3:GetBucketLocation"], Resource: "*" },
    {
      Sid: "ManageFluxBuckets",
      Effect: "Allow",
      Action: [
        "s3:ListBucket",
        "s3:GetObject",
        "s3:PutObject",
        "s3:CreateBucket",
        "s3:PutBucketPublicAccessBlock",
        "s3:PutEncryptionConfiguration",
        "s3:PutBucketCORS",
        "s3:PutBucketOwnershipControls",
      ],
      Resource: [`arn:aws:s3:::${bucketPattern}`, `arn:aws:s3:::${bucketPattern}/*`],
    },
  ],
});

/** The ONLY permissions Flux's platform IAM user needs: assume customer roles that are named by the template. */
export const PLATFORM_USER_POLICY = {
  Version: "2012-10-17",
  Statement: [
    { Sid: "AssumeCustomerFluxRoles", Effect: "Allow", Action: "sts:AssumeRole", Resource: "arn:aws:iam::*:role/FluxLinksAccess-*" },
  ],
};
