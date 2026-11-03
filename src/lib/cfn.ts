// Builds the CloudFormation template a customer deploys in THEIR AWS account.
export function cloudFormationTemplate(platformAccountId: string, externalId: string) {
  return `AWSTemplateFormatVersion: "2010-09-09"
Description: Flux Links access role (least privilege, External ID protected)
Parameters:
  BucketPattern:
    Type: String
    Default: "*"
    Description: Bucket names Flux Links may manage (e.g. "flux-*"). Use "*" for all buckets.
Resources:
  FluxLinksRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: FluxLinksAccess
      MaxSessionDuration: 3600
      AssumeRolePolicyDocument:
        Version: "2012-10-17"
        Statement:
          - Effect: Allow
            Principal:
              AWS: "arn:aws:iam::${platformAccountId}:root"
            Action: sts:AssumeRole
            Condition:
              StringEquals:
                sts:ExternalId: "${externalId}"
      Policies:
        - PolicyName: FluxLinksS3
          PolicyDocument:
            Version: "2012-10-17"
            Statement:
              - Sid: Discover
                Effect: Allow
                Action: [s3:ListAllMyBuckets, s3:GetBucketLocation]
                Resource: "*"
              - Sid: ManageBuckets
                Effect: Allow
                Action:
                  - s3:ListBucket
                  - s3:CreateBucket
                  - s3:PutBucketPublicAccessBlock
                  - s3:PutEncryptionConfiguration
                  - s3:PutBucketCORS
                  - s3:PutBucketOwnershipControls
                Resource: !Sub "arn:aws:s3:::\${BucketPattern}"
              - Sid: Objects
                Effect: Allow
                Action: [s3:GetObject, s3:PutObject]
                Resource: !Sub "arn:aws:s3:::\${BucketPattern}/*"
Outputs:
  RoleArn:
    Description: Paste this into Flux Links
    Value: !GetAtt FluxLinksRole.Arn
`;
}
