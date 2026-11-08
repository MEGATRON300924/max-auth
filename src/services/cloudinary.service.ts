import crypto from "crypto";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";

function config() {
  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
    throw AppError.serviceUnavailable("Profile image uploads are temporarily unavailable.");
  }
  return { cloudName: env.CLOUDINARY_CLOUD_NAME, apiKey: env.CLOUDINARY_API_KEY, apiSecret: env.CLOUDINARY_API_SECRET };
}
function signature(params: Record<string, string>, secret: string) {
  const canonical = Object.keys(params).sort().map((key) => key + "=" + params[key]).join("&");
  return crypto.createHash("sha1").update(canonical + secret).digest("hex");
}
export const cloudinaryService = {
  createAvatarUpload(userId: string) {
    const c = config();
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const folder = "max-auth/avatars/" + userId;
    const publicId = "profile";
    const params = { folder, overwrite: "true", public_id: publicId, timestamp };
    return {
      cloudName: c.cloudName,
      apiKey: c.apiKey,
      uploadUrl: "https://api.cloudinary.com/v1_1/" + c.cloudName + "/image/upload",
      folder,
      publicId,
      signature: signature(params, c.apiSecret),
      timestamp: Number(timestamp),
      uploadParams: params,
      maxBytes: 5 * 1024 * 1024,
      allowedFormats: ["jpg", "jpeg", "png", "webp", "avif"]
    };
  },
  getAvatarUrl(userId: string, publicId: string) {
    const c = config();
    if (publicId !== "max-auth/avatars/" + userId + "/profile") {
      throw AppError.badRequest("Invalid profile image asset.");
    }
    return "https://res.cloudinary.com/" + c.cloudName + "/image/upload/f_auto,q_auto,c_fill,g_face,w_512,h_512/" + publicId;
  }
};
