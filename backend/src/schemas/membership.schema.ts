import { z } from "zod";

export const roleEnum = z.enum(["OWNER", "ADMIN", "DEVELOPER", "VIEWER"]);

export const inviteSchema = z.object({
  email: z.string().email(),
  role: roleEnum.default("DEVELOPER"),
});

export const acceptInviteSchema = z.object({ token: z.string().min(1) });

export const changeRoleSchema = z.object({ role: roleEnum });

export type InviteDTO = z.infer<typeof inviteSchema>;
