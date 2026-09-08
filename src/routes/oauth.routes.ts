import { Router } from "express";
import { oauthController } from "../controllers/oauth.controller";
import { authenticate } from "../middleware/authenticate";
import { z } from "zod";
import { validate } from "../middleware/validate";
import { MAX_OAUTH_SCOPES } from "../services/oauth.service";

const router = Router();
const scopeSchema = z.array(z.string()).min(1).refine((scopes) => scopes.every((scope) => MAX_OAUTH_SCOPES.includes(scope)), "Unsupported OAuth scope");
const createClientSchema = z.object({ body: z.object({ name: z.string().trim().min(2).max(100), redirectUris: z.array(z.string().url()).min(1).max(50), scopes: scopeSchema, isConfidential: z.boolean().optional() }) });
const updateClientSchema = z.object({ body: z.object({ name: z.string().trim().min(2).max(100).optional(), redirectUris: z.array(z.string().url()).min(1).max(50).optional(), scopes: scopeSchema.optional() }).refine((body) => Object.keys(body).length > 0, "At least one field is required") });
const approveSchema = z.object({ body: z.object({ clientId: z.string().min(1), redirectUri: z.string().url(), scopes: z.string().min(1), codeChallenge: z.string().min(43).max(128), codeChallengeMethod: z.literal("S256"), state: z.string().min(1).max(2048) }) });
const revokeSchema = z.object({ body: z.object({ token: z.string().min(1), token_type_hint: z.string().optional(), client_id: z.string().optional(), client_secret: z.string().optional() }) });

router.post("/clients", authenticate, validate(createClientSchema), oauthController.createClient);
router.get("/clients", authenticate, oauthController.listClients);
router.patch("/clients/:clientId", authenticate, validate(updateClientSchema), oauthController.updateClient);
router.post("/clients/:clientId/rotate-secret", authenticate, oauthController.rotateClientSecret);
router.delete("/clients/:clientId", authenticate, oauthController.revokeClient);
router.get("/consents", authenticate, oauthController.listConsents);
router.delete("/consents/:consentId", authenticate, oauthController.revokeConsent);
router.get("/authorize", oauthController.authorize);
router.post("/authorize/approve", authenticate, validate(approveSchema), oauthController.approve);
router.post("/token", oauthController.token);
router.post("/revoke", validate(revokeSchema), oauthController.revoke);
router.get("/introspect", oauthController.introspect);
router.post("/introspect", oauthController.introspect);
router.get("/userinfo", oauthController.userinfo);
export default router;
