// Shared AWS IAM ARN validation, used by the browser (Connections page), the
// CloudFormation template builder, and the server functions.
//
// Deliberately built from plain string checks instead of one big regex:
// PostgreSQL caps a regex repetition count at 255, and the database trigger that
// guards this column used `{1,512}`, which made every Role ARN save fail with
// "invalid regular expression: invalid repetition count(s)".

export const ARN_MAX = 512;
export const IAM_ROLE_NAME_MAX = 64;

const ALLOWED_EXTRA = "+=,.@_/-";

function isLetter(ch: string) {
  return (ch >= "A" && ch <= "Z") || (ch >= "a" && ch <= "z");
}
function isDigit(ch: string) {
  return ch >= "0" && ch <= "9";
}
/** IAM allows these characters in role/user names; nothing else. */
function isNameChar(ch: string) {
  return isLetter(ch) || isDigit(ch) || ALLOWED_EXTRA.includes(ch);
}

export type ArnResult = { ok: true; arn: string } | { ok: false; reason: string };

const reject = (reason: string): ArnResult => ({ ok: false, reason });

type ArnParts = {
  partition: string;
  service: string;
  region: string;
  account: string;
  resource: string;
};

/**
 * Splits `arn:partition:service:region:account:resource` and checks the shared
 * shape: 6 colon-separated parts, no whitespace, no control characters, sane length.
 * An empty region is kept as-is because IAM ARNs legitimately have none.
 */
function splitArn(input: string, what: string): ArnResult | ArnParts {
  const arn = input.trim();
  if (!arn) return reject(`Paste the ${what} from your AWS console.`);
  if (arn.length > ARN_MAX) return reject(`A ${what} is at most ${ARN_MAX} characters.`);
  if (/\s/.test(arn)) return reject(`A ${what} can't contain spaces — paste just the ARN.`);
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f]/.test(arn)) return reject(`That ${what} contains invalid characters.`);
  const parts = arn.split(":");
  if (parts.length !== 6 || parts[0] !== "arn")
    return reject(
      `A ${what} has 6 colon-separated parts, like arn:aws:iam::123456789012:role/Name`,
    );
  return {
    partition: parts[1] ?? "",
    service: parts[2] ?? "",
    region: parts[3] ?? "",
    account: parts[4] ?? "",
    resource: parts[5] ?? "",
  };
}

function checkAccount(account: string): ArnResult | null {
  if (account.length !== 12 || !account.split("").every(isDigit))
    return reject("The AWS account in the ARN must be exactly 12 digits.");
  return null;
}

/**
 * Validates an IAM **role** ARN, e.g. `arn:aws:iam::123456789012:role/FluxLinksAccess-ab12cd34ef56`.
 * Role names may include a path (`role/some/path/Name`); the final name segment
 * must satisfy AWS's 64-character role-name limit.
 */
export function parseRoleArn(input: string): ArnResult {
  const parsed = splitArn(input, "role ARN");
  if ("ok" in parsed) return parsed;
  const { partition, service, region, account, resource } = parsed;
  if (partition !== "aws") return reject("Only standard AWS partitions are supported.");
  if (service !== "iam") return reject("A role ARN's service part must be iam.");
  if (region !== "")
    return reject("IAM role ARNs have no region — use arn:aws:iam::ACCOUNT:role/Name");
  const badAccount = checkAccount(account);
  if (badAccount) return badAccount;
  if (!resource.startsWith("role/"))
    return reject(
      "A role ARN's resource part must start with role/ — check you copied the RoleArn output.",
    );
  const name = resource.slice("role/".length);
  if (!name || name.endsWith("/")) return reject("The role ARN must end with a role name.");
  if (!name.split("").every(isNameChar))
    return reject("Role names may only contain letters, digits and + = , . @ _ / -");
  const finalSegment = name.split("/").filter(Boolean).at(-1) ?? "";
  if (!finalSegment) return reject("The role ARN must end with a role name.");
  if (finalSegment.length > IAM_ROLE_NAME_MAX)
    return reject(`A role name is at most ${IAM_ROLE_NAME_MAX} characters.`);
  return { ok: true, arn: `arn:aws:iam::${account}:role/${name}` };
}

/** Validates an IAM **user** ARN — the platform identity our site signs in as. */
export function parseUserArn(input: string): ArnResult {
  const parsed = splitArn(input, "IAM user ARN");
  if ("ok" in parsed) return parsed;
  const { partition, service, region, account, resource } = parsed;
  if (partition !== "aws") return reject("Only standard AWS partitions are supported.");
  if (service !== "iam") return reject("A user ARN's service part must be iam.");
  if (region !== "") return reject("IAM user ARNs have no region.");
  const badAccount = checkAccount(account);
  if (badAccount) return badAccount;
  if (!resource.startsWith("user/"))
    return reject(
      "The platform identity must be a dedicated IAM user ARN, like arn:aws:iam::123456789012:user/flux-links-platform",
    );
  const name = resource.slice("user/".length);
  if (!name || name.endsWith("/") || !name.split("").every(isNameChar))
    return reject("IAM user names may only contain letters, digits and + = , . @ _ / -");
  return { ok: true, arn: `arn:aws:iam::${account}:user/${name}` };
}

export const isValidRoleArn = (input: string) => parseRoleArn(input).ok;
