import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { Tailwind } from "@react-email/tailwind";

interface InvitationEmailProps {
  invitedByUsername: string;
  invitedByEmail: string;
  teamName: string;
  inviteLink: string;
}

export const InvitationEmail = ({
  invitedByUsername,
  invitedByEmail,
  teamName,
  inviteLink,
}: InvitationEmailProps) => {
  const previewText = `Join ${invitedByUsername} on ${teamName}`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Tailwind>
        <Body className="bg-white my-auto mx-auto font-sans px-2">
          <Container className="border border-solid border-[#eaeaea] rounded my-[40px] mx-auto p-[20px] max-w-[465px]">
            <Section className="mt-[32px]">
              <Heading className="text-black text-[24px] font-normal text-center p-0 my-[30px] mx-0">
                Join <strong>{teamName}</strong> on{" "}
                <strong>Turborepo Boilerplate</strong>
              </Heading>
              <Text className="text-black text-[14px] leading-[24px]">
                Hello,
              </Text>
              <Text className="text-black text-[14px] leading-[24px]">
                <strong>{invitedByUsername}</strong> (
                <span className="text-blue-600">{invitedByEmail}</span>) has
                invited you to the <strong>{teamName}</strong> team on{" "}
                <strong>Turborepo Boilerplate</strong>.
              </Text>
              <Section className="text-center mt-[32px] mb-[32px]">
                <Button
                  className="bg-[#000000] rounded text-white text-[12px] font-semibold no-underline text-center px-5 py-3"
                  href={inviteLink}
                >
                  Join the team
                </Button>
              </Section>
              <Text className="text-black text-[14px] leading-[24px]">
                or copy and paste this URL into your browser:{" "}
                <span className="text-blue-600 break-all">{inviteLink}</span>
              </Text>
              <Hr className="border border-solid border-[#eaeaea] my-[26px] mx-0 w-full" />
              <Text className="text-[#666666] text-[12px] leading-[24px]">
                This invitation was intended for{" "}
                <span className="text-black">{invitedByEmail}</span>. If you
                were not expecting this invitation, you can ignore this email.
                If you are concerned about your account's safety, please reply
                to this email to get in touch with us.
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default InvitationEmail;
