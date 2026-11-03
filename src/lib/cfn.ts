// Builds the CloudFormation template a customer deploys in THEIR AWS account.
// - Trusts ONLY the Flux platform IAM user (not the whole platform account) and ONLY with this connection's External ID.
// - Role name is unique per connection and matches the platform user's sts:AssumeRole policy (FluxLinksAccess-*).
// - S3 permissions are limited to buckets matching BucketPattern (default flux-*). No delete, ACL, or bucket-policy actions,
//   so Flux can never make a bucket public or delete data.
export function roleNameFor(externalId: string) {
  return `FluxLinksAccess-${externalId.slice(0, 12)}`;
}

export function cloudFormationTemplate(platformPrincipalArn: string, externalId: string) {
  return `AWSTemplateFormatVersion: "2010-09-09"
Description: Flux Links access role (least privilege, External ID protected, no delete or public-access actions)
Parameters:
  BucketPattern:
    Type: String
    Default: "flux-*"
    AllowedPattern: "^[a-z0-9.*-]{1,63}$"
    Description: Bucket names Flux Links may use (e.g. "flux-*" or one exact bucket name). Avoid "*".
Resources:
  FluxLinksRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: ${roleNameFor(externalId)}
      MaxSessionDuration: 3600
      AssumeRolePolicyDocument:
        Version: "2012-10-17"
        Statement:
          - Effect: Allow
            Principal:
              AWS: "${platformPrincipalArn}"
            Action: sts:AssumeRole
            Condition:
              StringEquals:
                sts:ExternalId: "${externalId}"
      Policies:
        - PolicyName: FluxLinksS3
          PolicyDocument:
            Version: "2012-10-17"
            Statement:
              - Sid: DiscoverBucketNames
                Effect: Allow
                Action: [s3:ListAllMyBuckets, s3:GetBucketLocation]
                Resource: "*"
              - Sid: CreatePrivateBuckets
                Effect: Allow
                Action:
                  - s3:ListBucket
                  - s3:CreateBucket
                  - s3:PutBucketPublicAccessBlock
                  - s3:PutEncryptionConfiguration
                  - s3:PutBucketCORS
                  - s3:PutBucketOwnershipControls
                Resource: !Sub "arn:aws:s3:::\${BucketPattern}"
              - Sid: ReadWriteObjects
                Effect: Allow
                Action: [s3:GetObject, s3:PutObject]
                Resource: !Sub "arn:aws:s3:::\${BucketPattern}/*"
Outputs:
  RoleArn:
    Description: Paste this into Flux Links
    Value: !GetAtt FluxLinksRole.Arn
`;
}
