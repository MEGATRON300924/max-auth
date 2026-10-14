import { randomUUID } from "crypto";
import { prisma } from "../database/prisma";
import { AppError } from "../utils/AppError";

type Role = "OWNER" | "ADMIN" | "DEVELOPER" | "MEMBER" | "READ_ONLY";
const slugify = (value: string) => {
  const slug = value.trim().toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw AppError.badRequest("Use letters, numbers and hyphens for the slug", "INVALID_SLUG");
  return slug;
};
async function member(orgId: string, userId: string) {
  const rows = await prisma.$queryRaw<Array<{ role: Role }>>\`SELECT role FROM organisation_members WHERE organisation_id = \${orgId}::uuid AND user_id = \${userId}::uuid LIMIT 1\`;
  if (!rows[0]) throw AppError.notFound("Organisation not found");
  return rows[0].role;
}
async function canManage(orgId: string, userId: string, linkOnly = false) {
  const role = await member(orgId, userId);
  if (linkOnly ? !["OWNER", "ADMIN", "DEVELOPER"].includes(role) : !["OWNER", "ADMIN"].includes(role))
    throw AppError.forbidden("Your organisation role cannot perform this action", "ORGANISATION_ROLE_REQUIRED");
}
export const ecosystemService = {
  async listOrganisations(userId: string) {
    return prisma.$queryRaw\`SELECT o.id,o.name,o.slug,m.role,o.created_at AS "createdAt",
      (SELECT COUNT(*)::int FROM ecosystems e WHERE e.organisation_id=o.id) AS "ecosystemCount",
      (SELECT COUNT(*)::int FROM organisation_members mm WHERE mm.organisation_id=o.id) AS "memberCount"
      FROM organisations o JOIN organisation_members m ON m.organisation_id=o.id
      WHERE m.user_id=\${userId}::uuid ORDER BY o.created_at DESC\`;
  },
  async createOrganisation(userId: string, input: {name:string;slug?:string}) {
    const name=input.name.trim(); if(name.length<2||name.length>120) throw AppError.badRequest("Organisation name must be 2–120 characters","INVALID_ORGANISATION_NAME");
    const slug=slugify(input.slug?.trim()||name), id=randomUUID();
    try { await prisma.$transaction(async tx=>{
      await tx.$executeRaw\`INSERT INTO organisations(id,name,slug,created_by) VALUES(\${id}::uuid,\${name},\${slug},\${userId}::uuid)\`;
      await tx.$executeRaw\`INSERT INTO organisation_members(organisation_id,user_id,role) VALUES(\${id}::uuid,\${userId}::uuid,'OWNER')\`;
    }); } catch(error) { if(String(error).includes("unique")||String(error).includes("organisations_slug_key")) throw AppError.conflict("That organisation slug is already in use","ORGANISATION_SLUG_TAKEN"); throw error; }
    return (await this.listOrganisations(userId) as Array<{id:string}>).find(x=>x.id===id);
  },
  async listEcosystems(userId:string, orgId:string) {
    await member(orgId,userId);
    return prisma.$queryRaw\`SELECT e.id,e.organisation_id AS "organisationId",e.name,e.slug,e.description,e.created_at AS "createdAt",
      (SELECT COUNT(*)::int FROM ecosystem_clients ec WHERE ec.ecosystem_id=e.id) AS "clientCount",
      (SELECT json_agg(json_build_object('id',oc.id,'clientId',oc."clientId",'name',oc.name,'isPrimary',ec.is_primary,'linkedAt',ec.linked_at) ORDER BY ec.is_primary DESC,oc.name)
       FROM ecosystem_clients ec JOIN oauth_clients oc ON oc.id=ec.oauth_client_id WHERE ec.ecosystem_id=e.id) AS clients
      FROM ecosystems e WHERE e.organisation_id=\${orgId}::uuid ORDER BY e.created_at DESC\`;
  },
  async createEcosystem(userId:string,orgId:string,input:{name:string;slug?:string;description?:string}) {
    await canManage(orgId,userId);
    const name=input.name.trim(), description=input.description?.trim()||null;
    if(name.length<2||name.length>120) throw AppError.badRequest("Ecosystem name must be 2–120 characters","INVALID_ECOSYSTEM_NAME");
    if(description&&description.length>500) throw AppError.badRequest("Description must be 500 characters or fewer","INVALID_DESCRIPTION");
    const slug=slugify(input.slug?.trim()||name),id=randomUUID();
    try { await prisma.$executeRaw\`INSERT INTO ecosystems(id,organisation_id,name,slug,description,created_by) VALUES(\${id}::uuid,\${orgId}::uuid,\${name},\${slug},\${description},\${userId}::uuid)\`; }
    catch(error) { if(String(error).includes("unique")) throw AppError.conflict("That ecosystem slug is already used in this organisation","ECOSYSTEM_SLUG_TAKEN"); throw error; }
    return (await this.listEcosystems(userId,orgId) as Array<{id:string}>).find(x=>x.id===id);
  },
  async linkClient(userId:string,ecosystemId:string,oauthClientId:string,isPrimary=false) {
    const rows=await prisma.$queryRaw<Array<{organisationId:string}>>\`SELECT organisation_id AS "organisationId" FROM ecosystems WHERE id=\${ecosystemId}::uuid LIMIT 1\`;
    if(!rows[0]) throw AppError.notFound("Ecosystem not found");
    await canManage(rows[0].organisationId,userId,true);
    const clients=await prisma.$queryRaw<Array<{id:string;ownerId:string|null;name:string;clientId:string;isActive:boolean}>>\`SELECT id,"ownerId",name,"clientId","isActive" FROM oauth_clients WHERE id=\${oauthClientId}::uuid LIMIT 1\`;
    const client=clients[0]; if(!client||!client.isActive) throw AppError.notFound("Active OAuth client not found");
    const owners=client.ownerId?await prisma.$queryRaw<Array<{id:string}>>\`SELECT id FROM organisation_members WHERE organisation_id=\${rows[0].organisationId}::uuid AND user_id=\${client.ownerId}::uuid LIMIT 1\`:[];
    if(!owners.length) throw AppError.forbidden("Only active OAuth clients owned by organisation members can be linked","CLIENT_NOT_OWNED_BY_ORGANISATION");
    const prior=await prisma.$queryRaw<Array<{ecosystemId:string}>>\`SELECT ecosystem_id AS "ecosystemId" FROM ecosystem_clients WHERE oauth_client_id=\${oauthClientId}::uuid LIMIT 1\`;
    if(prior[0]) throw AppError.conflict(prior[0].ecosystemId===ecosystemId?"Application is already linked":"Application already belongs to another ecosystem",prior[0].ecosystemId===ecosystemId?"CLIENT_ALREADY_LINKED":"CLIENT_LINKED_ELSEWHERE");
    await prisma.$transaction(async tx=>{
      if(isPrimary) await tx.$executeRaw\`UPDATE ecosystem_clients SET is_primary=FALSE WHERE ecosystem_id=\${ecosystemId}::uuid\`;
      await tx.$executeRaw\`INSERT INTO ecosystem_clients(ecosystem_id,oauth_client_id,linked_by,is_primary) VALUES(\${ecosystemId}::uuid,\${oauthClientId}::uuid,\${userId}::uuid,\${isPrimary})\`;
    });
    return {id:client.id,clientId:client.clientId,name:client.name,isPrimary};
  },
  async setPrimaryClient(userId:string,ecosystemId:string,oauthClientId:string) {
    const rows=await prisma.$queryRaw<Array<{organisationId:string}>>\`SELECT organisation_id AS "organisationId" FROM ecosystems WHERE id=\${ecosystemId}::uuid LIMIT 1\`;
    if(!rows[0]) throw AppError.notFound("Ecosystem not found"); await canManage(rows[0].organisationId,userId,true);
    const linked=await prisma.$queryRaw<Array<{id:string}>>\`SELECT id FROM ecosystem_clients WHERE ecosystem_id=\${ecosystemId}::uuid AND oauth_client_id=\${oauthClientId}::uuid LIMIT 1\`;
    if(!linked[0]) throw AppError.notFound("Client is not linked to this ecosystem");
    await prisma.$transaction(async tx=>{
      await tx.$executeRaw\`UPDATE ecosystem_clients SET is_primary=FALSE WHERE ecosystem_id=\${ecosystemId}::uuid\`;
      await tx.$executeRaw\`UPDATE ecosystem_clients SET is_primary=TRUE WHERE ecosystem_id=\${ecosystemId}::uuid AND oauth_client_id=\${oauthClientId}::uuid\`;
    }); return {ecosystemId,oauthClientId,isPrimary:true};
  },
  async unlinkClient(userId:string,ecosystemId:string,oauthClientId:string) {
    const rows=await prisma.$queryRaw<Array<{organisationId:string}>>\`SELECT organisation_id AS "organisationId" FROM ecosystems WHERE id=\${ecosystemId}::uuid LIMIT 1\`;
    if(!rows[0]) throw AppError.notFound("Ecosystem not found"); await canManage(rows[0].organisationId,userId,true);
    await prisma.$executeRaw\`DELETE FROM ecosystem_clients WHERE ecosystem_id=\${ecosystemId}::uuid AND oauth_client_id=\${oauthClientId}::uuid\`;
    return {ecosystemId,oauthClientId,unlinked:true};
  },
  async subjectForClient(clientId:string,userId:string) {
    const linked=await prisma.$queryRaw<Array<{ecosystemId:string}>>\`SELECT ec.ecosystem_id AS "ecosystemId" FROM ecosystem_clients ec JOIN oauth_clients oc ON oc.id=ec.oauth_client_id WHERE oc."clientId"=\${clientId} AND oc."isActive"=TRUE LIMIT 1\`;
    if(!linked[0]) return userId;
    const ecosystemId=linked[0].ecosystemId;
    await prisma.$executeRaw\`INSERT INTO ecosystem_identities(ecosystem_id,user_id) VALUES(\${ecosystemId}::uuid,\${userId}::uuid) ON CONFLICT(ecosystem_id,user_id) DO NOTHING\`;
    const identity=await prisma.$queryRaw<Array<{id:string}>>\`SELECT id FROM ecosystem_identities WHERE ecosystem_id=\${ecosystemId}::uuid AND user_id=\${userId}::uuid LIMIT 1\`;
    return identity[0]?.id ?? userId;
  }
};
