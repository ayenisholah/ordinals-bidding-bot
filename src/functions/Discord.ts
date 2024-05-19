import axios from "axios";
import { config } from "dotenv"


config()

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL as string;

export async function sendDiscordAlert(message: string) {
  try {
    await axios.post(DISCORD_WEBHOOK_URL, { content: message });
    console.log("Discord alert sent:", message);
  } catch (error) {
    console.error("Failed to send Discord alert:", error);
  }
}