import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../database/prisma";
import { authenticate } from "../middleware/authenticate";
import { ok } from "../utils/response";
import { AppError } from "../utils/AppError";

const router = Router();
const conversationId = z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
const messageSchema = z.object({
  id: z.string().max(120).optional(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().max(100_000).optional().default(""),
  createdAt: z.string().max(64).optional(),
  attachments: z.array(z.unknown()).max(10).optional(),
  failed: z.boolean().optional(),
}).passthrough();
const createSchema = z.object({
  id: conversationId.optional(),
  title: z.string().trim().min(1).max(160).optional(),
});
const updateSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  messages: z.array(messageSchema).max(500).optional(),
}).refine((value) => value.title !== undefined || value.messages !== undefined, "Provide a title or messages");

router.use(authenticate);

// Every query is scoped to the authenticated MAX Auth subject.
router.get("/", async (req, res, next) => {
  try {
    const rows = await prisma.aIConversation.findMany({
      where: { userId: req.user!.sub },
      orderBy: { updatedAt: "desc" },
      take: 200,
      select: { id: true, title: true, createdAt: true, updatedAt: true, messages: true },
    });
    return ok(res, { conversations: rows.map((row) => ({
      ...row,
      messages: Array.isArray(row.messages) ? row.messages : [],
      preview: Array.isArray(row.messages) && row.messages.length
        ? String((row.messages[row.messages.length - 1] as { content?: unknown })?.content ?? "").slice(0, 180)
        : "",
    })) });
  } catch (error) { next(error); }
});

router.post("/", async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return next(AppError.badRequest("Invalid conversation details"));
    const id = parsed.data.id || undefined;
    const conversation = id
      ? await prisma.aIConversation.upsert({
          where: { id },
          create: { id, userId: req.user!.sub, title: parsed.data.title || "New chat", messages: [] },
          update: {},
        })
      : await prisma.aIConversation.create({
          data: { userId: req.user!.sub, title: parsed.data.title || "New chat", messages: [] },
        });
    if (conversation.userId !== req.user!.sub) return next(AppError.notFound("Conversation not found"));
    return ok(res, { conversation }, 201);
  } catch (error) { next(error); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const parsedId = conversationId.safeParse(req.params.id);
    if (!parsedId.success) return next(AppError.notFound("Conversation not found"));
    const conversation = await prisma.aIConversation.findFirst({ where: { id: parsedId.data, userId: req.user!.sub } });
    if (!conversation) return next(AppError.notFound("Conversation not found"));
    return ok(res, { conversation: { ...conversation, messages: Array.isArray(conversation.messages) ? conversation.messages : [] } });
  } catch (error) { next(error); }
});

router.put("/:id", async (req, res, next) => {
  try {
    const parsedId = conversationId.safeParse(req.params.id);
    const parsedBody = updateSchema.safeParse(req.body);
    if (!parsedId.success || !parsedBody.success) return next(AppError.badRequest("Invalid conversation update"));
    const current = await prisma.aIConversation.findFirst({ where: { id: parsedId.data, userId: req.user!.sub }, select: { id: true } });
    if (!current) return next(AppError.notFound("Conversation not found"));
    const data: Prisma.AIConversationUpdateInput = {};
    if (parsedBody.data.title !== undefined) data.title = parsedBody.data.title;
    if (parsedBody.data.messages !== undefined) {
      const serialized = JSON.stringify(parsedBody.data.messages);
      if (serialized.length > 1_000_000) return next(AppError.badRequest("Conversation is too large to save"));
      data.messages = parsedBody.data.messages as Prisma.InputJsonValue;
    }
    const conversation = await prisma.aIConversation.update({ where: { id: parsedId.data }, data });
    return ok(res, { conversation });
  } catch (error) { next(error); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const parsedId = conversationId.safeParse(req.params.id);
    if (!parsedId.success) return next(AppError.notFound("Conversation not found"));
    const result = await prisma.aIConversation.deleteMany({ where: { id: parsedId.data, userId: req.user!.sub } });
    if (!result.count) return next(AppError.notFound("Conversation not found"));
    return ok(res, { deleted: true });
  } catch (error) { next(error); }
});

export default router;
