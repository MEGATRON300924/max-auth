import { Router } from "express";
import { z } from "zod";
import { authenticateDeveloper } from "../middleware/authenticateDeveloper";
import { validate } from "../middleware/validate";
import { ecosystemController } from "../controllers/ecosystem.controller";

const router = Router();
const slug = z.string().trim().min(2).max(64).regex(/^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/).optional();
const uuid = z.string().uuid();
const organisationParams = z.object({ params: z.object({ organisationId: uuid }) });
const ecosystemParams = z.object({ params: z.object({ ecosystemId: uuid }) });
const ecosystemClientParams = z.object({ params: z.object({ ecosystemId: uuid, oauthClientId: uuid }) });
const createOrganisationSchema = z.object({ body: z.object({ name: z.string().trim().min(2).max(120), slug }) });
const createEcosystemSchema = z.object({
  params: z.object({ organisationId: uuid }),
  body: z.object({ name: z.string().trim().min(2).max(120), slug, description: z.string().trim().max(500).optional() }),
});
const linkClientSchema = z.object({
  params: z.object({ ecosystemId: uuid }),
  body: z.object({ oauthClientId: uuid, isPrimary: z.boolean().optional() }),
});

router.use(authenticateDeveloper);
router.get("/organisations", ecosystemController.listOrganisations);
router.post("/organisations", validate(createOrganisationSchema), ecosystemController.createOrganisation);
router.get("/organisations/:organisationId/ecosystems", validate(organisationParams), ecosystemController.listEcosystems);
router.post("/organisations/:organisationId/ecosystems", validate(createEcosystemSchema), ecosystemController.createEcosystem);
router.post("/:ecosystemId/clients", validate(linkClientSchema), ecosystemController.linkClient);
router.put("/:ecosystemId/clients/:oauthClientId/primary", validate(ecosystemClientParams), ecosystemController.setPrimaryClient);
router.delete("/:ecosystemId/clients/:oauthClientId", validate(ecosystemClientParams), ecosystemController.unlinkClient);
export default router;
