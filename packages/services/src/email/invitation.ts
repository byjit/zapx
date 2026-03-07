import { resend } from "./resend";
import { InvitationEmail } from "./templates/invitation-email";

export const sendOrganizationInvitation = async ({
  email,
  invitedByUsername,
  invitedByEmail,
  teamName,
  inviteLink,
}: {
  email: string;
  invitedByUsername: string;
  invitedByEmail: string;
  teamName: string;
  inviteLink: string;
}) => {
  await resend.emails.send({
    from: "Turborepo Boilerplate <onboarding@resend.dev>",
    to: email,
    subject: `Join ${teamName} on Turborepo Boilerplate`,
    react: InvitationEmail({
      invitedByUsername,
      invitedByEmail,
      teamName,
      inviteLink,
    }),
  });
};
