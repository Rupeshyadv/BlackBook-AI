import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { auth } from "@clerk/nextjs/server";
import { nanoid } from "nanoid";

async function getSignedR2Url(key: string, contentType: string): Promise<string> {
    const accountId = process.env.R2_ACCOUNT_ID!;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID!;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY!;
    const bucket = process.env.R2_BUCKET_NAME!;

    const S3 = new S3Client({
        region: "auto",
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: accessKeyId,
            secretAccessKey: secretAccessKey,
        },
    });

    const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
    });

    // Generate a pre-signed URL for the PutObject command
    const signedUrl = await getSignedUrl(S3, command, { expiresIn: 300 }); // URL valid for 300 seconds (5 minutes)

    return signedUrl;
}

export async function POST(req: Request) {
    const { userId } = await auth();
    if (!userId) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { fileType } = await req.json();

    const fileKey = `references/${userId}/${nanoid()}.pdf`;

    try {
        const uploadUrl = await getSignedR2Url(fileKey, fileType);
        console.log("uploadUrl (SDK):", uploadUrl);
        return Response.json({ uploadUrl, fileKey });
    } catch (error) {
        console.error("Error generating signed URL:", error);
        return Response.json({ error: "Failed to generate upload URL" }, { status: 500 });
    }
}