import { z } from "zod";

const code = z.string().min(6).max(32);
const password = z.string().min(1).max(128);

export const mfaPasswordSchema = z.object({ body: z.object({ password }) });
export const mfaCodeSchema = z.object({ body: z.object({ password, code }) });

export const mfaStepUpSchema = z.object({
  body: z.object({
    password,
    code,
    action: z.enum(["door.unlock", "garage.open", "alarm.disarm", "camera.view"]),
    homeId: z.string().uuid(),
    resourceId: z.string().uuid()
  }).strict()
});
