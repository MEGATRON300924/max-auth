import { Request, Response, NextFunction } from "express";
import { ok } from "../utils/response";
import { ecosystemService } from "../services/ecosystem.service";
export const ecosystemController = {
 async listOrganisations(req:Request,res:Response,next:NextFunction){try{return ok(res,{organisations:await ecosystemService.listOrganisations(req.user!.sub)});}catch(e){next(e);}},
 async createOrganisation(req:Request,res:Response,next:NextFunction){try{return ok(res,{organisation:await ecosystemService.createOrganisation(req.user!.sub,req.body)},201);}catch(e){next(e);}},
 async listEcosystems(req:Request,res:Response,next:NextFunction){try{return ok(res,{ecosystems:await ecosystemService.listEcosystems(req.user!.sub,req.params.organisationId)});}catch(e){next(e);}},
 async createEcosystem(req:Request,res:Response,next:NextFunction){try{return ok(res,{ecosystem:await ecosystemService.createEcosystem(req.user!.sub,req.params.organisationId,req.body)},201);}catch(e){next(e);}},
 async linkClient(req:Request,res:Response,next:NextFunction){try{return ok(res,{client:await ecosystemService.linkClient(req.user!.sub,req.params.ecosystemId,req.body.oauthClientId,req.body.isPrimary??false)},201);}catch(e){next(e);}},
 async setPrimaryClient(req:Request,res:Response,next:NextFunction){try{return ok(res,await ecosystemService.setPrimaryClient(req.user!.sub,req.params.ecosystemId,req.params.oauthClientId));}catch(e){next(e);}},
 async unlinkClient(req:Request,res:Response,next:NextFunction){try{return ok(res,await ecosystemService.unlinkClient(req.user!.sub,req.params.ecosystemId,req.params.oauthClientId));}catch(e){next(e);}}
};
