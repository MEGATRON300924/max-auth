import { Router } from "express";
import { oauthController } from "../controllers/oauth.controller";
import { authenticate } from "../middleware/authenticate";
import { z } from "zod";
import { validate } from "../middleware/validate";

const router = Router();

const createClientSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(100),
    redirectUris: z.array(z.string().url()).min(1),
    scopes: z.array(z.string()).min(1),
    isConfidential: z.boolean().optional(),
  }),
});

// --- Client management (developer-facing, authenticated) ---

/** @openapi /oauth/clients: post: tags: [OAuth] summary: Register a new OAuth client ("Continue with MAX AI") */
router.post("/clients", authenticate, validate(createClientSchema), oauthController.createClient);

/** @openapi /oauth/clients: get: tags: [OAuth] summary: List OAuth clients owned by the authenticated user */
router.get("/clients", authenticate, oauthController.listClients);

/** @openapi /oauth/clients/{clientId}: delete: tags: [OAuth] summary: Revoke (deactivate) an OAuth client */
router.delete("/clients/:clientId", authenticate, oauthController.revokeClient);

// --- Consent management (end-user-facing) ---

/** @openapi /oauth/consents: get: tags: [OAuth] summary: List apps the user has granted MAX AI access to */
router.get("/consents", authenticate, oauthController.listConsents);

/** @openapi /oauth/consents/{consentId}: delete: tags: [OAuth] summary: Revoke access previously granted to a third-party app */
router.delete("/consents/:consentId", authenticate, oauthController.revokeConsent);

// --- Authorization Code + Token flow (architecture prepared, NOT implemented) ---

/** @openapi /oauth/authorize: get: tags: [OAuth] summary: (Not implemented) Authorization endpoint for "Continue with MAX AI" */
router.get("/authorize", oauthController.authorize);

/** @openapi /oauth/token: post: tags: [OAuth] summary: (Not implemented) Token exchange endpoint */
router.post("/token", oauthController.token);

export default router;
