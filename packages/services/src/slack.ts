import { servicesEnv } from "./env";

export async function sendAdminSlackNotification(
  message: string
): Promise<void> {
  if (!servicesEnv.SLACK_NOTIFICATION_URL) {
    console.warn("SLACK_NOTIFICATION_URL is not set. Skipping notification.");
    return;
  }

  try {
    const response = await fetch(servicesEnv.SLACK_NOTIFICATION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: message }),
    });

    if (!response.ok) {
      throw new Error(`Slack notification failed: ${response.statusText}`);
    }
  } catch (error) {
    console.error("Error sending Slack notification:", error);
  }
}
